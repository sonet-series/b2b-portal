#!/bin/sh
# Applies pending migrations, then hands off to the app.
#
# `migrate deploy` only ever applies committed migrations — it never generates
# or resets, so it is safe to run on every container start.
set -e

# next.config.ts must exist at RUNTIME — `next start` re-reads it, and without
# it Next reverts to defaults with no warning. That is how the Server Action
# body limit silently dropped back to 1MB and broke document uploads.
if [ ! -f next.config.ts ]; then
  echo "FATAL: next.config.ts is missing from the image." >&2
  echo "  next start re-reads it at runtime; without it the Server Action body" >&2
  echo "  limit reverts to 1MB and document uploads fail with a 413." >&2
  exit 1
fi

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
