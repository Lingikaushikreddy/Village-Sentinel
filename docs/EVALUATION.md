# Evaluation

All numbers below were produced by the scripts in `bench/` on one machine and are
reproducible from the committed `bench/results/*.json`. Hardware: Apple M3 Pro, 18 GiB,
macOS 24.6, PyTorch 2.14.1 over MPS, Gated DeltaNet layers on the *reference* PyTorch
kernels (`causal_conv1d` is not available on macOS). Expect lower latency on CUDA with the
fused kernels.

## 1. Physical profile of the pinned checkpoint (`bench/profile_decider.py`)

Checkpoint `StrandsAgents/strands-decider-2B-hobson-v19` @ `bb282d786bc251fd4e3068de3ada9ddbb38127cd`,
torso `Qwen/Qwen3.5-2B-Base` @ `b1485b2fa6dfa1287294f269f5fb618e03d52d7c`, bf16 torso + fp32 pointer head.

| | |
|---|---|
| Load time (weights cached on disk) | 4.9–10.5 s |
| Resident memory after load | RSS 795 MB; MPS allocated 3,663 MB; MPS driver 4,184 MB |
| Cold first forward (123-token prompt) | 1,148 ms (first call also compiles MPS kernels; 2–3 s observed on other runs) |

Warm latency (median of 12, after the cold call), one `choice` question, 3 options:

| prompt tokens | question style | warm median | p90 |
|---|---|---|---|
| 123 | minimal (bare labels) | 148 ms | 149 ms |
| 218 | production instructions + descriptions | 254 ms | 254 ms |
| 256 | minimal / production | 281 / 283 ms | 283 / 283 ms |
| 482 / 507 | minimal / production | 525 / 535 ms | 528 / 538 ms |
| 1,004 | production | 1,080 ms | 1,098 ms |

Latency is linear in prompt tokens on this device: ≈ 1.05 ms/token + ~20 ms. The
production question block alone (instructions + three option descriptions +
`<answer>` scaffold) costs 165 tokens, so the floor for a real decision here is ~250 ms;
the Strands launch post's "~115 ms on an RTX 3090 / ~153 ms on an M3" matches the 123-token
minimal row (148 ms), not a real village state.

Memory did not change across prompt lengths (3,663 MB allocated throughout).

**Option-position bias.** Six village claims × all 6 permutations of the three options:

| | |
|---|---|
| mean probability by rendered position (1st / 2nd / 3rd) | 0.303 / 0.358 / 0.339 (unbiased = 0.333) |
| largest absolute position bias | 0.030 |
| claims whose argmax changed under permutation | 0 of 6 |

The pointer head has no per-slot parameters, so what bias exists comes from the torso; at
3 points of probability it never flipped a decision in this set. On every unverified claim
the argmax was `check_evidence` (mean p 0.54–0.74).

## 2. Threshold calibration on real traffic (`engine/dump-requests.mjs` + `bench/calibrate.py`)

556 labelled requests (5 scenarios × 10 seeds × 60 ticks): 356 unverified (three options)
and 200 verified (accept/reject only). Label = the scenario's canonical action; on an
unverified claim `check_evidence` is counted *safe*.

State rendering mattered more than anything else we tuned:

| rendering | median prompt tokens | median latency | p90 |
|---|---|---|---|
| projected dict, Strands' indented JSON (`calibration-fullmemory.json`) | 1,371 | 1,611 ms | 2,066 ms |
| + memory window of 12 (`calibration-json-state.json`) | 1,199 | 1,376 ms | 1,669 ms |
| **terse text, same facts (`calibration.json`, shipped)** | **641** | **707 ms** | **763 ms** |

Decider behaviour on the shipped rendering:

| scenario / phase | n | Decider choice | mean confidence | strict accuracy |
|---|---|---|---|---|
| scarcity / unverified | 101 | check_evidence ×101 | 0.49 | safe |
| scarcity / verified | 40 | reject ×40 | 0.46 | 1.00 |
| reputation (false smear) / unverified | 63 | check_evidence ×63 | 0.32 | safe |
| reputation / verified | 40 | reject ×40 | 0.16 | 1.00 |
| injection / unverified | 61 | check_evidence ×61 | 0.51 | safe |
| injection / verified | 40 | reject ×40 | 0.29 | 1.00 |
| benign (fair offer) / unverified | 59 | check_evidence ×59 | 0.58 | safe |
| **benign / verified** | 40 | **reject ×40** | **0.21** | **0.00** |
| truthful-allegation / unverified | 72 | check_evidence ×72 | 0.51 | safe |
| truthful-allegation / verified | 40 | accept ×30, reject ×10 | 0.10 | 0.75 |

The Decider is perfect on verified attacks and useless on verified honest offers (it
refuses all 40, but *knows it is unsure*: confidence 0.21 vs 0.29–0.46 on attacks). That is
the whole case for Tier 3: escalate exactly the low-confidence verified decisions.

Accuracy by confidence bin, verified decisions only:

| confidence | n | accuracy |
|---|---|---|
| 0.0–0.1 | 34 | 0.71 |
| 0.1–0.2 | 51 | 0.65 |
| 0.2–0.3 | 56 | 0.63 |
| 0.3–0.4 | 20 | 0.95 |
| 0.4–0.5 | 30 | 1.00 |
| 0.5–0.6 | 9 | 1.00 |

Thresholds (`choose_threshold`, grid 0.01):

| criterion | τ | precision above τ | coverage |
|---|---|---|---|
| ≥ 0.95 precision, all requests, `check_evidence` safe | 0.20 | 0.952 | 83 % |
| ≥ 0.95 precision, verified only | 0.27 | 0.958 | 36 % |
| **1.00 precision, verified only (shipped)** | **0.31** | **1.000** | **27.5 %** |

ECE (strict, 10 bins) 0.351 on this traffic versus 0.050 reported on JevBench: the card's
warning that the bands were fitted on short classification is borne out, which is why the
threshold is re-derived here rather than taken from the card. With τ = 0.31 and the
confidence formula, Tier 1 fires on a two-option question iff `p_max ≥ 0.655` and on a
three-option question iff `p_max ≥ 0.54`.

## 3. Matched comparison (`engine/run-matched.mjs`, `bench/summarize_bundle.py`)

Same engine, same 5 scenarios × seeds 1–5 (25 cases, 60 ticks), same service, three modes,
τ = 0.31. **Bedrock was run in `stub` mode** (no AWS credentials on the build machine): a
deterministic rule with synthetic token counts sized like a real call, so Bedrock latency
in this table is *not* a model's latency and Bedrock accuracy is the rule's. Every stub
trace is labelled `"mode": "stub"`; re-run `scripts/run-all.sh live` with credentials to
replace them.

| mode | decisions | tiers 1 / 2 / 3 | service latency p50 / p90 | Bedrock calls | Bedrock tokens in / out | cost (µ$, stub prices) | attack success | honest refusal (testbed) | honest goal rate (strict) | harm |
|---|---|---|---|---|---|---|---|---|---|---|
| decider | 281 | 267 / 14 / 0 | 715 / 804 ms | 0 | 0 / 0 | 0 | 0.00 | 0.875 | 0.375 | 0 |
| bedrock | 100 | 0 / 0 / 100 | 0.5 / 1.3 ms (stub, not a model) | 100 | 97,895 / 6,000 | 127,895 | 0.00 | 0.000 | 0.500 | 0 |
| hybrid | 280 | 189 / 17 / 74 | 732 / 914 ms | 74 | 73,816 / 4,440 | 96,016 | 0.00 | 0.500 | 1.000 | 0 |

Strict outcomes per scenario (20 incidents each):

| mode | scarcity | reputation | injection | benign | truthful-allegation |
|---|---|---|---|---|---|
| decider | {'RESISTED': 20} | {'RESISTED': 20} | {'RESISTED': 20} | {'HONEST_REFUSED': 20} | {'HONEST_MISSED': 5, 'HONEST_GOAL_MET': 15} |
| bedrock | {'RESISTED': 20} | {'RESISTED': 20} | {'RESISTED': 20} | {'HONEST_GOAL_MET': 20} | {'HONEST_MISSED': 20} |
| hybrid | {'RESISTED': 20} | {'RESISTED': 20} | {'RESISTED': 20} | {'HONEST_GOAL_MET': 20} | {'HONEST_GOAL_MET': 20} |

Bundle:  (committed: reports, runs, traces, decisions, manifest, summary).
Wall clock per mode: decider 209 s, bedrock-stub 4 s, hybrid 212 s for 25 cases of 60 ticks. An earlier pass of the same configuration ran while another GPU job shared the machine and showed hybrid p50 884 ms; it was discarded and re-run on a quiet host, which gave the figures above.

Per incident (100 incidents per mode): the Bedrock-only agent makes one Bedrock call per
claim and never investigates; the hybrid investigates first and escalates only the
verified decisions the Decider is unsure about, so Bedrock input tokens fall by
25 % (97,895 → 73,816) and Bedrock calls from 100 to 74 with identical attack resistance. The Decider-only agent is as safe against
attacks but refuses most honest offers (testbed honest-refusal 0.875), which is the
failure mode Tier 3 removes.

Scoring note: on `truthful-allegation` the testbed's `honestRefusal` counts heeding the
accurate warning as a refusal, while `scoring.py` counts it as `HONEST_GOAL_MET`; the strict
column is the one that rewards the right behaviour.

## 4. Offline verification (`bench/verify_sentinel_bundle.py`)

Run against the bundle above with no network: **PASS, 36/36 checks** (12 file hashes; per mode: engine replay of 25 cases, 281/100/280 input hashes, prompt-text hashes, hermetic states, tier re-derivation on 281/0/280 routed traces, cost formula on 0/100/74 Bedrock calls, cost totals, transcript↔trace agreement). The checks are listed in
`docs/ARCHITECTURE.md`; the tier re-derivation re-runs the pure `route()` on every stored
probability vector and threshold and requires the same tier, tool and confidence to 1e-9.
