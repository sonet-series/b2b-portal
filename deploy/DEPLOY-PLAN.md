# B2B Portal — deployment runbook

Target: `b2b.seriestours.com` on the Hetzner box that already runs
seriestours.com and the Frappe/ERPNext ERP.

Follows the deployment pattern seriestours.com uses (Docker Compose + Traefik
labels + GitHub Actions), with **one deliberate difference: the Docker
network**. See "Network isolation" below — that difference is the whole point,
not an oversight.

---

## Network isolation (read this first)

seriestours-website joins `frappe_default`, the ERP's own Docker network. That
is correct for that site: it calls the ERP API.

**This portal must not.** Per CLAUDE.md, the portal has no shared network path
to the ERP container or its database. Sharing a host is an ops-convenience
decision; it is not permission to share a network.

Traefik must share a network with a container to route to it, so the portal
joins a dedicated `edge` network and **Traefik is attached to both**:

```
Cloudflare -> Traefik --+-- frappe_default -> ERP, MariaDB, seriestours.com
                        |
                        +-- edge ----------> b2b-portal-web -> ./data/prod.db
```

Docker does not route between networks by default, so the portal has no path
to the ERP. This is enforced by topology, not by a firewall rule someone has to
remember.

One-time setup on the box (additive, reversible with `docker network disconnect`):

```bash
docker network create edge
docker network connect edge <traefik-container-name>
```

---

## First deploy

Prerequisites: DNS for `b2b.seriestours.com` pointing at the box, and the
`edge` network created above.

```bash
cd /opt
git clone <repo-url> b2b-portal
cd b2b-portal

# The container runs as uid 1001; the bind mount must be writable by it.
mkdir -p data && chown 1001:1001 data

# Secrets are generated HERE, on the box — never committed, never pasted from
# elsewhere. AUTH_SECRET must be at least 32 chars or the app refuses to boot.
umask 077
cat > .env.production <<EOF
AUTH_SECRET=$(openssl rand -base64 48)
ADMIN_EMAIL=sonetpunnoose@gmail.com
ADMIN_PASSWORD=$(openssl rand -base64 18)
EOF

# Read the one-time admin password, then sign in and change it immediately.
cat .env.production

docker compose build
docker compose up -d
docker compose logs -f web
```

The entrypoint runs `prisma migrate deploy` and seeds the admin user before
Next starts. `migrate deploy` only applies committed migrations — it never
generates or resets — so it is safe on every container start.

`SEED_DEMO` is deliberately unset in production: the demo catalogue must never
appear in a real database.

## Verify HTTPS before trusting the handover

The WhatsApp handover copy button needs a secure context. Over plain HTTP it
disables itself and tells the user to copy manually — degraded but honest.
Confirm TLS is actually up:

```bash
curl -sSI https://b2b.seriestours.com/login | head -1     # expect HTTP/2 200
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://b2b.seriestours.com/login                        # expect 308
```

## Admin password

`ADMIN_PASSWORD` reaches the server in an env file, so it is known to anyone
who can read that file. The seed marks the account `mustChangePassword` on
every run and the admin layout blocks the dashboard until a new password is
set. The credential that travels is never the credential that persists.

## Backups

```bash
crontab -e
15 2 * * * /opt/b2b-portal/deploy/backup.sh >> /var/log/b2b-backup.log 2>&1
```

`deploy/backup.sh` uses SQLite's own `.backup` (transaction-safe — a plain `cp`
of a live database can capture a torn write), verifies with `PRAGMA
integrity_check`, gzips, and prunes past 30 days. CI also runs it before every
deploy, since migrations apply on container start.

`deploy/restore.sh <backup.db.gz>` restores one, keeping the current database
alongside as `.pre-restore-*`.

**Gap:** these backups sit on the same disk as the database. That covers a bad
migration or a mistaken delete, not the box failing. Off-box copies are a
separate decision.

## Continuous deploy

`.github/workflows/deploy.yml` deploys on push to `main`. Requires repo
secrets: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`.

Unlike seriestours-website's workflow it does **not** `docker compose down`
before building, so downtime is a restart rather than a full image build, and
it health-checks a real page rather than container status.

## Rollback

```bash
cd /opt/b2b-portal
git log --oneline -10
git checkout <known-good-sha>
docker compose build && docker compose up -d
```

If a migration is the problem, restore the pre-deploy backup first —
`prisma migrate deploy` rolls forward only.
