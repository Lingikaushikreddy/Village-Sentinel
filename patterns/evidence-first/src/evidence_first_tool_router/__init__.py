"""evidence_first_tool_router: a three-tier, evidence-first routing contract.

Tier 1  Decider 2B confidence >= threshold          -> dispatch the Decider's choice now
Tier 2  confidence < threshold, investigation open  -> dispatch the investigation tool
Tier 3  still unsure after investigating            -> escalate to a large model (Bedrock)

The package knows nothing about villages, Strands or AWS. You give it two callables
(a fast `decide` that returns per-option probabilities and an optional slow
`escalate` that returns one option) and it returns a Route you can log and replay.
Standard library only.
"""
from .router import (
    DeciderReading,
    EvidenceFirstRouter,
    MalformedProbabilities,
    Route,
    RouterConfig,
    RouterError,
    Tier,
    derive_confidence,
    margin_of,
    route,
    validate_probabilities,
)

__all__ = [
    "DeciderReading",
    "EvidenceFirstRouter",
    "MalformedProbabilities",
    "Route",
    "RouterConfig",
    "RouterError",
    "Tier",
    "derive_confidence",
    "margin_of",
    "route",
    "validate_probabilities",
]
__version__ = "0.1.0"
