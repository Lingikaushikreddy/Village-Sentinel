#!/usr/bin/env bash
# Start the service, run the matched comparison, summarise and verify. Usage:
#   scripts/run-all.sh [stub|live] [seeds=1-5] [threshold]
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=${1:-stub}; SEEDS=${2:-1-5}
THR=${3:-$(python -c "import json;print(json.load(open('bench/results/calibration.json'))['threshold_recommended']['threshold'])" 2>/dev/null || echo 0.6)}
PORT=${PORT:-8097}
LEDGER=bench/bundles/ledger-$(date +%Y%m%dT%H%M%S).sqlite
python -m village_sentinel.service --port "$PORT" --threshold "$THR" --bedrock-mode "$MODE" --ledger "$LEDGER" > "$LEDGER.service.log" 2>&1 &
SVC=$!
trap 'kill $SVC 2>/dev/null || true' EXIT
for i in $(seq 1 120); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 1; done
curl -s "http://127.0.0.1:$PORT/health"; echo
OUT=$(cd engine && node run-matched.mjs --url="http://127.0.0.1:$PORT/decide" --seeds="$SEEDS" | tee /dev/stderr | awk '/^bundle /{print $2}')
python bench/summarize_bundle.py "$OUT"
python bench/verify_sentinel_bundle.py "$OUT"
echo "bundle: $OUT"
