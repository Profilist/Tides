#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

if [[ -z "${GEMINI_API_KEY:-}" && -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

echo "Posting synthetic events to derive issues..."
DERIVE_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/derive-issues" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      { "event_type": "click_signup_btn", "country": "Thailand", "user_id": "th_a1", "event_time": "2026-01-16T10:00:00Z" },
      { "event_type": "click_signup_btn", "country": "Thailand", "user_id": "th_a2", "event_time": "2026-01-16T10:05:00Z" },
      { "event_type": "click_signup_btn", "country": "Thailand", "user_id": "th_b1", "event_time": "2026-01-08T09:00:00Z" },
      { "event_type": "click_signup_btn", "country": "Thailand", "user_id": "th_b1", "event_time": "2026-01-08T09:05:00Z" },
      { "event_type": "click_signup_btn", "country": "Thailand", "user_id": "th_b1", "event_time": "2026-01-08T09:10:00Z" },
      { "event_type": "click_signup_btn", "country": "Thailand", "user_id": "th_b2", "event_time": "2026-01-08T09:15:00Z" },
      { "event_type": "click_signup_btn", "country": "Thailand", "user_id": "th_b2", "event_time": "2026-01-08T09:20:00Z" },
      { "event_type": "click_signup_btn", "country": "US", "user_id": "us_a1", "event_time": "2026-01-16T12:00:00Z" },
      { "event_type": "click_signup_btn", "country": "US", "user_id": "us_b1", "event_time": "2026-01-08T12:00:00Z" }
    ],
    "options": {
      "eventType": "click_signup_btn",
      "segmentBy": ["country"],
      "minUsers": 1,
      "minDeltaPct": 10,
      "topN": 5
    }
  }')

echo "Derived issues response:"
echo "${DERIVE_RESPONSE}"

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY not set. Skipping /api/analyze-issues."
  exit 0
fi

ISSUES_JSON=$(echo "${DERIVE_RESPONSE}" | python -c 'import json,sys; data=json.load(sys.stdin); issues=data.get("issues", []); print(json.dumps({"issues": issues, "project": {"id": "demo", "name": "Synthetic Test"}}))')

echo "Sending issues to Gemini for analysis..."
ANALYZE_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/analyze-issues" \
  -H "Content-Type: application/json" \
  -d "${ISSUES_JSON}")

echo "Analyze issues response:"
echo "${ANALYZE_RESPONSE}"
