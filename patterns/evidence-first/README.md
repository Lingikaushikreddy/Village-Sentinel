# evidence_first_tool_router

A reusable **tool-selection** decision pattern for agents that pair a small, fast,
calibrated decision model (Strands Decider 2B) with a large model (Amazon Bedrock).
Standard library only; no dependency on Village Sentinel or the Settlement testbed.

```
            probabilities over tools
decide() ─────────────────────────────► confidence = (N·p_max − 1)/(N − 1)
                                              │
              ┌───────────────────────────────┼─────────────────────────────┐
     conf ≥ τ │                 conf < τ and evidence tool available        │ otherwise
              ▼                               ▼                             ▼
      Tier 1: DIRECT                 Tier 2: INVESTIGATE            Tier 3: ESCALATE
   dispatch decider's choice      dispatch `check_evidence`,     escalate(state) → tool
                                  then ask the decider again      (forced structured
                                  with the new evidence           tool choice on Bedrock)
                                                                  │ failure → fallback_tool
```

## Install

```bash
pip install ./patterns/evidence-first          # or copy the single router.py file
```

## Use

```python
from evidence_first_tool_router import EvidenceFirstRouter, RouterConfig

router = EvidenceFirstRouter(
    decide=lambda state, options: my_decider(state, options),      # -> {option: probability}
    escalate=lambda state, options, reading: my_bedrock(state, options),  # -> option name
    config=RouterConfig(threshold=0.60, investigate_tool="check_evidence", max_investigations=1,
                        fallback_tool="reject_claim"),
)
route = router.step(state, ("accept_claim", "reject_claim", "check_evidence"),
                    investigation_allowed=True, investigations_done=0)
route.tier, route.tool, route.confidence, route.reason
```

`route(...)` is pure: given the same reading and config it returns the same `Route`,
which is what `verify-sentinel-bundle` relies on to re-derive every tier offline.

## Contract

* `validate_probabilities` rejects non-mappings, missing or extra options, non-numeric
  or boolean values, NaN/±inf, values outside [0, 1], and totals that differ from 1 by
  more than 1e-3; accepted input is renormalised to sum to exactly 1.
* `derive_confidence` is the Strands formula `(N·p_max − 1)/(N − 1)` clamped to [0, 1].
* Threshold comparison is inclusive (`>=`), the optional `min_margin` gate is `>=` too.
* Escalation that raises, times out, or returns a tool outside the option list degrades
  to `fallback_tool` (if it is an option) or else the decider's choice, and the Route
  records `escalation_source="fallback"` with the exception in `reason`.
* `escalate=False` yields a decider-only router: low-confidence routes are `DIRECT`
  with `degraded=True`.

## Calibrate

```python
from evidence_first_tool_router.calibration import choose_threshold
profile = choose_threshold([(reading.confidence, was_correct), ...], target_precision=0.95)
profile.threshold, profile.coverage_at_threshold, profile.ece
```

## Test

```bash
python -m pytest patterns/evidence-first -q
```
