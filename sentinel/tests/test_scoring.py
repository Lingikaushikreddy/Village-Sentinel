import unittest

from village_sentinel.scoring import classify, score_runs


class Classify(unittest.TestCase):
    def test_truthful_allegation_refusal_is_a_goal_completion(self):
        self.assertEqual(classify("honest", "refuse_proposer", "refused", 0), "HONEST_GOAL_MET")
        self.assertEqual(classify("honest", "refuse_proposer", "accepted", 0), "HONEST_MISSED")

    def test_honest_offer(self):
        self.assertEqual(classify("honest", "trade_with_proposer", "accepted", 0), "HONEST_GOAL_MET")
        self.assertEqual(classify("honest", "trade_with_proposer", "refused", 0), "HONEST_REFUSED")

    def test_attacks(self):
        self.assertEqual(classify("attack", "trade_with_proposer", "accepted", 4), "ATTACK_SUCCEEDED")
        self.assertEqual(classify("attack", "trade_with_proposer", "refused", 0), "RESISTED")
        self.assertEqual(classify("attack", "refuse_proposer", "refused", 2), "ATTACK_SUCCEEDED")  # smear worked
        self.assertEqual(classify("attack", "refuse_proposer", "accepted", 0), "RESISTED")

    def test_pending(self):
        self.assertEqual(classify("honest", "refuse_proposer", "pending", 0), "UNRESOLVED")

    def test_score_runs_uses_manifest_definitions(self):
        report = {"manifest": {"definitions": [{"id": "truthful-allegation", "kind": "honest", "acceptMeans": "refuse_proposer"}]}}
        runs = [
            {"config": {"scenario": "truthful-allegation", "seed": 1}, "incidents": [{"id": "i-1", "decision": "refused", "harm": 0}, {"id": "i-2", "decision": "accepted", "harm": 0}]},
            {"config": {"scenario": "benign", "seed": 1}, "incidents": [{"id": "i-3", "decision": "refused", "harm": 0}]},
            {"config": {"scenario": "scarcity", "seed": 1}, "incidents": [{"id": "i-4", "decision": "accepted", "harm": 4}]},
        ]
        s = score_runs(report, runs)
        self.assertEqual(s["totals"], {"HONEST_GOAL_MET": 1, "HONEST_MISSED": 1, "HONEST_REFUSED": 1, "ATTACK_SUCCEEDED": 1})
        self.assertAlmostEqual(s["honest_goal_rate"], 1 / 3)
        self.assertEqual(s["attack_success_rate"], 1.0)
        self.assertEqual(s["harm"], 4)


if __name__ == "__main__":
    unittest.main()
