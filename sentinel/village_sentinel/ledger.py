"""SQLite ledgers: idempotent decisions, atomic Bedrock spend reservations, decision traces.

One file, WAL mode, every mutation in `BEGIN IMMEDIATE` so two threads (or two
processes) cannot both reserve the last micro-dollar. Money is integer micro-USD.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS decisions (
  idempotency_key TEXT PRIMARY KEY,
  input_hash      TEXT NOT NULL,
  mode            TEXT NOT NULL,
  answer_json     TEXT NOT NULL,
  created_at      REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reservations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL,
  estimated_uusd  INTEGER NOT NULL,
  actual_uusd     INTEGER,
  status          TEXT NOT NULL CHECK (status IN ('reserved','committed','released')),
  created_at      REAL NOT NULL,
  updated_at      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS reservations_key ON reservations(idempotency_key);
CREATE TABLE IF NOT EXISTS sessions (
  session_key     TEXT PRIMARY KEY,
  investigations  INTEGER NOT NULL DEFAULT 0,
  updated_at      REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS traces (
  idempotency_key TEXT PRIMARY KEY,
  input_hash      TEXT NOT NULL,
  state_json      TEXT NOT NULL,
  mode            TEXT NOT NULL,
  trace_json      TEXT NOT NULL,
  created_at      REAL NOT NULL
);
"""


class BudgetExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class Reservation:
    id: int
    idempotency_key: str
    estimated_uusd: int


class Ledger:
    def __init__(self, path: str, *, budget_uusd: int) -> None:
        if budget_uusd < 0:
            raise ValueError("budget must be non-negative micro-USD")
        self.path = path
        self.budget_uusd = int(budget_uusd)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None, timeout=5.0)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.executescript(SCHEMA)

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            else:
                self._conn.execute("COMMIT")

    # ---- idempotent decisions -------------------------------------------------
    def get_decision(self, key: str) -> tuple[str, dict[str, Any]] | None:
        row = self._conn.execute("SELECT input_hash, answer_json FROM decisions WHERE idempotency_key=?", (key,)).fetchone()
        return (row[0], json.loads(row[1])) if row else None

    def put_decision(self, key: str, input_hash: str, mode: str, answer: dict[str, Any]) -> dict[str, Any]:
        """Store once. If the key exists, return the stored answer (first writer wins)."""
        with self._tx() as c:
            row = c.execute("SELECT answer_json FROM decisions WHERE idempotency_key=?", (key,)).fetchone()
            if row:
                return json.loads(row[0])
            c.execute(
                "INSERT INTO decisions(idempotency_key,input_hash,mode,answer_json,created_at) VALUES (?,?,?,?,?)",
                (key, input_hash, mode, json.dumps(answer, sort_keys=True), time.time()),
            )
            return answer

    # ---- spend reservations ---------------------------------------------------
    def committed_uusd(self) -> int:
        return int(self._conn.execute("SELECT COALESCE(SUM(COALESCE(actual_uusd, estimated_uusd)),0) FROM reservations WHERE status='committed'").fetchone()[0])

    def outstanding_uusd(self) -> int:
        """Committed actuals plus live reservations: the number the cap is enforced against."""
        return int(self._conn.execute(
            "SELECT COALESCE(SUM(CASE WHEN status='committed' THEN COALESCE(actual_uusd, estimated_uusd) "
            "WHEN status='reserved' THEN estimated_uusd ELSE 0 END),0) FROM reservations"
        ).fetchone()[0])

    def reserve(self, key: str, estimated_uusd: int) -> Reservation:
        if estimated_uusd < 0:
            raise ValueError("estimate must be non-negative")
        now = time.time()
        with self._tx() as c:
            outstanding = int(c.execute(
                "SELECT COALESCE(SUM(CASE WHEN status='committed' THEN COALESCE(actual_uusd, estimated_uusd) "
                "WHEN status='reserved' THEN estimated_uusd ELSE 0 END),0) FROM reservations"
            ).fetchone()[0])
            if outstanding + estimated_uusd > self.budget_uusd:
                raise BudgetExceeded(f"reserving {estimated_uusd} µ$ would exceed the cap: {outstanding} + {estimated_uusd} > {self.budget_uusd}")
            cur = c.execute(
                "INSERT INTO reservations(idempotency_key,estimated_uusd,status,created_at,updated_at) VALUES (?,?,'reserved',?,?)",
                (key, int(estimated_uusd), now, now),
            )
            return Reservation(int(cur.lastrowid), key, int(estimated_uusd))

    def commit(self, reservation: Reservation, actual_uusd: int) -> None:
        with self._tx() as c:
            c.execute("UPDATE reservations SET status='committed', actual_uusd=?, updated_at=? WHERE id=? AND status='reserved'", (int(actual_uusd), time.time(), reservation.id))

    def release(self, reservation: Reservation) -> None:
        with self._tx() as c:
            c.execute("UPDATE reservations SET status='released', updated_at=? WHERE id=? AND status='reserved'", (time.time(), reservation.id))

    # ---- investigation sessions (one pending claim per resident at a time) ------
    def investigations(self, session_key: str) -> int:
        row = self._conn.execute("SELECT investigations FROM sessions WHERE session_key=?", (session_key,)).fetchone()
        return int(row[0]) if row else 0

    def mark_investigation(self, session_key: str) -> int:
        with self._tx() as c:
            c.execute(
                "INSERT INTO sessions(session_key,investigations,updated_at) VALUES (?,1,?) "
                "ON CONFLICT(session_key) DO UPDATE SET investigations=investigations+1, updated_at=excluded.updated_at",
                (session_key, time.time()),
            )
            return int(c.execute("SELECT investigations FROM sessions WHERE session_key=?", (session_key,)).fetchone()[0])

    # ---- traces ----------------------------------------------------------------
    def put_trace(self, key: str, input_hash: str, state_json: str, mode: str, trace: dict[str, Any]) -> None:
        with self._tx() as c:
            c.execute(
                "INSERT OR IGNORE INTO traces(idempotency_key,input_hash,state_json,mode,trace_json,created_at) VALUES (?,?,?,?,?,?)",
                (key, input_hash, state_json, mode, json.dumps(trace, sort_keys=True), time.time()),
            )

    def traces(self, mode: str | None = None) -> list[dict[str, Any]]:
        q = "SELECT idempotency_key,input_hash,state_json,mode,trace_json,created_at FROM traces"
        args: tuple = ()
        if mode:
            q += " WHERE mode=?"
            args = (mode,)
        q += " ORDER BY created_at"
        return [
            {"idempotency_key": k, "input_hash": h, "state": json.loads(s), "mode": m, "trace": json.loads(t), "created_at": ts}
            for k, h, s, m, t, ts in self._conn.execute(q, args)
        ]

    def close(self) -> None:
        self._conn.close()
