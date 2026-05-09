#!/usr/bin/env bash
# Minimal one-liner client. Replace API_KEY and endpoint, then run.
set -euo pipefail
API_KEY="${API_KEY:?Set API_KEY=rrk_...}"
ENDPOINT="${ENDPOINT:-http://localhost:3000/api/v1/send}"

curl -sS -X POST "$ENDPOINT" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Acme <noreply@acme.com>",
    "to": ["alice@example.com"],
    "subject": "Hello from Resend Rapper",
    "html": "<p>It works.</p>",
    "text": "It works."
  }'
echo
