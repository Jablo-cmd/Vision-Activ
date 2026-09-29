#!/usr/bin/env bash
# Replays every migration in order against a Postgres URL (default: local test container).
set -euo pipefail
DB_URL="${1:-postgresql://postgres:postgres@127.0.0.1:54329/postgres}"
cd "$(dirname "$0")/../supabase/migrations"
for f in $(ls *.sql | sort); do
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FAILED: $f"; exit 1; }
done
echo "Applied $(ls *.sql | wc -l) migrations"
