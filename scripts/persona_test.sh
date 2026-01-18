#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROJECT_ID="${PROJECT_ID:-demo}"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

echo "Posting synthetic events to derive personas..."
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

echo "Derived personas response:"
echo "${DERIVE_RESPONSE}"

echo "Fetching latest personas from storage..."
LIST_RESPONSE=$(curl -sS "${BASE_URL}/api/personas?projectId=${PROJECT_ID}&limit=10")

echo "List personas response:"
echo "${LIST_RESPONSE}"
