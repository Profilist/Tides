#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROJECT_ID="${PROJECT_ID:-demo}"

if [[ -z "${GEMINI_API_KEY:-}" && -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY not set. Cannot call /api/test/analyze-persona-impacts."
  exit 1
fi

echo "Deriving personas from synthetic events..."
DERIVE_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/derive-personas" \
  -H "Content-Type: application/json" \
  -d "{
    \"events\": [
      { \"event_type\": \"page_view\", \"user_id\": \"u1\", \"event_time\": \"2026-01-16T10:00:00Z\" },
      { \"event_type\": \"product_view\", \"user_id\": \"u1\", \"event_time\": \"2026-01-16T10:02:00Z\" },
      { \"event_type\": \"click_add_to_cart\", \"user_id\": \"u1\", \"event_time\": \"2026-01-16T10:04:00Z\" },
      { \"event_type\": \"checkout_complete\", \"user_id\": \"u1\", \"event_time\": \"2026-01-16T10:06:00Z\" },

      { \"event_type\": \"page_view\", \"user_id\": \"u2\", \"event_time\": \"2026-01-15T09:00:00Z\" },
      { \"event_type\": \"page_view\", \"user_id\": \"u2\", \"event_time\": \"2026-01-15T09:01:00Z\" },
      { \"event_type\": \"product_view\", \"user_id\": \"u2\", \"event_time\": \"2026-01-15T09:03:00Z\" },

      { \"event_type\": \"page_view\", \"user_id\": \"u3\", \"event_time\": \"2026-01-10T12:00:00Z\" },
      { \"event_type\": \"click_signup_btn\", \"user_id\": \"u3\", \"event_time\": \"2026-01-10T12:02:00Z\" },
      { \"event_type\": \"page_view\", \"user_id\": \"u3\", \"event_time\": \"2026-01-10T12:05:00Z\" },

      { \"event_type\": \"page_view\", \"user_id\": \"u4\", \"event_time\": \"2026-01-08T15:00:00Z\" },
      { \"event_type\": \"product_view\", \"user_id\": \"u4\", \"event_time\": \"2026-01-08T15:05:00Z\" },
      { \"event_type\": \"click_add_to_cart\", \"user_id\": \"u4\", \"event_time\": \"2026-01-08T15:10:00Z\" },

      { \"event_type\": \"page_view\", \"user_id\": \"u5\", \"event_time\": \"2026-01-05T08:00:00Z\" },
      { \"event_type\": \"page_view\", \"user_id\": \"u5\", \"event_time\": \"2026-01-05T08:01:00Z\" },
      { \"event_type\": \"page_view\", \"user_id\": \"u5\", \"event_time\": \"2026-01-05T08:02:00Z\" }
    ],
    \"options\": {
      \"projectId\": \"${PROJECT_ID}\",
      \"daysBack\": 30,
      \"minUsers\": 1,
      \"maxPersonas\": 4
    }
  }")

PAYLOAD_FILE="$(mktemp)"
DERIVE_RESPONSE="${DERIVE_RESPONSE}" PROJECT_ID="${PROJECT_ID}" python - <<'PY' > "${PAYLOAD_FILE}"
import json
import os

derive = json.loads(os.environ.get("DERIVE_RESPONSE", "{}"))
personas = derive.get("personas", [])

issue = {
  "id": "iss_scroll_depth_low",
  "metric": "event_rate",
  "eventType": "scroll_depth_25",
  "segment": { "country": "Thailand" },
  "windowA": { "start": "2026-01-10T20:50:45.695Z", "end": "2026-01-17T20:50:45.695Z" },
  "windowB": { "start": "2026-01-03T20:50:45.695Z", "end": "2026-01-10T20:50:45.695Z" },
  "valueA": 0.35,
  "valueB": 0.58,
  "deltaPct": -39.7,
  "direction": "decrease",
  "severity": "high",
  "sampleA": { "eventCount": 420, "uniqueUsers": 1200 },
  "sampleB": { "eventCount": 680, "uniqueUsers": 1180 }
}

demo_html = ""
try:
  with open("demo.html", "r", encoding="utf-8") as f:
    demo_html = f.read()
except Exception:
  demo_html = ""

updated_html = ""
try:
  with open("suggestion_output.html", "r", encoding="utf-8") as f:
    updated_html = f.read()
except Exception:
  updated_html = ""

payload = {
  "personas": personas,
  "issue": issue,
  "project": {"id": os.environ.get("PROJECT_ID", "demo"), "name": "Persona UI Impact Test"},
  "assets": {
    "demoHtml": demo_html,
    "updatedHtml": updated_html,
    "changeSummary": [
      "Use suggestion_output.html as the proposed UI change."
    ]
  },
}

print(json.dumps(payload))
PY

echo "Sending persona impact request..."
IMPACT_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/test/analyze-persona-impacts" \
  -H "Content-Type: application/json" \
  --data-binary "@${PAYLOAD_FILE}")

rm -f "${PAYLOAD_FILE}"

echo "Persona impacts response:"
echo "${IMPACT_RESPONSE}"
