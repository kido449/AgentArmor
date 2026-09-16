from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


class QuarantineStore:
    """
    SQLite quarantine store for intercepted payloads.
    Provides storage and dashboard management (human release, promotion).
    """

    def __init__(self, db_path: Optional[str] = None):
        self._lock = threading.Lock()
        if db_path is None:
            base_dir = Path(__file__).parent.parent / "data"
            base_dir.mkdir(parents=True, exist_ok=True)
            db_path = str(base_dir / "quarantine.db")
        self.db_path = db_path
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS quarantine_records (
                        request_id TEXT PRIMARY KEY,
                        chunk_id TEXT,
                        raw_text TEXT,
                        tool_name TEXT,
                        trust_tier TEXT,
                        confidence REAL,
                        attack_class TEXT,
                        stage_traces TEXT,
                        status TEXT DEFAULT 'QUARANTINED',
                        timestamp REAL
                    )
                    """
                )
                conn.commit()

    def add(
        self,
        request_id: str,
        chunk_id: str,
        raw_text: str,
        tool_name: str,
        trust_tier: str,
        confidence: float,
        attack_class: Optional[str],
        stage_traces: List[Dict[str, Any]],
    ) -> None:
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO quarantine_records
                    (request_id, chunk_id, raw_text, tool_name, trust_tier, confidence, attack_class, stage_traces, status, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUARANTINED', ?)
                    """,
                    (
                        request_id,
                        chunk_id,
                        raw_text,
                        tool_name,
                        trust_tier,
                        confidence,
                        attack_class or "unknown",
                        json.dumps(stage_traces),
                        time.time(),
                    ),
                )
                conn.commit()

    def list_all(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            with self._get_conn() as conn:
                if status:
                    cursor = conn.execute(
                        "SELECT * FROM quarantine_records WHERE status = ? ORDER BY timestamp DESC",
                        (status,),
                    )
                else:
                    cursor = conn.execute(
                        "SELECT * FROM quarantine_records ORDER BY timestamp DESC"
                    )
                rows = cursor.fetchall()
                results = []
                for row in rows:
                    item = dict(row)
                    item["stage_traces"] = json.loads(item["stage_traces"])
                    results.append(item)
                return results

    def get(self, request_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            with self._get_conn() as conn:
                cursor = conn.execute(
                    "SELECT * FROM quarantine_records WHERE request_id = ?",
                    (request_id,),
                )
                row = cursor.fetchone()
                if not row:
                    return None
                item = dict(row)
                item["stage_traces"] = json.loads(item["stage_traces"])
                return item

    def update_status(self, request_id: str, new_status: str) -> bool:
        with self._lock:
            with self._get_conn() as conn:
                cursor = conn.execute(
                    "UPDATE quarantine_records SET status = ? WHERE request_id = ?",
                    (new_status, request_id),
                )
                conn.commit()
                return cursor.rowcount > 0


quarantine_store = QuarantineStore()
