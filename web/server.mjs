import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { GameManager, SCENES } from './game.mjs';
import { GameStore, GameError } from './store.mjs';
import { liveSource, agentHealth } from './provider.mjs';

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'],
  '/characters.mjs': ['characters.mjs', 'text/javascript; charset=utf-8'],
  '/village.mjs': ['village.mjs', 'text/javascript; charset=utf-8'],
  '/demo-api.mjs': ['demo-api.mjs', 'text/javascript; charset=utf-8'],
  '/static-data.mjs': ['static-data.mjs', 'text/javascript; charset=utf-8'],
  '/presentation.mjs': ['presentation.mjs', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/assets/character-cast.png': ['assets/character-cast.png', 'image/png'],
};
function send(res, status, data, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(data));
}
function onlyKeys(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k))) throw new GameError('Unsupported request fields');
}
async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new GameError('Use application/json', 415);
  if (Number(req.headers['content-length']) > 16_384) { req.resume(); throw new GameError('Request is too large', 413); }
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 16_384) throw new GameError('Request is too large', 413);
  }
  try { return JSON.parse(text); } catch { throw new GameError('Request must contain valid JSON'); }
}
const matchesToken = (actual, expected) => {
  const a = Buffer.from(String(actual ?? '')), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function createApp({ game, getHealth, allowLive = false, liveToken = null, publicOrigin = null }) {
  const authorizeLive = req => {
    if (!allowLive) throw new GameError('Live inference is disabled on this host; choose the recorded walkthrough', 403);
    if (liveToken && !matchesToken(req.headers['x-live-token'], liveToken)) throw new GameError('Enter the host live-access token', 401);
  };
  return createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
    try {
      const serverPort = req.socket.localPort;
      const localHosts = [`127.0.0.1:${serverPort}`, `localhost:${serverPort}`, `[::1]:${serverPort}`];
      const configured = publicOrigin ? new URL(publicOrigin) : null;
      if (!localHosts.includes(req.headers.host) && req.headers.host !== configured?.host) throw new GameError('Unrecognized host', 421);
      const origin = configured && req.headers.host === configured.host ? configured.origin : `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      if (req.method === 'POST' && req.headers.origin && req.headers.origin !== origin) throw new GameError('Cross-origin commands are not allowed', 403);
      if (!['GET', 'POST'].includes(req.method)) throw new GameError('Method not allowed', 405);
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return send(res, 200, { ...(await getHealth()), liveEnabled: allowLive, liveRequiresToken: Boolean(liveToken), recordedAvailable: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/scenes') return send(res, 200, SCENES);
      if (req.method === 'POST' && url.pathname === '/api/runs') {
        const body = await jsonBody(req);
        onlyKeys(body, ['scene', 'mode']);
        if (body.mode === 'live') authorizeLive(req);
        return send(res, 201, game.create(body));
      }
      const match = /^\/api\/runs\/([a-zA-Z0-9_-]{1,80})(?:\/(step|export))?$/.exec(url.pathname);
      if (match) {
        const [, id, operation] = match;
        if (req.method === 'GET' && !operation) return send(res, 200, game.get(id));
        if (req.method === 'GET' && operation === 'export') return send(res, 200, game.export(id), { 'content-disposition': `attachment; filename="sentinel-${id}.json"` });
        if (req.method === 'POST' && operation === 'step') {
          const body = await jsonBody(req);
          onlyKeys(body, ['commandId', 'expectedVersion']);
          if (game.get(id).mode === 'live') authorizeLive(req);
          return send(res, 200, await game.step(id, body));
        }
      }
      if (req.method === 'GET' && STATIC[url.pathname]) {
        const [file, type] = STATIC[url.pathname];
        let data;
        try { data = await readFile(new URL(`./public/${file}`, import.meta.url)); }
        catch { throw new GameError('This page is not available yet', 404); }
        res.writeHead(200, { 'content-type': type, 'cache-control': file.endsWith('.png') ? 'public, max-age=86400' : 'no-cache' });
        return res.end(data);
      }
      throw new GameError('Not found', 404);
    } catch (error) {
      if (!res.headersSent) send(res, error.status ?? 500, { error: error.status ? error.message : 'The scene could not finish. Refresh its state before continuing.' });
      else res.end();
    }
  });
}

export function main() {
  const base = process.env.SENTINEL_AGENT_URL ?? 'http://127.0.0.1:8797';
  const host = process.env.SENTINEL_WEB_HOST ?? '127.0.0.1';
  const port = Number(process.env.SENTINEL_WEB_PORT ?? 5173);
  const allowLive = process.env.SENTINEL_ALLOW_LIVE === '1';
  const liveToken = process.env.SENTINEL_LIVE_TOKEN || null;
  if (host !== '127.0.0.1' && host !== 'localhost' && allowLive && !liveToken) throw Error('Public live inference requires SENTINEL_LIVE_TOKEN');
  const store = new GameStore(process.env.SENTINEL_GAME_DB ?? 'work/game.sqlite', { liveLimit: Number(process.env.SENTINEL_LIVE_LIMIT ?? 120) });
  const game = new GameManager({ store, source: liveSource(base) });
  const app = createApp({ game, getHealth: () => agentHealth(base), allowLive, liveToken, publicOrigin: process.env.SENTINEL_PUBLIC_ORIGIN });
  app.listen(port, host, () => console.log(`Village Sentinel: http://${host}:${app.address().port} (live ${allowLive ? 'enabled' : 'disabled'})`));
  const stop = () => app.close(() => { store.close(); process.exit(0); });
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
