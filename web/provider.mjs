import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseAgentResponse } from '../engine/live-adapter.mjs';
import { GameError } from './store.mjs';
import { bedrockStatus } from './public/presentation.mjs';

export const BUNDLE = new URL('../bench/bundles/2026-10-16T23-06-48-676Z/', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, BUNDLE), 'utf8'));
const report = read('hybrid.report.json');
const traceList = read('hybrid.traces.json');
const manifest = read('manifest.json');
for (const file of ['hybrid.report.json', 'hybrid.traces.json']) {
  const bytes = readFileSync(new URL(file, BUNDLE));
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[file].sha256) throw Error(`Recorded bundle integrity failed: ${file}`);
}
const traces = new Map(traceList.map(row => [row.idempotency_key, row]));

export function recordedCase(scenario) {
  const entry = report.cases.find(row => row.config.scenario === scenario && row.config.seed === 2);
  if (!entry) throw new GameError('No recorded example exists for this scene');
  return structuredClone(entry);
}

export function recordedDecision(entry, request) {
  const saved = entry.transcript.find(row => row.tick === request.tick + 1 && row.actor === request.you.id);
  if (!saved) throw new GameError('The recorded walkthrough does not match the current world', 409);
  const row = traces.get(saved.decisionId);
  if (!row || row.state.claim !== request.claim || JSON.stringify(row.trace.allowed) !== JSON.stringify(request.allowedActions)) {
    throw new GameError('Recorded trace does not match this decision', 409);
  }
  return {
    answer: structuredClone(saved.answer), trace: structuredClone(row.trace), inputHash: row.input_hash,
    provider: { decider: 'recorded', bedrock: bedrockStatus(row.trace), host: 'recorded-local', recordedAt: manifest.createdAt },
  };
}

export function liveSource(baseUrl = 'http://127.0.0.1:8797') {
  const base = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') throw Error('The agent URL must be local HTTP');
  return async request => {
    const started = performance.now();
    const response = await fetch(new URL('/decide?mode=hybrid', base), {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': request.decisionId },
      body: JSON.stringify(request), signal: AbortSignal.timeout(25_000), redirect: 'error',
    });
    if (!response.ok) throw new GameError(`Agent returned HTTP ${response.status}; the world was not advanced`, 502);
    const raw = await response.json();
    const answer = parseAgentResponse(JSON.stringify(raw), request, performance.now() - started);
    if (answer.status !== 'valid') throw new GameError(`Agent answer was invalid (${answer.reason}); the world was not advanced`, 502);
    const records = await fetch(new URL('/traces?mode=hybrid', base), { signal: AbortSignal.timeout(5_000), redirect: 'error' });
    if (!records.ok) throw new GameError('The agent did not expose its trace; the world was not advanced', 502);
    const row = (await records.json()).traces.find(item => item.idempotency_key === request.decisionId);
    if (!row) throw new GameError('Missing decision trace; the world was not advanced', 502);
    return {
      answer, trace: row.trace, inputHash: row.input_hash,
      provider: { decider: row.trace.decider?.error ? 'unavailable' : 'live', bedrock: bedrockStatus(row.trace), host: 'local' },
    };
  };
}

export async function agentHealth(baseUrl) {
  try {
    const response = await fetch(new URL('/health', baseUrl), { signal: AbortSignal.timeout(2500), redirect: 'error' });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return { connected: true, ...(await response.json()), host: 'local', awsVerified: false };
  } catch { return { connected: false, host: 'local', awsVerified: false, bedrock_mode: 'unavailable', decider: null }; }
}
