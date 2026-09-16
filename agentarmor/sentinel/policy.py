from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from agentarmor.sentinel.normalize import (
    BASE64_CANDIDATE,
    HTML_COMMENT_PATTERN,
    MD_COMMENT_PATTERN,
    tokenize_sentences,
)
from agentarmor.sentinel.quarantine import quarantine_store
from agentarmor.sentinel.schemas import ActionType, PolicyRule, PolicyThresholds, ToolTrustTier

# Default tier policy thresholds
DEFAULT_POLICIES: Dict[ToolTrustTier, PolicyThresholds] = {
    ToolTrustTier.INTERNAL: PolicyThresholds(sanitize=0.60, quarantine=0.80, block=0.92),
    ToolTrustTier.THIRD_PARTY: PolicyThresholds(sanitize=0.50, quarantine=0.70, block=0.85),
    ToolTrustTier.OPEN_WEB: PolicyThresholds(sanitize=0.40, quarantine=0.65, block=0.80),
    ToolTrustTier.USER_UPLOAD: PolicyThresholds(sanitize=0.35, quarantine=0.60, block=0.75),
}


def sanitize_text(
    raw_text: str,
    matched_spans: List[str],
    matched_signatures: List[Dict[str, Any]],
) -> str:
    """
    Excises only the offending span from raw text, replacing with
    '[REMOVED: suspected injection]', and forwarding the remainder.
    """
    sanitized = raw_text

    # Strip HTML / Markdown comments first if malicious
    sanitized = HTML_COMMENT_PATTERN.sub("[REMOVED: hidden comment payload]", sanitized)
    sanitized = MD_COMMENT_PATTERN.sub("[REMOVED: hidden comment payload]", sanitized)

    # Excise direct matched spans from Stage A regex
    for span in matched_spans:
        if span and len(span) >= 5 and span in sanitized:
            sanitized = sanitized.replace(span, "[REMOVED: suspected injection]")

    # If sentences match signature phrases closely, excise them
    sentences = tokenize_sentences(sanitized)
    for sig in matched_signatures:
        sig_text = sig.get("text", "").lower()
        sig_words = set(re.findall(r"\b\w{4,}\b", sig_text))
        for sent in sentences:
            sent_words = set(re.findall(r"\b\w{4,}\b", sent.lower()))
            overlap = len(sig_words.intersection(sent_words))
            if overlap >= 3 and sent in sanitized:
                sanitized = sanitized.replace(sent, "[REMOVED: suspected injection]")

    return sanitized


class PolicyEngine:
    def __init__(self, rules: Optional[Dict[ToolTrustTier, PolicyThresholds]] = None):
        self.rules = rules or DEFAULT_POLICIES

    def evaluate(
        self,
        fused_confidence: float,
        trust_tier: ToolTrustTier,
        request_id: str,
        chunk_id: str,
        raw_text: str,
        tool_name: str,
        attack_class: Optional[str],
        stage_traces: List[Dict[str, Any]],
        matched_spans: List[str],
        matched_signatures: List[Dict[str, Any]],
        moss_circuit_broken: bool = False,
    ) -> Tuple[ActionType, Optional[str]]:
        """
        Evaluates fused score against tier thresholds and determines action.
        Also applies circuit breaker logic if Moss fails.
        """
        # Circuit breaker handling
        if moss_circuit_broken:
            if trust_tier in (ToolTrustTier.OPEN_WEB, ToolTrustTier.USER_UPLOAD):
                # Fail-closed for untrusted open web and user uploads
                return ActionType.BLOCK, None
            else:
                # Fail-open with caution for internal trusted tools
                return ActionType.ALLOW, raw_text

        thresholds = self.rules.get(trust_tier, DEFAULT_POLICIES[ToolTrustTier.OPEN_WEB])

        if fused_confidence >= thresholds.block:
            return ActionType.BLOCK, None

        if fused_confidence >= thresholds.quarantine:
            # Write to SQLite quarantine store
            quarantine_store.add(
                request_id=request_id,
                chunk_id=chunk_id,
                raw_text=raw_text,
                tool_name=tool_name,
                trust_tier=trust_tier.value,
                confidence=fused_confidence,
                attack_class=attack_class,
                stage_traces=stage_traces,
            )
            # Quarantined payload returns nothing to the agent
            return ActionType.QUARANTINE, None

        if fused_confidence >= thresholds.sanitize:
            sanitized = sanitize_text(raw_text, matched_spans, matched_signatures)
            return ActionType.SANITIZE, sanitized

        return ActionType.ALLOW, raw_text


policy_engine = PolicyEngine()
