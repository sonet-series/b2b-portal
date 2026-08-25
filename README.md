# Series Tours — B2B Agent Portal

Quote portal for B2B travel agents. Deploys to `b2b.seriestours.com`.

Standalone by design: **no connection of any kind to the Frappe/ERPNext ERP.**
See [CLAUDE.md](CLAUDE.md) for the full working notes, schema conventions, and
open decisions.

## Getting started

```bash
cp .env.example .env     # then fill in AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx prisma migrate deploy
npm run db:seed          # add SEED_DEMO=1 for sample catalogue data
npm run dev
```

Requires Node 24 (see `.nvmrc`). Open http://localhost:3000.

## Status

Phase 1 complete: project scaffold, database schema, dev container, CLAUDE.md.
Phases 2–5 (admin CRUD, agent registration/approval, quoting, deploy) still to
come — see the phase plan in CLAUDE.md.
