#!/usr/bin/env bash
# Loads the demonstration data into a migrated database, checks its integrity, and proves that loading it a
# second time changes nothing (same audit-log size, same row counts). Used by CI and for local checks.
# Needs a database whose auth schema is complete (the local stack, not a bare Postgres container).
# Usage: [DEMO_PASSWORD=...] scripts/db-demo.sh [postgres-url]
set -euo pipefail
DB_URL="${1:-postgresql://postgres:postgres@127.0.0.1:54329/postgres}"
cd "$(dirname "$0")/.."
PW="${DEMO_PASSWORD:-ci-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')}"

psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "select set_config('demo.password', '$PW', false)" -f supabase/demo/seed_demo.sql >/dev/null
bad=$(psql "$DB_URL" -X -q -tA -F' | ' -v ON_ERROR_STOP=1 -f supabase/demo/verify_demo.sql | awk -F' \\| ' '$2 == "f"')
if [ -n "$bad" ]; then echo "Demonstration data failed its integrity checks:"; echo "$bad"; exit 1; fi

snapshot() { psql "$DB_URL" -X -q -tA -c "select (select count(*) from audit_log) || '/' || (select count(*) from auth.users) || '/' || (select count(*) from assessments) || '/' || (select count(*) from commitments) || '/' || (select count(*) from commitment_updates) || '/' || (select count(*) from evidence_items) || '/' || (select count(*) from management_reviews) || '/' || (select count(*) from notifications)"; }
before=$(snapshot)
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f supabase/demo/seed_demo.sql >/dev/null
after=$(snapshot)
if [ "$before" != "$after" ]; then echo "Seed is not idempotent: $before -> $after"; exit 1; fi
echo "Demonstration data OK and idempotent ($after)"
