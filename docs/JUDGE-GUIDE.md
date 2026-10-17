# Meet the village, then inspect the decision

**Project in one sentence:** Village Sentinel tests whether a small decision model can help villagers resist misleading claims while still accepting fair trade, with evidence gathering and a generative fallback.

The declared reusable pattern is **tool selection**: `accept_claim`, `reject_claim`, or `check_evidence`. For allegations, accepting the claim means believing the warning and refusing the accused trader. The exact action meaning is in the input and trace.

| Character | What the judge sees | What actually does the work |
| --- | --- | --- |
| Mira | A resident with coins, supplies and a changing location | Settlement engine state; other residents keep their real names |
| Pip | Original tool choice, probabilities and confidence | Pinned Strands Decider 2B; no generated prose |
| Bea | A difficult choice after inspection | Bedrock Converse in live mode; an explicitly labeled rule-based stand-in otherwise |
| Gus | Travel, inspection, refusal or a completed trade | Deterministic engine validation and execution |
| Luna | Recorded usage and budget reservations | Python SQLite ledger plus durable web commands |
| Nimbus | Current connection and host label | Local app now; AWS only after a verified deployment |

## A 150-second demonstration outline

1. **0:00–0:15:** State the problem: a village must spot a scam without becoming so suspicious that it rejects good offers. Point to the mode and host labels.
2. **0:15–0:35:** Meet Mira and Pip. Show the notice asking for eight coins and the public price of two. Explain the three tools.
3. **0:35–1:05:** Take real decisions. Mira travels, inspects and receives a new observation. Open the probabilities. Identify the original Decider choice and any application override separately.
4. **1:05–1:30:** Show Gus’s actual consequence and the resident’s inventory. An action selection alone does not prove success.
5. **1:30–1:55:** Try The fair trade. Explain why refusing everything is a failure. If Bea is called, show whether that response is live Bedrock or a stub.
6. **1:55–2:15:** Show Luna’s recorded usage and Save evidence. Replay verification makes no model calls. Show the reusable recipe and typed question in the public source.
7. **2:15–2:30:** Say what was learned and disclose limitations. The local MPS result is not an AWS latency result. Current authored scenes do not establish general prompt-injection resistance.

Do not record the qualifying final video until a real AWS run and real Bedrock response have been captured. The current recorded bundle has real Decider results and a Bedrock stub, so it cannot prove the required live Bedrock pairing.

## What is verified in this development pass

- Real local Decider checkpoint loaded; three browser-driven decisions moved Mira, inspected a source and selected a final action.
- Every recorded scene can be played without calling a model; saved world checksums are compared with the committed bundle.
- Six role guides, scene controls, probability inspection, mobile layout and reduced-motion behavior work in Chrome.
- Duplicate commands replay a durable result; concurrent calls are admitted once; stale versions and conflicting commands fail.
- Provider errors are visible. Uncertain charges are retained, not silently refunded in the application ledger.

The source includes reproducible tests and the earlier evaluation evidence. Absolute latency/cost savings from a live AWS/Bedrock comparison remain unmeasured. Winning is determined by the judges; this interface makes the decision and its limitations reviewable.

## Submission items still owned by release

- Verify account eligibility and the disclosed use of prior Settlement simulation code.
- Capture a real AWS-hosted run with the qualifying Decider checkpoint and live Bedrock, then validate the exported evidence.
- Replace or separately label stub comparisons; do not present their synthetic usage as AWS billing.
- Publish the Builder Center article and a publicly accessible video shorter than three minutes.
- Include the public repository and reusable recipe. Add **#strands-decider-2b** and **#tool-selection**.
