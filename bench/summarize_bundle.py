"""Summarise a matched comparison bundle: latency, tokens, micro-dollars, tiers, outcomes,
and the matched subset (decision states every mode saw, keyed by input hash).
Writes <bundle>/summary.json and prints a Markdown table."""
from __future__ import annotations

import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "sentinel"))
sys.path.insert(0, str(HERE.parent / "patterns" / "evidence-first" / "src"))
from village_sentinel.scoring import score_runs  # noqa: E402


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * (len(xs) - 1)))] if xs else None


def main(bundle: str) -> None:
    d = Path(bundle)
    manifest = json.loads((d / "manifest.json").read_text())
    per_mode, by_hash = {}, defaultdict(dict)
    for mode in manifest["modes"]:
        report = json.loads((d / f"{mode}.report.json").read_text())
        traces = json.loads((d / f"{mode}.traces.json").read_text())
        runs = json.loads((d / f"{mode}.runs.json").read_text())
        svc_lat = [t["trace"]["total_latency_ms"] for t in traces]
        dec_lat = [t["trace"]["decider"]["latency_ms"] for t in traces if "decider" in t["trace"] and "latency_ms" in t["trace"]["decider"]]
        bed = [t["trace"]["bedrock"] for t in traces if t["trace"].get("bedrock") and "cost_uusd" in t["trace"]["bedrock"]]
        bed_lat = [b["latency_ms"] for b in bed]
        tiers = Counter(t["trace"]["tier"] for t in traces)
        tb_lat = [e["answer"]["latencyMs"] for c in report["cases"] for e in c["transcript"]]
        strict = score_runs(report, runs)
        per_mode[mode] = {
            "decisions": len(traces), "tiers": {str(k): v for k, v in sorted(tiers.items())},
            "service_latency_ms": {"median": round(statistics.median(svc_lat), 1), "p90": round(pct(svc_lat, 0.9), 1), "mean": round(statistics.mean(svc_lat), 1)},
            "testbed_measured_latency_ms": {"median": statistics.median(tb_lat), "p90": pct(tb_lat, 0.9), "mean": round(statistics.mean(tb_lat), 1)},
            "decider_latency_ms": {"median": round(statistics.median(dec_lat), 1), "p90": round(pct(dec_lat, 0.9), 1)} if dec_lat else None,
            "bedrock": {"calls": len(bed), "input_tokens": sum(b["input_tokens"] for b in bed), "output_tokens": sum(b["output_tokens"] for b in bed), "cost_uusd": sum(b["cost_uusd"] for b in bed), "latency_ms_median": round(statistics.median(bed_lat), 1) if bed_lat else None, "modes": sorted({b["mode"] for b in bed})},
            "decider_input_tokens": sum(t["trace"].get("decider", {}).get("input_tokens", 0) for t in traces),
            "testbed_overall": manifest["summary"][mode]["overall"], "strict": {k: v for k, v in strict.items() if k != "outcomes"},
            "wall_ms": manifest["summary"][mode]["wallMs"],
        }
        for t in traces:
            tr = t["trace"]
            by_hash[t["input_hash"]][mode] = {"action": (tr.get("bedrock") or {}).get("action") or (tr.get("route") or {}).get("tool"), "tier": tr["tier"], "latency_ms": tr["total_latency_ms"], "cost_uusd": (tr.get("bedrock") or {}).get("cost_uusd", 0)}
    matched = {h: m for h, m in by_hash.items() if len(m) == len(manifest["modes"])}
    modes = manifest["modes"]
    agree = sum(1 for m in matched.values() if len({m[x]["action"] for x in modes}) == 1)
    matched_summary = {
        "n_states_seen_by_all_modes": len(matched), "all_modes_agree": agree,
        "per_mode": {mode: {"median_latency_ms": round(statistics.median(m[mode]["latency_ms"] for m in matched.values()), 1) if matched else None, "cost_uusd": sum(m[mode]["cost_uusd"] for m in matched.values()), "tiers": dict(Counter(m[mode]["tier"] for m in matched.values()))} for mode in modes},
        "pairwise_agreement": {f"{a}~{b}": sum(1 for m in matched.values() if m[a]["action"] == m[b]["action"]) for i, a in enumerate(modes) for b in modes[i + 1:]},
    }
    out = {"bundle": str(d), "per_mode": per_mode, "matched": matched_summary}
    (d / "summary.json").write_text(json.dumps(out, indent=2))
    rows = ["| mode | decisions | tiers (1/2/3) | service p50 / p90 ms | Bedrock calls | tokens in/out | cost µ$ | attack success | honest refusal (testbed) | honest goal rate (strict) | harm |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for mode, m in per_mode.items():
        t = m["tiers"]; b = m["bedrock"]; o = m["testbed_overall"]; s = m["strict"]
        rows.append(f"| {mode} | {m['decisions']} | {t.get('1',0)}/{t.get('2',0)}/{t.get('3',0)} | {m['service_latency_ms']['median']} / {m['service_latency_ms']['p90']} | {b['calls']} | {b['input_tokens']}/{b['output_tokens']} | {b['cost_uusd']} | {o['attackSuccess']:.3f} | {o['honestRefusal']:.3f} | {s['honest_goal_rate'] if s['honest_goal_rate'] is None else round(s['honest_goal_rate'],3)} | {s['harm']} |")
    print("\n".join(rows))
    print("\nmatched states:", json.dumps(matched_summary, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
