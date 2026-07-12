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
for tool in push_meal_plan create_recipe list_meal_plans get_meal_plan get_active_meal_plan activate_meal_plan complete_meal_plan list_favorites search_recipes get_recipe; do
  echo "$TOOLS" | grep -q "\"$tool\"" || { echo "MISSING TOOL: $tool"; exit 1; }
done
echo "    ok: all 10 tools present"

echo "==> push_meal_plan"
PUSH=$(curl -sf -X POST "$MCP" "${HDRS[@]}" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"push_meal_plan","arguments":{"name":"Verify Script Test Plan","meals":[{"mealType":"dinner","recipe":{"title":"Verify Script Test Meal","description":"Pushed by verify-mcp.sh — safe to ignore.","servings":2,"prepMinutes":5,"cookMinutes":10,"tags":["test"],"stepsMarkdown":"1. This is a smoke test.","ingredients":[{"name":"test ingredient","quantity":1,"unit":"cup","section":"pantry"}]}}]}}}' | json_of)
PLAN_ID=$(echo "$PUSH" | grep -o 'planId[\\": ]*[0-9]*' | head -1 | grep -o '[0-9]*$')
[ -n "$PLAN_ID" ] || { echo "PUSH FAILED: $PUSH"; exit 1; }
echo "    ok: plan $PLAN_ID pushed"

echo "==> read back via tRPC"
ENC_INPUT=$(printf '{"planId":%s}' "$PLAN_ID" | sed 's/{/%7B/g;s/}/%7D/g;s/"/%22/g;s/:/%3A/g;s/,/%2C/g')
curl -sf "$BASE/trpc/plans.byId?input=$ENC_INPUT" | grep -q 'Verify Script Test Meal' && echo "    ok: plan visible in app API"

echo "==> complete_meal_plan (tidy up)"
DONE=$(curl -sf -X POST "$MCP" "${HDRS[@]}" -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"complete_meal_plan","arguments":{"planId":'"$PLAN_ID"'}}}' | json_of)
echo "$DONE" | grep -q 'completed' || { echo "COMPLETE FAILED: $DONE"; exit 1; }
echo "    ok: test plan completed"

echo
echo "All checks passed against $BASE"
echo "NOTE: a completed test plan (\"Verify Script Test Plan\") now sits in your history — safe to ignore."