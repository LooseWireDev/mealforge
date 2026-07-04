#!/usr/bin/env bash
# Smoke-test a running mealforge instance end-to-end over MCP.
#   scripts/verify-mcp.sh [base-url]   (default http://localhost:8090)
set -euo pipefail

BASE="${1:-http://localhost:8090}"
MCP="$BASE/mcp"
HDRS=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H 'mcp-protocol-version: 2025-06-18')

json_of() { tr -d '\r' | grep '^data:' | head -1 | sed 's/^data: //'; }

echo "==> initialize"
INIT=$(curl -sf -X POST "$MCP" "${HDRS[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify-mcp","version":"0.0.0"}}}' | json_of)
echo "$INIT" | grep -q '"serverInfo"' && echo "    ok: $(echo "$INIT" | grep -o '"name":"mealforge"' | head -1)"

echo "==> tools/list"
TOOLS=$(curl -sf -X POST "$MCP" "${HDRS[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | json_of)
for tool in push_meal_plan get_recent_meal_plans get_meal_plan_for_week list_favorites search_recipes get_recipe; do
  echo "$TOOLS" | grep -q "\"$tool\"" || { echo "MISSING TOOL: $tool"; exit 1; }
done
echo "    ok: all 6 tools present"

# next Monday, so a test push never collides with the real current week
WEEK=$(date -d 'next monday' +%F 2>/dev/null || date -v +Mon +%F)

echo "==> push_meal_plan ($WEEK)"
PUSH=$(curl -sf -X POST "$MCP" "${HDRS[@]}" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"push_meal_plan","arguments":{"weekStart":"'"$WEEK"'","meals":[{"dayOfWeek":0,"mealType":"dinner","recipe":{"title":"Verify Script Test Meal","description":"Pushed by verify-mcp.sh — safe to ignore.","servings":2,"prepMinutes":5,"cookMinutes":10,"tags":["test"],"stepsMarkdown":"1. This is a smoke test.","ingredients":[{"name":"test ingredient","quantity":1,"unit":"cup","section":"pantry"}]}}]}}}' | json_of)
echo "$PUSH" | grep -q planId || { echo "PUSH FAILED: $PUSH"; exit 1; }
echo "    ok: plan pushed"

echo "==> read back via tRPC"
ENC_INPUT=$(printf '{"weekStart":"%s"}' "$WEEK" | sed 's/{/%7B/g;s/}/%7D/g;s/"/%22/g;s/:/%3A/g;s/,/%2C/g')
curl -sf "$BASE/trpc/plans.byWeek?input=$ENC_INPUT" | grep -q 'Verify Script Test Meal' && echo "    ok: plan visible in app API"

echo
echo "All checks passed against $BASE"
echo "NOTE: a test plan now exists for week $WEEK — re-push that week with a real plan (or ignore it)."
