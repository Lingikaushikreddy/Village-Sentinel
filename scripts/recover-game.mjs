import { resolve } from 'node:path';
import { GameStore } from '../web/store.mjs';

const args = process.argv.slice(2);
if (!args.includes('--confirm-worker-stopped')) {
  console.error('Stop both the game server and Python inference worker, then run: node scripts/recover-game.mjs --confirm-worker-stopped [--stopped-pid PID]');
  process.exitCode = 1;
} else {
  const pidIndex = args.indexOf('--stopped-pid');
  const store = new GameStore(resolve(process.env.SENTINEL_GAME_DB ?? 'work/game.sqlite'));
  try {
    const count = store.recoverInterrupted({ confirmWorkerStopped: true, legacyStoppedPid: pidIndex < 0 ? undefined : Number(args[pidIndex + 1]) });
    console.log(`Recovered ${count} interrupted commands. No inference retried; call allowances and provider reservations retained. Restart the services and create a fresh scene.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { store.close(); }
}
