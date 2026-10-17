# AWS handoff: prepared, not deployed

Status on October 16, 2026: the owner is still creating an AWS account. No resources or paid model calls were created in this development pass. The game currently runs on the local computer and the interface says so.

## Concrete proposed resources

One Linux x86_64 EC2 host, initially `m6i.xlarge` (4 vCPU, 16 GiB), one encrypted 30 GiB gp3 volume, one instance role, one instance profile and one security group with **no inbound rules**. Use an existing VPC and a subnet with internet egress. A public IPv4 address is for outbound package/model download and SSM connectivity; it adds cost. It does not expose the web or model ports.

The reviewable CloudFormation draft is [deploy/ec2-plan.json](../deploy/ec2-plan.json). It is syntax-checked locally, **not validated or deployed by AWS**. It creates the host and its four-hour stop timer; application installation remains an explicit SSM session. An Ubuntu 24.04 x86_64 AMI with the SSM agent must be selected for the chosen region. Do not paste an AMI from another region.

The existing M3/MPS measurements do not prove this CPU host meets the 12-second Decider deadline. First verify CPU memory, warm latency and account quota. If it fails, stop the host and review a priced alternative within the same remaining allocation before proceeding.

## Planning envelope, not spending authorization

| Allocation | Limit |
| --- | ---: |
| Compute, at most 24 running hours and at most $0.25/hour | $6 |
| Storage allowance | $4 |
| Bedrock model usage | $7 |
| IPv4, transfer and operations | $2 |
| Tax and contingency | $6 |
| Total out of pocket, excluding credits | **$25** |

These are allocations, not current AWS price quotes. Confirm the selected instance, region, model rates, credit eligibility and taxes in the account before starting. Stopped instances can still incur volume charges. Budget alerts can lag and are not a hard cap.

## Account and access

1. Complete [AWS signup](https://aws.amazon.com/resources/create-account/), review its plan and billing terms, enable MFA and use an ordinary project identity rather than root for development.
2. Configure the [AWS CLI authentication flow](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html) locally. Keep credentials out of chat, source and evidence.
3. Run `python scripts/aws-preflight.py`. It makes only account/model metadata checks and never invokes a model or creates a resource. An authenticated account still needs an actual bounded Converse smoke test to prove invocation permission and model access.
4. The current service defaults to `us.anthropic.claude-haiku-4-5-20251001-v1:0`. Confirm availability, [Bedrock access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html), inference-profile requirements and [current model pricing](https://aws.amazon.com/bedrock/pricing/) for this account. The earlier planning document considered Nova Micro; no silent model substitution is made.
5. Supply the exact selected inference-profile ARN and destination foundation-model ARNs to the template's `BedrockResourceArns` parameter. Cross-region profiles require permission on the destination model resources as well. Do not use `*` as a substitute.

Only after those checks is the resource proposal ready for spending approval and stack creation. No stack-creation command was run here.

## Install and run through SSM

After an approved host exists, connect with [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html). Install Git, Python 3.12 and Node 26.8.1 from their supported distributions. Clone the exact reviewed commit, not an unreviewed moving branch.

```bash
uv venv --python 3.12 .venv
# For a CPU host, install the supported CPU PyTorch wheel first to avoid downloading CUDA libraries.
uv pip install torch --index-url https://download.pytorch.org/whl/cpu
uv pip install -e patterns/evidence-first -e 'sentinel[decider,bedrock,test]'
npm ci
npm run setup:engine
npm test
.venv/bin/python -m pytest patterns/evidence-first sentinel/tests -q
```

Keep the instance role credentials on the host; no access key belongs in the page. After verifying model rates and invocation access, set `SENTINEL_BEDROCK_MODE=live`, `AWS_REGION=us-east-1` and the reviewed pricing variables. Start `npm run game -- --live`; the local agent is on 8797 and the page on 5173, both loopback. A real local warmup runs before the agent advertises readiness.

Forward port 5173 using `AWS-StartPortForwardingSession`. The existing design uses private judge/operator access through that tunnel and a public demo video; it does not require a public inference endpoint. If a public web deployment is later wanted, add HTTPS and protected live access. The server requires a live token when bound publicly, and accepts a configured public origin. Recorded mode can stay public without granting model calls.

Before the final recording, capture runtime/host identity and a real Decider/Bedrock trace, run the evidence verifier and disclose the host accurately. The UI deliberately continues to say local/unverified until an AWS deployment has been checked; do not merely change its text to imply proof.

Stop the instance after the session and confirm EC2 reports **stopped**. The template's four-hour timer invokes host shutdown, with instance-initiated behavior set to stop. Export evidence before deleting storage. Keep enough of the $7 model allocation for final recording.

## Failure accounting

The application reserves before Bedrock calls. It retains a reservation when the provider charge is uncertain and commits returned usage even if the paid reply is malformed. Automatic SDK retries are disabled with `total_max_attempts=1` ([AWS retry semantics](https://docs.aws.amazon.com/boto3/latest/guide/retries.html)). This conservative ledger still is not an AWS billing hard cap; configured token prices and unrelated account costs must be checked separately.

The cartoon ledger shows attempted calls, valid replies, cost estimated from returned usage and uncertain reservations separately. Recorded playback makes no new model calls; stand-in token usage is synthetic. A failed response remains a failure even when its provider was configured in live mode.

## Recover an interrupted game command

A crash during an admitted live command deliberately blocks further live calls. Stop **both** the Node game server and Python inference worker before recovery. Then run:

```bash
node scripts/recover-game.mjs --confirm-worker-stopped
```

Use the same `SENTINEL_GAME_DB` as the server. Recovery checks that each recorded owner PID has exited, marks its command interrupted and permits a fresh scene. It never retries inference, refunds a call allowance, changes the old world or releases a Python provider reservation. For a database created before owner PIDs were stored, provide the verified old PID with `--stopped-pid PID`; an unknown or still-running PID blocks recovery. PID reuse can conservatively block recovery too. Do not delete the ledgers to bypass a limit.

## Local inference limits observed

Three actual local Decider decisions completed through the browser and engine at 4,491, 930 and 648 ms in one session. Other cold or idle calls exceeded the 12-second deadline on the memory-pressured development Mac, including after startup warmup. Those runs are explicitly degraded; they are not successful live-model results. A final live judge run still needs a measured host with enough available memory, real Bedrock access and preserved failure traces. The public recorded walkthrough avoids that runtime dependency and is labeled accordingly.
