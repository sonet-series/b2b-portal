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

**Sharing a host does not weaken this.** Confirmed with Sonet 25 Aug 2026: this
portal deploys to the *same Hetzner box* as seriestours.com and the ERP, in its
**own container with its own database and no network path to the ERP container
or its database**. That is an ops-convenience decision — one server to maintain
— and explicitly not a walk-back of the rule above. Physical proximity is not
logical coupling. If a future change would open a route between the two
containers, it is forbidden by default.

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

### Auth
Two audiences, two cookies, two `aud` claims (`admin` / `agent`) — an agent
token can never satisfy an admin check even if a downstream caller forgets to
look at the role. Sessions are 12h httpOnly JWTs.

`src/app/admin/(dashboard)/layout.tsx` is the single gate for admin pages.
**Server actions are a separate entry point and the layout does not run for
them**, so every action calls `requireAdmin()` itself.

Agent login re-checks `status === "approved"` on every request, not just at
sign-in, so revoking an agent takes effect immediately rather than when their
cookie expires.

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

### Pricing modes (confirmed with Sonet, 25 Aug 2026)
Houseboats and packages each sell two ways, and both modes must coexist.

| Table | `pricingMode` | Price column means |
|---|---|---|
| `HouseboatRate` | `WHOLE_BOAT` | the whole boat, one cruise |
| `HouseboatRate` | `PER_PERSON` | one person, one cruise |
| `ItineraryRate` | `PER_PERSON_TWIN_SHARING` | one person, sharing a twin |
| `ItineraryRate` | `PER_PACKAGE` | the whole package, flat |

Three things about this shape are load-bearing:

1. **The mode is on the RATE row, not the parent.** The same boat can sell
   whole-boat overnight and per-person on a day cruise; the same package can be
   per-person in one season and a flat family rate in another. A product sold
   both ways at once simply has two rate rows.

2. **One required price column, not two nullable ones.** `rateMinor` /
   `priceMinor` change meaning with the mode. Two nullable columns would allow a
   row whose mode points at a null price; this cannot. The cost is that the
   number is only meaningful through `src/lib/pricing.ts` — **nothing else may
   multiply a rate by a pax count.**

3. **The mode is never an agent input.** The agent picks the product, duration,
   dates, and pax. If a product sells both ways they see two concrete priced
   options ("Whole boat ₹14,500" vs "Per person ₹3,800 × 4"). There is no mode
   toggle in the agent UI — an agent should not need to know the term, and a
   toggle would let them pick a mode the product does not offer.

Guardrails, so an unrealistic quote is impossible rather than merely unlikely:
`PER_PERSON` carries `minPax` (a party below it is charged at `minPax`),
`WHOLE_BOAT` carries `includedPax` + `extraPaxRateMinor`, and both carry
`maxPax`. `PER_PACKAGE` has an optional `maxPax` ceiling.

Mode-dependent field rules are enforced in `src/lib/validation.ts` — SQLite
cannot express them and Prisma will not check them, so that file is the only
thing standing between a typo and a wrong price.

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
  pricing.ts           # mode-dependent price maths (the ONLY interpreter of
                       #   rateMinor / priceMinor units)
  validation.ts        # zod schemas + the mode-dependent field rules
  auth.ts              # admin + agent sessions
src/components/ui.tsx  # form and table primitives
  handover.ts          # the copy-ready WhatsApp message (v1 sends no email)
  temp-password.ts     # CSPRNG temp passwords, no lookalike characters
  rate-options.ts      # the four rate tables flattened into one pick list
  quote.ts             # the quote engine (season resolution + rate card)
  quote-types.ts       # shared shapes, no server-only import so the client
                       #   components can use the types
  quote-store.ts       # saving, listing, and retrieving quotes
src/app/
  page.tsx             # public landing
  register/            # public agent registration -> pending
  login/               # public agent sign-in
  agent/
    change-password/   # OUTSIDE the (portal) group, so the forced-change
                       #   redirect cannot loop
    (portal)/          # guarded; redirects out when mustChangePassword
  admin/
    login/             # unguarded
    (dashboard)/       # guarded by layout.tsx; hotels, houseboats, vehicles,
                       #   itineraries, agents
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
- [x] **Phase 2** — admin CRUD (hotels/houseboats/vehicles/itineraries/rates) + Sonet-only auth
- [x] **Phase 3** — agent registration, pending queue, approve + assign rate card
- [x] **Phase 4** — agent quote screens for the four product types, price resolution
- [ ] **Phase 5** — polish, deploy to b2b.seriestours.com

Each phase ends with a checkpoint for Sonet: what was built, what is left, what
needs a decision. Do not push silently into the next phase.

---

## Still open — ask Sonet, do not assume

- **Mode per rate row** — implemented so `pricingMode` varies by
  houseboat+duration and by package+season, rather than being fixed per boat or
  per package. Sonet raised this as an assumption to confirm rather than
  assume; the schema supports the flexible reading. Confirm it matches how the
  boats are actually contracted.
### Quoting (Phase 4)
Single-product quoting: one hotel, one boat, one vehicle, or one package per
quote. Combining products into one multi-line quote is deliberately NOT built.

Two rules run through `src/lib/quote.ts`:

1. **Every price resolves through the agent's rate card, falling back to the
   catalogue default.** `QuoteLine.usedOverride` records which source supplied
   each line, so "why is this price what it is" stays answerable.

2. **Seasons resolve per night / per day, not once per trip.** A stay crossing
   from off-season into peak reprices at the boundary and shows as two lines.
   Resolving once for the whole trip would silently undercharge on exactly the
   bookings that matter most. Consecutive nights sharing a rate are grouped into
   one line, so a quote reads as seasons rather than as a list of days.

   Per-day resolution applies to hotel stays and PER_DAY vehicle hire. Cruises,
   transfers, per-km hire, and packages are single events priced on their start
   date — they are one product with one season, not a run of nights.

   Vehicle extra-km bills against the km allowance pooled across the whole
   hire, not per season segment.

**Quote inputs live in the query string**, not component state, so a priced
result is refreshable, bookmarkable, and shareable with a colleague.

**Saving recomputes.** `saveQuote` re-prices from the inputs and the chosen
option key server-side; the total rendered in the browser is never trusted.
A stale or forged option key is refused rather than persisted.

Quotes are scoped to their agent — `getQuote` filters on `agentId`, so another
agency's reference 404s.

Reference format `ST-YYMM-NNNN` (e.g. `ST-2609-0042`), short enough to read
down a phone line. Allocation is read-then-write, so it retries on the unique
index rather than assuming no collision.

### Approval notification — manual, by design (confirmed 25 Aug 2026)
**No email provider, and none is to be built for v1.** Approving an agent does
not send anything. Instead the admin surfaces a copy-ready handover message
(portal URL + the agent's sign-in email) that Sonet pastes into WhatsApp or
reads out over a call.

This is a deliberate manual step, not a placeholder for automation. Do not add
a mail provider, queue, or background sender without Sonet asking for one.

Because there is no email channel, there is also no self-service password
reset. That gap is filled by an admin-issued temporary password: Sonet can
issue one from the agent's page, it is shown to him exactly once to hand over,
and the agent is forced to change it at next sign-in (`Agent.mustChangePassword`).

#### How the handover actually works
1. Agent registers at `/register`, choosing their own password. Status `pending`.
2. Sonet reviews at `/admin/agents/[id]`, checks the GST/licence, and approves —
   assigning the rate card in the same action (default rates, or clone another
   agent's overrides).
3. The approved agent's page renders a copy-ready message with the portal URL
   and their sign-in email. **This is server-rendered, not held in form state**:
   approving flips the page to its approved layout, so anything kept in the
   form component's state would be destroyed at the moment Sonet needs it.
4. Sonet pastes that into WhatsApp himself.
5. If the agent has lost their password, "Issue temporary password" generates
   one, shows it exactly once, and sets `mustChangePassword`.

Registration never reveals whether an email is already registered — it returns
the same message either way, so a stranger cannot enumerate which agencies work
with Series Tours.

### Hosting (confirmed 25 Aug 2026)
Same Hetzner box as seriestours.com and the ERP, in a separate container with a
separate database and no shared network path to the ERP. See the rule at the
top of this file. Nothing has been provisioned yet — ask before provisioning.

Resolved:
- Houseboat schema — confirmed, extended with dual pricing modes (25 Aug 2026).
- Itinerary seasonality — confirmed, `ItineraryRate` now carries date windows.
- Itinerary pricing basis — confirmed, both twin-sharing and flat-package.
- Quote persistence — confirmed, `Quote` / `QuoteLine` stay as designed.
- Rate-card fallback — confirmed, defaults apply when no override exists.

---

## Environment notes

- No Docker on Sonet's Mac, so `.devcontainer/` is written and ready but has
  never been built. Local dev runs directly on the host Node.
- No Homebrew. Node was installed by extracting the official nodejs.org
  darwin-arm64 tarball to `~/.local/node` (checksum verified).
- npm 11 gates package install scripts. `better-sqlite3`, `@prisma/engines`,
  and `esbuild` are approved in `package.json`; a new native dep may need
  `npm approve-scripts <pkg>`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
