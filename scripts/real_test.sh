#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
HOURS_BACK="${HOURS_BACK:-24}"
LIMIT="${LIMIT:-1000}"
EVENT_TYPE="${EVENT_TYPE:-}"

if [[ -z "${GEMINI_API_KEY:-}" && -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

echo "Fetching Amplitude events..."
QUERY="hoursBack=${HOURS_BACK}&limit=${LIMIT}"
if [[ -n "${EVENT_TYPE}" ]]; then
  QUERY="${QUERY}&eventTypes=${EVENT_TYPE}"
fi

SYNC_RESPONSE=$(curl -sS -X GET "${BASE_URL}/api/sync-amplitude?${QUERY}")
echo "Sync response received."

EVENTS_JSON=$(echo "${SYNC_RESPONSE}" | python -c 'import json,sys; data=json.load(sys.stdin); events=data.get("events", []); print(json.dumps(events))')

echo "Deriving issues from real events..."
DERIVE_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/derive-issues" \
  -H "Content-Type: application/json" \
  -d "$(python -c 'import json,sys,os; events=json.loads(sys.stdin.read()); payload={"events": events, "options": {"eventType": os.environ.get("EVENT_TYPE") or None, "segmentBy": ["country"], "minUsers": 20, "minDeltaPct": 20, "topN": 5}}; print(json.dumps(payload))' <<< "${EVENTS_JSON}")")

echo "Derived issues response:"
echo "${DERIVE_RESPONSE}"

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY not set. Skipping /api/analyze-issues."
  exit 0
fi

ISSUES_JSON=$(echo "${DERIVE_RESPONSE}" | python -c 'import json,sys; data=json.load(sys.stdin); issues=data.get("issues", []); print(json.dumps({"issues": issues, "project": {"id": "demo", "name": "Real Test"}}))')

echo "Sending issues to Gemini for analysis..."
ANALYZE_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/analyze-issues" \
  -H "Content-Type: application/json" \
  -d "${ISSUES_JSON}")

echo "Analyze issues response:"
echo "${ANALYZE_RESPONSE}"
