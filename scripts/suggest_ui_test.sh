#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SCREENSHOT_URLS="${SCREENSHOT_URLS:-}"
SCREENSHOT_CAPTIONS="${SCREENSHOT_CAPTIONS:-}"

if [[ -z "${GEMINI_API_KEY:-}" && -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY not set. Cannot call /api/suggest-ui."
  exit 1
fi

echo "Using stubbed issue for demo site..."
ISSUES_JSON=$(python - <<'PY'
import json
print(json.dumps({
  "issues": [
    {
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
  ],
  "meta": {
    "totalEvents": 2400,
    "windowA": { "start": "2026-01-10T20:50:45.695Z", "end": "2026-01-17T20:50:45.695Z" },
    "windowB": { "start": "2026-01-03T20:50:45.695Z", "end": "2026-01-10T20:50:45.695Z" }
  }
}))
PY
)

ISSUE_COUNT=$(ISSUES_JSON="${ISSUES_JSON}" python - <<'PY'
import json, os
data = json.loads(os.environ.get("ISSUES_JSON", '{"issues": []}'))
print(len(data.get("issues", [])))
PY
)

if [[ "${ISSUE_COUNT}" -eq 0 ]]; then
  echo "No issues derived. Exiting."
  exit 0
fi

echo "Sending issues to Gemini for analysis..."
ANALYZE_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/analyze-issues" \
  -H "Content-Type: application/json" \
  -d "${ISSUES_JSON}")

echo "Analyze issues response:"
echo "${ANALYZE_RESPONSE}"

SUGGEST_PAYLOAD=$(ISSUES_JSON="${ISSUES_JSON}" ANALYZE_RESPONSE="${ANALYZE_RESPONSE}" python - <<'PY'
import json, os, sys

derive = json.loads(os.environ.get("ISSUES_JSON", "{}"))
analyze = json.loads(os.environ.get("ANALYZE_RESPONSE", "{}"))
issue = (derive.get("issues") or [])[0]
analyses = analyze.get("analyses") or []
analysis = next((a for a in analyses if a.get("issueId") == issue.get("id")), None)

demo_html = ""
try:
  with open("demo.html", "r", encoding="utf-8") as f:
    demo_html = f.read()
except Exception:
  demo_html = ""

urls = [u.strip() for u in os.environ.get("SCREENSHOT_URLS", "").split(",") if u.strip()]
captions = [c.strip() for c in os.environ.get("SCREENSHOT_CAPTIONS", "").split(",")] if os.environ.get("SCREENSHOT_CAPTIONS") else []
screenshots = []
for idx, url in enumerate(urls):
  entry = {"url": url}
  if idx < len(captions) and captions[idx]:
    entry["caption"] = captions[idx]
  screenshots.append(entry)

payload = {
  "issue": issue,
  "analysis": analysis,
  "project": {"id": "demo", "name": "Synthetic Suggest UI"},
  "assets": {
    "demoHtml": demo_html,
    "screenshots": screenshots,
  },
}

print(json.dumps(payload))
PY
)

echo "Sending UI suggestion request..."
SUGGEST_RESPONSE=$(curl -sS -X POST "${BASE_URL}/api/suggest-ui" \
  -H "Content-Type: application/json" \
  -d "${SUGGEST_PAYLOAD}")

echo "Suggest UI response:"
echo "${SUGGEST_RESPONSE}"
