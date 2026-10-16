"""Choose the Tier-1 threshold from labelled traffic. Standard library only.

Given (confidence, correct) pairs from your own decisions, pick the smallest threshold
whose direct-dispatch precision meets a target, and report coverage (how many
decisions Tier 1 handles) and expected calibration error.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class CalibrationProfile:
    threshold: float
    target_precision: float
    precision_at_threshold: float
    coverage_at_threshold: float
    n: int
    ece: float
    bins: list[dict[str, float]]

    def to_dict(self) -> dict:
        return asdict(self)


def expected_calibration_error(pairs: list[tuple[float, bool]], n_bins: int = 10) -> tuple[float, list[dict[str, float]]]:
    """ECE over p_max-style confidences in [0,1]: sum_b (n_b/N) * |acc_b - conf_b|."""
    bins: list[list[tuple[float, bool]]] = [[] for _ in range(n_bins)]
    for conf, ok in pairs:
        i = min(n_bins - 1, max(0, int(conf * n_bins)))
        bins[i].append((conf, ok))
    n = len(pairs)
    ece = 0.0
    rows = []
    for i, b in enumerate(bins):
        if not b:
            rows.append({"lo": i / n_bins, "hi": (i + 1) / n_bins, "n": 0, "accuracy": None, "confidence": None})
            continue
        acc = sum(1 for _, ok in b if ok) / len(b)
        mean_conf = sum(c for c, _ in b) / len(b)
        ece += (len(b) / n) * abs(acc - mean_conf)
        rows.append({"lo": i / n_bins, "hi": (i + 1) / n_bins, "n": len(b), "accuracy": acc, "confidence": mean_conf})
    return ece, rows


def choose_threshold(pairs: Iterable[tuple[float, bool]], *, target_precision: float = 0.95, grid: int = 100) -> CalibrationProfile:
    """Smallest threshold t on a grid such that accuracy among {conf >= t} >= target_precision.

    Falls back to 1.0 (never dispatch directly) when no threshold reaches the target.
    """
    data = [(float(c), bool(ok)) for c, ok in pairs]
    if not data:
        raise ValueError("need at least one labelled decision")
    best = None
    for k in range(grid + 1):
        t = k / grid
        sel = [ok for c, ok in data if c >= t]
        if not sel:
            break
        prec = sum(sel) / len(sel)
        if prec >= target_precision:
            best = (t, prec, len(sel) / len(data))
            break
    if best is None:
        best = (1.0, 0.0, 0.0)
    ece, rows = expected_calibration_error(data)
    return CalibrationProfile(best[0], target_precision, best[1], best[2], len(data), ece, rows)
