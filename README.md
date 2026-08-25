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

Phases 1–3 complete: project scaffold, database schema, dev container, the
Sonet-only admin (catalogue CRUD with seasonal rates and dual pricing modes),
and agent registration through approval and per-agent rate cards.

Phases 4–5 (agent quote screens, deploy) still to come — see the phase plan in
CLAUDE.md.

This portal sends no email. Approving an agent produces a copy-ready message
that Sonet passes on over WhatsApp or by phone — a deliberate manual step.
