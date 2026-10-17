import { exportFrame } from './static-data.mjs?v=c141c8b983cd';

export class StaticDemo {
  constructor(base = new URL('./', document.baseURI)) { this.base = base; this.runs = new Map(); this.data = new Map(); }
  async catalog() {
    if (!this.index) this.index = await (await fetch(new URL('./demo-data/catalog.json', this.base))).json();
    return this.index;
  }
  async scene(id) {
    if (this.data.has(id)) return this.data.get(id);
    const catalog = await this.catalog();
    const expected = catalog.files[`${id}.json`];
    if (!expected) throw Error('Unknown recorded scene');
    const response = await fetch(new URL(`./demo-data/${id}.json`, this.base));
    if (!response.ok) throw Error('The recorded scene could not load');
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== expected.sha256) throw Error('Recorded scene integrity check failed');
    const data = JSON.parse(new TextDecoder().decode(bytes));
    this.data.set(id, data);
    return data;
  }
  view(run) {
    const { latestEntry, ...view } = structuredClone(run.data.frames[run.index]);
    return { ...view, id: run.id, history: run.data.frames.slice(1, run.index + 1).map(frame => structuredClone(frame.latestEntry)), provenance: { ...view.provenance, playbackHost: 'static-replay' } };
  }
  export(id) {
    const run = this.runs.get(id);
    if (!run) throw Error('Recorded run not found');
    return exportFrame(run.data, run.index, id);
  }
  async request(path, body) {
    if (path === '/api/health') return { connected: false, staticReplay: true, host: this.base.hostname.endsWith('.github.io') ? 'github-pages-replay' : 'static-preview', awsVerified: false, liveEnabled: false, liveRequiresToken: false, recordedAvailable: true };
    if (path === '/api/scenes') return (await this.catalog()).scenes;
    if (path === '/api/runs') {
      if (body.mode !== 'recorded') throw Error('This public walkthrough only replays recorded results. Run the source locally for new model calls.');
      const run = { id: crypto.randomUUID(), index: 0, data: await this.scene(body.scene), commands: new Map() };
      this.runs.set(run.id, run);
      return this.view(run);
    }
    const match = /^\/api\/runs\/([a-zA-Z0-9_-]+)(?:\/(step|export))?$/.exec(path);
    if (!match) throw Error('Unknown recorded operation');
    const run = this.runs.get(match[1]);
    if (!run) throw Error('Recorded run not found');
    if (match[2] === 'export') return this.export(run.id);
    if (match[2] === 'step') {
      const stored = run.commands.get(body.commandId);
      if (stored) {
        if (stored.version !== body.expectedVersion) throw Error('Command was already used with another version');
        return structuredClone(stored.result);
      }
      if (run.index !== body.expectedVersion) throw Error('The recorded scene changed; refresh it first');
      if (run.index + 1 >= run.data.frames.length) throw Error('The recorded scene is complete');
      run.index++;
      const result = this.view(run);
      run.commands.set(body.commandId, { version: body.expectedVersion, result });
      return result;
    }
    return this.view(run);
  }
}
