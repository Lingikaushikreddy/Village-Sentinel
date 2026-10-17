import pytest

from evidence_first_tool_router import RouterConfig
from village_sentinel.bedrock_client import BedrockClient, BedrockUnavailable
from village_sentinel.ledger import Ledger
from village_sentinel.service import Sentinel
from test_projection import REQ


class RuntimeReply:
    def __init__(self, reply=None, error=None):
        self.reply, self.error = reply, error

    def converse(self, **kwargs):
        if self.error:
            raise self.error
        return self.reply


def real_client_with_transport(monkeypatch, runtime):
    import boto3
    monkeypatch.setattr(boto3, "client", lambda *args, **kwargs: runtime)
    return BedrockClient(mode="live")


def test_network_timeout_retains_reservation_because_provider_charge_is_unknown(monkeypatch, tmp_path):
    client = real_client_with_transport(monkeypatch, RuntimeReply(error=TimeoutError("read timed out")))
    ledger = Ledger(str(tmp_path / "ledger.sqlite"), budget_uusd=100_000)
    try:
        service = Sentinel(decider=None, bedrock=client, ledger=ledger, config=RouterConfig(), default_mode="bedrock")
        answer = service.decide(REQ)
        assert "fallback" in answer["summary"].lower()
        assert ledger.outstanding_uusd() > 0
        assert ledger.committed_uusd() == 0
        assert ledger.traces()[0]["trace"]["bedrock"]["reservation_status"] == "retained-uncertain"
    finally:
        ledger.close()


def test_malformed_paid_reply_still_records_the_returned_token_usage(monkeypatch, tmp_path):
    reply = {"usage": {"inputTokens": 400, "outputTokens": 50}, "output": {"message": {"content": [{"text": "not a tool"}]}}}
    client = real_client_with_transport(monkeypatch, RuntimeReply(reply=reply))
    ledger = Ledger(str(tmp_path / "ledger.sqlite"), budget_uusd=100_000)
    try:
        service = Sentinel(decider=None, bedrock=client, ledger=ledger, config=RouterConfig(), default_mode="bedrock")
        answer = service.decide(REQ)
        assert ledger.committed_uusd() == 650
        assert answer["usage"]["inputTokens"] == 400
        assert answer["usage"]["outputTokens"] == 50
        assert answer["usage"]["costUSD"] == 0.00065
    finally:
        ledger.close()
