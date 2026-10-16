"""The agent service the Settlement testbed talks to: POST /decide (protocol 1).

Loopback only (127.0.0.1). Every request is idempotent on `Idempotency-Key` (default: the
testbed's decisionId); replays return the stored answer without touching a model. Each
decision is one of three modes, selectable per request with `?mode=`:

  decider  Decider 2B only. Low confidence degrades to the Decider's choice (never Bedrock).
  bedrock  Bedrock only. Every decision is a Converse call with a forced tool choice.
  hybrid   The evidence-first router: Tier 1 Decider, Tier 2 check_evidence, Tier 3 Bedrock.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from evidence_first_tool_router import DeciderReading, Route, RouterConfig, Tier, route

from .bedrock_client import BedrockClient, BedrockUnavailable
from .decider_client import DeciderClient, DeciderUnavailable
from .ledger import BudgetExceeded, Ledger
from .projection import options_for, projected_with_hash

MODES = ("decider", "bedrock", "hybrid")
DEFAULT_BUDGET_UUSD = 22_000_000  # $22.00 of a $25 allocation
FALLBACK_TOOL = "reject_claim"


class Sentinel:
    def __init__(self, *, decider: DeciderClient | None, bedrock: BedrockClient, ledger: Ledger, config: RouterConfig, default_mode: str = "hybrid") -> None:
        self.decider, self.bedrock, self.ledger, self.config = decider, bedrock, ledger, config
        if default_mode not in MODES:
            raise ValueError(default_mode)
        self.default_mode = default_mode

    # ---------------------------------------------------------------- core
    def decide(self, request: dict[str, Any], *, mode: str | None = None, idempotency_key: str | None = None) -> dict[str, Any]:
        mode = mode or self.default_mode
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}")
        key = idempotency_key or str(request["decisionId"])
        stored = self.ledger.get_decision(key)
        if stored:
            return {**stored[1], "replayed": True}
        t0 = time.perf_counter()
        state, state_text, input_hash = projected_with_hash(request)
        allowed = list(state["allowedActions"])
        criteria = options_for(state)
        session_key = f"{request.get('caseId','?')}:{request['you']['id']}"
        trace: dict[str, Any] = {"mode": mode, "input_hash": input_hash, "allowed": allowed, "threshold": self.config.threshold}

        action, summary, usage = None, "", {"inputTokens": 0, "outputTokens": 0, "costUSD": 0.0}
        if mode == "bedrock":
            action, summary, usage = self._escalate(state, state_text, allowed, key, trace)
            trace["tier"] = 3
        else:
            reading = self._read(state, criteria, trace)
            investigation_allowed = "check_evidence" in allowed
            done = self.ledger.investigations(session_key)
            cfg = self.config if mode == "hybrid" else RouterConfig(**{**self.config.__dict__, "escalate": False})
            if reading is None:
                # Decider unavailable: hybrid escalates, decider-only falls back to the safe tool.
                trace["decider_error"] = True
                if mode == "hybrid":
                    action, summary, usage = self._escalate(state, state_text, allowed, key, trace)
                    trace["tier"] = 3
                else:
                    action = FALLBACK_TOOL if FALLBACK_TOOL in allowed else allowed[0]
                    summary = "Decider unavailable; safe fallback."
                    trace["tier"] = 1
                    trace["degraded"] = True
            else:
                r = route(reading, options=tuple(allowed), config=cfg, investigation_allowed=investigation_allowed, investigations_done=done)
                if done >= 1 and investigation_allowed and r.tier is not Tier.DIRECT:
                    # Still walking to the source: keep investigating; Tier 3 waits for evidence.
                    r = Route(**{**r.__dict__, "tier": Tier.INVESTIGATE, "tool": "check_evidence", "reason": r.reason + "; investigation in progress"})
                trace["route"] = r.to_dict()
                trace["tier"] = int(r.tier)
                if r.tier is Tier.INVESTIGATE:
                    if done == 0:
                        self.ledger.mark_investigation(session_key)
                    action, summary = r.tool, f"Confidence {r.confidence:.2f} below {cfg.threshold}; checking the source first."
                elif r.tier is Tier.DIRECT:
                    action = r.tool
                    summary = f"Decider {r.confidence:.2f} confident" + (" (degraded: no escalation)." if r.degraded else ".")
                else:
                    action, summary, usage = self._escalate(state, state_text, allowed, key, trace, reading=reading)
        total_ms = (time.perf_counter() - t0) * 1000.0
        trace["total_latency_ms"] = round(total_ms, 3)
        answer = {
            "action": action,
            "evidenceIds": [],
            "summary": summary[:600],
            "usage": {k: (round(v, 8) if isinstance(v, float) else v) for k, v in usage.items()},
            "sentinel": {"mode": mode, "tier": trace["tier"], "input_hash": input_hash, "latency_ms": round(total_ms, 3)},
        }
        self.ledger.put_trace(key, input_hash, state_text, mode, trace)
        return self.ledger.put_decision(key, input_hash, mode, answer)

    def _read(self, state: dict[str, Any], criteria: dict[str, str], trace: dict[str, Any]) -> DeciderReading | None:
        if self.decider is None:
            trace["decider"] = {"error": "not configured"}
            return None
        try:
            ans = self.decider.ask(state, criteria)
        except DeciderUnavailable as exc:
            trace["decider"] = {"error": str(exc)}
            return None
        trace["decider"] = {"probabilities": ans.probabilities, "choice": ans.choice, "confidence": ans.confidence, "latency_ms": round(ans.latency_ms, 3), "input_tokens": ans.input_tokens, "backend": ans.backend}
        return DeciderReading(ans.probabilities, ans.choice, ans.confidence, max(ans.probabilities.values()) - sorted(ans.probabilities.values())[-2], ans.latency_ms, ans.input_tokens)

    def _escalate(self, state, state_text, allowed, key, trace, *, reading: DeciderReading | None = None):
        fallback = (reading.choice if reading else None) or (FALLBACK_TOOL if FALLBACK_TOOL in allowed else allowed[0])
        est = self.bedrock.estimate_uusd(state_text)
        try:
            reservation = self.ledger.reserve(key, est)
        except BudgetExceeded as exc:
            trace["bedrock"] = {"error": f"budget: {exc}", "fallback": fallback}
            return fallback, "Bedrock budget cap reached; using fallback.", {"inputTokens": 0, "outputTokens": 0, "costUSD": 0.0}
        try:
            ans = self.bedrock.decide(state, allowed)
        except BedrockUnavailable as exc:
            self.ledger.release(reservation)
            trace["bedrock"] = {"error": str(exc), "fallback": fallback, "estimated_uusd": est}
            return fallback, f"Bedrock unavailable ({type(exc).__name__}); using fallback.", {"inputTokens": 0, "outputTokens": 0, "costUSD": 0.0}
        self.ledger.commit(reservation, ans.cost_uusd)
        trace["bedrock"] = {"model_id": ans.model_id, "mode": ans.mode, "action": ans.action, "input_tokens": ans.input_tokens, "output_tokens": ans.output_tokens, "cost_uusd": ans.cost_uusd, "estimated_uusd": est, "latency_ms": round(ans.latency_ms, 3)}
        return ans.action, f"Bedrock ({ans.mode}): {ans.rationale}", {"inputTokens": ans.input_tokens, "outputTokens": ans.output_tokens, "costUSD": ans.cost_uusd / 1e6}


# ---------------------------------------------------------------- HTTP
def make_handler(sentinel: Sentinel):
    class Handler(BaseHTTPRequestHandler):
        server_version = "VillageSentinel/0.1"

        def _send(self, code: int, body: dict[str, Any]) -> None:
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            url = urlparse(self.path)
            if url.path == "/health":
                return self._send(200, {"ok": True, "modes": MODES, "default_mode": sentinel.default_mode, "threshold": sentinel.config.threshold, "bedrock_mode": sentinel.bedrock.mode, "decider": getattr(sentinel.decider, "backend", None), "spent_uusd": sentinel.ledger.committed_uusd(), "budget_uusd": sentinel.ledger.budget_uusd})
            if url.path == "/traces":
                mode = parse_qs(url.query).get("mode", [None])[0]
                return self._send(200, {"traces": sentinel.ledger.traces(mode)})
            return self._send(404, {"error": "not found"})

        def do_POST(self):
            url = urlparse(self.path)
            if url.path != "/decide":
                return self._send(404, {"error": "not found"})
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                return self._send(413, {"error": "too large"})
            try:
                request = json.loads(self.rfile.read(length))
                mode = parse_qs(url.query).get("mode", [None])[0]
                key = self.headers.get("Idempotency-Key")
                answer = sentinel.decide(request, mode=mode, idempotency_key=key)
            except (ValueError, KeyError, TypeError, AssertionError) as exc:
                return self._send(400, {"error": f"{type(exc).__name__}: {exc}"})
            self._send(200, answer)

        def log_message(self, *args):  # quiet
            pass

    return Handler


def build(args: argparse.Namespace) -> Sentinel:
    ledger = Ledger(args.ledger, budget_uusd=args.budget_uusd)
    bedrock = BedrockClient(mode=args.bedrock_mode)
    decider = None
    if not args.no_decider:
        decider = DeciderClient(url=args.decider_url, timeout_s=args.decider_timeout)
    cfg = RouterConfig(threshold=args.threshold, investigate_tool="check_evidence", max_investigations=1, escalate=True, fallback_tool=None)
    return Sentinel(decider=decider, bedrock=bedrock, ledger=ledger, config=cfg, default_mode=args.mode)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Village Sentinel agent service (loopback only)")
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8097")))
    p.add_argument("--mode", choices=MODES, default=os.environ.get("SENTINEL_MODE", "hybrid"))
    p.add_argument("--threshold", type=float, default=float(os.environ.get("SENTINEL_THRESHOLD", "0.60")))
    p.add_argument("--ledger", default=os.environ.get("SENTINEL_LEDGER", "sentinel-ledger.sqlite"))
    p.add_argument("--budget-uusd", type=int, default=int(os.environ.get("SENTINEL_BUDGET_UUSD", str(DEFAULT_BUDGET_UUSD))))
    p.add_argument("--bedrock-mode", choices=["live", "stub", "off"], default=os.environ.get("SENTINEL_BEDROCK_MODE", "stub"))
    p.add_argument("--decider-url", default=os.environ.get("SENTINEL_DECIDER_URL"))
    p.add_argument("--decider-timeout", type=float, default=float(os.environ.get("SENTINEL_DECIDER_TIMEOUT", "10")))
    p.add_argument("--no-decider", action="store_true")
    args = p.parse_args(argv)
    sentinel = build(args)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(sentinel))
    print(json.dumps({"listening": f"http://127.0.0.1:{server.server_address[1]}/decide", "mode": args.mode, "threshold": args.threshold, "bedrock_mode": args.bedrock_mode, "decider": getattr(sentinel.decider, "backend", None)}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
