# AgentArmor: Prompt Injection Sentinel 🧠

## 1. Executive Summary
AgentArmor is a real-time security gateway designed to protect autonomous AI agents from prompt injections, jailbreaks, and malicious instructions hidden within untrusted tool outputs. It acts as an interceptor sitting between an AI agent and its external tools, deeply inspecting payload data before it reaches the agent's context window.

Built for the YC Fall 2026 x Moss Zero Latency Builder Sprint, the system prioritizes sub-10ms retrieval latencies using an in-process Moss semantic index (meaning no external vector database is used).

## 2. System Architecture

The project consists of three primary domains:
1. **Sentinel Gateway (FastAPI Backend)**: The core detection engine, policy enforcer, and telemetry provider.
2. **Dashboard (React Frontend)**: A real-time control plane for viewing live verdicts, latencies, and managing quarantines.
3. **Agent Integration & Simulation**: Demonstrates how agents integrate with the gateway via decorators, and a simulator for replaying attack scenarios.

### Core Stack
* **Backend**: Python 3.10+, FastAPI, Uvicorn.
* **Retrieval Engine**: Moss SDK (in-process semantic matching).
* **Frontend**: React, Vite, TypeScript, Tailwind CSS.
* **Storage**: SQLite (`quarantine.db`) for held payloads, JSON (`signatures.json`) for the seed corpus.
* **Messaging**: In-process `asyncio.Queue` (SSE stream for frontend telemetry).

---

## 3. Core Workflows & Data Flow

### 3.1 The Interception Workflow
1. **Agent Tool Call**: An agent attempts to run a tool (e.g., `web_search`).
2. **Decorator Intercept**: The `@protect` decorator (`agent/interceptor.py`) catches the raw tool output.
3. **Inspection Request**: The raw output is sent to the Gateway's pipeline (`sentinel/pipeline.py`).
4. **Staged Detection**:
   * **Normalize**: Text is hashed, lowercased, and sanitized for baseline processing (`normalize.py`).
   * **Stage A (Regex)**: Microsecond-latency heuristic matching for explicit override commands and data exfiltration patterns (`stages.py`).
   * **Stage B (Moss Core)**: Semantic search against the known signature corpus. This is the heavy lifter and must execute in `<10ms` (`moss_index.py`).
   * **Stage C (Intent)**: Structural heuristics checking for imperative verbs or query drift (calculating similarity against the original tool query).
   * **Stage D (LLM Adjudication)**: *Currently stubbed*. Designed for Groq/Gemini to adjudicate borderline confidence bands.
5. **Score Fusion**: Scores from A, B, and C are weighted, combined, and amplified based on the `ToolTrustTier` (e.g., OPEN_WEB is weighted higher than INTERNAL).
6. **Policy Evaluation**: The `PolicyEngine` (`policy.py`) maps the fused score against tier-specific thresholds (sanitize, quarantine, block).
7. **Action Execution**:
   * **ALLOW**: Payload is returned unmodified.
   * **SANITIZE**: Malicious spans are excised, replacing them with `[REMOVED: suspected injection]`.
   * **QUARANTINE**: Payload is swallowed, written to SQLite (`quarantine.py`), and the agent receives a safe placeholder warning.
   * **BLOCK**: Payload is completely rejected.
8. **Telemetry Publish**: The `Verdict` is published to the `TelemetryBus` (`telemetry.py`).
9. **Return to Agent**: The decorator returns the resolved output to the LLM's context window.

### 3.2 Dashboard Telemetry Flow
1. `TelemetryBus` maintains an in-memory `asyncio.Queue`.
2. The `GET /stream` endpoint yields data from this queue as Server-Sent Events (SSE).
3. The React Dashboard (`App.tsx`) consumes the SSE stream, updating live feed panels, histograms, and latency percentiles in real-time.

### 3.3 Quarantine and Signature Promotion
1. **Quarantine**: Borderline/suspicious payloads that meet the `quarantine` threshold are stored in SQLite. 
2. **Review**: Humans review these via the React Dashboard.
3. **Release**: The payload is marked RELEASED (note: currently does not asynchronously push back to the agent; the agent has already moved on).
4. **Promote**: A true positive in quarantine can be "Promoted". This calls `moss_index.promote()`, immediately adding it to the live Moss index in memory, bumping the index version, and making future identical attacks trigger Stage B instantly.

---

## 4. File & Module Relationships

* **`agentarmor/sentinel/main.py`**: FastAPI app entry point. Handles routing, lifecycle (Moss warmup), and the SSE endpoint.
* **`agentarmor/sentinel/pipeline.py`**: The orchestrator. Coordinates stages A-D, calculates the fused score, and delegates to the policy engine.
* **`agentarmor/sentinel/stages.py`**: The actual detection logic for each stage.
* **`agentarmor/sentinel/policy.py`**: The decision engine. Contains threshold logic and the text sanitization logic.
* **`agentarmor/sentinel/moss_index.py`**: The persistence and retrieval layer. Wraps the Moss SDK, loads `signatures.json` at startup, and provides `query` and `promote` methods.
* **`agentarmor/sentinel/telemetry.py`**: In-process Event bus (`asyncio.Queue`) for decoupling the pipeline from SSE connections.
* **`agentarmor/sentinel/quarantine.py`**: Synchronous SQLite wrapper managing the `quarantine.db`.
* **`agentarmor/agent/interceptor.py`**: The `@protect` decorator logic.
* **`agentarmor/agent/stub_agent.py`**: A mock agent simulating unprotected vs protected tool calls using predefined payloads.
* **`agentarmor/simulator/run_attacks.py`**: A CLI script to bulk-fire payloads from `data/attack_scenarios.json` into the pipeline for deterministic benchmarking.
* **`src/*`**: React frontend components visualizing the system state.

---

## 5. Security & Circuit Breaker Logic

* **Moss Circuit Breaker**: If the Moss index fails or throws an exception, `stage_b` returns a degraded score. The `PolicyEngine` detects this `moss_circuit_broken` state.
  * *Untrusted tiers* (Open Web, User Upload) fail **CLOSED** (BLOCK).
  * *Trusted tiers* (Internal) fail **OPEN** (ALLOW) to preserve uptime.
* **Decorator Boundary**: The `@protect` decorator ensures that even if the gateway throws an internal error, it can be caught, preventing malicious payloads from slipping through by default.

---

## 6. Known Technical Debt & Edge Cases

1. **Stage D Stub**: Stage D (LLM adjudication) is currently a stub. Implementing this requires handling strict free-tier rate limits (Groq/Gemini) and enforcing a hard 2-second timeout so the pipeline never hangs.
2. **In-Memory Telemetry Bottleneck**: The `TelemetryBus` was recently converted from Redis to a pure `asyncio.Queue`. This means the application cannot be scaled horizontally across multiple workers (e.g., `uvicorn --workers 4`), as each worker would have an isolated event bus and Moss index.
3. **Quarantine SQLite Concurrency**: `quarantine.py` uses synchronous `sqlite3` without `aiosqlite`. While SQLite handles basic concurrency, heavy write load during an attack simulation could block the async event loop.
4. **Sanitization Naivety**: `sanitize_text` in `policy.py` uses simple substring replacement and regex. Advanced encodings, token smuggling, or fragmented injections could bypass this sanitization.
5. **Stage C Query Drift Performance**: Stage C calculates query drift by creating a temporary Moss index on the fly (`moss_index.semantic_similarity`). This introduces massive overhead for every tool call that passes a query.
6. **Quarantine Release Limbo**: Releasing a payload from quarantine updates the database, but does not push the payload back to the agent, since the agent's HTTP request has already returned the quarantine placeholder.

---

## 7. Deployment & Configuration

* **Docker**: Managed via `docker-compose.yml`. Contains `sentinel` (FastAPI) and `dashboard` (React) services.
* **Environment Variables**:
  * `MOSS_PROJECT_ID` & `MOSS_PROJECT_KEY`: Required for Moss semantic retrieval.
  * `GROQ_API_KEY` & `GEMINI_API_KEY`: Required for (future) Stage D LLM adjudication.
* **Starting the System**:
  * Development: `npm run dev` (Frontend) and `uvicorn agentarmor.sentinel.main:app --reload` (Backend).
  * Production: `docker-compose up --build`.

## 8. Maintainer / AI Agent Directives

* **Do not reintroduce Redis**: The project was explicitly moved to an in-process memory architecture for telemetry.
* **Do not introduce a Vector Database**: Moss is the sole retrieval layer; Pinecone/Milvus/PgVector are forbidden.
* **When Modifying Stages**: Always ensure the `latency_ms` is explicitly captured using `time.perf_counter()` and appended to the `StageTrace`. Sub-10ms is the strict goal for Stage B.
* **Modifying `signatures.json`**: New seed signatures should increment the `version` field. When developing, remember that the app loads this into Moss once at startup.
