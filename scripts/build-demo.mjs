import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GameStore } from '../web/store.mjs';
import { GameManager, SCENES } from '../web/game.mjs';
import { exportFrame } from '../web/public/static-data.mjs';
import { verifyReplay, checkInvariants } from '../engine/live-adapter.mjs';

export async function buildDemo(out) {
  mkdirSync(out, { recursive: true });
  cpSync(new URL('../web/public/', import.meta.url), out, { recursive: true });
  // Relative assets work both at a project subpath and at a local preview root.
  for (const name of ['index.html', 'styles.css', 'village.mjs']) {
    const path = resolve(out, name);
    let text = readFileSync(path, 'utf8').replaceAll('"/assets/', '"./assets/').replaceAll("'/assets/", "'./assets/");
    if (name === 'index.html') text = text.replace('<html lang="en">', '<html lang="en" data-backend="recorded-static">').replaceAll('href="/', 'href="./').replaceAll('src="/', 'src="./');
    writeFileSync(path, text);
  }
  mkdirSync(resolve(out, 'demo-data'), { recursive: true });
  writeFileSync(resolve(out, '.nojekyll'), '');
  const store = new GameStore(':memory:');
  const game = new GameManager({ store, source: () => { throw Error('A static build must never call a model'); } });
  const catalog = { format: 'village-sentinel-recorded-v1', scenes: SCENES, files: {}, operation: 'recorded', newModelCalls: 0, bedrock: 'stub' };
  try {
    for (const scene of SCENES) {
      let run = game.create({ scene: scene.id, mode: 'recorded' });
      const frames = [];
      while (true) {
        const { history, ...view } = run;
        frames.push({ ...view, latestEntry: history.at(-1) ?? null });
        if (run.status === 'completed') break;
        run = await game.step(run.id, { commandId: `build-${run.version}`, expectedVersion: run.version });
      }
      const data = { scene: scene.id, frames, finalBundle: game.export(run.id) };
      for (let i = 0; i < frames.length; i++) {
        const prefix = exportFrame(data, i, run.id);
        const replay = verifyReplay(prefix.run);
        const issues = checkInvariants(prefix.run);
        if (!replay.ok || issues.length) throw Error(`Invalid static replay: ${scene.id} frame ${i}: ${replay.reason}; ${issues.join(', ')}`);
      }
      const text = JSON.stringify(data);
      const name = `${scene.id}.json`;
      writeFileSync(resolve(out, 'demo-data', name), text);
      catalog.files[name] = { sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text), frames: frames.length };
    }
    writeFileSync(resolve(out, 'demo-data/catalog.json'), JSON.stringify(catalog));
    return catalog;
  } finally { store.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const out = resolve(process.argv[2] ?? 'work/static-site');
  const catalog = await buildDemo(out);
  console.log(JSON.stringify({ out, scenes: catalog.scenes.length, files: catalog.files, modelCalls: 0 }));
}
