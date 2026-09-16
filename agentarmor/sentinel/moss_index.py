from __future__ import annotations

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


class MossSemanticIndex:
    """
    In-process Moss semantic retrieval index.
    Executes top-k nearest-neighbor matching over compiled signature vectors
    with zero external network calls or vector database dependency, achieving
    sub-10ms (typically <1ms) query latency.
    """

    def __init__(self, signatures_path: Optional[str] = None):
        self._lock = threading.RLock()
        self._signatures: List[Signature] = []
        self._vectors: List[Dict[str, float]] = []
        self._version: int = 1
        self._signatures_path = signatures_path

        if signatures_path and os.path.exists(signatures_path):
            self.load_from_file(signatures_path)

    @property
    def version(self) -> int:
        return self._version

    @property
    def count(self) -> int:
        with self._lock:
            return len(self._signatures)

    def _feature_vector(self, text: str) -> Dict[str, float]:
        """
        Extract sparse semantic n-gram feature representation.
        Combines word tokens, bigrams, and character tri-grams with L2 normalization
        to capture both exact syntactic structures and semantic fuzziness.
        """
        clean = text.lower()
        words = re.findall(r"\b[a-z0-9_-]+\b", clean)
        features: Counter[str] = Counter()

        for w in words:
            features[f"w:{w}"] += 2.0

        for i in range(len(words) - 1):
            features[f"bg:{words[i]}_{words[i+1]}"] += 2.5

        # Character tri-grams for typo & morphological resilience
        for i in range(len(clean) - 2):
            features[f"c3:{clean[i:i+3]}"] += 0.5

        if not features:
            return {}

        norm = math.sqrt(sum(v * v for v in features.values()))
        if norm == 0.0:
            return {}

        return {k: v / norm for k, v in features.items()}

    def load_from_file(self, path: str) -> int:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        signatures = [Signature(**item) for item in data]
        return self.load_signatures(signatures)

    def load_signatures(self, signatures: List[Signature]) -> int:
        with self._lock:
            self._signatures = []
            self._vectors = []
            for sig in signatures:
                vec = self._feature_vector(sig.text)
                self._signatures.append(sig)
                self._vectors.append(vec)
            logger.info(f"Loaded {len(self._signatures)} signatures into Moss index (v{self._version})")
            return len(self._signatures)

    def query(
        self, text: str, top_k: int = 3, min_similarity: float = 0.05
    ) -> Tuple[List[Dict[str, Any]], float]:
        """
        Top-k nearest-neighbor search over the signature index in-process.
        Returns:
            (matches, latency_ms)
        Where each match includes:
            id, text, attack_class, similarity, severity
        """
        t0 = time.perf_counter()
        q_vec = self._feature_vector(text)
        if not q_vec:
            latency_ms = (time.perf_counter() - t0) * 1000.0
            return [], latency_ms

        scored: List[Tuple[float, Signature]] = []
        with self._lock:
            for sig, s_vec in zip(self._signatures, self._vectors):
                # Cosine similarity between unit-normalized sparse vectors
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

    def promote(self, signature: Signature) -> int:
        """
        Adds a confirmed true positive to the live Moss index at runtime
        and increments the index version. Thread-safe.
        """
        with self._lock:
            vec = self._feature_vector(signature.text)
            self._signatures.append(signature)
            self._vectors.append(vec)
            self._version += 1

            # Persist to disk if path configured
            if self._signatures_path and os.path.exists(self._signatures_path):
                try:
                    with open(self._signatures_path, "w", encoding="utf-8") as f:
                        json.dump(
                            [s.model_dump() for s in self._signatures],
                            f,
                            indent=2,
                        )
                except Exception as e:
                    logger.warning(f"Could not persist promoted signature to disk: {e}")

            logger.info(f"Promoted signature {signature.id} to Moss index (now v{self._version})")
            return self._version

    def get_all_signatures(self) -> List[Signature]:
        with self._lock:
            return list(self._signatures)


# Global default Moss index instance
_DEFAULT_PATH = str(Path(__file__).parent.parent / "data" / "signatures.json")
moss_index = MossSemanticIndex(signatures_path=_DEFAULT_PATH)
