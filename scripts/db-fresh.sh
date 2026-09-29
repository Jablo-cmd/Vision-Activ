#!/usr/bin/env bash
# Starts a brand-new Supabase Postgres container for migration replay and pgTAP tests.
set -euo pipefail
NAME="${DB_CONTAINER:-vadb}"
PORT="${DB_PORT:-54329}"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" supabase/postgres:17.6.1.171 >/dev/null
for _ in $(seq 1 60); do
  PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc "select 1" >/dev/null 2>&1 && exit 0
  sleep 2
done
echo "database did not become ready" >&2; exit 1
