#!/usr/bin/env python
"""verify-sentinel-bundle: offline proof that a comparison bundle is internally consistent.

No network. Checks, per bundle directory written by engine/run-matched.mjs:
  1. manifest.json file hashes match the files on disk.
  2. Every *.report.json replays deterministically in the Settlement engine
     (`settlement-testbed --verify`): world invariants, checkpoints, metrics, baselines.
  3. Every trace's `input_hash` equals sha256(canonical JSON of the stored projected state),
     and the stored state is hermetic (no case ids, labels or hidden fields).
  4. Every routed trace re-derives to the same tier and tool from its recorded
     probabilities, threshold and investigation count via the pure router.
  5. Every Bedrock trace's micro-dollar cost equals the price formula over its tokens, and
     the sum of committed cost per mode equals the report's self-reported cost.
  6. Every transcript answer in each report matches the action its trace committed to,
     and the decision records the same input hash.
Exit 0 only if every check passes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "patterns" / "evidence-first" / "src"))
sys.path.insert(0, str(HERE.parent / "sentinel"))
from evidence_first_tool_router import DeciderReading, RouterConfig, Tier, route  # noqa: E402
from village_sentinel.bedrock_client import micro_usd  # noqa: E402
from village_sentinel.projection import assert_hermetic, canonical_json, sha256_hex  # noqa: E402
from village_sentinel.scoring import score_runs  # noqa: E402

TESTBED = HERE.parent / "engine" / "node_modules" / ".bin" / "settlement-testbed"


class Report:
    def __init__(self) -> None:
        self.checks: list[tuple[str, bool, str]] = []

    def add(self, name: str, ok: bool, detail: str = "") -> None:
        self.checks.append((name, ok, detail))
        print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail else ""), flush=True)

    @property
    def ok(self) -> bool:
        return all(ok for _, ok, _ in self.checks)


def committed_action(trace: dict) -> str | None:
    """The action the service committed to, reconstructed from the trace alone."""
    b = trace.get("bedrock")
    if b:
        return b.get("action") or b.get("fallback")
    r = trace.get("route")
    if r:
        return r.get("tool")
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--skip-replay", action="store_true", help="skip the Settlement engine replay (needs node)")
    a = ap.parse_args()
    d = Path(a.bundle)
    rep = Report()
    manifest = json.loads((d / "manifest.json").read_text())

    # 1. hashes
    for name, meta in manifest["files"].items():
        text = (d / name).read_text()
        rep.add(f"hash {name}", hashlib.sha256(text.encode()).hexdigest() == meta["sha256"] and len(text) == meta["bytes"])

    for mode in manifest["modes"]:
        report = json.loads((d / f"{mode}.report.json").read_text())
        traces = {t["idempotency_key"]: t for t in json.loads((d / f"{mode}.traces.json").read_text())}
        decisions = {x["decisionId"]: x for x in json.loads((d / f"{mode}.decisions.json").read_text())}
        runs = json.loads((d / f"{mode}.runs.json").read_text())

        # 2. engine replay
        if not a.skip_replay:
            env = {**os.environ, "NODE_OPTIONS": "--no-warnings"}
            p = subprocess.run([str(TESTBED), "--verify", str(d / f"{mode}.report.json")], capture_output=True, text=True, env=env)
            rep.add(f"{mode}: engine replay", p.returncode == 0, (p.stdout + p.stderr).strip().splitlines()[-1] if (p.stdout or p.stderr) else "")

        # 3. input hashes + hermetic
        bad_hash = bad_herm = 0
        for t in traces.values():
            if sha256_hex(canonical_json(t["state"])) != t["input_hash"]:
                bad_hash += 1
            try:
                assert_hermetic(t["state"])
            except AssertionError:
                bad_herm += 1
        rep.add(f"{mode}: input hashes", bad_hash == 0, f"{len(traces)} traces, {bad_hash} mismatches")
        rep.add(f"{mode}: hermetic states", bad_herm == 0, f"{bad_herm} leaks")

        # 4. tier re-derivation
        rederived = mismatched = 0
        for t in traces.values():
            tr = t["trace"]
            r = tr.get("route")
            dec = tr.get("decider") or {}
            if not r or "probabilities" not in dec:
                continue
            cfg = RouterConfig(threshold=tr["threshold"], investigate_tool="check_evidence", max_investigations=1, escalate=(t["mode"] == "hybrid"), fallback_tool=None)
            reading = DeciderReading.from_probabilities(dec["probabilities"], tuple(tr["allowed"]))
            done = int(r["investigations_done"])
            allowed_inv = "check_evidence" in tr["allowed"]
            expect = route(reading, options=tuple(tr["allowed"]), config=cfg, investigation_allowed=allowed_inv, investigations_done=done)
            tier, tool = int(expect.tier), expect.tool
            if done >= 1 and allowed_inv and expect.tier is not Tier.DIRECT:
                tier, tool = 2, "check_evidence"
            if tier == 3:
                tool = None if tr.get("bedrock") else tool
            ok = tier == r["tier"] and (tier == 3 or tool == r["tool"]) and abs(expect.confidence - r["confidence"]) < 1e-9
            rederived += 1
            mismatched += not ok
        rep.add(f"{mode}: tier re-derivation", mismatched == 0, f"{rederived} routed traces, {mismatched} mismatches")

        # 5. costs
        bad_cost, total_uusd, calls = 0, 0, 0
        for t in traces.values():
            b = t["trace"].get("bedrock")
            if b and "cost_uusd" in b:
                calls += 1
                total_uusd += b["cost_uusd"]
                if micro_usd(b["input_tokens"], b["output_tokens"]) != b["cost_uusd"]:
                    bad_cost += 1
        reported = round(report["totals"]["selfReportedCostUSD"] * 1e6)
        rep.add(f"{mode}: cost formula", bad_cost == 0, f"{calls} Bedrock calls, {bad_cost} mismatches")
        rep.add(f"{mode}: cost total", abs(total_uusd - reported) <= calls, f"traces {total_uusd} µ$ vs report {reported} µ$")

        # 6. transcript <-> decisions <-> traces
        missing = action_mismatch = hash_mismatch = n = 0
        for case in report["cases"]:
            for entry in case["transcript"]:
                if entry["answer"]["status"] != "valid":
                    continue
                n += 1
                key = entry["decisionId"]
                t, dcn = traces.get(key), decisions.get(key)
                if not t or not dcn:
                    missing += 1
                    continue
                if committed_action(t["trace"]) != entry["answer"]["action"]:
                    action_mismatch += 1
                if dcn["input_hash"] != t["input_hash"] or dcn["tier"] != t["trace"]["tier"]:
                    hash_mismatch += 1
        rep.add(f"{mode}: transcript↔trace", missing == 0 and action_mismatch == 0 and hash_mismatch == 0, f"{n} answers, missing {missing}, action mismatches {action_mismatch}, hash/tier mismatches {hash_mismatch}")

        # strict scoring is informational
        s = score_runs(report, runs)
        print(f"     {mode}: strict scoring {json.dumps(s['totals'])} honest_goal_rate={s['honest_goal_rate']} attack_success_rate={s['attack_success_rate']} harm={s['harm']}")

    print("\nRESULT:", "PASS" if rep.ok else "FAIL", f"({sum(ok for _, ok, _ in rep.checks)}/{len(rep.checks)} checks)")
    return 0 if rep.ok else 1


if __name__ == "__main__":
    sys.exit(main())
