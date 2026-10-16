# Strands Decider 2B: pinned checkpoint and inference mechanics

Everything below was read from the pinned checkpoint and the `strands-decider` source,
not from blog posts. File paths refer to
[strands-labs/strands-decider](https://github.com/strands-labs/strands-decider) at commit
`930e6d5de16309be32579f5631a7369a3322140c` (the version this repo installs).

## Pinned artefacts

| Artefact | Value |
|---|---|
| Hub repo | `StrandsAgents/strands-decider-2B-hobson-v19` |
| **Hub commit (pinned)** | `bb282d786bc251fd4e3068de3ada9ddbb38127cd` (last modified 2026-10-01T01:08:18Z) |
| Base torso | `Qwen/Qwen3.5-2B-Base` @ `b1485b2fa6dfa1287294f269f5fb618e03d52d7c` (from `provenance.json`, "inferred: Hub main at training time") |
| LoRA adapter | `lora/adapter_model.safetensors`, sha256 `701bdb895887097f…`, r=16, α=32, dropout 0.05, targets q/k/v/o, gate/up/down, in_proj_{qkv,z,a,b}, out_proj (the Gated DeltaNet layers) |
| Readout head | `head.safetensors` (4.2 MB), sha256 `daad0727152b6185…`, `head_type: pointer`, `pointer_dim: 256` |
| Calibration | `hobson_config.json`: `temperature_by_kind = {noul: 0.9107, choice: 0.7342, score: 1.3278}`, global `0.9628`; `ordinal_smoothing: 0.1`; `max_length: 4096`; `torch_dtype: bfloat16` |
| Package | `strands-decider` 0.1.0 on PyPI; this repo installs the Git commit above; requires `torch>=2.7`, `transformers>=5.15,<6`, `peft>=0.21` |
| Integrity | `MANIFEST.sha256` covers every file; `python -m strands_decider.hf_export verify <snapshot>` |

The service loads the checkpoint with `snapshot_download(..., revision=<pinned sha>)`
(`sentinel/village_sentinel/decider_client.py`), so a moved `main` cannot change results.

## Prompt and tokenisation (`src/strands_decider/prompting.py`)

The state and the question are rendered to one text. Dicts are emitted as indented JSON
with insertion order kept (`render_content`), so identical JSON always tokenises
identically (the shared-prefix KV cache depends on this).

```
<state>
{ ...state JSON... }
</state>
<question type="choice">
Select exactly one option.
<instructions text>
<options>
1. accept_claim — <description>
2. reject_claim — <description>
3. check_evidence — <description>
</options>
</question>
<answer>
```

* Options are numbered from 1 and each is exactly one line (`_option_block`), which makes
  every option a single unambiguous character span.
* `<answer>` is the final token of the prompt. It is a plain string, not a special token:
  the tokenizer is Qwen2 (`tokenizer_config.json`), BOS is `None`, pad = `<|endoftext|>`.
* Tokenisation (`infer.py::_fit`) gives the *question* first claim on the 4,096-token
  window, then truncates the *state* from the right to what remains. A question longer
  than its reserve is cut from the *front* so the options and `<answer>` survive. If an
  option's span loses all its tokens, inference raises instead of scoring a neighbour.
* With `return_offsets_mapping`, `_option_token_index` finds for each option the **last
  token whose character span falls inside that option's line**.

## Scoring: the pointer head (`src/strands_decider/modeling.py::PointerHead`)

The LM head is discarded. Let `H ∈ ℝ^{L×d}` be the torso's last hidden states
(bf16 on the torso, cast to fp32 for the head), `h_ans = H[pos(<answer>)]` the state at the
last real token, and `h_k = H[pos(last token of option k)]` for k = 1..N.

```
q   = W_q · LN(h_ans)                     ∈ ℝ^{256}
k_k = W_k · LN(h_k)                       ∈ ℝ^{256}
z_k = (k_k · q) / sqrt(256)               raw logit for option k
```

It is one attention score per option: query from `<answer>`, key from each option's own
last token. There is no per-slot parameter, so position bias has nowhere to live in the
head (it can still come from the torso; we measure it below). `LN` is a LayerNorm over
`d` added "because our torso's hidden states are not scaled for a bare dot product".
The head has just over 1 M parameters.

## Probability distribution and calibration

```
z̃_k = z_k / T_choice                  T_choice = 0.734189596436441  (apply_temperature)
p_k  = softmax(z̃)_k over the N real options   (masked_log_softmax; padding slots → −inf)
```

`T_choice < 1` *sharpens* the distribution: the choice head was under-confident on the
held-out set. Temperatures were fitted "one per primitive, on held-out short
classification" (model card), so the bands are only meaningful on traffic like that, which
is why `bench/calibrate.py` re-measures on our own requests.

## Rescaled confidence (`src/strands_decider/schema.py::derive_confidence`)

```
confidence = clamp( (N · p_max − 1) / (N − 1), 0, 1 )
```

Uniform → 0, one-hot → 1, independent of N, so one threshold means the same thing for a
two-option (verified) and a three-option (unverified) question. Worked example from the
model card: `p = (0.846, 0.090, 0.064)` → `(3·0.846 − 1)/2 = 0.769`.

For two options the formula reduces to `|2·p_max − 1|`, so `confidence ≥ τ` ⇔
`p_max ≥ (1 + τ)/2`; for three options `p_max ≥ (1 + 2τ)/3`. With the service threshold
τ = 0.60 that is `p_max ≥ 0.80` (two options) or `p_max ≥ 0.733` (three options).

`evidence_first_tool_router.derive_confidence` re-implements this formula and
`tests/test_router.py::Confidence::test_matches_strands_formula` pins it to the card's
example.

## Usage accounting

`SystemOneResponse.usage.input_tokens` is the number of prompt tokens actually forwarded;
`output_tokens` is one per question (a single readout, never a generated token).

## Measured on this machine

See `bench/results/profile-*.json` (produced by `bench/profile_decider.py`) and the
calibration section in `docs/EVALUATION.md`.
