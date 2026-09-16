from __future__ import annotations

import asyncio
import functools
import logging
from typing import Any, Callable, Optional

from agentarmor.sentinel.pipeline import detection_pipeline
from agentarmor.sentinel.schemas import ActionType, ToolTrustTier, Verdict

logger = logging.getLogger("agentarmor.interceptor")


class SecurityGatewayBlockedError(Exception):
    """Raised when AgentArmor blocks an untrusted tool response outright."""
    def __init__(self, message: str, verdict: Verdict):
        super().__init__(message)
        self.verdict = verdict


def protect(
    tool_name: str,
    trust_tier: ToolTrustTier = ToolTrustTier.OPEN_WEB,
    bypass: bool = False,
):
    """
    Decorator intercepting AI agent tool outputs before they reach the LLM's context window.
    Applies the AgentArmor staged detection pipeline.
    """
    def decorator(func: Callable[..., Any]):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            # Extract query text if passed as first arg or 'query' kwarg
            query_hint = None
            if args and isinstance(args[0], str):
                query_hint = args[0]
            elif "query" in kwargs and isinstance(kwargs["query"], str):
                query_hint = kwargs["query"]

            raw_result = await func(*args, **kwargs)
            str_payload = str(raw_result)

            verdict = await detection_pipeline.inspect(
                raw_text=str_payload,
                tool_name=tool_name,
                trust_tier=trust_tier,
                tool_query=query_hint,
                bypass_gateway=bypass,
            )

            if verdict.action == ActionType.ALLOW:
                return raw_result

            if verdict.action == ActionType.SANITIZE:
                logger.info(f"AgentArmor sanitized output from {tool_name}")
                return verdict.sanitized_output

            if verdict.action == ActionType.QUARANTINE:
                logger.warning(f"AgentArmor quarantined output from {tool_name} (req_id: {verdict.request_id})")
                return (
                    f"[AGENTARMOR SECURITY GATEWAY] Output from {tool_name} quarantined for human review. "
                    f"Attack class: {verdict.attack_class or 'untrusted content'}."
                )

            if verdict.action == ActionType.BLOCK:
                logger.error(f"AgentArmor BLOCKED output from {tool_name}")
                return (
                    f"[AGENTARMOR SECURITY GATEWAY BLOCKED] Tool execution was rejected due to critical injection risk. "
                    f"Attack class: {verdict.attack_class} (confidence: {verdict.confidence:.2f})."
                )

            return raw_result

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            import asyncio
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            return loop.run_until_complete(async_wrapper(*args, **kwargs))

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper

    return decorator
