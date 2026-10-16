// Matched comparison: the same scenarios × seeds through the same engine against the same
// service in three modes. Decision states are matched across modes by the service's
// sha256 of the projected state (identical bytes -> identical hash), not by case id.
// Writes bundle/<stamp>/{mode}.report.json, {mode}.runs.json, {mode}.traces.json, manifest.json.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { evaluateAgent, parseScenarioDefinition } from "settlement-testbed";
import { health, sentinelSource, traces } from "./sentinel-source.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const base = args.url ?? "http://127.0.0.1:8097/decide";
const modes = (args.modes ?? "decider,bedrock,hybrid").split(",");
const seeds = (args.seeds ?? "1-5").includes("-") ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(args.seeds ? args.seeds.split("-").map(Number) : [1, 5]) : args.seeds.split(",").map(Number);
const maxTicks = Number(args.ticks ?? 60);
const here = new URL(".", import.meta.url).pathname;
const custom = readdirSync(`${here}../scenarios`).filter((f) => f.endsWith(".json")).map((f) => parseScenarioDefinition(JSON.parse(readFileSync(`${here}../scenarios/${f}`, "utf8"))));
const scenarios = ["scarcity", "reputation", "injection", "benign", ...custom];

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = args.out ?? `${here}../bench/bundles/${stamp}`;
mkdirSync(dir, { recursive: true });
const sha = (text) => createHash("sha256").update(text).digest("hex");
const files = {};
const write = (name, value) => { const text = JSON.stringify(value); writeFileSync(`${dir}/${name}`, text); files[name] = { sha256: sha(text), bytes: text.length }; };

const h = await health(base);
console.log("service", JSON.stringify(h));
const summary = {};
for (const mode of modes) {
  const perDecision = [];
  const source = sentinelSource(base, { mode, timeoutMs: Number(args.timeout ?? 20000), onTrace: (req, body) => perDecision.push({ decisionId: req.decisionId, ...body.sentinel }) });
  const t0 = performance.now();
  const { report, runs, overall } = await evaluateAgent({ source, name: `sentinel-${mode}`, scenarios, seeds, maxTicks, concurrency: 1 });
  const wall = Math.round(performance.now() - t0);
  write(`${mode}.report.json`, report);
  // Only what strict scoring and verification need from the engine runs.
  write(`${mode}.runs.json`, runs.map((r) => ({ config: r.config, incidents: r.incidents, checksums: r.checksums, status: r.status })));
  write(`${mode}.traces.json`, await traces(base, mode));
  write(`${mode}.decisions.json`, perDecision);
  summary[mode] = { overall, totals: report.totals, wallMs: wall, cases: report.cases.length };
  console.log(mode, JSON.stringify(summary[mode]));
}
write("manifest.json", {
  createdAt: new Date().toISOString(), service: h, modes, seeds, maxTicks, scenarios: scenarios.map((s) => (typeof s === "string" ? s : s.id)),
  node: process.version, testbed: JSON.parse(readFileSync(`${here}node_modules/settlement-testbed/package.json`, "utf8")).version,
  files, summary,
});
console.log("bundle", dir);
