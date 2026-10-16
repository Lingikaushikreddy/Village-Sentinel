"""Calibrate the Tier-1 threshold on real testbed traffic.

Reads bench/results/requests.jsonl (from `node engine/dump-requests.mjs`), projects each
request exactly as the service does, asks the Decider, and writes bench/results/calibration.json
with accuracy-vs-confidence bins, the chosen threshold, coverage, ECE and real-traffic latency.

A Tier-1 dispatch is "safe" when the Decider's choice is the scenario's canonical action
or is check_evidence on an unverified claim (investigating is never harmful). The strict
variant counts only the canonical action as correct.
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
from collections import defaultdict
from pathlib import Path

from evidence_first_tool_router.calibration import choose_threshold, expected_calibration_error
from village_sentinel.decider_client import DeciderClient
from village_sentinel.projection import options_for, projected_with_hash


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--requests", default="bench/results/requests.jsonl")
    ap.add_argument("--out", default="bench/results/calibration.json")
    ap.add_argument("--target-precision", type=float, default=0.95)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--device", default=None)
    a = ap.parse_args()

    rows = [json.loads(l) for l in open(a.requests)]
    if a.limit:
        rows = rows[: a.limit]
    client = DeciderClient(device=a.device, timeout_s=60)
    readings = []
    t_all = time.perf_counter()
    for i, row in enumerate(rows):
        state, text, h = projected_with_hash(row["request"])
        ans = client.ask(state, options_for(state))
        safe = ans.choice == row["label"] or (not row["verified"] and ans.choice == "check_evidence")
        readings.append({
            "scenario": row["scenario"], "kind": row["kind"], "verified": row["verified"], "label": row["label"], "input_hash": h,
            "choice": ans.choice, "confidence": ans.confidence, "probabilities": ans.probabilities, "latency_ms": round(ans.latency_ms, 2),
            "input_tokens": ans.input_tokens, "strict_correct": ans.choice == row["label"], "safe": safe,
        })
        if i % 50 == 0:
            print(i, len(rows), round(time.perf_counter() - t_all, 1), "s", flush=True)

    lat = sorted(r["latency_ms"] for r in readings[1:])  # drop the cold call
    safe_pairs = [(r["confidence"], r["safe"]) for r in readings]
    strict_pairs = [(r["confidence"], r["strict_correct"]) for r in readings]
    verified_pairs = [(r["confidence"], r["strict_correct"]) for r in readings if r["verified"]]
    prof_safe = choose_threshold(safe_pairs, target_precision=a.target_precision)
    prof_strict = choose_threshold(strict_pairs, target_precision=a.target_precision)
    prof_verified = choose_threshold(verified_pairs, target_precision=a.target_precision) if verified_pairs else None

    per_scenario = defaultdict(lambda: {"n": 0, "strict_correct": 0, "safe": 0, "choices": defaultdict(int), "mean_conf": 0.0})
    for r in readings:
        s = per_scenario[r["scenario"] + ("/verified" if r["verified"] else "/unverified")]
        s["n"] += 1; s["strict_correct"] += r["strict_correct"]; s["safe"] += r["safe"]; s["choices"][r["choice"]] += 1; s["mean_conf"] += r["confidence"]
    for s in per_scenario.values():
        s["strict_accuracy"] = round(s["strict_correct"] / s["n"], 3); s["safe_rate"] = round(s["safe"] / s["n"], 3); s["mean_conf"] = round(s["mean_conf"] / s["n"], 3); s["choices"] = dict(s["choices"])

    out = {
        "n": len(readings), "backend": client.backend, "target_precision": a.target_precision,
        "threshold_safe": prof_safe.to_dict(), "threshold_strict": prof_strict.to_dict(), "threshold_verified_only": prof_verified.to_dict() if prof_verified else None,
        "ece_safe": prof_safe.ece, "ece_strict": prof_strict.ece,
        "latency_ms": {"median": statistics.median(lat), "p90": lat[int(0.9 * (len(lat) - 1))], "min": lat[0], "max": lat[-1], "n": len(lat)},
        "input_tokens": {"median": statistics.median(r["input_tokens"] for r in readings), "max": max(r["input_tokens"] for r in readings)},
        "per_scenario": dict(per_scenario),
        "readings": readings,
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, indent=2))
    print(json.dumps({k: v for k, v in out.items() if k not in ("readings", "per_scenario")}, indent=1))
    print(json.dumps(out["per_scenario"], indent=1))


if __name__ == "__main__":
    main()
