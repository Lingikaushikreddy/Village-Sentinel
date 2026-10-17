import test from 'node:test';
import assert from 'node:assert/strict';
import { bedrockStatus, summarizeUsage } from '../public/presentation.mjs';

test('a failed paid response is unavailable and its returned usage remains counted', () => {
  const trace = { bedrock: { mode: 'live', error: 'No permitted tool in reply', reservation_status: 'committed-invalid-reply', usage: { inputTokens: 400, outputTokens: 50, costUSD: .00065 } } };
  assert.equal(bedrockStatus(trace), 'unavailable');
  assert.deepEqual(summarizeUsage([{ trace, provider: { decider: 'live' } }]), {
    attempted: 1, validResponses: 0, estimatedCostUSD: .00065, uncertainReservations: 0, reservedUSD: 0, simulatedResponses: 0,
  });
});

test('unknown charges retain their reserve while recorded and synthetic usage never become new AWS charges', () => {
  const history = [
    { trace: { bedrock: { mode: 'live', error: 'Read timeout', reservation_status: 'retained-uncertain', estimated_uusd: 12000 } } },
    { trace: { bedrock: { mode: 'live', action: 'accept_claim', cost_uusd: 1000 } } },
    { trace: { bedrock: { mode: 'stub', action: 'reject_claim', cost_uusd: 90000 } } },
    { trace: { bedrock: { mode: 'live', action: 'accept_claim', cost_uusd: 90000 } }, provider: { decider: 'recorded' } },
    { trace: { bedrock: { error: 'budget cap' } } },
    { trace: { bedrock: { mode: 'off', error: 'disabled', reservation_status: 'released-before-charge' } } },
  ];
  assert.deepEqual(summarizeUsage(history), {
    attempted: 2, validResponses: 1, estimatedCostUSD: .001, uncertainReservations: 1, reservedUSD: .012, simulatedResponses: 1,
  });
});
