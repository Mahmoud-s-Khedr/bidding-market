#!/usr/bin/env bash
# Reproduce the CI pipeline locally on a *clean checkout of HEAD* (no .env, no generated files,
# no build caches) so "works on my machine" issues surface before pushing.
#
# usage: scripts/ci-local.sh [--with-db]
#   --with-db  also run db:check, migrations, integration tests (needs `docker compose up -d`)
#
# Local infra is expected under compose project "bidding-market" (override with COMPOSE_PROJECT_NAME).
# DB-backed steps use a throwaway database `market_ci_<pid>` on the local compose Postgres.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
WITH_DB=${1:-}
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ci-local.XXXXXX")
cleanup() { git -C "$ROOT" worktree remove --force "$TMP/repo" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

git -C "$ROOT" worktree add --detach "$TMP/repo" HEAD >/dev/null
cd "$TMP/repo"
export CI=true TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
unset DATABASE_URL SHADOW_DATABASE_URL || true

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
step "install (frozen lockfile)";   pnpm install --frozen-lockfile
step "format";                      pnpm format:check
step "lint";                        pnpm lint
step "typecheck";                   pnpm typecheck
step "unit tests";                  pnpm test
step "build";                       NEXT_PUBLIC_API_URL=http://localhost:4000 NEXT_PUBLIC_WS_URL=http://localhost:4000 pnpm build
step "audit";                       pnpm audit --prod --audit-level moderate && pnpm audit --audit-level high

if [ "$WITH_DB" = "--with-db" ]; then
  DB="market_ci_$$"
  PSQL=(docker compose -p "${COMPOSE_PROJECT_NAME:-bidding-market}" -f "$ROOT/docker-compose.yml" exec -T postgres psql -U market -q)
  "${PSQL[@]}" -c "CREATE DATABASE ${DB};" -c "CREATE DATABASE ${DB}_shadow;"
  trap '"${PSQL[@]}" -c "DROP DATABASE IF EXISTS ${DB} WITH (FORCE);" -c "DROP DATABASE IF EXISTS ${DB}_shadow WITH (FORCE);" >/dev/null 2>&1 || true; cleanup' EXIT
  export DATABASE_URL="postgresql://market:market@localhost:5442/${DB}?schema=public"
  export SHADOW_DATABASE_URL="postgresql://market:market@localhost:5442/${DB}_shadow?schema=public"
  export REDIS_URL=redis://localhost:6379 WEB_ORIGIN=http://localhost:3000
  export JWT_ACCESS_SECRET=ci-access-secret-ci-access-secret-0000 JWT_REFRESH_SECRET=ci-refresh-secret-ci-refresh-secret-000
  export JWT_ACCESS_TTL=15m JWT_REFRESH_TTL=7d S3_ENDPOINT=http://localhost:8333 S3_REGION=us-east-1
  export S3_BUCKET=market-uploads S3_ACCESS_KEY=minioadmin S3_SECRET_KEY=minioadmin S3_FORCE_PATH_STYLE=true
  step "db:check";                  pnpm --filter api run db:check
  step "migrate deploy";            pnpm --filter api run db:migrate:deploy
  step "integration tests";         pnpm test:integration
fi
step "CI-LOCAL PASSED"
