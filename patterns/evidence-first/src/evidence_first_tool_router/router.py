from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from enum import IntEnum
from numbers import Real
from typing import Any

Probabilities = Mapping[str, float]
Options = Sequence[str]

# How far the reported probabilities may drift from summing to one before we treat
# them as malformed rather than as float noise. Strands rounds to 4 decimals, so a
# three-option answer can legitimately sum to 0.9998 or 1.0002.
SUM_TOLERANCE = 1e-3
# Probabilities a hair below zero or above one after rounding are tolerated and
# clamped; anything beyond this is malformed.
RANGE_TOLERANCE = 1e-6


class RouterError(ValueError):
    """Base class for contract violations."""


class MalformedProbabilities(RouterError):
    """The decider returned something that is not a probability distribution over the options."""


class Tier(IntEnum):
    DIRECT = 1       # act on the decider's choice
    INVESTIGATE = 2  # gather evidence first
    ESCALATE = 3     # ask the large model


def _check_options(options: Options) -> tuple[str, ...]:
    if isinstance(options, (str, bytes)) or not isinstance(options, Sequence):
        raise MalformedProbabilities("options must be a sequence of option names")
    opts = tuple(options)
    if len(opts) < 2:
        raise MalformedProbabilities(f"need at least 2 options, got {len(opts)}")
    if any(not isinstance(o, str) or not o for o in opts):
        raise MalformedProbabilities("every option must be a non-empty string")
    if len(set(opts)) != len(opts):
        raise MalformedProbabilities("options must be unique")
    return opts


def validate_probabilities(probs: Any, options: Options, *, tolerance: float = SUM_TOLERANCE) -> dict[str, float]:
    """Return a clean distribution keyed in option order, or raise MalformedProbabilities.

    Rejects: non-mappings, missing/extra keys, non-numeric or bool values, NaN/inf,
    values outside [0, 1], and mass that does not sum to 1 within `tolerance`.
    The accepted distribution is renormalised so it sums to exactly 1.0.
    """
    opts = _check_options(options)
    if not isinstance(probs, Mapping):
        raise MalformedProbabilities(f"probabilities must be a mapping, got {type(probs).__name__}")
    keys = set(probs)
    expected = set(opts)
    if keys != expected:
        missing = sorted(expected - keys)
        extra = sorted(keys - expected)
        raise MalformedProbabilities(f"option mismatch: missing={missing} extra={extra}")
    clean: dict[str, float] = {}
    for name in opts:
        value = probs[name]
        if isinstance(value, bool) or not isinstance(value, Real):
            raise MalformedProbabilities(f"{name}: probability must be a real number, got {value!r}")
        p = float(value)
        if not math.isfinite(p):
            raise MalformedProbabilities(f"{name}: probability is not finite ({p!r})")
        if p < -RANGE_TOLERANCE or p > 1.0 + RANGE_TOLERANCE:
            raise MalformedProbabilities(f"{name}: probability {p!r} outside [0, 1]")
        clean[name] = min(1.0, max(0.0, p))
    total = sum(clean.values())
    if abs(total - 1.0) > tolerance:
        raise MalformedProbabilities(f"probabilities sum to {total!r}, not 1 (tolerance {tolerance})")
    return {k: v / total for k, v in clean.items()}


def derive_confidence(probabilities: Sequence[float] | Mapping[str, float]) -> float:
    """Normalised max-probability, the formula Strands Decider reports for `choice`:

        confidence = (N * p_max - 1) / (N - 1), clamped to [0, 1]

    Uniform -> 0, one-hot -> 1, independent of N. N == 1 is a forced answer -> 1.
    """
    values = list(probabilities.values()) if isinstance(probabilities, Mapping) else list(probabilities)
    n = len(values)
    if n <= 1:
        return 1.0
    p_max = max(values)
    return float(max(0.0, min(1.0, (n * p_max - 1.0) / (n - 1.0))))


def margin_of(probabilities: Sequence[float] | Mapping[str, float]) -> float:
    """p(1st) - p(2nd): a second, threshold-free view of how separated the top option is."""
    values = sorted((probabilities.values() if isinstance(probabilities, Mapping) else probabilities), reverse=True)
    if len(values) < 2:
        return 1.0
    return float(values[0] - values[1])


@dataclass(frozen=True)
class DeciderReading:
    """A validated fast-model answer: distribution, argmax, and two separation statistics."""

    probabilities: dict[str, float]
    choice: str
    confidence: float
    margin: float
    latency_ms: float | None = None
    input_tokens: int | None = None

    @classmethod
    def from_probabilities(cls, probs: Any, options: Options, *, latency_ms: float | None = None, input_tokens: int | None = None) -> "DeciderReading":
        clean = validate_probabilities(probs, options)
        # max() keeps the first maximal item, so ties resolve by option order: deterministic.
        choice = max(clean, key=clean.__getitem__)
        return cls(clean, choice, derive_confidence(clean), margin_of(clean), latency_ms, input_tokens)


@dataclass(frozen=True)
class RouterConfig:
    threshold: float = 0.60
    """Tier-1 gate on `derive_confidence`. Calibrate it on your own traffic; see calibration.py."""
    min_margin: float = 0.0
    """Optional second gate: top-1 minus top-2 must also reach this to dispatch directly."""
    investigate_tool: str = "check_evidence"
    max_investigations: int = 1
    escalate: bool = True
    """False gives a decider-only router: low confidence degrades to the decider's choice."""
    fallback_tool: str | None = None
    """Dispatched when escalation fails (timeout, budget, malformed). None -> decider's choice."""

    def __post_init__(self) -> None:
        t = self.threshold
        if isinstance(t, bool) or not isinstance(t, Real) or not math.isfinite(float(t)) or not (0.0 < float(t) <= 1.0):
            raise ValueError(f"threshold must be in (0, 1], got {t!r}")
        if not (0.0 <= float(self.min_margin) <= 1.0):
            raise ValueError(f"min_margin must be in [0, 1], got {self.min_margin!r}")
        if not isinstance(self.max_investigations, int) or self.max_investigations < 0:
            raise ValueError(f"max_investigations must be a non-negative int, got {self.max_investigations!r}")
        if not self.investigate_tool:
            raise ValueError("investigate_tool must be a non-empty name")


@dataclass(frozen=True)
class Route:
    tier: Tier
    tool: str | None
    """The option to dispatch. None only for Tier 3 before the escalator has answered."""
    reason: str
    confidence: float
    margin: float
    probabilities: dict[str, float]
    decider_choice: str
    investigations_done: int
    degraded: bool = False
    """True when escalation was unavailable and a low-confidence decider choice was used."""
    escalation_source: str | None = None
    """'escalator' or 'fallback' once Tier 3 has been resolved."""
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["tier"] = int(self.tier)
        return d

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> "Route":
        kw = dict(d)
        kw["tier"] = Tier(int(kw["tier"]))
        return cls(**kw)


def route(
    reading: DeciderReading,
    *,
    options: Options,
    config: RouterConfig,
    investigation_allowed: bool,
    investigations_done: int,
) -> Route:
    """The pure tier decision. No I/O, no clocks: the same inputs always give the same Route."""
    opts = _check_options(options)
    if reading.choice not in opts:
        raise RouterError(f"reading.choice {reading.choice!r} is not one of the options")
    base = dict(
        confidence=reading.confidence,
        margin=reading.margin,
        probabilities=dict(reading.probabilities),
        decider_choice=reading.choice,
        investigations_done=investigations_done,
    )
    confident = reading.confidence >= config.threshold and reading.margin >= config.min_margin
    if confident:
        return Route(Tier.DIRECT, reading.choice, f"confidence {reading.confidence:.4f} >= {config.threshold}", **base)
    can_investigate = (
        investigation_allowed
        and config.investigate_tool in opts
        and investigations_done < config.max_investigations
    )
    if can_investigate:
        return Route(Tier.INVESTIGATE, config.investigate_tool, f"confidence {reading.confidence:.4f} < {config.threshold}; evidence available", **base)
    if config.escalate:
        why = "investigation budget spent" if investigations_done >= config.max_investigations or not investigation_allowed else "no investigation tool"
        return Route(Tier.ESCALATE, None, f"confidence {reading.confidence:.4f} < {config.threshold}; {why}", **base)
    return Route(Tier.DIRECT, reading.choice, f"confidence {reading.confidence:.4f} < {config.threshold}; escalation disabled", degraded=True, **base)


DecideFn = Callable[[Any, Options], Any]
EscalateFn = Callable[[Any, Options, DeciderReading], Any]


class EvidenceFirstRouter:
    """Wires the pure `route` to a fast decider and an optional slow escalator.

    `decide(state, options)` must return a mapping option -> probability.
    `escalate(state, options, reading)` must return one option name; it may raise.
    Investigation is executed by *your* environment (the router only names the tool),
    so pass `investigations_done` on the next step for the same decision.
    """

    def __init__(self, *, decide: DecideFn, escalate: EscalateFn | None, config: RouterConfig | None = None) -> None:
        self.decide = decide
        self.escalate = escalate
        self.config = config or RouterConfig()
        if self.config.escalate and escalate is None:
            # A hybrid config without an escalator behaves like decider-only, explicitly.
            self.config = RouterConfig(**{**asdict(self.config), "escalate": False})

    def read(self, state: Any, options: Options) -> DeciderReading:
        return DeciderReading.from_probabilities(self.decide(state, options), options)

    def step(self, state: Any, options: Options, *, investigation_allowed: bool, investigations_done: int = 0) -> Route:
        reading = self.read(state, options)
        r = route(reading, options=options, config=self.config, investigation_allowed=investigation_allowed, investigations_done=investigations_done)
        if r.tier is not Tier.ESCALATE:
            return r
        return self.resolve_escalation(r, state, options, reading)

    def resolve_escalation(self, r: Route, state: Any, options: Options, reading: DeciderReading) -> Route:
        opts = _check_options(options)
        fallback = self.config.fallback_tool if self.config.fallback_tool in opts else reading.choice
        try:
            assert self.escalate is not None
            tool = self.escalate(state, options, reading)
            if tool not in opts:
                raise RouterError(f"escalator returned {tool!r}, not one of {list(opts)}")
            return Route(**{**asdict(r), "tier": Tier.ESCALATE, "tool": tool, "escalation_source": "escalator"})
        except Exception as exc:  # noqa: BLE001 - every escalation failure must degrade safely
            reason = f"{r.reason}; escalation failed: {type(exc).__name__}: {exc}; fallback {fallback!r}"
            return Route(**{**asdict(r), "tier": Tier.ESCALATE, "tool": fallback, "reason": reason, "escalation_source": "fallback"})
