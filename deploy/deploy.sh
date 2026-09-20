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

# Every phase prints how long the one before it took.
#
# Added 20 Sept 2026, after Sonet asked why deploying was slow and neither of
# us could answer it: the build log shows the build and nothing else, so the
# two thirds of the time spent outside `docker compose build` were invisible.
# A deploy that cannot say where its own minutes went gets optimised by guess.
START_TS=$(date +%s)
LAST_TS=$START_TS
PHASE=""
say() {
  local now
  now=$(date +%s)
  if [ -n "$PHASE" ]; then printf '    \033[2m%s took %ss\033[0m\n' "$PHASE" "$((now - LAST_TS))"; fi
  PHASE="$1"
  LAST_TS=$now
  printf '\n\033[1m==> %s\033[0m\n' "$1"
}
total() { printf '\n\033[1m==> Total %ss\033[0m\n' "$(($(date +%s) - START_TS))"; }

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

# Ask the APP whether it is up, rather than waiting for Docker to notice.
#
# The healthcheck in docker-compose.yml runs on a 30s interval with a 40s start
# period. That is correct for monitoring a container that is already running —
# notice within half a minute if it stops answering — and wrong for waiting on
# one that is starting: the container serves requests seconds after boot, but
# `docker inspect` cannot say "healthy" until its first scheduled check lands,
# so a deploy sat there for up to a minute and a half with a working site.
#
# Polling the same URL the healthcheck uses, every 2s, reports the truth as
# soon as it is true. The healthcheck stays exactly as it is; it is doing its
# own job, which is not this one.
say "Waiting for the app to answer"
ready=""
crashed=""
for i in $(seq 1 60); do
  if docker exec b2b-portal-web curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null; then
    ready=1
    printf 'answering after %ss\n' "$((i * 2))"
    break
  fi

  # A container that is restarting is not starting slowly, it is failing —
  # most often a migration that will fail again in five seconds' time. Waiting
  # the full two minutes to be told that helps nobody, and the entrypoint's
  # own assertions (next.config.ts, the PDF fonts) land here too.
  state="$(docker inspect -f '{{.State.Status}}' b2b-portal-web 2>/dev/null || echo missing)"
  if [ "$i" -ge 3 ] && [ "$state" != "running" ]; then
    crashed="$state"
    break
  fi

  sleep 2
done

if [ -z "$ready" ]; then
  if [ -n "$crashed" ]; then
    say "Container is $crashed, not starting — last 60 lines"
  else
    say "App never answered — last 60 lines"
  fi
  docker compose logs --tail=60 web
  total
  exit 1
fi

say "Migrations applied this boot"
docker compose logs --tail=60 web 2>&1 | grep -iE "migration|seed|markup rules" || echo "(none reported)"

# Clear up after ourselves.
#
# Every build adds BuildKit cache layers and nothing evicts them. Left alone it
# reached 37GB of a 75GB disk — shared with the ERP and MariaDB, so a full disk
# takes the whole box down, not just this portal. Found on 20 Sept 2026 at 85%
# and climbing.
#
# A SIZE CAP, not an age filter.
#
# `--filter until=168h` was tried first and reclaimed 2.7GB of 31GB, because
# `until` matches on LAST ACCESSED and a day of deploying refreshes almost
# every layer. Age is the wrong axis: what matters is not how old the cache is
# but how much disk it occupies.
#
# 10GB holds the layers that actually matter — `npm ci` and compiling
# better-sqlite3 from source, which only re-run when package-lock.json
# changes — so a routine deploy stays at ~25s. BuildKit evicts least-recently-
# used beyond the cap.
#
# --max-used-space is tried FIRST and is the semantically correct flag: a cap
# on what the cache may occupy. The older --keep-storage (renamed
# --reserved-space in Docker 28, and deprecated) means the opposite — keep at
# LEAST this much — and merely happens to prune down to about the same place.
# It is kept only as a fallback for a Docker too old to have the new flag.
#
# `|| echo` rather than failing: a deploy that has already succeeded must not
# be reported as failed over housekeeping.
say "Trimming the build cache"
{ docker builder prune -f --max-used-space 10GB 2>/dev/null \
    || docker builder prune -f --keep-storage 10GB 2>/dev/null \
    || echo "(could not trim — check 'docker system df')"; } | tail -1
# Portable field-picking rather than `df --output`, which is GNU-only and so
# cannot be tested anywhere but the server.
df -h / | tail -1 | awk '{print "  disk: " $5 " used, " $4 " free"}' || true

# Reported, never waited on: the container is already serving. This only says
# whether Docker has caught up yet, which matters for its restart policy.
say "Deployed"
printf 'docker health: %s\n' "$(docker inspect -f '{{.State.Health.Status}}' b2b-portal-web 2>/dev/null || echo unknown)"
git --no-pager log --oneline -1
total
