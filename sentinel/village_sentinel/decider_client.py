"""Strands Decider 2B client: in-process (torch/MPS/CUDA/CPU) or over HTTP to `strands-decider serve`.

Either way the question is a single `choice` over the allowed actions, so the reported
`confidence` is exactly (N·p_max − 1)/(N − 1) over the temperature-scaled softmax of the
pointer-head logits (see docs/DECIDER_MECHANICS.md).
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from dataclasses import dataclass
from typing import Any

MODEL_ID = "StrandsAgents/strands-decider-2B-hobson-v19"
MODEL_REVISION = "bb282d786bc251fd4e3068de3ada9ddbb38127cd"  # pinned Hub commit, 2026-10-01
BASE_MODEL_REVISION = "b1485b2fa6dfa1287294f269f5fb618e03d52d7c"  # Qwen/Qwen3.5-2B-Base per provenance.json

INSTRUCTIONS = (
    "You are the resident named in `you`. A claim was made to you (`claim`). Using only the "
    "state, pick the action that best protects your coins and food while still taking fair "
    "trades: verify unsupported or pressuring claims before acting, accept offers at the "
    "normal price, and refuse claims the evidence contradicts."
)


class DeciderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class DeciderAnswer:
    probabilities: dict[str, float]
    choice: str
    confidence: float
    latency_ms: float
    input_tokens: int
    backend: str


class DeciderClient:
    """`ask(state, options)` -> DeciderAnswer. Bounded by `timeout_s`."""

    def __init__(self, *, url: str | None = None, checkpoint: str | None = None, device: str | None = None, timeout_s: float = 10.0) -> None:
        self.url = url or os.environ.get("SENTINEL_DECIDER_URL")
        self.timeout_s = timeout_s
        self._engine = None
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="decider")
        self.backend = "http" if self.url else "in-process"
        if not self.url:
            self._load(checkpoint or os.environ.get("SENTINEL_DECIDER_CHECKPOINT") or MODEL_ID, device)

    def _load(self, checkpoint: str, device: str | None) -> None:
        try:
            import torch
            from strands_decider.infer import load_engine
            from strands_decider.modeling import checkpoint_dir
        except ImportError as exc:  # pragma: no cover
            raise DeciderUnavailable("pip install 'village-sentinel[decider]' for the in-process backend") from exc
        dev = device or os.environ.get("SENTINEL_DECIDER_DEVICE") or ("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
        path = checkpoint_dir(checkpoint, revision=MODEL_REVISION if checkpoint == MODEL_ID else None)
        self._engine = load_engine(path, device=dev)
        self.device = dev
        self.backend = f"in-process:{dev}"

    def _ask_inprocess(self, state, criteria: dict[str, str]) -> tuple[dict[str, float], int]:
        from strands_decider.schema import ChoiceQuestion
        resp = self._engine.ask(state, {"action": ChoiceQuestion(instructions=INSTRUCTIONS, criteria=criteria)})
        ans = resp.answers["action"]
        return dict(ans.probabilities), int(resp.usage.input_tokens)

    def _ask_http(self, state, criteria: dict[str, str]) -> tuple[dict[str, float], int]:
        body = json.dumps({"state": state, "questions": {"action": {"type": "choice", "instructions": INSTRUCTIONS, "criteria": criteria}}}).encode()
        req = urllib.request.Request(self.url.rstrip("/") + "/v1/systemone", data=body, headers={"content-type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout_s) as r:
            data = json.loads(r.read())
        ans = data["answers"]["action"]
        return dict(ans["probabilities"]), int(data.get("usage", {}).get("input_tokens", 0))

    def ask(self, state: "dict[str, Any] | str", criteria: dict[str, str]) -> DeciderAnswer:
        """`state` may be the projected dict (rendered by Strands as indented JSON) or an
        already-rendered string (the service passes `render_state_text(state)`)."""
        from evidence_first_tool_router import DeciderReading
        started = time.perf_counter()
        fn = self._ask_http if self.url else self._ask_inprocess
        fut = self._pool.submit(fn, state, criteria)
        try:
            probs, tokens = fut.result(timeout=self.timeout_s)
        except FutureTimeout as exc:
            raise DeciderUnavailable(f"decider exceeded {self.timeout_s}s") from exc
        except Exception as exc:
            raise DeciderUnavailable(f"decider failed: {type(exc).__name__}: {exc}") from exc
        latency = (time.perf_counter() - started) * 1000.0
        reading = DeciderReading.from_probabilities(probs, tuple(criteria))
        return DeciderAnswer(reading.probabilities, reading.choice, reading.confidence, latency, tokens, self.backend)
