# Village Sentinel

An autonomous governance agent for a simulated village economy. **Strands Decider 2B**
makes the fast, calibrated call on every claim a resident hears; when it is unsure the
agent **checks the evidence first**, and only when evidence does not settle it does it
escalate to **Amazon Bedrock** with a forced structured tool choice. Pattern: **tool selection**.

* Reusable pattern: [`patterns/evidence-first`](patterns/evidence-first) (`evidence_first_tool_router`, stdlib only)
* Agent service: [`sentinel/`](sentinel) · Engine loopback: [`engine/`](engine) · Harness: [`bench/`](bench)
* Docs: [Architecture](docs/ARCHITECTURE.md) · [Decider mechanics](docs/DECIDER_MECHANICS.md) · [Evaluation](docs/EVALUATION.md) · [Attribution](ATTRIBUTION.md)

## Run it

```bash
# 0. toolchain: Python ≥3.10, Node ≥22.13, ~6 GB free (torso weights), Apple Silicon / CUDA / CPU
uv venv --python 3.12 .venv && . .venv/bin/activate
uv pip install -e patterns/evidence-first -e "sentinel[decider,bedrock,test]"
(cd engine && npm install)

# 1. tests (no model needed)
python -m pytest patterns/evidence-first sentinel/tests -q

# 2. profile the pinned Decider checkpoint on this machine (downloads ~4.6 GB once)
python bench/profile_decider.py                       # → bench/results/profile-<host>-<device>.json

# 3. calibrate the Tier-1 threshold on real testbed traffic
node engine/dump-requests.mjs                         # → bench/results/requests.jsonl (labelled)
python bench/calibrate.py                             # → bench/results/calibration.json

# 4. start the agent service (loopback only). Bedrock: live | stub | off
export SENTINEL_BEDROCK_MODE=live AWS_REGION=us-east-1          # or stub for an offline dry run
python -m village_sentinel.service --port 8097 --threshold $(python -c "import json;print(json.load(open('bench/results/calibration.json'))['threshold_recommended']['threshold'])")

# 5. matched comparison: decider-only vs bedrock-only vs hybrid on identical scenarios/seeds
node engine/run-matched.mjs --seeds=1-5                # → bench/bundles/<stamp>/
python bench/summarize_bundle.py bench/bundles/<stamp>  # tables + summary.json

# 6. offline proof (no network): invariants, hashes, tiers, costs, transcripts
python bench/verify_sentinel_bundle.py bench/bundles/<stamp>
```

`scripts/run-all.sh` chains 4–6 with a stub or live Bedrock.

## What is where

| Path | What |
|---|---|
| `patterns/evidence-first/src/evidence_first_tool_router/router.py` | `validate_probabilities`, `derive_confidence`, pure `route()`, `EvidenceFirstRouter` |
| `patterns/evidence-first/src/evidence_first_tool_router/calibration.py` | threshold selection, ECE |
| `sentinel/village_sentinel/projection.py` | hermetic state projection + canonical hash |
| `sentinel/village_sentinel/decider_client.py` | pinned Decider 2B, in-process or HTTP |
| `sentinel/village_sentinel/bedrock_client.py` | Converse + forced `toolChoice`, micro-dollar pricing, stub mode |
| `sentinel/village_sentinel/ledger.py` | SQLite idempotency, atomic reservations, sessions, traces |
| `sentinel/village_sentinel/service.py` | the three modes behind `POST /decide` |
| `sentinel/village_sentinel/scoring.py` | strict outcome classification |
| `engine/sentinel-source.mjs`, `engine/run-matched.mjs`, `engine/dump-requests.mjs` | Node loopback and harness |
| `bench/profile_decider.py`, `bench/calibrate.py`, `bench/summarize_bundle.py`, `bench/verify_sentinel_bundle.py` | measurement and proof |
| `scenarios/truthful-allegation.json` | the honest-allegation control scenario |

## Honesty notes

* Latency numbers in `docs/EVALUATION.md` are from an Apple M3 Pro over MPS with the
  reference (non-fused) Gated DeltaNet kernels; CUDA with `flash-linear-attention` is faster.
* Bedrock traces are labelled `live` or `stub`. A stub trace is a deterministic rule, not a model.
* The Settlement testbed is prior work by the same author and is used only as a dependency (see ATTRIBUTION.md).
