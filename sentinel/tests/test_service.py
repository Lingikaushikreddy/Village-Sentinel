"""Sentinel core with fake clients: tiers, idempotent replay, budget and failure fallbacks."""
import os
import tempfile
import unittest

from evidence_first_tool_router import RouterConfig
from village_sentinel.bedrock_client import BedrockAnswer, BedrockUnavailable
from village_sentinel.decider_client import DeciderAnswer, DeciderUnavailable
from village_sentinel.ledger import Ledger
from village_sentinel.service import Sentinel

from test_projection import REQ


class FakeDecider:
    backend = "fake"

    def __init__(self, probs):
        self.probs, self.calls = probs, 0

    def ask(self, state, criteria):
        self.calls += 1
        if self.probs is None:
            raise DeciderUnavailable("down")
        p = {k: self.probs[k] for k in criteria}
        s = sum(p.values()); p = {k: v / s for k, v in p.items()}
        n = len(p); pm = max(p.values())
        return DeciderAnswer(p, max(p, key=p.get), (n * pm - 1) / (n - 1), 1.0, 100, "fake")


class FakeBedrock:
    mode = "fake"

    def __init__(self, action="reject_claim", fail=False):
        self.action, self.fail, self.calls = action, fail, 0

    def estimate_uusd(self, text):
        return 500

    def decide(self, state, allowed):
        self.calls += 1
        if self.fail:
            raise BedrockUnavailable("boom")
        return BedrockAnswer(self.action, "because", 400, 50, 650, 12.0, "fake-model", "fake")


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.ledger = Ledger(os.path.join(self.dir.name, "l.sqlite"), budget_uusd=2_000)
        self.cfg = RouterConfig(threshold=0.6)

    def tearDown(self):
        self.ledger.close(); self.dir.cleanup()

    def make(self, decider, bedrock, mode="hybrid"):
        return Sentinel(decider=decider, bedrock=bedrock, ledger=self.ledger, config=self.cfg, default_mode=mode)

    def test_tier1_direct(self):
        s = self.make(FakeDecider({"accept_claim": 0.05, "reject_claim": 0.9, "check_evidence": 0.05}), FakeBedrock())
        a = s.decide(REQ)
        self.assertEqual((a["action"], a["sentinel"]["tier"]), ("reject_claim", 1))
        self.assertEqual(a["usage"]["costUSD"], 0.0)

    def test_tier2_then_continue_then_tier3_after_verification(self):
        bed = FakeBedrock("accept_claim")
        s = self.make(FakeDecider({"accept_claim": 0.4, "reject_claim": 0.4, "check_evidence": 0.2}), bed)
        a1 = s.decide(REQ)
        self.assertEqual((a1["action"], a1["sentinel"]["tier"]), ("check_evidence", 2))
        # next tick, still walking: check_evidence still allowed -> keep investigating, no Bedrock
        a2 = s.decide({**REQ, "decisionId": "c_9f2a71c4:t13:mira", "tick": 12})
        self.assertEqual((a2["action"], a2["sentinel"]["tier"], bed.calls), ("check_evidence", 2, 0))
        # verified: only accept/reject remain; decider still unsure -> Tier 3
        a3 = s.decide({**REQ, "decisionId": "c_9f2a71c4:t14:mira", "tick": 13, "allowedActions": ["accept_claim", "reject_claim"]})
        self.assertEqual((a3["action"], a3["sentinel"]["tier"], bed.calls), ("accept_claim", 3, 1))
        self.assertEqual(a3["usage"]["inputTokens"], 400)
        self.assertEqual(self.ledger.committed_uusd(), 650)

    def test_idempotent_replay_does_not_recompute(self):
        d = FakeDecider({"accept_claim": 0.05, "reject_claim": 0.9, "check_evidence": 0.05})
        s = self.make(d, FakeBedrock())
        a = s.decide(REQ); b = s.decide(REQ)
        self.assertEqual(d.calls, 1)
        self.assertTrue(b.get("replayed"))
        self.assertEqual(a["action"], b["action"])

    def test_decider_only_mode_degrades_instead_of_escalating(self):
        bed = FakeBedrock()
        s = self.make(FakeDecider({"accept_claim": 0.5, "reject_claim": 0.5}), bed, mode="decider")
        a = s.decide({**REQ, "allowedActions": ["accept_claim", "reject_claim"]})
        self.assertEqual((a["sentinel"]["tier"], bed.calls), (1, 0))

    def test_bedrock_only_mode(self):
        bed = FakeBedrock("reject_claim")
        d = FakeDecider({"accept_claim": 0.9, "reject_claim": 0.05, "check_evidence": 0.05})
        s = self.make(d, bed, mode="bedrock")
        a = s.decide(REQ)
        self.assertEqual((a["action"], a["sentinel"]["tier"], d.calls, bed.calls), ("reject_claim", 3, 0, 1))

    def test_budget_cap_falls_back_without_calling_bedrock(self):
        self.ledger.reserve("other", 1_900)
        bed = FakeBedrock("accept_claim")
        s = self.make(FakeDecider({"accept_claim": 0.5, "reject_claim": 0.5}), bed)
        a = s.decide({**REQ, "allowedActions": ["accept_claim", "reject_claim"]})
        self.assertEqual(bed.calls, 0)
        self.assertEqual(a["action"], "accept_claim")  # decider's own choice (tie -> first option)
        self.assertIn("budget", a["summary"].lower())

    def test_bedrock_failure_releases_reservation_and_falls_back(self):
        bed = FakeBedrock(fail=True)
        s = self.make(FakeDecider({"accept_claim": 0.45, "reject_claim": 0.55}), bed)
        a = s.decide({**REQ, "allowedActions": ["accept_claim", "reject_claim"]})
        self.assertEqual((a["action"], a["sentinel"]["tier"]), ("reject_claim", 3))
        self.assertEqual(self.ledger.outstanding_uusd(), 0)

    def test_decider_down_hybrid_escalates_decider_only_uses_safe_tool(self):
        bed = FakeBedrock("accept_claim")
        s = self.make(FakeDecider(None), bed)
        self.assertEqual(s.decide(REQ)["action"], "accept_claim")
        s2 = self.make(FakeDecider(None), FakeBedrock(), mode="decider")
        a = s2.decide({**REQ, "decisionId": "c_9f2a71c4:t99:mira"})
        self.assertEqual(a["action"], "reject_claim")

    def test_rejects_unknown_mode_and_malformed_request(self):
        s = self.make(FakeDecider({"accept_claim": 1.0, "reject_claim": 0.0, "check_evidence": 0.0}), FakeBedrock())
        with self.assertRaises(ValueError):
            s.decide(REQ, mode="turbo")
        with self.assertRaises((KeyError, TypeError)):
            s.decide({"decisionId": "x"})


if __name__ == "__main__":
    unittest.main()
