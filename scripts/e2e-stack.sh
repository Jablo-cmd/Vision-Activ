#!/usr/bin/env bash
# Brings up a real local Supabase subset (Postgres + GoTrue + PostgREST + Storage + Mailpit)
# with every migration applied, plus an API gateway on :54321. Used by the Playwright suite.
set -euo pipefail
cd "$(dirname "$0")/.."

NET=vanet
PG_IMAGE=supabase/postgres:17.6.1.171
eval "$(node scripts/e2e-keys.mjs | sed 's/^/export /')"
JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
PGURL="postgresql://postgres:postgres@127.0.0.1:54329/postgres"

docker network inspect $NET >/dev/null 2>&1 || docker network create $NET >/dev/null
for c in vadb va-auth va-rest va-storage va-mail; do docker rm -f $c >/dev/null 2>&1 || true; done
rm -f /tmp/va-gateway.pid

docker run -d --name vadb --network $NET -e POSTGRES_PASSWORD=postgres -p 54329:5432 $PG_IMAGE >/dev/null
for _ in $(seq 1 60); do psql "$PGURL" -tAc "select 1" >/dev/null 2>&1 && break; sleep 2; done

# The image creates the service roles without passwords; the services connect over the network.
for role in supabase_auth_admin supabase_storage_admin authenticator supabase_admin; do
  docker exec vadb psql -U supabase_admin -d postgres -qc "alter role $role with password 'postgres'" >/dev/null
done

docker run -d --name va-mail --network $NET -p 127.0.0.1:8025:8025 -p 127.0.0.1:1025:1025 axllent/mailpit:v1.30.2 >/dev/null

docker run -d --name va-auth --network $NET -p 127.0.0.1:9999:9999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54321 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@vadb:5432/postgres" \
  -e GOTRUE_SITE_URL=http://127.0.0.1:4173 -e GOTRUE_URI_ALLOW_LIST="http://127.0.0.1:4173/**" \
  -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_DISABLE_SIGNUP=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true \
  -e GOTRUE_SMTP_HOST=va-mail -e GOTRUE_SMTP_PORT=1025 -e GOTRUE_SMTP_ADMIN_EMAIL=noreply@test.invalid \
  -e GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify -e GOTRUE_PASSWORD_MIN_LENGTH=10 \
  supabase/gotrue:v2.197.0 >/dev/null

docker run -d --name va-storage --network $NET -p 127.0.0.1:5000:5000 \
  -e ANON_KEY="$ANON_KEY" -e SERVICE_KEY="$SERVICE_KEY" -e AUTH_JWT_SECRET="$JWT_SECRET" -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e DATABASE_URL="postgres://supabase_storage_admin:postgres@vadb:5432/postgres" -e POSTGREST_URL=http://va-rest:3000 \
  -e DB_INSTALL_ROLES=false -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage -e TENANT_ID=stub -e REGION=stub \
  -e GLOBAL_S3_BUCKET=stub -e FILE_SIZE_LIMIT=52428800 -e ENABLE_IMAGE_TRANSFORMATION=false -e SERVER_PORT=5000 \
  supabase/storage-api:v1.77.0 >/dev/null

# Storage and Auth create their own schemas; wait for them before the application migrations run.
for _ in $(seq 1 90); do
  ready=$(psql "$PGURL" -tAc "select (to_regclass('storage.objects') is not null and to_regclass('auth.users') is not null and to_regclass('auth.identities') is not null)::int" 2>/dev/null || echo 0)
  [ "$ready" = "1" ] && break; sleep 2
done
[ "${ready:-0}" = "1" ] || { echo "auth/storage schemas never appeared"; docker logs va-auth 2>&1 | tail -5; docker logs va-storage 2>&1 | tail -5; exit 1; }
sleep 3

./scripts/db-replay.sh "$PGURL" 2>&1 | tail -1

docker run -d --name va-rest --network $NET -p 127.0.0.1:3000:3000 \
  -e PGRST_DB_URI="postgres://authenticator:postgres@vadb:5432/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_DB_MAX_ROWS=1000 -e PGRST_DB_EXTRA_SEARCH_PATH=public \
  postgrest/postgrest:v16.3 >/dev/null

nohup node scripts/e2e-gateway.mjs >/tmp/va-gateway.log 2>&1 &
echo $! > /tmp/va-gateway.pid

for _ in $(seq 1 60); do
  curl -fsS -H "apikey: $ANON_KEY" http://127.0.0.1:54321/auth/v1/health >/dev/null 2>&1 \
    && curl -fsS -H "apikey: $ANON_KEY" http://127.0.0.1:54321/rest/v1/ >/dev/null 2>&1 && break
  sleep 2
done
echo "stack ready: http://127.0.0.1:54321"
