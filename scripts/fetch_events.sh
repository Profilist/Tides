#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
HOURS_BACK="${HOURS_BACK:-1000}"
LIMIT="${LIMIT:-1000}"
EVENT_TYPES="${EVENT_TYPES:-}"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

QUERY="hoursBack=${HOURS_BACK}&limit=${LIMIT}"
if [[ -n "${EVENT_TYPES}" ]]; then
  QUERY="${QUERY}&eventTypes=${EVENT_TYPES}"
fi

echo "Fetching Amplitude events..."
curl -sS -X GET "${BASE_URL}/api/sync-amplitude?${QUERY}"
echo
