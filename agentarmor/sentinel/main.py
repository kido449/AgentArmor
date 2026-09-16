from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# Ensure repository root is on sys.path
BASE_DIR = Path(__file__).parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from agentarmor.agent.stub_agent import ProtectedAgentOrchestrator
from agentarmor.sentinel.moss_index import moss_index
from agentarmor.sentinel.pipeline import detection_pipeline
from agentarmor.sentinel.quarantine import quarantine_store
from agentarmor.sentinel.schemas import (
    ActionType,
    InspectRequest,
    Signature,
    SignaturePromoteRequest,
    ToolTrustTier,
    Verdict,
)
from agentarmor.sentinel.telemetry import telemetry_bus
from agentarmor.simulator.run_attacks import run_simulation

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("agentarmor.sentinel")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AgentArmor Sentinel Gateway...")
    await telemetry_bus.connect()
    # Warmup Moss index query
    _, _ = moss_index.query("warmup check", top_k=1)
    logger.info(f"Moss semantic index ready: {moss_index.count} signatures, v{moss_index.version}")
    yield
    logger.info("AgentArmor Sentinel shutting down.")


app = FastAPI(
    title="AgentArmor Sentinel Gateway",
    description="Real-time security gateway protecting AI agents from malicious tool outputs using in-process Moss semantic matching",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "AgentArmor Sentinel",
        "moss_signatures": moss_index.count,
        "moss_version": moss_index.version,
    }


@app.post("/inspect", response_model=Verdict)
async def inspect_tool_output(req: InspectRequest):
    """
    Main inspection endpoint. Evaluates raw tool output across
    Stages A, B, C, D and returns action verdict.
    """
    verdict = await detection_pipeline.inspect(
        raw_text=req.text,
        tool_name=req.tool_name,
        trust_tier=req.trust_tier,
        tool_query=req.tool_query,
        bypass_gateway=req.bypass_gateway,
    )
    return verdict


@app.get("/stream")
async def stream_telemetry():
    """
    Server-Sent Events (SSE) stream for real-time dashboard telemetry.
    Subscribes to the in-memory event bus.
    """
    return StreamingResponse(
        telemetry_bus.subscribe_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/signatures")
async def list_signatures():
    sigs = moss_index.get_all_signatures()
    return {
        "version": moss_index.version,
        "count": len(sigs),
        "signatures": [s.model_dump() for s in sigs],
    }


@app.post("/signatures/promote")
async def promote_signature(req: SignaturePromoteRequest):
    """
    Adds a confirmed injection payload to the live Moss index at runtime
    and increments the index version.
    """
    sig_id = f"PROM-{int(time.time())}"
    sig = Signature(
        id=sig_id,
        text=req.text,
        attack_class=req.attack_class,
        severity=req.severity,
        source="promoted",
        version=moss_index.version + 1,
    )
    new_version = moss_index.promote(sig)

    # If linked to a quarantine request, update quarantine status
    if req.source_request_id:
        quarantine_store.update_status(req.source_request_id, "PROMOTED")

    return {
        "status": "success",
        "signature_id": sig_id,
        "new_version": new_version,
        "total_signatures": moss_index.count,
    }


@app.get("/quarantine")
async def list_quarantined_payloads(status: Optional[str] = None):
    items = quarantine_store.list_all(status=status)
    return {
        "count": len(items),
        "records": items,
    }


@app.post("/quarantine/{request_id}/release")
async def release_quarantined_payload(request_id: str):
    success = quarantine_store.update_status(request_id, "RELEASED")
    if not success:
        raise HTTPException(status_code=404, detail="Quarantine record not found")
    return {"status": "released", "request_id": request_id}


@app.post("/quarantine/{request_id}/promote")
async def promote_quarantined_payload(request_id: str):
    rec = quarantine_store.get(request_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Quarantine record not found")

    sig_id = f"PROM-{int(time.time())}"
    sig = Signature(
        id=sig_id,
        text=rec["raw_text"],
        attack_class=rec.get("attack_class") or "instruction_override",
        severity=4,
        source="promoted",
        version=moss_index.version + 1,
    )
    new_version = moss_index.promote(sig)
    quarantine_store.update_status(request_id, "PROMOTED")

    return {
        "status": "promoted",
        "signature_id": sig_id,
        "new_version": new_version,
        "total_signatures": moss_index.count,
    }


@app.get("/stats")
async def get_stats():
    recent = telemetry_bus.get_recent()
    total_requests = len(recent)

    action_counts = {"ALLOW": 0, "SANITIZE": 0, "QUARANTINE": 0, "BLOCK": 0}
    attack_classes = {}
    total_latencies = []
    moss_latencies = []

    for v in recent:
        act = v.get("action", "ALLOW")
        action_counts[act] = action_counts.get(act, 0) + 1

        cls = v.get("attack_class")
        if cls and cls != "benign":
            attack_classes[cls] = attack_classes.get(cls, 0) + 1

        tot_ms = v.get("total_overhead_ms", 0.0)
        if tot_ms > 0:
            total_latencies.append(tot_ms)

        traces = v.get("stage_traces", [])
        b_trace = next((t for t in traces if t.get("stage") == "B"), None)
        if b_trace:
            moss_ms = b_trace.get("detail", {}).get("retrieval_latency_ms", b_trace.get("latency_ms", 0.0))
            if moss_ms > 0:
                moss_latencies.append(moss_ms)

    # Percentiles
    total_latencies.sort()
    moss_latencies.sort()

    def calc_percentiles(arr: List[float]) -> Dict[str, float]:
        if not arr:
            return {"p50": 0.0, "p95": 0.0, "avg": 0.0}
        n = len(arr)
        p50 = arr[int(n * 0.50)]
        p95 = arr[min(n - 1, int(n * 0.95))]
        avg = sum(arr) / n
        return {"p50": round(p50, 3), "p95": round(p95, 3), "avg": round(avg, 3)}

    return {
        "total_verdicts": total_requests,
        "action_counts": action_counts,
        "attack_classes": attack_classes,
        "total_overhead": calc_percentiles(total_latencies),
        "moss_stage": calc_percentiles(moss_latencies),
        "moss_version": moss_index.version,
        "signatures_count": moss_index.count,
    }


@app.post("/simulate")
async def trigger_simulation(limit: int = 10):
    """Fires scripted attack scenarios through the gateway."""
    results = await run_simulation(limit=limit, delay_ms=25)
    return {"status": "completed", "scenarios_run": len(results), "results": results}


class AgentStepRequest(BaseModel):
    tool_name: str = "web_search_tool"
    tool_arg: str = "Search query"
    inject_attack: bool = True
    bypass_armor: bool = False


@app.post("/agent/run-step")
async def run_agent_step(req: AgentStepRequest):
    """Executes a tool call step for the stub agent (WITH vs WITHOUT toggle)."""
    orchestrator = ProtectedAgentOrchestrator(bypass_armor=req.bypass_armor)
    result = await orchestrator.run_step(
        tool_name=req.tool_name,
        tool_arg=req.tool_arg,
        inject_attack=req.inject_attack,
    )
    return result
