import os
import tempfile
import threading
import unittest

from village_sentinel.ledger import BudgetExceeded, Ledger


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.ledger = Ledger(os.path.join(self.dir.name, "l.sqlite"), budget_uusd=1_000)

    def tearDown(self):
        self.ledger.close()
        self.dir.cleanup()

    def test_idempotent_decision_first_writer_wins(self):
        a = self.ledger.put_decision("k1", "h", "hybrid", {"action": "reject_claim"})
        b = self.ledger.put_decision("k1", "h", "hybrid", {"action": "accept_claim"})
        self.assertEqual(a, b)
        self.assertEqual(self.ledger.get_decision("k1")[1]["action"], "reject_claim")

    def test_reservation_cap_is_atomic_under_concurrency(self):
        wins, losses = [], []

        def worker(i):
            try:
                r = self.ledger.reserve(f"k{i}", 300)
                wins.append(r)
            except BudgetExceeded:
                losses.append(i)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(len(wins), 3)  # 3 * 300 = 900 <= 1000; a 4th would be 1200
        self.assertEqual(len(losses), 7)
        self.assertEqual(self.ledger.outstanding_uusd(), 900)

    def test_release_frees_budget_and_commit_records_actual(self):
        r1 = self.ledger.reserve("a", 600)
        r2 = self.ledger.reserve("b", 400)
        with self.assertRaises(BudgetExceeded):
            self.ledger.reserve("c", 1)
        self.ledger.release(r1)
        self.ledger.commit(r2, 250)
        self.assertEqual(self.ledger.committed_uusd(), 250)
        self.assertEqual(self.ledger.outstanding_uusd(), 250)
        self.ledger.reserve("c", 750)
        with self.assertRaises(BudgetExceeded):
            self.ledger.reserve("d", 1)

    def test_commit_is_a_noop_after_release(self):
        r = self.ledger.reserve("x", 100)
        self.ledger.release(r)
        self.ledger.commit(r, 100)
        self.assertEqual(self.ledger.committed_uusd(), 0)

    def test_sessions_and_traces(self):
        self.assertEqual(self.ledger.investigations("c:mira"), 0)
        self.assertEqual(self.ledger.mark_investigation("c:mira"), 1)
        self.assertEqual(self.ledger.mark_investigation("c:mira"), 2)
        self.ledger.put_trace("k", "h", "{}", "hybrid", {"tier": 2})
        self.ledger.put_trace("k", "h", "{}", "hybrid", {"tier": 9})  # ignored duplicate
        self.assertEqual(self.ledger.traces("hybrid")[0]["trace"]["tier"], 2)
        self.assertEqual(self.ledger.traces("bedrock"), [])

    def test_rejects_negative(self):
        with self.assertRaises(ValueError):
            self.ledger.reserve("k", -1)
        with self.assertRaises(ValueError):
            Ledger(":memory:", budget_uusd=-5)


if __name__ == "__main__":
    unittest.main()
