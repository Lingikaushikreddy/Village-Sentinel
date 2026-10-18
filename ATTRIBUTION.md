# Attribution and prior-work boundary

**Built during the AWS Strands Decider 2B Hackathon (16–23 October 2026), in this repository:**
the `evidence_first_tool_router` pattern package, the Village Sentinel agent service
(hermetic projection, Decider 2B client, Bedrock Converse client with forced tool choice,
SQLite reservation/idempotency/trace ledger, strict outcome scoring), the Node loopback
layer, the illustrated interactive interface and command store, the `truthful-allegation` scenario, the profiling, calibration, matched-comparison
and offline verification harnesses, and all documentation.

**Pre-existing, used as an external dependency and not part of the entry:**
[Settlement-Village](https://github.com/Lingikaushikreddy/Settlement-Village) (MIT, by the
same author, first published 17 September 2026) provides the deterministic village
simulation and the `settlement-testbed` npm package (pinned to 0.12.0). Its simulation is consumed through its protocol and npm package; nothing in the
Settlement repository was modified for this entry. The painted terrain and building
atlas are also reused at commit `cb766635301ee0dd627029944b3bb89388f07d0d`, under its
MIT license (see `docs/SETTLEMENT-ART-LICENSE.txt`). They are prior artwork, not new
hackathon assets. Details and character-adaptation provenance are in `docs/ART-PROVENANCE.md`.
The interactive adapter additionally imports the pinned package's published internal
step APIs because the root export omits them. This coupling is isolated and tested by replay.

**Pre-existing planning artwork, reused and disclosed:** the six original teaching
mascots (Mira, Pip, Bea, Gus, Luna and Nimbus) were generated for this team's planning
guide on October 13, 2026, before the event launch. The original cast sheet is reused unchanged for mission guides. A transparent
atlas adapted from that supplied sheet with the built-in image generation tool
on October 16 is used for the living village and displayed through SVG clipping. It is not presented as artwork created during
the event. The interactive village view and wiring were authored for this entry.
These characters are teaching aliases, not official AWS mascots or product branding.

**Third-party:**
* Strands Decider 2B checkpoint `StrandsAgents/strands-decider-2B-hobson-v19` (Apache-2.0),
  pinned to Hub commit `bb282d786bc251fd4e3068de3ada9ddbb38127cd`, base `Qwen/Qwen3.5-2B-Base`
  (Apache-2.0); `strands-decider` library (Apache-2.0).
* Amazon Bedrock is called through `boto3`; model id and prices are configuration.
