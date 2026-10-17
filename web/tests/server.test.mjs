import test from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../game.mjs';
import { GameStore } from '../store.mjs';

async function server(t, options = {}) {
  const { createApp } = await import('../server.mjs');
  const store = new GameStore(':memory:');
  const game = new GameManager({ store, source: async () => { throw Error('No provider in HTTP tests'); } });
  const app = createApp({ game, getHealth: async () => ({ connected: false, host: 'local', awsVerified: false }), ...options });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
  return `http://127.0.0.1:${app.address().port}`;
}
const post = (base, path, body, headers = {}) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: JSON.stringify(body),
});

test('HTTP scene creation, decision and export run a recorded example', async t => {
  const base = await server(t);
  const created = await post(base, '/api/runs', { scene: 'notice', mode: 'recorded' });
  assert.equal(created.status, 201);
  const game = await created.json();
  const result = await post(base, `/api/runs/${game.id}/step`, { commandId: 'http-step', expectedVersion: 0 });
  assert.equal(result.status, 200);
  const next = await result.json();
  assert.equal(next.history.length, 1);
  const bundle = await (await fetch(`${base}/api/runs/${game.id}/export`)).json();
  assert.equal(bundle.verification.ok, true);
  assert.equal(bundle.verification.recordedCheckpointsMatch, true);
});

test('cross-origin mutations, unknown scenes and malformed JSON fail clearly', async t => {
  const base = await server(t);
  assert.equal((await post(base, '/api/runs', { scene: 'notice' }, { origin: 'https://another.example' })).status, 403);
  assert.equal((await post(base, '/api/runs', { scene: 'invented' })).status, 400);
  const malformed = await fetch(base + '/api/runs', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await post(base, '/api/runs', { scene: 'notice', providerUrl: 'https://another.example' })).status, 400);
});

test('live creation is disabled by default and requires a token when configured', async t => {
  const disabled = await server(t);
  assert.equal((await post(disabled, '/api/runs', { scene: 'notice', mode: 'live' })).status, 403);
  const locked = await server(t, { allowLive: true, liveToken: 'test-only-token' });
  assert.equal((await post(locked, '/api/runs', { scene: 'notice', mode: 'live' })).status, 401);
  assert.equal((await post(locked, '/api/runs', { scene: 'notice', mode: 'live' }, { 'x-live-token': 'test-only-token' })).status, 201);
  const health = await (await fetch(locked + '/api/health')).json();
  assert.equal(health.awsVerified, false);
  assert.equal(health.liveRequiresToken, true);
  assert.equal(JSON.stringify(health).includes('test-only-token'), false);
});

test('oversized bodies and static traversal never expose source or secrets', async t => {
  const base = await server(t);
  assert.equal((await post(base, '/api/runs', { scene: 'x'.repeat(17000) })).status, 413);
  const traversal = await fetch(base + '/%2e%2e/%2e%2e/README.md');
  assert.equal(traversal.status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
  const missing = await fetch(base + '/api/runs/not-a-run');
  assert.equal(missing.status, 404);
});

test('GET state and health do not trigger inference or change a run', async t => {
  const base = await server(t);
  const run = await (await post(base, '/api/runs', { scene: 'fair-trade' })).json();
  const first = await (await fetch(base + `/api/runs/${run.id}`)).json();
  await fetch(base + '/api/health');
  const second = await (await fetch(base + `/api/runs/${run.id}`)).json();
  assert.deepEqual(first, second);
});
