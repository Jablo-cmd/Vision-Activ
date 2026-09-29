#!/usr/bin/env bash
# Builds the app against the local stack and serves it on :4173 (used by Playwright's webServer).
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(node scripts/e2e-keys.mjs | sed 's/^/export /')"
export VITE_SUPABASE_URL=http://127.0.0.1:54321
export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
npm run build
exec npx vite preview --port 4173 --strictPort --host 127.0.0.1
