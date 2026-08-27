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

### The catalogue stores COST, not sell prices (26 Aug 2026)
Every rate row holds ONE cost. Neither agent-facing price is persisted — both
are derived at read time from the cost and the current `MarkupRule`.

A stored sell price goes stale the moment a markup is edited, and a stale price
is indistinguishable from a correct one until somebody is quoted the wrong
number. This is the same principle as saving a quote re-pricing server-side
rather than trusting a number computed earlier.

Confirmed rules (seeded, editable at `/admin/settings`):

| Product | Kerala | Outside Kerala |
|---|---|---|
| Hotels | cost + ₹100 | cost + 5% |
| Vehicles | cost + 10% | cost + 15% |
| Houseboats | cost + 5% | cost + 12% |
| Packages | cost + 15% | cost + 27% |

**Ancillary charges inherit their PARENT PRODUCT's rule** — a hotel's extra bed
is marked up by the hotel rule, a vehicle's extra km by the vehicle rule.

`MarkupRule.value` is one required column whose meaning follows `kind`: paise
for `FLAT`, **basis points** for `PERCENT` (500 = 5%). Basis points, not a
float, for the same reason money is `Int` — the arithmetic must be exact.

Editing a rule affects FUTURE calculations only. Saved `Quote`/`QuoteLine` rows
store computed totals and never reference this table, so they cannot be
retroactively rewritten. Verified: changing hotel/Kerala to +₹250 moved a new
quote ₹8,300 → ₹8,450 while the saved quote stayed at ₹8,300.

### Price resolution — three steps, in order
1. **The agent's own rate-card override**, if one exists. An absolute price,
   unaffected by markup. Wins over everything.
2. **Otherwise the stored cost, marked up for that agent's tier.**
3. **There is no step 3.** Cost is `NOT NULL`, so a rate row that cannot price
   somebody cannot exist. If you find yourself writing a fallback below step 2,
   something upstream is wrong.

A missing override never blocks a quote and never hides a product (confirmed
with Sonet, 25 Aug 2026). `QuoteLine.usedOverride` records whether an override
supplied each price, so "why is this price what it is" stays answerable.

Implemented in `src/lib/rate-card.ts` (step 1) and the `tierDefault` helper in
`src/lib/quote.ts` (step 2).

### Agency tiers (26 Aug 2026)
Every agency is `KERALA` or `OUTSIDE_KERALA`, and that decides which of the two
catalogue defaults it is quoted.

**Two columns on `Agent`, not one.** `derivedTier` is a best-effort guess parsed
from the address at registration; `tierOverride` is Sonet's explicit choice and
**wins whenever set**. Keeping them apart is what lets the admin show "we
guessed Kerala from the PIN code, you set outside-Kerala" — collapsing them
would make a deliberate decision indistinguishable from a lucky guess.

**Always read the tier through `effectiveTier()` in `src/lib/tier.ts`.** Reading
either column directly is exactly how the override silently stops mattering.
`getAgent()` already resolves it and returns `tier`.

Derivation checks the PIN code first (Kerala is 67xxxx–69xxxx, the strongest
signal in an Indian address), then a list of districts and town names. A
non-Kerala PIN is treated as conclusive the other way. It is best-effort by
design — Sonet reviews every registration before it can quote anything.

**Both tier prices are required columns on all four rate tables**, following the
same reasoning as the pricing-mode columns: not two nullable columns, because a
rate row must not be able to exist that cannot price somebody.

**Ancillary charges are tiered too** (26 Aug 2026) — extra bed, extra pax,
driver allowance, extra km, single supplement each carry a Kerala and an
outside-Kerala column.

They are **nullable as a PAIR**, not NOT NULL like the main rates, and that
difference is deliberate. These charges are genuinely optional — a room type may
not offer an extra bed — and for three of the five the pricing-mode rules
actively FORBID a value (extra pax on `PER_PERSON`, extra km and driver
allowance on non-per-day, single supplement on `PER_PACKAGE`). NOT NULL would
contradict rules already in the schema.

What must never happen is one tier priced and the other blank — that is the
"cannot price somebody" failure the required main-rate columns prevent. So the
invariant is enforced as **both-or-neither in `src/lib/validation.ts`**, which
is the only write path.

**Confirmed with Sonet, 26 Aug 2026: code-level enforcement only. Do NOT add
SQLite CHECK constraints.** They were considered and rejected on purpose —
Prisma does not model them, so it would silently drop them on the next table
rebuild, leaving a guarantee everyone believes in and nothing enforces. The
single-write-path architecture is what makes validation sufficient; if a second
write path is ever added, this reasoning stops holding and must be revisited.

### Rate-card overrides are per CHARGE (26 Aug 2026)
`AgentRateCard.charge` says which charge on the referenced row an override
replaces — `MAIN`, `EXTRA_BED`, `EXTRA_PAX`, `EXTRA_KM`, `DRIVER_ALLOWANCE`,
`SINGLE_SUPPLEMENT`. Unique on `(agentId, productType, referenceId, charge)`.

One row per charge rather than one wide row, so an agency can get a special room
rate **without** also inheriting a special extra-bed rate. Every lookup goes
through `overrideKey()` in `src/lib/rate-card.ts` — never build the key by hand,
or the lookup silently misses and the tier default applies.

**Confirmed with Sonet, 26 Aug 2026:** the per-charge dimension is the intended
scope, not an over-reach to be simplified away later.

The resolution order above holds for ancillary charges exactly as for main
rates: override for that charge, else the tier default, else the charge is not
offered and the product says so rather than guessing.

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

### The admin seed is idempotent — do not make it an upsert again
`RUN_SEED_ON_START=1` means `prisma/seed.ts` runs on **every container start**,
so anything it writes unconditionally is rewritten on every redeploy.

It originally upserted `passwordHash` and `mustChangePassword` on both create
and update, reasoning that the env-file password must be one-time. The effect
was the opposite of intended: each redeploy silently reverted an
already-changed admin password back to `ADMIN_PASSWORD` and re-armed the forced
change. Credentials belong to the account once it exists, not to the env file.

Now:
- **first boot only** — create the account, set the one-time password, force a change
- **`ADMIN_PASSWORD_RESET=1`** — explicit opt-in recovery, since there is no
  email provider and so no self-service reset. A separate variable precisely so
  it cannot fire by accident on an ordinary deploy. Unset it afterwards.
- **every other boot** — confirm the account exists, touch nothing else

Changing `ADMIN_EMAIL` creates a *second* account rather than renaming the
first; the seed warns when it notices, since v1 is deliberately single-admin.

### Migrations that add a NOT NULL column (learned the hard way, 27 Aug 2026)
Prisma's SQLite table rebuild copies rows with `INSERT INTO new_X (...) SELECT
... FROM X`, and it does **not** list a newly-added NOT NULL column. That
succeeds against an empty table and fails against a populated one, leaving the
migration half-applied and the container crash-looping on P3009.

`20260826154152_cost_and_markup_rules` shipped exactly that bug because it was
generated and tested against a local database whose catalogue had been cleared
first. **Test any migration adding a NOT NULL column against a copy of the real
production file**, reproducing its row counts — never an empty one.

Two habits that came out of it, both now in that migration:
- Make a destructive or rebuilding migration **idempotent** (`DROP TABLE IF
  EXISTS new_*`, `CREATE TABLE IF NOT EXISTS`) so it can re-run from its own
  half-finished state. Migrations run unattended on container start; one that
  cannot recover from its own failure needs a human at the worst moment.
- Say in the migration itself why data is being deleted, when it is.

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
### Dates are dd/mm/yyyy everywhere (26 Aug 2026)
Native `<input type="date">` renders in the **browser's** locale, not the
app's — there is no attribute that changes it, so a US-defaulted machine shows
mm/dd/yyyy. Everyone here is in India and an ambiguous 03/04/2026 is a booking
error waiting to happen.

`src/components/date-field.tsx` replaces every one of them. The visible control
is a text input under our control (auto-inserts slashes, rejects dates that do
not exist like 31/02); a **hidden input carries the ISO value**, so actions,
zod schemas and query strings all keep receiving `YYYY-MM-DD` unchanged. Do not
reintroduce `type="date"`.

Two date formatters, and the distinction is load-bearing:
`formatDateOnly` returns ISO and feeds form values, query strings and
comparisons; `formatDateDisplay` returns dd/mm/yyyy and is for anything a
person reads. Swapping them silently breaks either display or parsing.

### Vehicle quotes are multi-leg (26 Aug 2026)
Agents book one vehicle for a whole trip but build the distance up leg by leg —
Cochin → Munnar, a day's sightseeing at Munnar, Munnar → Thekkady, and so on.
A single "estimated distance" box discarded that reasoning.

`VehicleQuoteInput.legs` is a list of `{ label, km, bufferKm }`, where
`bufferKm` is local sightseeing running on top of the transfer distance. Legs
travel as three PARALLEL repeated query params (`legLabel` / `legKm` /
`legBufferKm`) so a plain GET form produces them with no serialising, and
`parseVehicleLegs()` zips them back by index.

**The pricing maths is untouched.** `totalLegKm()` reduces the legs to the one
number the existing per-day / per-km logic already consumed.

The legs are recorded in `Quote.snapshotJson` and rendered as an itinerary
block on the saved quote, so a reference explains where its distance came from.
They are deliberately NOT `QuoteLine` rows: they are inputs to one priced line,
not charges, and zero-value lines would break "lines sum to the total".

### Combined trip quoting (26 Aug 2026)
An agent assembles a whole trip — one vehicle, several hotel stays, a houseboat
— and saves it as ONE quote with one total.

**The schema needed a change, contrary to a first read.** `Quote`/`QuoteLine`
supported multi-LINE but not multi-PRODUCT: lines carried no provenance, so
they could not be grouped back into the items the agent chose. `QuoteLine` now
has `productType`, `itemIndex` and `itemLabel`. A hotel stay split across two
seasons produces two lines with the SAME `itemIndex` — the split is pricing
detail within one chosen thing, not two choices.

`Quote.productType` is `"combined"` only when the quote genuinely holds more
than one product, so a one-item trip still reads as a hotel quote in the list.

**The cart lives in sessionStorage, holding INPUTS only — never prices.**
Adding items means moving between the four product screens, so the URL would
be unusable at six items. Every render of `/agent/trip` re-prices the whole
cart server-side, and `saveCombinedQuote` re-prices again before writing, so a
total from the browser is never trusted.

**Every item is priced by the SAME engine as a single-product quote.**
`src/lib/combined-quote.ts` only assembles; it never prices. If a combined and
a single quote for the same thing ever disagreed, that is a bug in the
assembler, not two pricing paths to reconcile.

One item failing does not fail the cart — it is flagged against that item so
the agent can fix or drop it. Saving with any unpriceable item is refused
outright rather than silently dropping it.

### Quoting (Phase 4)
Single-product quoting still exists and is unchanged: one hotel, one boat, one
vehicle, or one package. It is now one path into the same storage as a trip.

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

### AI rate-sheet import — hotels only (26 Aug 2026)
Sonet cannot hand-type hundreds of room rates, so `/admin/hotels/[id]/import`
reads a hotel's own rate sheet (PDF, scan, photo or CSV) with the Claude API
and PROPOSES rows.

**The review step is the feature, not a nicety.** Extraction results are staged
in `RateSheetImport` / `RateSheetRow` and nothing reaches `HotelRate` until a
human confirms. A bad extraction becomes a wrong price quoted to a real
customer. Staged rows are stored as the STRINGS the manual form would submit,
so confirming feeds each one through `writeHotelRate()` — the same zod schema
and the same create as manual entry. There is deliberately no second insert
path that could drift from the validated one.

**Confirm is all-or-nothing.** Every included row is validated before anything
is written, so a bad row at line 40 cannot leave 1–39 committed. Half an
imported rate sheet is a silent pricing gap nobody would notice.

Rate sheets quote NET/COST rates, so extraction produces cost; the markup rules
turn that into the two agent prices, shown beside each row during review.

**`ANTHROPIC_API_KEY` is required in production.** Without it the feature
refuses. Locally, a clearly-labelled fabricated stub runs instead, gated on
`NODE_ENV !== "production"` so it can never reach the live site — a stub
quietly inventing room rates would be worse than no feature.

Houseboats and packages can follow the same pattern once hotels are proven.

### Agent documents (26 Aug 2026)
Registration collects three files — PAN card, business proof, visiting card —
which replaced the free-text GST/licence field. Address, alternative phone and
alternative email were added at the same time.

**Files go on disk, not in SQLite.** Blobs would bloat every `.backup` copy,
and cheap copying is the whole point of a single-file database. They live under
`UPLOAD_DIR` (`/app/data/uploads` in production) — the **same bind mount as
prod.db**, so documents survive a rebuild exactly like the database. Anywhere
else and they vanish on the next deploy. `deploy/backup.sh` tars them alongside
the nightly database dump; backing up only the DB would restore agent rows
whose documents no longer exist.

**They are never served statically.** A PAN card is sensitive personal data.
Nothing is written under `public/`; the only read path is
`/admin/agents/[id]/documents/[kind]`, which re-checks the admin session on
every request (a route handler is its own entry point — the dashboard layout
does not run for it). Verified: unauthenticated, agent-token, and direct static
paths all fail.

**File type comes from the bytes, not the browser.** `src/lib/uploads.ts`
sniffs magic numbers; a text file sent as `image/png` is rejected. Stored names
are generated UUIDs — the browser-supplied filename is kept only as a label,
never used as a path.

**`next.config.ts` raises `serverActions.bodySizeLimit` to 16mb.** Next's
default is 1MB *for the whole request body*, which is below a single phone
photo — uploads fail with an opaque 413 before the app's own 5MB check can
produce a useful message. The per-file 5MB limit is still the real guard.

**`next.config.ts` MUST be copied into the runtime image.** `next start`
re-reads it from disk at boot; the value baked into
`.next/required-server-files.json` is not what the running server uses. Leaving
it out reverts every setting to framework defaults with no warning at all —
that is exactly how the 1MB limit came back in production while the config sat
correct on `main`. `docker-entrypoint.sh` now aborts if the file is absent.

**Test config-dependent behaviour against a production build, not `next dev`.**
Dev runs from the project directory where the config is always present, so it
cannot reproduce this class of bug.

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

### Hosting (confirmed 25–26 Aug 2026)
Same Hetzner box as seriestours.com and the ERP, in a separate container with a
separate database and no shared network path to the ERP. See the rule at the
top of this file.

**How the isolation is enforced.** seriestours-website joins `frappe_default`,
the ERP's Docker network — correct for that site, which calls the ERP API. This
portal joins a dedicated **`edge`** network instead, with Traefik attached to
both. Traefik routes to the portal; the portal has no route to the ERP or its
database.

Sonet confirmed on 26 Aug 2026 that this is a deliberate choice, not a
fallback: the isolation is meant to hold at the infrastructure level, enforced
by Docker topology rather than by a firewall rule someone has to remember.
**Do not move this container onto `frappe_default` for consistency.** The thing
that is kept consistent with the rest of the web family is the deployment
*style* — Compose, Traefik labels, `/opt/<repo>`, GitHub Actions — and that is
already met.

Deployment details live in `deploy/DEPLOY-PLAN.md`.

### Backups (confirmed 26 Aug 2026)
Nightly `sqlite3 .backup` + `PRAGMA integrity_check`, gzipped, 30 days, on the
same disk. Also runs before every CI deploy, since migrations apply on
container start.

**Known gap, deliberately accepted for launch:** no off-box copy. Covers a bad
migration or a mistaken delete, not the box failing. Sonet decided on 26 Aug
2026 to ship without it and revisit **after the 24 Sept 2026 deadline**. Do not
build it before then; do not let it be forgotten after.

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
