#!/usr/bin/env bash
#
# Deploy the portal, on the box.
#
# This exists because the GitHub Actions workflow has never once succeeded —
# every run since #8 failed in under eleven seconds on the SSH step, so every
# deploy has actually been somebody typing these commands by hand. Typed
# commands drift: the backup gets skipped when it feels unnecessary, which is
# exactly when it is not.
#
# The workflow stays, and this is what it should have been running. Fix the
# secrets and the two paths do the same thing.
#
#   sudo bash deploy/deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

say "Pulling main"
git pull origin main

# Back up BEFORE migrating. Migrations run on container start, and a failed
# migration against a database with no recent backup is the worst position to
# be in — which this project has already been in once, on 27 Aug.
say "Backing up"
bash deploy/backup.sh

say "Building"
docker compose build

say "Starting"
docker compose up -d

say "Waiting for health"
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' b2b-portal-web 2>/dev/null || echo missing)"
  if [ "$status" = "healthy" ]; then
    printf 'healthy after %s checks\n' "$i"

    say "Migrations applied this boot"
    docker compose logs --tail=60 web 2>&1 | grep -iE "migration|seed|markup rules" || echo "(none reported)"

    say "Deployed"
    git --no-pager log --oneline -1
    exit 0
  fi
  sleep 5
done

say "Container did not become healthy — last 60 lines"
docker compose logs --tail=60 web
exit 1
