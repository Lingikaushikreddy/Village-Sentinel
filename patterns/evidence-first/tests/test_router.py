"""Contract tests for evidence_first_tool_router. Standard library unittest; run with
`python -m pytest patterns/evidence-first` or `python -m unittest discover patterns/evidence-first/tests`."""
import math
import unittest

from evidence_first_tool_router import (
    DeciderReading,
    EvidenceFirstRouter,
    MalformedProbabilities,
    Route,
    RouterConfig,
    Tier,
    derive_confidence,
    route,
    validate_probabilities,
)

OPTS = ("accept_claim", "reject_claim", "check_evidence")


class ValidateProbabilities(unittest.TestCase):
    def test_accepts_well_formed_and_renormalises_tiny_drift(self):
        p = validate_probabilities({"accept_claim": 0.7, "reject_claim": 0.2, "check_evidence": 0.1004}, OPTS)
        self.assertAlmostEqual(sum(p.values()), 1.0, places=12)
        self.assertEqual(tuple(p), OPTS)  # option order, not dict order

    def test_rejects_missing_option(self):
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": 0.5, "reject_claim": 0.5}, OPTS)

    def test_rejects_extra_option(self):
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": 0.5, "reject_claim": 0.4, "check_evidence": 0.1, "bribe": 0.0}, OPTS)

    def test_rejects_sum_far_from_one(self):
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": 0.5, "reject_claim": 0.5, "check_evidence": 0.5}, OPTS)
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": 0.0, "reject_claim": 0.0, "check_evidence": 0.0}, OPTS)

    def test_rejects_negative_and_above_one(self):
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": -0.1, "reject_claim": 0.6, "check_evidence": 0.5}, OPTS)
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": 1.2, "reject_claim": -0.1, "check_evidence": -0.1}, OPTS)

    def test_rejects_non_finite(self):
        for bad in (math.nan, math.inf, -math.inf):
            with self.assertRaises(MalformedProbabilities, msg=repr(bad)):
                validate_probabilities({"accept_claim": bad, "reject_claim": 0.0, "check_evidence": 0.0}, OPTS)

    def test_rejects_non_numeric_and_bool(self):
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": "0.5", "reject_claim": 0.5, "check_evidence": 0.0}, OPTS)
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": True, "reject_claim": 0.0, "check_evidence": 0.0}, OPTS)
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"accept_claim": None, "reject_claim": 1.0, "check_evidence": 0.0}, OPTS)

    def test_rejects_not_a_mapping(self):
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities([0.5, 0.5, 0.0], OPTS)  # type: ignore[arg-type]

    def test_rejects_degenerate_option_lists(self):
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"a": 1.0}, ("a",))
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({"a": 0.5, "b": 0.5}, ("a", "a", "b"))
        with self.assertRaises(MalformedProbabilities):
            validate_probabilities({}, ())


class Confidence(unittest.TestCase):
    def test_uniform_is_zero_and_one_hot_is_one_for_any_n(self):
        for n in (2, 3, 5, 10):
            self.assertAlmostEqual(derive_confidence([1 / n] * n), 0.0)
            self.assertAlmostEqual(derive_confidence([1.0] + [0.0] * (n - 1)), 1.0)

    def test_matches_strands_formula(self):
        # (N * p_max - 1) / (N - 1); the example from the Strands model card: 0.846/0.090/0.064 -> 0.769
        self.assertAlmostEqual(derive_confidence([0.846, 0.090, 0.064]), (3 * 0.846 - 1) / 2, places=9)
        self.assertAlmostEqual(round(derive_confidence([0.846, 0.090, 0.064]), 3), 0.769)

    def test_clamped_and_single_option_is_certain(self):
        self.assertEqual(derive_confidence([1.0]), 1.0)
        self.assertAlmostEqual(derive_confidence([0.2, 0.2, 0.6]), 0.4)

    def test_reading_carries_choice_confidence_margin(self):
        r = DeciderReading.from_probabilities({"accept_claim": 0.1, "reject_claim": 0.8, "check_evidence": 0.1}, OPTS)
        self.assertEqual(r.choice, "reject_claim")
        self.assertAlmostEqual(r.confidence, 0.7)
        self.assertAlmostEqual(r.margin, 0.7)

    def test_argmax_tie_breaks_by_option_order_deterministically(self):
        r = DeciderReading.from_probabilities({"accept_claim": 0.5, "reject_claim": 0.5, "check_evidence": 0.0}, OPTS)
        self.assertEqual(r.choice, "accept_claim")


class Routing(unittest.TestCase):
    cfg = RouterConfig(threshold=0.6, investigate_tool="check_evidence", max_investigations=1, escalate=True)

    def reading(self, a, r, c):
        return DeciderReading.from_probabilities({"accept_claim": a, "reject_claim": r, "check_evidence": c}, OPTS)

    def test_tier1_direct_when_confident(self):
        out = route(self.reading(0.05, 0.9, 0.05), options=OPTS, config=self.cfg, investigation_allowed=True, investigations_done=0)
        self.assertEqual(out.tier, Tier.DIRECT)
        self.assertEqual(out.tool, "reject_claim")
        self.assertFalse(out.degraded)

    def test_threshold_is_inclusive(self):
        # p_max = 2/3 gives confidence (3*(2/3)-1)/2 = 0.5 exactly in IEEE doubles
        cfg = RouterConfig(threshold=0.5)
        out = route(self.reading(2 / 3, 1 / 6, 1 / 6), options=OPTS, config=cfg, investigation_allowed=True, investigations_done=0)
        self.assertEqual(out.confidence, 0.5)
        self.assertEqual(out.tier, Tier.DIRECT)

    def test_tier2_investigate_when_unsure_and_allowed(self):
        out = route(self.reading(0.45, 0.45, 0.10), options=OPTS, config=self.cfg, investigation_allowed=True, investigations_done=0)
        self.assertEqual(out.tier, Tier.INVESTIGATE)
        self.assertEqual(out.tool, "check_evidence")

    def test_tier2_requires_tool_in_options(self):
        opts = ("accept_claim", "reject_claim")
        r = DeciderReading.from_probabilities({"accept_claim": 0.55, "reject_claim": 0.45}, opts)
        out = route(r, options=opts, config=self.cfg, investigation_allowed=True, investigations_done=0)
        self.assertEqual(out.tier, Tier.ESCALATE)

    def test_tier3_after_investigation_budget_spent(self):
        out = route(self.reading(0.45, 0.45, 0.10), options=OPTS, config=self.cfg, investigation_allowed=True, investigations_done=1)
        self.assertEqual(out.tier, Tier.ESCALATE)
        self.assertIsNone(out.tool)

    def test_tier3_when_investigation_not_permitted(self):
        out = route(self.reading(0.45, 0.45, 0.10), options=OPTS, config=self.cfg, investigation_allowed=False, investigations_done=0)
        self.assertEqual(out.tier, Tier.ESCALATE)

    def test_degraded_direct_when_escalation_disabled(self):
        cfg = RouterConfig(threshold=0.6, escalate=False)
        out = route(self.reading(0.45, 0.45, 0.10), options=OPTS, config=cfg, investigation_allowed=False, investigations_done=0)
        self.assertEqual(out.tier, Tier.DIRECT)
        self.assertTrue(out.degraded)
        self.assertEqual(out.tool, "accept_claim")

    def test_margin_gate_can_force_investigation(self):
        cfg = RouterConfig(threshold=0.3, min_margin=0.5)
        out = route(self.reading(0.55, 0.40, 0.05), options=OPTS, config=cfg, investigation_allowed=True, investigations_done=0)
        self.assertEqual(out.tier, Tier.INVESTIGATE)

    def test_config_validation(self):
        for bad in (0.0, 1.5, -1, math.nan):
            with self.assertRaises(ValueError, msg=repr(bad)):
                RouterConfig(threshold=bad)
        with self.assertRaises(ValueError):
            RouterConfig(max_investigations=-1)

    def test_route_is_a_plain_serialisable_record(self):
        out = route(self.reading(0.05, 0.9, 0.05), options=OPTS, config=self.cfg, investigation_allowed=True, investigations_done=0)
        d = out.to_dict()
        self.assertEqual(d["tier"], 1)
        self.assertEqual(d["tool"], "reject_claim")
        self.assertIn("probabilities", d)
        self.assertIsInstance(Route.from_dict(d), Route)


class RouterLoop(unittest.TestCase):
    def test_hybrid_calls_escalation_only_on_tier3(self):
        calls = {"decide": 0, "escalate": 0}

        def decide(state, options):
            calls["decide"] += 1
            return {"accept_claim": 0.4, "reject_claim": 0.5, "check_evidence": 0.1}

        def escalate(state, options, reading):
            calls["escalate"] += 1
            return "reject_claim"

        r = EvidenceFirstRouter(decide=decide, escalate=escalate, config=RouterConfig(threshold=0.6))
        out = r.step({"claim": "x"}, OPTS, investigation_allowed=True, investigations_done=0)
        self.assertEqual((out.tier, calls["escalate"]), (Tier.INVESTIGATE, 0))
        out = r.step({"claim": "x"}, OPTS, investigation_allowed=True, investigations_done=1)
        self.assertEqual((out.tier, out.tool, calls["escalate"]), (Tier.ESCALATE, "reject_claim", 1))
        self.assertEqual(out.escalation_source, "escalator")

    def test_escalation_failure_falls_back_to_fixed_safe_tool(self):
        def decide(state, options):
            return {"accept_claim": 0.5, "reject_claim": 0.4, "check_evidence": 0.1}

        def escalate(state, options, reading):
            raise TimeoutError("bedrock took too long")

        cfg = RouterConfig(threshold=0.9, fallback_tool="reject_claim")
        r = EvidenceFirstRouter(decide=decide, escalate=escalate, config=cfg)
        out = r.step({}, OPTS, investigation_allowed=False, investigations_done=0)
        self.assertEqual((out.tier, out.tool, out.escalation_source), (Tier.ESCALATE, "reject_claim", "fallback"))
        self.assertIn("TimeoutError", out.reason)

    def test_escalation_failure_falls_back_to_decider_choice_when_no_fixed_tool(self):
        def decide(state, options):
            return {"accept_claim": 0.5, "reject_claim": 0.4, "check_evidence": 0.1}

        def escalate(state, options, reading):
            return "not_an_option"

        r = EvidenceFirstRouter(decide=decide, escalate=escalate, config=RouterConfig(threshold=0.9))
        out = r.step({}, OPTS, investigation_allowed=False, investigations_done=0)
        self.assertEqual((out.tool, out.escalation_source), ("accept_claim", "fallback"))

    def test_fallback_tool_must_be_an_option(self):
        r = EvidenceFirstRouter(decide=lambda s, o: {"a": 0.5, "b": 0.5}, escalate=lambda s, o, rd: (_ for _ in ()).throw(RuntimeError()), config=RouterConfig(threshold=0.9, fallback_tool="zzz"))
        out = r.step({}, ("a", "b"), investigation_allowed=False, investigations_done=0)
        self.assertEqual(out.tool, "a")  # falls back to the decider's choice, never an illegal tool

    def test_malformed_decider_output_is_surfaced_not_swallowed(self):
        r = EvidenceFirstRouter(decide=lambda s, o: {"accept_claim": math.nan, "reject_claim": 0.5, "check_evidence": 0.5}, escalate=None, config=RouterConfig())
        with self.assertRaises(MalformedProbabilities):
            r.step({}, OPTS, investigation_allowed=True, investigations_done=0)

    def test_decider_only_mode_never_escalates(self):
        r = EvidenceFirstRouter(decide=lambda s, o: {"accept_claim": 0.4, "reject_claim": 0.5, "check_evidence": 0.1}, escalate=None, config=RouterConfig(threshold=0.99, escalate=False))
        out = r.step({}, OPTS, investigation_allowed=False, investigations_done=0)
        self.assertEqual((out.tier, out.degraded, out.tool), (Tier.DIRECT, True, "reject_claim"))


if __name__ == "__main__":
    unittest.main()
