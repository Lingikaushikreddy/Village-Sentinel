// The loopback: one POST per decision to the Python service, with a bounded timeout, an
// idempotency key (the testbed's decisionId) and exactly one retry on *network* failure.
// The retry is safe because the service replays a stored answer for a repeated key, so a
// decision is never computed twice and the world never sees two different answers.
import { parseAgentResponse } from "settlement-testbed";

export const DEFAULT_TIMEOUT_MS = 20_000;

export function sentinelSource(baseUrl, { mode, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1, onTrace } = {}) {
  const url = new URL(baseUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("sentinel service must be loopback");
  if (mode) url.searchParams.set("mode", mode);
  return async (request) => {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const invalid = (reason) => ({ status: "invalid", reason, latencyMs: elapsed() });
    for (let attempt = 0; ; attempt++) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "settlement-protocol": "1", "idempotency-key": request.decisionId },
          body: JSON.stringify(request),
          redirect: "error",
          signal,
        });
        const body = await response.text();
        if (response.status !== 200) return invalid("http_status");
        const answer = parseAgentResponse(body, request, elapsed());
        if (onTrace && answer.status === "valid") {
          try { onTrace(request, JSON.parse(body)); } catch { /* trace is best-effort */ }
        }
        return answer;
      } catch (error) {
        if (signal.aborted) return invalid("timeout");
        if (attempt < retries) continue; // connection reset / ECONNREFUSED: idempotent, retry once
        return invalid("network");
      }
    }
  };
}

export async function health(baseUrl) {
  const res = await fetch(new URL("/health", baseUrl), { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`sentinel /health returned ${res.status}`);
  return res.json();
}

export async function traces(baseUrl, mode) {
  const u = new URL("/traces", baseUrl);
  if (mode) u.searchParams.set("mode", mode);
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`sentinel /traces returned ${res.status}`);
  return (await res.json()).traces;
}
