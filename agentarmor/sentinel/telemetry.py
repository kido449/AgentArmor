from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, AsyncGenerator, Dict, List, Set

from agentarmor.sentinel.schemas import Verdict

logger = logging.getLogger("agentarmor.telemetry")

class TelemetryBus:
    """
    In-memory event bus using asyncio.Queue.
    Broadcasts real-time Verdict payloads to SSE listeners.
    """

    def __init__(self):
        self._local_subscribers: Set[asyncio.Queue] = set()
        self._recent_verdicts: List[Dict[str, Any]] = []
        self._max_recent = 100

    async def connect(self) -> None:
        logger.info("In-memory event bus initialized (asyncio.Queue)")

    async def publish_verdict(self, verdict: Verdict) -> None:
        payload = verdict.model_dump()
        payload_str = json.dumps(payload)

        # Retain in recent list for initial dashboard state
        self._recent_verdicts.insert(0, payload)
        if len(self._recent_verdicts) > self._max_recent:
            self._recent_verdicts.pop()

        # Broadcast to in-memory local SSE queues
        dead_queues = set()
        for q in list(self._local_subscribers):
            try:
                q.put_nowait(payload_str)
            except asyncio.QueueFull:
                dead_queues.add(q)
            except Exception:
                dead_queues.add(q)

        for q in dead_queues:
            self._local_subscribers.discard(q)

    def get_recent(self) -> List[Dict[str, Any]]:
        return list(self._recent_verdicts)

    async def subscribe_sse(self) -> AsyncGenerator[str, None]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        self._local_subscribers.add(queue)

        try:
            # First send any recent cached verdicts so dashboard loads immediately
            for v in reversed(self._recent_verdicts[:15]):
                yield f"data: {json.dumps(v)}\n\n"

            while True:
                data = await queue.get()
                yield f"data: {data}\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            self._local_subscribers.discard(queue)


telemetry_bus = TelemetryBus()
