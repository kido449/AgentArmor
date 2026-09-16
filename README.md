# AgentArmor 🛡️

**Real-time security gateway that protects AI agents from malicious tool outputs.**

AgentArmor intercepts untrusted outputs from web search tools, scrapers, APIs, and file readers *before* they can enter an LLM's context window. Built for autonomous agent systems (LangGraph, LangChain, CrewAI), AgentArmor neutralizes prompt injections, roleplay hijacks, system prompt extraction, credential exfiltration, and hidden comment injections at wire speed.

---

## ⚡ Non-Negotiable Architectural Guarantees

1. **Zero External Vector Database**: The entire semantic retrieval layer is handled **in-process** via Moss (`moss_core.LocalIndexManager`). No Milvus, Pinecone, or Qdrant round-trips.
2. **Sub-10ms Retrieval**: Stage B Moss nearest-neighbor search executes in **~0.8ms** directly in process memory.
3. **No OpenAI Dependency**: Stage D and agent fallback use Groq (`llama-3.3-70b-versatile`) as primary and Google Gemini (`gemini-2.5-flash`) as fallback.
4. **Real Measured Overhead**: Every verdict carries a real measured `total_overhead_ms` via Python `time.perf_counter()`—never estimated.
5. **Stage D Borderline Gate**: Expensive LLM adjudication is strictly restricted to ambiguous scores ($0.35 \le \text{confidence} < 0.70$), which accounts for under 5% of all traffic.

---

## 🏗️ Detection Pipeline Architecture

```text
Untrusted Tool Output (Web / File / API)
                │
                ▼
      [Layer 1: Normalizer]
      • Unicode NFKC canonicalization
      • Homoglyph folding (Cyrillic/Greek -> Latin)
      • Hidden markdown comments & base64/hex decoding
      • Sliding window token chunker (512 tokens)
                │
                ▼
      [Stage A: Regex Fast-Path] ─── (Score >= 0.94) ──► Short-circuit to Policy
      • Compiled high-confidence signature patterns
      • Microsecond execution (<0.1ms)
                │ (Score < 0.94)
                ▼
      [Stage B: Moss Semantic Retrieval (CORE)]
      • In-process cosine nearest-neighbor search
      • Sub-10ms headline latency (~0.8ms)
      • Matches against 49+ live attack signatures
                │
                ▼
      [Stage C: Structural & Intent Anomaly]
      • Imperative verbs directed at assistant (NLTK)
      • System prompt / agent persona references
      • Tool-query semantic drift
                │
                ▼
      [Score Fusion: Stages A, B, C]
      • Trust tier weights: INTERNAL (0.85x), THIRD_PARTY (1.0x),
        OPEN_WEB (1.15x), USER_UPLOAD (1.25x)
                │
                ├── (0.35 <= fused < 0.70) ──► [Stage D: LLM Adjudication]
                │                               • Groq Llama 3.3 70B (Primary)
                │                               • Gemini 2.5 Flash (Fallback)
                │                               • 2-second hard timeout
                ▼
      [Policy Engine & Action Selection]
      • ALLOW: Forward tool output unchanged
      • SANITIZE: Strip injection spans/comments, forward clean payload
      • QUARANTINE: Isolate in SQLite store, alert human reviewers
      • BLOCK: Terminate execution, prevent context poisoning
                │
                ▼
      [Telemetry Event Bus] ──► Redis Pub/Sub ──► Next.js/React SSE Dashboard
```

---

## 🚀 Quickstart

### Prerequisites
- Python 3.10+
- Node.js 18+
- (Optional) Docker & Docker Compose
- (Optional) Redis (falls back automatically to in-memory event bus if Redis is not running)

### Setup & Run Locally

1. **Clone repository and set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env and supply GROQ_API_KEY and/or GEMINI_API_KEY
   ```

2. **Run with Node Unified Server (Boots Python Sentinel + Dashboard):**
   ```bash
   npm install
   npm run dev
   ```
   *Dashboard and Gateway will be live at `http://localhost:3000`.*

3. **Or run with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

---

## 🛡️ Protecting Your Agents

Decorate any tool function with `@protect`:

```python
from agentarmor.agent.interceptor import protect
from agentarmor.sentinel.schemas import ToolTrustTier

@protect(tool_name="web_search", trust_tier=ToolTrustTier.OPEN_WEB)
async def web_search_tool(query: str) -> str:
    # Any untrusted content returned here is inspected before the agent sees it!
    return fetch_page_content(query)
```

If an injection is detected:
- **`BLOCK`**: Replaces tool output with a security alert, keeping the agent safe.
- **`SANITIZE`**: Strips malicious comments and tags, preserving legitimate text.
- **`QUARANTINE`**: Records the payload in SQLite for human review and Moss signature promotion.

---

## 📊 Benchmark Summary

| Stage | Technology | Typical Latency | Function |
|---|---|---|---|
| **Stage A** | Compiled Regex | `~0.08 ms` | Fast-path short circuit |
| **Stage B** | **Moss In-Process** | **`~0.79 ms`** | **Core semantic signature matching** |
| **Stage C** | NLTK Intent Heuristics | `~0.35 ms` | Verb & entity drift analysis |
| **Stage D** | Groq / Gemini | `~350 ms` | Borderline adjudication (<5% traffic) |
| **Total Gateway** | Pipeline Orchestrator | **`< 2.5 ms`** | End-to-end verdict generation |

---

## 📡 API Reference

- `POST /api/sentinel/inspect` — Inspects raw tool text and returns full `Verdict` with stage traces.
- `GET /stream` — Server-Sent Events (SSE) telemetry stream of all verdicts.
- `GET /api/sentinel/stats` — Summary metrics, action distribution, and latency percentiles (p50/p95).
- `GET /api/sentinel/signatures` — Lists all active signatures in the Moss index with version.
- `POST /api/sentinel/signatures/promote` — Promotes a confirmed injection payload into Moss at runtime.
- `GET /api/sentinel/quarantine` — Lists quarantined suspicious payloads.
- `POST /api/sentinel/quarantine/{id}/release` — Releases a false positive.
- `POST /api/sentinel/quarantine/{id}/promote` — Promotes a quarantined payload to a live signature.
- `POST /api/sentinel/simulate` — Runs scripted attack scenarios (`attack_scenarios.json`).
- `POST /api/sentinel/agent/run-step` — Runs an autonomous tool call step with WITH vs WITHOUT toggle.
