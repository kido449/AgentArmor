from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import threading
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from agentarmor.sentinel.schemas import Signature

logger = logging.getLogger("agentarmor.moss")

# ---------------------------------------------------------------------------
# Fallback: lightweight n-gram cosine engine (when Moss creds are absent)
# ---------------------------------------------------------------------------

class _FallbackNgramEngine:
    """Minimal n-gram + cosine similarity engine used when real Moss SDK
    credentials are not configured."""

    def __init__(self) -> None:
        self._signatures: List[Signature] = []
        self._vectors: List[Dict[str, float]] = []

    def feature_vector(self, text: str) -> Dict[str, float]:
        clean = text.lower()
        words = re.findall(r"\b[a-z0-9_-]+\b", clean)
        features: Counter[str] = Counter()
        for w in words:
            features[f"w:{w}"] += 2.0
        for i in range(len(words) - 1):
            features[f"bg:{words[i]}_{words[i+1]}"] += 2.5
        for i in range(len(clean) - 2):
            features[f"c3:{clean[i:i+3]}"] += 0.5
        if not features:
            return {}
        norm = math.sqrt(sum(v * v for v in features.values()))
        if norm == 0.0:
            return {}
        return {k: v / norm for k, v in features.items()}

    def load(self, signatures: List[Signature]) -> int:
        self._signatures = []
        self._vectors = []
        for sig in signatures:
            self._signatures.append(sig)
            self._vectors.append(self.feature_vector(sig.text))
        return len(self._signatures)

    def query(self, text: str, top_k: int = 3, min_similarity: float = 0.05) -> Tuple[List[Dict[str, Any]], float]:
        t0 = time.perf_counter()
        q_vec = self.feature_vector(text)
        if not q_vec:
            return [], (time.perf_counter() - t0) * 1000.0
        scored: List[Tuple[float, Signature]] = []
        for sig, s_vec in zip(self._signatures, self._vectors):
            if len(q_vec) < len(s_vec):
                dot = sum(val * s_vec.get(k, 0.0) for k, val in q_vec.items())
            else:
                dot = sum(val * q_vec.get(k, 0.0) for k, val in s_vec.items())
            if dot > min_similarity:
                scored.append((dot, sig))
        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:top_k]
        latency_ms = (time.perf_counter() - t0) * 1000.0
        matches = [
            {
                "id": sig.id,
                "text": sig.text,
                "attack_class": sig.attack_class,
                "similarity": round(score, 4),
                "severity": sig.severity,
            }
            for score, sig in top
        ]
        return matches, latency_ms


# ---------------------------------------------------------------------------
# Main Moss semantic index: real Moss SDK primary, n-gram fallback
# ---------------------------------------------------------------------------

class MossSemanticIndex:
    """
    In-process Moss semantic retrieval index.

    PRIMARY mode  -- uses the real Moss SDK (pip install moss) with
                     MossClient, on-device moss-minilm embeddings,
                     and in-memory query via Moss Cloud sync.
                     Requires MOSS_PROJECT_ID + MOSS_PROJECT_KEY.

    FALLBACK mode -- if credentials are missing or the SDK fails,
                     degrades to a local n-gram + cosine engine.
    """

    MOSS_INDEX_NAME = "attack-signatures"

    def __init__(self, signatures_path: Optional[str] = None):
        self._lock = threading.RLock()
        self._signatures: List[Signature] = []
        self._version: int = 1
        self._signatures_path = signatures_path
        self._using_real_moss: bool = False
        self._moss_client: Any = None
        self._moss_ready: bool = False
        self._fallback = _FallbackNgramEngine()

        # Load signatures from disk (both modes need the data)
        if signatures_path and os.path.exists(signatures_path):
            self._load_signatures_from_file(signatures_path)

        # Attempt real Moss SDK init
        project_id = os.environ.get("MOSS_PROJECT_ID", "").strip()
        project_key = os.environ.get("MOSS_PROJECT_KEY", "").strip()

        if project_id and project_key:
            try:
                from moss import MossClient
                self._moss_client = MossClient(project_id, project_key)
                self._using_real_moss = True
                logger.info(
                    "Real Moss SDK client created (project=%s). "
                    "Index will be built on async_warmup().",
                    project_id[:12] + "...",
                )
            except Exception as e:
                logger.warning("Failed to init real Moss SDK: %s -- using n-gram fallback", e)
                self._using_real_moss = False
        else:
            logger.warning(
                "MOSS_PROJECT_ID / MOSS_PROJECT_KEY not set. "
                "Using local n-gram fallback engine (NOT the real Moss SDK)."
            )

    # ---- internal helpers ------------------------------------------------

    def _load_signatures_from_file(self, path: str) -> None:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        sigs = [Signature(**item) for item in data]
        self._signatures = sigs
        self._fallback.load(sigs)
        logger.info("Loaded %d signatures from %s", len(sigs), path)

    def _run_async(self, coro):
        """Run an async coroutine from synchronous context safely."""
        try:
            asyncio.get_running_loop()
            # Inside an existing loop -- run in a worker thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result(timeout=30)
        except RuntimeError:
            # No running loop -- safe to asyncio.run
            return asyncio.run(coro)

    # ---- async Moss SDK operations ---------------------------------------

    async def async_warmup(self) -> None:
        """Call during FastAPI lifespan to create + load the real Moss index.

        Workflow (mirrors the official Moss quickstart):
          1. client.create_index("attack-signatures", docs, "moss-minilm")
             -- Moss Cloud ingests, generates on-device embeddings, stores
          2. client.load_index("attack-signatures")
             -- Pulls index over HTTPS once, then queries are fully in-memory
        """
        if not self._using_real_moss or not self._moss_client:
            return

        try:
            from moss import DocumentInfo

            # Build DocumentInfo objects (real SDK requires this type)
            docs = [
                DocumentInfo(
                    id=sig.id,
                    text=sig.text,
                    metadata={
                        "attack_class": sig.attack_class,
                        "severity": str(sig.severity),
                        "source": sig.source,
                    },
                )
                for sig in self._signatures
            ]

            logger.info(
                "Creating Moss index '%s' with %d docs (moss-minilm embeddings)...",
                self.MOSS_INDEX_NAME, len(docs),
            )
            try:
                await self._moss_client.create_index(
                    self.MOSS_INDEX_NAME,
                    docs,
                    "moss-minilm",
                )
                logger.info("Moss index '%s' created successfully.", self.MOSS_INDEX_NAME)
            except Exception as create_err:
                err_str = str(create_err)
                if "INDEX_EXISTS" in err_str or "409" in err_str:
                    logger.info("Moss index '%s' already exists -- reusing.", self.MOSS_INDEX_NAME)
                else:
                    raise create_err

            logger.info("Loading Moss index '%s' into memory...", self.MOSS_INDEX_NAME)
            await self._moss_client.load_index(self.MOSS_INDEX_NAME)
            self._moss_ready = True
            logger.info(
                "Real Moss SDK ready: index='%s', %d signatures, moss-minilm, in-memory queries enabled.",
                self.MOSS_INDEX_NAME, len(self._signatures),
            )
        except Exception as e:
            logger.error("Moss SDK warmup failed: %s -- falling back to n-gram engine", e)
            self._using_real_moss = False
            self._moss_ready = False

    async def _moss_query_async(self, text: str, top_k: int = 3) -> Tuple[List[Dict[str, Any]], float]:
        """Query the real Moss SDK index. Returns (matches, latency_ms).

        Uses client.query() which returns a SearchResult with:
          - result.docs: list of QueryResultDocumentInfo(id, text, score, metadata)
          - result.time_taken_ms: SDK-reported internal query time
        """
        from moss import QueryOptions

        t0 = time.perf_counter()
        result = await self._moss_client.query(
            self.MOSS_INDEX_NAME,
            text,
            QueryOptions(top_k=top_k),
        )
        wall_ms = (time.perf_counter() - t0) * 1000.0

        # Use SDK's time_taken_ms if available and non-zero, otherwise wall-clock
        sdk_ms = getattr(result, "time_taken_ms", 0)
        latency_ms = sdk_ms if sdk_ms and sdk_ms > 0 else wall_ms

        matches = []
        for doc in result.docs:
            # Metadata is returned by the SDK: {'attack_class': '...', 'severity': '5'}
            meta = getattr(doc, "metadata", {}) or {}
            matches.append({
                "id": doc.id,
                "text": doc.text,
                "attack_class": meta.get("attack_class", "unknown"),
                "similarity": round(doc.score, 4),
                "severity": int(meta.get("severity", 3)),
            })

        return matches, latency_ms

    # ---- public interface (same signatures Stage B calls) ----------------

    @property
    def version(self) -> int:
        return self._version

    @property
    def count(self) -> int:
        with self._lock:
            return len(self._signatures)

    @property
    def using_real_moss(self) -> bool:
        return self._using_real_moss and self._moss_ready

    def load_from_file(self, path: str) -> int:
        self._load_signatures_from_file(path)
        return len(self._signatures)

    def load_signatures(self, signatures: List[Signature]) -> int:
        with self._lock:
            self._signatures = list(signatures)
            self._fallback.load(signatures)
            logger.info("Loaded %d signatures into index (v%d)", len(self._signatures), self._version)
            return len(self._signatures)

    def query(
        self, text: str, top_k: int = 3, min_similarity: float = 0.05
    ) -> Tuple[List[Dict[str, Any]], float]:
        """
        Top-k nearest-neighbor search over the signature index.

        If the real Moss SDK is active (credentials set + index loaded),
        queries the Moss in-memory index (on-device, no network hop).
        Otherwise, falls back to the n-gram engine.

        Returns:
            (matches, latency_ms)
        Where each match includes: id, text, attack_class, similarity, severity
        """
        if self._using_real_moss and self._moss_ready:
            try:
                matches, latency_ms = self._run_async(
                    self._moss_query_async(text, top_k)
                )
                # Apply min_similarity filter
                matches = [m for m in matches if m["similarity"] >= min_similarity]
                return matches, latency_ms
            except Exception as e:
                logger.warning("Real Moss query failed (%s) -- falling back to n-gram", e)

        # Fallback to n-gram engine
        return self._fallback.query(text, top_k, min_similarity)

    def promote(self, signature: Signature) -> int:
        """
        Adds a confirmed true positive to the live Moss index at runtime
        and increments the index version. Thread-safe.

        Uses client.add_docs() to push the new document into the real
        Moss index so future queries match it immediately.
        """
        with self._lock:
            self._signatures.append(signature)
            self._version += 1

            # Update fallback engine
            self._fallback.load(self._signatures)

            # Add to real Moss index via add_docs()
            if self._using_real_moss and self._moss_ready:
                try:
                    from moss import DocumentInfo
                    doc = DocumentInfo(
                        id=signature.id,
                        text=signature.text,
                        metadata={
                            "attack_class": signature.attack_class,
                            "severity": str(signature.severity),
                            "source": signature.source,
                        },
                    )
                    self._run_async(
                        self._moss_client.add_docs(self.MOSS_INDEX_NAME, [doc])
                    )
                    logger.info(
                        "Promoted signature %s to real Moss index via add_docs() (now v%d)",
                        signature.id, self._version,
                    )
                except Exception as e:
                    logger.warning("Failed to promote to real Moss index: %s (fallback updated)", e)

            # Persist to disk
            if self._signatures_path and os.path.exists(self._signatures_path):
                try:
                    with open(self._signatures_path, "w", encoding="utf-8") as f:
                        json.dump(
                            [s.model_dump() for s in self._signatures],
                            f,
                            indent=2,
                        )
                except Exception as e:
                    logger.warning("Could not persist promoted signature to disk: %s", e)

            return self._version

    def get_all_signatures(self) -> List[Signature]:
        with self._lock:
            return list(self._signatures)

    # Expose fallback feature_vector for Stage C drift calculation
    def _feature_vector(self, text: str) -> Dict[str, float]:
        return self._fallback.feature_vector(text)


# ---------------------------------------------------------------------------
# Global default Moss index instance
# ---------------------------------------------------------------------------
_DEFAULT_PATH = str(Path(__file__).parent.parent / "data" / "signatures.json")
moss_index = MossSemanticIndex(signatures_path=_DEFAULT_PATH)
