import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export class GameStore {
  constructor(path, { liveLimit = 120 } = {}) {
    if (!Number.isSafeInteger(liveLimit) || liveLimit < 1 || liveLimit > 500) throw new GameError('liveLimit must be an integer from 1 to 500');
    this.liveLimit = liveLimit;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands(run TEXT NOT NULL, id TEXT NOT NULL, input TEXT NOT NULL,
        status TEXT NOT NULL, result TEXT, owner_pid INTEGER, PRIMARY KEY(run,id));
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending ON commands(run) WHERE status='pending';`);
    if (!this.db.prepare('PRAGMA table_info(commands)').all().some(column => column.name === 'owner_pid')) {
      this.db.exec('ALTER TABLE commands ADD COLUMN owner_pid INTEGER');
    }
  }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  insert(state) {
    if (this.db.prepare('SELECT COUNT(*) AS n FROM games').get().n >= 200) throw new GameError('This demo has reached its saved-run limit. Ask the host to archive its game database.', 429);
    this.db.prepare('INSERT INTO games VALUES(?,?,?)').run(state.id, state.version, JSON.stringify(state));
  }
  read(id) {
    const row = this.db.prepare('SELECT state FROM games WHERE id=?').get(id);
    if (!row) throw new GameError('Run not found', 404);
    return JSON.parse(row.state);
  }
  busy(id) { return Boolean(this.db.prepare("SELECT 1 FROM commands WHERE run=? AND status='pending'").get(id)); }
  reserve(id, command) {
    return this.tx(() => {
      const input = JSON.stringify({ expectedVersion: command.expectedVersion });
      const prior = this.db.prepare('SELECT * FROM commands WHERE run=? AND id=?').get(id, command.commandId);
      if (prior) {
        if (prior.input !== input) throw new GameError('Command ID was already used with different contents', 409);
        if (prior.status === 'done') return { result: JSON.parse(prior.result) };
        throw new GameError(prior.status === 'pending' ? 'Decision pending or interrupted; no automatic retry was made' : 'This command failed; start a fresh scene', 409);
      }
      const state = this.read(id);
      if (state.version !== command.expectedVersion) throw new GameError('The world changed; refresh before deciding', 409);
      if (state.lastError) throw new GameError('The last decision failed; start a fresh scene', 409);
      if (this.busy(id)) throw new GameError('A decision is already pending', 409);
      if (state.run.status === 'completed') throw new GameError('This scene is complete', 409);
      if (state.mode === 'live') {
        const usage = this.db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN c.status='pending' THEN 1 ELSE 0 END) AS pending
          FROM commands c JOIN games g ON g.id=c.run WHERE json_extract(g.state,'$.mode')='live'`).get();
        if (usage.pending) throw new GameError('A live decision is pending. If its worker stopped, the host must recover the interrupted command.', 409);
        if (usage.n >= this.liveLimit) throw new GameError('The host live-call allowance is exhausted; recorded walkthroughs remain available', 429);
      }
      this.db.prepare("INSERT INTO commands(run,id,input,status,result,owner_pid) VALUES(?,?,?,'pending',NULL,?)").run(id, command.commandId, input, process.pid);
      return { state };
    });
  }
  finish(id, command, state, result) {
    this.tx(() => {
      const version = this.db.prepare('SELECT version FROM games WHERE id=?').get(id)?.version;
      if (version !== command.expectedVersion) throw new GameError('World version changed while deciding', 409);
      this.db.prepare('UPDATE games SET version=?,state=? WHERE id=?').run(state.version, JSON.stringify(state), id);
      this.db.prepare("UPDATE commands SET status='done',result=? WHERE run=? AND id=? AND status='pending'").run(JSON.stringify(result), id, command.commandId);
    });
  }
  fail(id, command, message) {
    this.tx(() => {
      const state = this.read(id);
      state.lastError = message;
      this.db.prepare('UPDATE games SET state=? WHERE id=?').run(JSON.stringify(state), id);
      this.db.prepare("UPDATE commands SET status='failed',result=? WHERE run=? AND id=?").run(JSON.stringify({ error: message }), id, command.commandId);
    });
  }
  recoverInterrupted({ confirmWorkerStopped = false, legacyStoppedPid } = {}) {
    if (!confirmWorkerStopped) throw new GameError('Confirm that the game server and its inference worker have stopped before recovery');
    return this.tx(() => {
      const pending = this.db.prepare("SELECT run,id,owner_pid FROM commands WHERE status='pending'").all();
      for (const command of pending) {
        const pid = command.owner_pid ?? legacyStoppedPid;
        if (!Number.isSafeInteger(pid) || pid < 1) throw new GameError('The legacy worker PID is unknown. Supply its stopped PID explicitly.');
        try { process.kill(pid, 0); }
        catch (error) { if (error.code === 'ESRCH') continue; else throw new GameError(`Cannot confirm that worker ${pid} stopped`, 409); }
        throw new GameError(`Worker ${pid} is still running; stop it before recovery`, 409);
      }
      const message = 'Interrupted decision; no inference was retried. Start a fresh scene.';
      for (const command of pending) {
        const state = this.read(command.run);
        state.lastError = message;
        this.db.prepare('UPDATE games SET state=? WHERE id=?').run(JSON.stringify(state), command.run);
        this.db.prepare("UPDATE commands SET status='interrupted',result=? WHERE run=? AND id=?").run(JSON.stringify({ error: message }), command.run, command.id);
      }
      return pending.length;
    });
  }
  close() { this.db.close(); }
}
