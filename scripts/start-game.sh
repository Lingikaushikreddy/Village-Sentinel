#!/usr/bin/env bash
# Default: recorded walkthrough, no Python or paid service needed.
# --live: real local Decider; Bedrock stays an explicitly labelled stub by default.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p work
if [[ ! -d engine/node_modules/settlement-testbed ]]; then npm --prefix engine ci --ignore-scripts; fi
agent_pid=''
cleanup() { if [[ -n "$agent_pid" ]]; then kill "$agent_pid" 2>/dev/null || true; wait "$agent_pid" 2>/dev/null || true; fi; }
trap cleanup EXIT INT TERM
if [[ "${1:-}" == '--live' ]]; then
  if [[ ! -x .venv/bin/python ]]; then
    echo "Install Python 3.12 dependencies first; see README.md." >&2
    exit 1
  fi
  export SENTINEL_AGENT_URL="${SENTINEL_AGENT_URL:-http://127.0.0.1:8797}"
  export SENTINEL_ALLOW_LIVE=1
  .venv/bin/python -m village_sentinel.service --port 8797 --threshold 0.31 \
    --ledger work/game-ledger.sqlite --budget-uusd 7000000 \
    --bedrock-mode "${SENTINEL_BEDROCK_MODE:-stub}" --decider-timeout 12 >work/agent.log 2>&1 &
  agent_pid=$!
  echo "Loading the real Decider checkpoint; startup details: work/agent.log"
fi
node web/server.mjs
