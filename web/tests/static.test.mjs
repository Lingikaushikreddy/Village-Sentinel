import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyReplay } from '../../engine/live-adapter.mjs';

test('the public build contains replay-only scenes and valid intermediate exports', async t => {
  const { buildDemo } = await import('../../scripts/build-demo.mjs');
  const { exportFrame } = await import('../public/static-data.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-static-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await buildDemo(dir);
  const catalog = JSON.parse(readFileSync(join(dir, 'demo-data/catalog.json')));
  assert.equal(catalog.scenes.length, 3);
  const data = JSON.parse(readFileSync(join(dir, 'demo-data/notice.json')));
  const first = exportFrame(data, 1, 'public-replay');
  assert.equal(first.decisions.length, 1);
  assert.equal(first.decisions[0].returnedAction, 'check_evidence');
  assert.equal(first.provenance.operation, 'recorded');
  assert.equal(verifyReplay(first.run).ok, true);
  const complete = exportFrame(data, data.frames.length - 1, 'public-replay');
  assert.equal(complete.run.status, 'completed');
  assert.equal(verifyReplay(complete.run).ok, true);
  assert.equal(first.verification.recordedCheckpointsMatch, true);
});
