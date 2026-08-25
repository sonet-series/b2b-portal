# CLAUDE.md — Series Tours B2B Agent Portal

Working notes for any future session (or Sonet) picking this up. Read this
before changing anything.

**What this is:** a standalone B2B quote portal for travel agents, deploying to
`b2b.seriestours.com`. Target: working v1 by **24 Sept 2026**.

---

## The one rule that must never be broken

**This system has NO connection to the Frappe/ERPNext ERP (`series_tours_app`).**

No shared database. No API calls into Frappe. No sync, in either direction. No
import tooling. Sonet re-enters hotel/vehicle/itinerary data by hand through the
admin screens — that is the intended workflow, not a gap to be helpfully filled.

If a future phase genuinely needs ERP data, that is a deliberate decision Sonet
makes explicitly. It is never a default, and never something to build on spec.

---

## v1 scope

**In scope**
- Quote-only. Instant pricing, no human in the loop once an agent is approved.
- Four quotable product types: vehicle, houseboat, hotel, itinerary/package.
- Per-agent rate cards (per-customer pricing, not one shared B2B rate card).
- Sonet-only admin: catalogue CRUD + agent approval + rate-card assignment.

**Out of scope — do not build**
- Booking, payment, or any money movement.
- Multi-admin, roles, or admin invites. One admin user: Sonet.
- B2C / consumer booking (that is cochincarrental.com, a separate system).
- Anything touching the ERP.

---

## Stack

| Choice | What | Why |
|---|---|---|
| Runtime | Node 24.19.0 LTS (`.nvmrc`) | Installed at `~/.local/node` on Sonet's Mac — no Homebrew, no sudo. |
| Framework | Next.js 16 (App Router, `src/` dir, TypeScript) | Blueprint constraint; API routes and UI in one deployable. |
| Styling | Tailwind v4 | Ships with the scaffold. |
| Database | **SQLite** via `prisma/dev.db` | Chosen over Postgres deliberately: the constraint was "simplest to self-host alongside Next.js". Single file, no daemon, backup is `cp`. This box has no Docker, so Postgres would have needed a hosted instance just to develop. |
| ORM | Prisma 7.10 + `@prisma/adapter-better-sqlite3` | Prisma 7 requires a driver adapter; the connection URL lives in `prisma.config.ts`, **not** in `schema.prisma`. |
| Auth | Own email+password, `bcryptjs` (cost 12) + `jose` JWT cookies | Two separate session audiences: admin and agent. No third-party identity provider for two user classes. |
| Validation | `zod` | At every request boundary. |

### If SQLite ever needs to become Postgres
The schema was written to make that mostly mechanical: no SQLite-only types,
money as `Int`, enum-ish columns as `String` fed by `src/lib/enums.ts`. The real
work would be swapping the adapter, changing `provider`, and regenerating
migrations. Not free, but not a rewrite.

---

## Schema conventions

These are load-bearing. Breaking one produces wrong prices, not a crash.

1. **Money is `Int` minor units (paise). Never float, never Decimal.**
   `₹1,500.50` is stored as `150050`. Every money field is named with a
   `Minor` suffix — if a field name lacks it, it is not paise. All conversion
   goes through `src/lib/money.ts` (`toMinor` / `toMajor` / `formatMinor`).
   SQLite has no exact decimal type; floats lose rupees across a multi-line quote.

2. **Enum-ish columns are `String`; `src/lib/enums.ts` is the source of truth.**
   SQLite has no native enum. Validate on every write or the DB stores nonsense.

3. **Seasons are date ranges, not labels.** Every rate row carries
   `validFrom` / `validTo` (inclusive) plus a human `seasonLabel`. A free-text
   "Peak" cannot be resolved from a travel date, and instant quoting requires
   exactly that. Date helpers: `src/lib/dates.ts`, all UTC-midnight calendar days.

4. **`active` is a soft delete.** Catalogue rows that have been quoted against
   are never hard-deleted.

5. **`AgentRateCard.referenceId` is polymorphic** across `HotelRate`,
   `HouseboatRate`, `VehicleRate`, and `Itinerary`. Prisma cannot enforce it.
   Every write path must call `assertReferenceExists()` in `src/lib/rate-card.ts`.

6. **Quotes are snapshotted.** `Quote.snapshotJson` freezes inputs and resolved
   pricing. Catalogue rates change; a quote already sent must not change with them.

### Pricing fallback — confirmed with Sonet, 25 Aug 2026
> If an agent has **no** rate-card override for an item, they are quoted the
> **default rate** from the catalogue row. A missing override never blocks a
> quote and never hides a product.

Implemented in `src/lib/rate-card.ts`. `QuoteLine.usedOverride` records which
source supplied each price, so "why is this price what it is" stays answerable.

### Houseboat pricing design (designed fresh — no prior precedent)
Hotels and vehicles had existing rate shapes to follow. Houseboats did not.

Modelled as **whole-boat, per-cruise** rather than per-room-per-night, because
that is how Kerala houseboats are actually sold. The axes are:
- `cruisePackage` — `DAY_CRUISE` / `OVERNIGHT_22HR` / `TWO_NIGHT`
  (the 22hr standard is 12pm check-in → 9am check-out)
- `season` — as date range, same as everything else
- `ratePerCruiseMinor` — price for the **entire boat**, one cruise
- `includedPax` / `maxPax` / `extraPaxRateMinor` — capacity guardrails, so a
  2-bedroom boat quoted for 6 pax produces an extra-pax charge rather than a
  silently wrong price
- `mealPlan` — explicit, because overnight is normally full board but a day
  cruise is not

**Sonet should confirm this shape before Phase 4 builds quoting on top of it.**

---

## Repo layout

```
prisma/
  schema.prisma        # the whole data model, heavily commented
  migrations/          # committed; never edit an applied migration
  seed.ts              # admin user always; demo catalogue only if SEED_DEMO=1
  dev.db               # gitignored
prisma.config.ts       # Prisma 7 CLI config (connection URL lives here)
src/lib/
  db.ts                # the single PrismaClient (+ driver adapter)
  enums.ts             # allowed values for every String-as-enum column
  money.ts             # paise <-> rupees, INR formatting
  dates.ts             # UTC calendar-day maths, season window matching
  password.ts          # bcrypt hash/verify
  rate-card.ts         # per-agent override resolution + the fallback rule
.devcontainer/         # Dockerfile + devcontainer.json (needs Docker installed)
```

---

## Commands

```bash
npm run dev          # Next.js dev server on :3000
npm run typecheck    # tsc --noEmit
npm run lint
npm run db:migrate   # create + apply a migration
npm run db:seed      # admin user; SEED_DEMO=1 for sample catalogue
npm run db:studio    # Prisma Studio on :5555
npm run db:reset     # DESTRUCTIVE — drops and re-migrates
```

Node lives at `~/.local/node/bin` and is on PATH via `~/.zshrc`.

---

## Phase plan

- [x] **Phase 1** — scaffold, DB schema, dev container, this file
- [ ] **Phase 2** — admin CRUD (hotels/houseboats/vehicles/itineraries/rates) + Sonet-only auth
- [ ] **Phase 3** — agent registration, pending queue, approve + assign rate card
- [ ] **Phase 4** — agent quote screens for the four product types, price resolution
- [ ] **Phase 5** — polish, deploy to b2b.seriestours.com

Each phase ends with a checkpoint for Sonet: what was built, what is left, what
needs a decision. Do not push silently into the next phase.

---

## Still open — ask Sonet, do not assume

- **Houseboat schema shape** — designed above, needs Sonet's sign-off before
  Phase 4 builds on it.
- **Itinerary seasonality** — currently a flat `basePricePerPaxMinor` with no
  date window, unlike every other product. Does package pricing need seasons?
- **Itinerary pricing basis** — currently assumed **per person on twin sharing**,
  with an optional single supplement. Confirm.
- **Approval notification** — assumed email for v1. Nothing is wired up yet;
  no mail provider has been chosen. WhatsApp is a stated business interest but
  not a v1 requirement.
- **Hosting** — same Hetzner box as the rest of the Series Tours web family, or
  a separate one? Nothing has been provisioned. Ask before provisioning anything.
- **Quote persistence** — `Quote` / `QuoteLine` tables exist so an agent can
  retrieve a quote by reference. This was not in the blueprint; it is quote
  *record-keeping*, not booking. Confirm it is wanted.

---

## Environment notes

- No Docker on Sonet's Mac, so `.devcontainer/` is written and ready but has
  never been built. Local dev runs directly on the host Node.
- No Homebrew. Node was installed by extracting the official nodejs.org
  darwin-arm64 tarball to `~/.local/node` (checksum verified).
- npm 11 gates package install scripts. `better-sqlite3`, `@prisma/engines`,
  and `esbuild` are approved in `package.json`; a new native dep may need
  `npm approve-scripts <pkg>`.
