// Real browser -> local HTTP -> engine tests. All provider answers below are test fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from './server.mjs';
import { GameManager } from './game.mjs';
import { GameStore } from './store.mjs';

async function fixture(t) {
  const store = new GameStore(':memory:');
  const game = new GameManager({ store, source: async () => ({
    answer: { status: 'valid', action: 'reject_claim', evidenceIds: [], summary: 'Test fixture: provider failed, fallback used.', latencyMs: 0 },
    trace: { tier: 3, decider: { choice: 'reject_claim', confidence: .1 }, bedrock: { mode: 'live', error: 'No permitted tool in paid reply', reservation_status: 'committed-invalid-reply', usage: { inputTokens: 400, outputTokens: 50, costUSD: .00065 } } },
    provider: { decider: 'live', bedrock: 'unavailable', host: 'local' },
  }) });
  const app = createApp({ game, allowLive: true, liveToken: 'fixture-token', getHealth: async () => ({ connected: true, decider: 'test-fixture', bedrock_mode: 'live' }) });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  t.after(async () => { await browser.close(); await new Promise(resolve => app.close(resolve)); store.close(); });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${app.address().port}`);
  await page.waitForFunction(() => document.querySelector('#next-button')?.disabled === false);
  return page;
}
async function enterToken(page, token) {
  await page.selectOption('#mode', 'live');
  await page.locator('#token-dialog[open]').waitFor();
  await page.locator('#live-token').fill(token);
  await page.locator('#token-form button[type=submit]').click();
}

test('a failed paid reply shows fallback, one attempt, zero valid replies and known usage', async t => {
  const page = await fixture(t);
  await enterToken(page, 'fixture-token');
  await page.waitForFunction(() => document.querySelector('#mode')?.value === 'live' && !document.querySelector('#next-button').disabled);
  await page.locator('#next-button').click();
  await page.locator('#decision-result:not([hidden])').waitFor();
  assert.match(await page.locator('[data-role=bea]').textContent(), /Bedrock failed/);
  assert.match(await page.locator('[data-role=luna]').textContent(), /1 attempt.*0 valid/);
  assert.match(await page.locator('#decision-result').textContent(), /fallback/);
  await page.locator('[data-role=luna]').click();
  assert.match(await page.locator('#character-content').textContent(), /0\.000650/);
});

test('a mistyped token can be corrected without reloading or losing the recorded scene', async t => {
  const page = await fixture(t);
  await enterToken(page, 'wrong-token');
  await page.locator('#error:not([hidden])').waitFor();
  assert.equal(await page.locator('#mode').inputValue(), 'recorded');
  await enterToken(page, 'fixture-token');
  await page.waitForFunction(() => document.querySelector('#mode')?.value === 'live' && !document.querySelector('#next-button').disabled);
  assert.equal(await page.locator('#error').isVisible(), false);
});
