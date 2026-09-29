#!/usr/bin/env bash
# Drops and recreates the application schema objects in the local test container, then replays migrations.
set -euo pipefail
DB_URL="${1:-postgresql://postgres:postgres@127.0.0.1:54329/postgres}"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
drop schema if exists public cascade; create schema public;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
drop schema if exists private cascade;
drop schema if exists cron cascade;
drop table if exists auth.users cascade;
SQL
echo reset-ok
