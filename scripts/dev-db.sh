#!/usr/bin/env bash
# scripts/dev-db.sh — a throwaway Postgres for working on the interface.
#
# The UI work has been running blind: the pages worth improving are the dense
# ones, and every one of them needs data. Screenshots have had to come from a
# markup harness rendered against the built stylesheet, which proves the tokens
# are right but cannot show a table with forty rows in it or an empty state or
# a page that is loading.
#
# This stands up a local database in Docker and fills it from the seeds that
# already exist. It is deliberately NOT the Supabase instance: UI work has no
# business reading production records, and the seeds write.
#
# Disposable by design. `./scripts/dev-db.sh reset` throws it away and rebuilds.
#
#   ./scripts/dev-db.sh up      start the container, create the schema, seed it
#   ./scripts/dev-db.sh reset   destroy and rebuild from scratch
#   ./scripts/dev-db.sh down    stop it, keep the data
#   ./scripts/dev-db.sh url     print the connection string
set -euo pipefail

CONTAINER="limsl-dev-db"
# The port is found rather than chosen, because two separate things on this
# machine already refuse the obvious answers: Windows reserves 55367-55466 for
# Hyper-V, where binding fails with a permissions error that reads like a
# Docker fault and is not one, and wslrelay sits on 5433. Never 5432 either, so
# this can never be mistaken for, or collide with, a real Postgres.
PASSWORD="limsl-dev"

pick_port() {
  # If the container already exists, keep whatever port it was created with.
  local existing
  existing=$(docker port "$CONTAINER" 5432/tcp 2>/dev/null | head -1 | sed 's/.*://') || true
  if [ -n "${existing:-}" ]; then
    echo "$existing"
    return
  fi
  for p in 15432 15433 15434 6543 7654; do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then
      echo "$p"
      return
    fi
    exec 3<&- 2>/dev/null || true
  done
  echo "no free port found in the candidate list" >&2
  exit 1
}

PORT="$(pick_port)"
URL="postgresql://postgres:${PASSWORD}@127.0.0.1:${PORT}/postgres"

cd "$(dirname "$0")/.."

need_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed but the daemon is not running."
    echo "Start Docker Desktop, wait for the whale to stop animating, then run this again."
    exit 1
  fi
}

wait_ready() {
  printf "waiting for postgres"
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
      echo " ready"
      return 0
    fi
    printf "."
    sleep 1
  done
  echo " gave up after 60s"
  exit 1
}

seed() {
  export DATABASE_URL="$URL"

  echo "==> creating the schema from schema.ts"
  npx drizzle-kit push --force

  # Order matters: base data and users first, then the role accounts the
  # sign-off chains reference, then passwords. Everything after that is
  # independent and idempotent, so a failure in one does not block the rest.
  #
  # seed-base rather than migrate-and-seed: the latter replays SQL from the
  # gitignored drizzle/ folder, which does not exist on a fresh machine, and
  # drizzle-kit push above has already built the schema.
  echo "==> seeding"
  npx tsx src/lib/db/seed-base.ts
  npx tsx src/lib/db/seed-roles-signoff.ts
  npx tsx src/lib/db/seed-auth.ts

  for s in schedule corrective-wms kpi oem-calibration training documents procedure facility-assets; do
    if [ -f "src/lib/db/seed-$s.ts" ]; then
      echo "--> seed-$s"
      npx tsx "src/lib/db/seed-$s.ts" || echo "    (seed-$s failed, continuing)"
    fi
  done

  echo
  echo "Database ready at $URL"
  echo "Sign in as daniel.idonor@limsl.com / limsl2026"
}

case "${1:-up}" in
  up)
    need_docker
    if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
      docker start "$CONTAINER" >/dev/null
      echo "==> started existing container"
    else
      echo "==> creating container on port $PORT"
      docker run -d --name "$CONTAINER" \
        -e POSTGRES_PASSWORD="$PASSWORD" \
        -p "127.0.0.1:${PORT}:5432" \
        postgres:16-alpine >/dev/null
    fi
    wait_ready
    seed
    ;;
  reset)
    need_docker
    echo "==> removing $CONTAINER"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    exec "$0" up
    ;;
  down)
    docker stop "$CONTAINER" >/dev/null 2>&1 && echo "stopped" || echo "not running"
    ;;
  url)
    echo "$URL"
    ;;
  *)
    echo "usage: $0 {up|reset|down|url}"
    exit 1
    ;;
esac
