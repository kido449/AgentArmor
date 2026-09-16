from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

# Ensure package root is in sys.path
BASE_DIR = Path(__file__).parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from agentarmor.sentinel.pipeline import detection_pipeline
from agentarmor.sentinel.schemas import ToolTrustTier, Verdict


async def run_simulation(limit: int = 10, delay_ms: int = 50) -> List[Dict[str, Any]]:
    scenarios_path = BASE_DIR / "agentarmor" / "data" / "attack_scenarios.json"
    with open(scenarios_path, "r", encoding="utf-8") as f:
        scenarios = json.load(f)

    results = []
    print(f"\n=======================================================")
    print(f"  AgentArmor Security Gateway: Attack Simulation Suite ")
    print(f"=======================================================\n")

    for i, s in enumerate(scenarios[:limit]):
        trust_tier = ToolTrustTier(s.get("trust_tier", "OPEN_WEB"))
        tool_name = s.get("tool_name", "web_search_tool")
        payload = s.get("payload", "")
        tool_query = s.get("tool_query")

        t0 = time.perf_counter()
        verdict: Verdict = await detection_pipeline.inspect(
            raw_text=payload,
            tool_name=tool_name,
            trust_tier=trust_tier,
            tool_query=tool_query,
        )
        elapsed = (time.perf_counter() - t0) * 1000.0

        b_trace = next((t for t in verdict.stage_traces if t.stage == "B"), None)
        moss_ms = b_trace.detail.get("retrieval_latency_ms", 0.0) if b_trace else 0.0

        item = {
            "scenario_id": s["id"],
            "name": s["name"],
            "action": verdict.action.value,
            "confidence": verdict.confidence,
            "attack_class": verdict.attack_class,
            "total_overhead_ms": verdict.total_overhead_ms,
            "moss_retrieval_ms": moss_ms,
            "expected_action": s.get("expected_action"),
        }
        results.append(item)

        status_sym = "🛡️" if verdict.action.value in ("BLOCK", "SANITIZE", "QUARANTINE") else "✅"
        print(
            f"[{i+1}/{len(scenarios[:limit])}] {status_sym} {s['id']}: {s['name']:<32} "
            f"Action: {verdict.action.value:<10} Confidence: {verdict.confidence:.2f} "
            f"Moss: {moss_ms:.3f}ms  Total: {verdict.total_overhead_ms:.3f}ms"
        )

        if delay_ms > 0:
            await asyncio.sleep(delay_ms / 1000.0)

    print("\n=======================================================")
    print(f"Simulation completed: {len(results)} payloads processed.")
    return results


if __name__ == "__main__":
    asyncio.run(run_simulation())
