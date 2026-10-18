import threading

import pytest

from village_sentinel.decider_client import DeciderClient, DeciderUnavailable


def test_timed_out_inference_cannot_accumulate_queued_model_calls(monkeypatch):
    client = DeciderClient(url="http://127.0.0.1:1", timeout_s=0.02)
    release = threading.Event()
    calls = []

    def slow_transport(state, criteria):
        calls.append(state)
        release.wait(2)
        return {"accept_claim": 0.1, "reject_claim": 0.9}, 10

    monkeypatch.setattr(client, "_ask_http", slow_transport)
    options = {"accept_claim": "Accept", "reject_claim": "Decline"}
    try:
        with pytest.raises(DeciderUnavailable, match="exceeded"):
            client.ask("First real operation is still pending", options)
        with pytest.raises(DeciderUnavailable, match="still running"):
            client.ask("Must not enqueue another operation", options)
    finally:
        release.set()
        client._pool.shutdown(wait=True, cancel_futures=True)
    assert calls == ["First real operation is still pending"]


def test_startup_warmup_can_finish_before_health_is_served(monkeypatch):
    client = DeciderClient(url="http://127.0.0.1:1", timeout_s=0.01)
    monkeypatch.setattr(client, "_ask_http", lambda state, criteria: ({"accept_claim": 0.1, "reject_claim": 0.9}, 10))
    try:
        answer = client.ask("Startup probe", {"accept_claim": "Accept", "reject_claim": "Decline"}, timeout_s=1.0)
        assert answer.choice == "reject_claim"
        assert client.timeout_s == 0.01
    finally:
        client._pool.shutdown(wait=True)
