// Provider errors take precedence over configuration: mode=live does not imply success.
export const bedrockStatus = trace => trace?.bedrock?.error ? 'unavailable' : trace?.bedrock?.mode ?? 'not-called';

export function summarizeUsage(history = []) {
  const total = { attempted: 0, validResponses: 0, estimatedCostUSD: 0, uncertainReservations: 0, reservedUSD: 0, simulatedResponses: 0 };
  for (const entry of history) {
    if (entry.provider?.decider === 'recorded') continue;
    const bedrock = entry.trace?.bedrock;
    if (bedrock?.mode === 'stub' && bedrock.action && !bedrock.error) total.simulatedResponses++;
    if (bedrock?.mode !== 'live' || (!bedrock.action && !bedrock.error)) continue;
    total.attempted++;
    if (bedrock.action && !bedrock.error) total.validResponses++;
    const cost = bedrock.usage?.costUSD ?? (bedrock.cost_uusd ?? 0) / 1e6;
    if (Number.isFinite(cost) && cost >= 0) total.estimatedCostUSD += cost;
    if (bedrock.reservation_status === 'retained-uncertain') {
      total.uncertainReservations++;
      total.reservedUSD += Math.max(0, bedrock.estimated_uusd ?? 0) / 1e6;
    }
  }
  return total;
}
