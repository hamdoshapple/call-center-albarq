#!/bin/sh
set -e

echo "[entrypoint] waiting for database..."
# Push schema (idempotent) and seed demo data on first boot.
npx prisma db push --skip-generate

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] seeding demo data..."
  node dist/seed/seed.js || echo "[entrypoint] seed skipped/failed (continuing)"
fi

echo "[entrypoint] starting server..."
node dist/index.js
