#!/usr/bin/env bash
# Runs every pgTAP file under supabase/tests/ against an already-migrated database.
# Usage: scripts/db-test.sh [postgres-url]   (default: local test container)
set -uo pipefail
DB_URL="${1:-postgresql://postgres:postgres@127.0.0.1:54329/postgres}"
cd "$(dirname "$0")/.."
status=0
total=0
for f in supabase/tests/*.test.sql; do
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); rc=$?
  passed=$(echo "$out" | grep -cE '^ *ok [0-9]+' || true)
  failed=$(echo "$out" | grep -cE '^ *not ok [0-9]+' || true)
  total=$((total + passed))
  if [ "$rc" -ne 0 ] || [ "$failed" -ne 0 ] || echo "$out" | grep -qE 'Looks like you (failed|planned)'; then
    echo "FAIL  $f (passed=$passed failed=$failed rc=$rc)"
    echo "$out" | grep -E '^ *not ok|^ *# |ERROR|CONTEXT' | head -30
    status=1
  else
    echo "PASS  $f ($passed assertions)"
  fi
done
echo "Total passing assertions: $total"
exit $status
