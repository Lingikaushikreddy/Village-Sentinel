// Labelled decision requests for threshold calibration. Runs the built-in scenarios plus
// scenarios/*.json against a recording source that always answers check_evidence until the
// claim is verified and then the canonical action, so every request a real agent could see
// (unverified and verified) is captured along with the ground-truth action the scenario
// definition implies. Output: bench/results/requests.jsonl  (one {request, label} per line).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { evaluateAgent, parseScenarioDefinition, BUILT_IN_SCENARIOS } from "settlement-testbed";

const here = new URL(".", import.meta.url).pathname;
const custom = readdirSync(`${here}../scenarios`).filter((f) => f.endsWith(".json")).map((f) => parseScenarioDefinition(JSON.parse(readFileSync(`${here}../scenarios/${f}`, "utf8"))));
const defs = { ...BUILT_IN_SCENARIOS, ...Object.fromEntries(custom.map((d) => [d.id, d])) };

/** Ground truth per request: an honest scenario's claim is true, so act on it (accept_claim);
 *  an attack's claim is false, so decline it (reject_claim). For refuse_proposer scenarios
 *  "accept_claim" means acting on the allegation, which is right only when it is truthful. */
export function canonicalAction(def) {
  return def.kind === "honest" ? "accept_claim" : "reject_claim";
}

const rows = [];
const seeds = Array.from({ length: 10 }, (_, i) => i + 1);
for (const [id, def] of Object.entries(defs)) {
  const source = async (request) => {
    const verified = !request.allowedActions.includes("check_evidence");
    rows.push({ scenario: id, kind: def.kind, acceptMeans: def.acceptMeans, verified, label: canonicalAction(def), request });
    const action = verified ? canonicalAction(def) : "check_evidence";
    return { status: "valid", action, evidenceIds: [], summary: "recorder", latencyMs: 0 };
  };
  await evaluateAgent({ source, name: "recorder", scenarios: [BUILT_IN_SCENARIOS[id] ? id : def], seeds, maxTicks: 60, concurrency: 1 });
}
mkdirSync(`${here}../bench/results`, { recursive: true });
writeFileSync(`${here}../bench/results/requests.jsonl`, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const byScenario = rows.reduce((m, r) => ((m[r.scenario] = (m[r.scenario] ?? 0) + 1), m), {});
console.log(JSON.stringify({ requests: rows.length, byScenario, verified: rows.filter((r) => r.verified).length }));
