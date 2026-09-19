from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from agentarmor.sentinel.normalize import chunk_output, normalize_text
from agentarmor.sentinel.policy import policy_engine
from agentarmor.sentinel.schemas import (
    ActionType,
    Chunk,
    StageTrace,
    ToolTrustTier,
    Verdict,
)
from agentarmor.sentinel.stages import (
    run_stage_a,
    run_stage_b,
    run_stage_c,
    run_stage_d,
)
from agentarmor.sentinel.telemetry import telemetry_bus

logger = logging.getLogger("agentarmor.pipeline")

# Trust tier weight multipliers for score fusion
TRUST_TIER_MULTIPLIERS = {
    ToolTrustTier.INTERNAL: 0.85,
    ToolTrustTier.THIRD_PARTY: 1.00,
    ToolTrustTier.OPEN_WEB: 1.15,
    ToolTrustTier.USER_UPLOAD: 1.25,
}


class DetectionPipeline:
    """
    Orchestrates the 4-stage AgentArmor detection pipeline:
    - Stage A: Regex Fast-path (microseconds)
    - Stage B: Moss In-process Semantic Retrieval (sub-10ms)
    - Stage C: Structural / Intent Anomaly Checks
    - Stage D: Borderline LLM Adjudication (only 0.35 <= fused < 0.70)
    """

    async def inspect(
        self,
        raw_text: str,
        tool_name: str = "web_search_tool",
        trust_tier: ToolTrustTier = ToolTrustTier.OPEN_WEB,
        tool_query: Optional[str] = None,
        bypass_gateway: bool = False,
        source_type: str = "tool_output",
        speaker_id: Optional[str] = None,
    ) -> Verdict:
        t_start = time.perf_counter()
        req_id = f"req-{uuid.uuid4().hex[:8]}"

        # If gateway is bypassed (e.g. for WITH vs WITHOUT comparison demo)
        if bypass_gateway:
            t_overhead = (time.perf_counter() - t_start) * 1000.0
            verdict = Verdict(
                request_id=req_id,
                chunk_id="bypass",
                action=ActionType.ALLOW,
                confidence=0.0,
                matched_signatures=[],
                attack_class=None,
                stage_traces=[],
                total_overhead_ms=round(t_overhead, 4),
                sanitized_output=raw_text,
                timestamp=time.time(),
                source_type=source_type,
                speaker_id=speaker_id,
            )
            await telemetry_bus.publish_verdict(verdict)
            return verdict

        # Chunk the output into segments
        chunks = chunk_output(raw_text, tool_name=tool_name, trust_tier=trust_tier)
        primary_chunk = chunks[0]

        stage_traces: List[StageTrace] = []
        matched_signatures: List[Dict[str, Any]] = []
        matched_spans: List[str] = []
        attack_class: Optional[str] = None
        moss_failed = False

        # ------------------------------------------------------------------
        # Stage A: Regex Pre-Filter
        # ------------------------------------------------------------------
        trace_a = run_stage_a(primary_chunk)
        stage_traces.append(trace_a)
        if trace_a.detail.get("matched_span"):
            matched_spans.append(trace_a.detail["matched_span"])
        if trace_a.detail.get("attack_class"):
            attack_class = trace_a.detail["attack_class"]

        # Short-circuit on ultra-high confidence Stage A hit
        if trace_a.score >= 0.94:
            fused_score = trace_a.score
            # Fill remaining traces as not triggered
            stage_traces.append(
                StageTrace(stage="B", triggered=False, score=0.0, latency_ms=0.0, detail={"short_circuited": True})
            )
            stage_traces.append(
                StageTrace(stage="C", triggered=False, score=0.0, latency_ms=0.0, detail={"short_circuited": True})
            )
        else:
            # --------------------------------------------------------------
            # Stage B: Moss Semantic Match (Core, In-Process)
            # --------------------------------------------------------------
            try:
                trace_b, b_matches = run_stage_b(primary_chunk)
                stage_traces.append(trace_b)
                matched_signatures = b_matches
                if b_matches and not attack_class:
                    attack_class = b_matches[0]["attack_class"]
            except Exception as e:
                logger.error(f"Stage B Moss retrieval error: {e}")
                moss_failed = True
                trace_b = StageTrace(
                    stage="B",
                    triggered=False,
                    score=0.0,
                    latency_ms=0.0,
                    detail={"error": str(e), "circuit_breaker_active": True},
                )
                stage_traces.append(trace_b)

            # --------------------------------------------------------------
            # Stage C: Structural / Intent Anomaly Check
            # --------------------------------------------------------------
            trace_c = run_stage_c(primary_chunk, tool_query=tool_query)
            stage_traces.append(trace_c)

            # --------------------------------------------------------------
            # Score Fusion: Stages A, B, C
            # --------------------------------------------------------------
            weight_a = 0.35
            weight_b = 0.45
            weight_c = 0.20

            raw_fused = (
                (trace_a.score * weight_a)
                + (trace_b.score * weight_b)
                + (trace_c.score * weight_c)
            )

            # Apply trust tier multiplier
            tier_mult = TRUST_TIER_MULTIPLIERS.get(trust_tier, 1.0)
            fused_score = min(1.0, raw_fused * tier_mult)

            # --------------------------------------------------------------
            # Stage D: LLM Adjudication (Borderline Band Only: 0.35 <= fused < 0.70)
            # --------------------------------------------------------------
            if 0.35 <= fused_score < 0.70:
                trace_d = run_stage_d(primary_chunk, fused_prior=fused_score)
                stage_traces.append(trace_d)
                if trace_d.triggered:
                    fused_score = max(fused_score, trace_d.score)
                    if trace_d.detail.get("attack_class") and trace_d.detail["attack_class"] != "unknown":
                        attack_class = trace_d.detail["attack_class"]
            else:
                stage_traces.append(
                    StageTrace(
                        stage="D",
                        triggered=False,
                        score=0.0,
                        latency_ms=0.0,
                        detail={"skipped": True, "reason": "Outside borderline band (target <5% traffic)"},
                    )
                )

        # ------------------------------------------------------------------
        # Policy Engine Evaluation
        # ------------------------------------------------------------------
        action, sanitized_output = policy_engine.evaluate(
            fused_confidence=fused_score,
            trust_tier=trust_tier,
            request_id=req_id,
            chunk_id=primary_chunk.id,
            raw_text=raw_text,
            tool_name=tool_name,
            attack_class=attack_class,
            stage_traces=[t.model_dump() for t in stage_traces],
            matched_spans=matched_spans,
            matched_signatures=matched_signatures,
            moss_circuit_broken=moss_failed,
        )

        total_overhead_ms = (time.perf_counter() - t_start) * 1000.0

        verdict = Verdict(
            request_id=req_id,
            chunk_id=primary_chunk.id,
            action=action,
            confidence=round(fused_score, 4),
            matched_signatures=matched_signatures,
            attack_class=attack_class,
            stage_traces=stage_traces,
            total_overhead_ms=round(total_overhead_ms, 4),
            sanitized_output=sanitized_output,
            timestamp=time.time(),
            source_type=source_type,
            speaker_id=speaker_id,
        )

        # Broadcast verdict to Redis Pub/Sub / SSE stream
        await telemetry_bus.publish_verdict(verdict)
        return verdict


detection_pipeline = DetectionPipeline()
