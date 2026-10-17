import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup(t, source) {
  const { GameManager } = await import('../game.mjs');
  const { GameStore } = await import('../store.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-game-'));
  const store = new GameStore(join(dir, 'game.sqlite'));
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return new GameManager({ store, source });
}

const decline = async () => ({
  answer: { status: 'valid', action: 'reject_claim', evidenceIds: [], summary: 'Test fixture only.', latencyMs: 0 },
  trace: { tier: 1, decider: { choice: 'reject_claim', probabilities: { accept_claim: .02, reject_claim: .96, check_evidence: .02 }, confidence: .94 } },
  provider: { decider: 'test-fixture', bedrock: 'off', host: 'local' },
});

test('a returned tool changes the real engine and its replay stays valid', async t => {
  const game = await setup(t, decline);
  const run = game.create({ scene: 'notice', mode: 'live' });
  assert.equal(run.pending.you.name, 'Mira');
  assert.equal(run.world.tick, 8);
  const next = await game.step(run.id, { commandId: 'step-1', expectedVersion: 0 });
  assert.equal(next.version, 1);
  assert.equal(next.history[0].returnedAction, 'reject_claim');
  assert.equal(next.incidents[0].decision, 'refused');
  assert.equal(next.incidents[0].outcome, 'resisted');
  const bundle = game.export(run.id);
  assert.equal(bundle.verification.ok, true);
  assert.equal(bundle.run.socialDecisions[0].action, 'reject_claim');
});

test('duplicate concurrent clicks share one source call and one world transition', async t => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const game = await setup(t, async (...args) => { calls++; await gate; return decline(...args); });
  const run = game.create({ scene: 'notice', mode: 'live' });
  const command = { commandId: 'same-command', expectedVersion: 0 };
  const a = game.step(run.id, command);
  const b = game.step(run.id, command);
  release();
  const [first, duplicate] = await Promise.all([a, b]);
  assert.deepEqual(first, duplicate);
  assert.equal(calls, 1);
  assert.equal(game.get(run.id).history.length, 1);
});

test('a changed duplicate command and stale version cannot invoke the source', async t => {
  let calls = 0;
  const game = await setup(t, async () => { calls++; return decline(); });
  const run = game.create({ scene: 'notice', mode: 'live' });
  await game.step(run.id, { commandId: 'step-1', expectedVersion: 0 });
  await assert.rejects(game.step(run.id, { commandId: 'step-1', expectedVersion: 1 }), error => error.status === 409);
  await assert.rejects(game.step(run.id, { commandId: 'step-2', expectedVersion: 0 }), error => error.status === 409);
  assert.equal(calls, 1);
});

test('recorded scenes replay recorded answers without a source or invented live calls', async t => {
  let calls = 0;
  const game = await setup(t, async () => { calls++; throw Error('Replay called a provider'); });
  const run = game.create({ scene: 'fair-trade', mode: 'recorded' });
  let next = run;
  for (let i = 0; next.status !== 'completed' && i < 60; i++) {
    next = await game.step(run.id, { commandId: `recorded-${i}`, expectedVersion: next.version });
  }
  assert.equal(next.status, 'completed');
  assert.equal(calls, 0);
  assert.equal(next.provenance.operation, 'recorded');
  assert.equal(next.provenance.bedrock, 'stub');
  assert.equal(next.incidents[0].decision, 'accepted');
  assert.equal(game.export(run.id).verification.recordedCheckpointsMatch, true);
});

test('provider errors remain visible and leave the current world unapplied', async t => {
  const game = await setup(t, async () => { throw Error('Agent is unavailable'); });
  const run = game.create({ scene: 'notice', mode: 'live' });
  await assert.rejects(game.step(run.id, { commandId: 'bad-source', expectedVersion: 0 }), /Agent is unavailable/);
  const after = game.get(run.id);
  assert.equal(after.version, 0);
  assert.equal(after.world.tick, 8);
  assert.equal(after.history.length, 0);
  assert.match(after.lastError, /Agent is unavailable/);
});

test('a durable completed command replays after reopening the game manager', async t => {
  let calls = 0;
  const game = await setup(t, async () => { calls++; return decline(); });
  const run = game.create({ scene: 'notice', mode: 'live' });
  const command = { commandId: 'durable-step', expectedVersion: 0 };
  const result = await game.step(run.id, command);
  const { GameManager } = await import('../game.mjs');
  const restarted = new GameManager({ store: game.store, source: async () => { throw Error('must not recompute'); } });
  assert.deepEqual(await restarted.step(run.id, command), result);
  assert.equal(calls, 1);
});

test('scene validation and command validation do not silently choose another scene', async t => {
  const game = await setup(t, decline);
  assert.throws(() => game.create({ scene: 'invented', mode: 'live' }), /scene/);
  assert.throws(() => game.create({ scene: 'notice', mode: 'pretend-live' }), /mode/);
  const run = game.create({ scene: 'notice', mode: 'live' });
  await assert.rejects(game.step(run.id, { commandId: '', expectedVersion: false }), /command|version/i);
});
