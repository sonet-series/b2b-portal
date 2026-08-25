#!/bin/sh
# Applies pending migrations, then hands off to the app.
#
# `migrate deploy` only ever applies committed migrations — it never generates
# or resets, so it is safe to run on every container start.
set -e

echo "→ applying database migrations"
npx prisma migrate deploy

# Creates the admin user on first boot and re-arms the forced password change.
# Idempotent: it upserts, and the demo catalogue is skipped unless SEED_DEMO=1.
if [ "${RUN_SEED_ON_START}" = "1" ]; then
  echo "→ seeding admin user"
  npx tsx prisma/seed.ts
fi

echo "→ starting Next.js"
exec "$@"
