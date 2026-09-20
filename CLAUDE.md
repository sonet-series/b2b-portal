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
- Payment, or any money movement. Still true, and unaffected by the booking
  work below.
- ~~Booking~~ — Sonet reversed this on 19 Sept 2026. Agents will be able to
  submit a booking request against a saved quote, which Sonet approves before
  it is confirmed. **No money moves through the portal**; it is a request and
  an approval, not a transaction. Not built yet — see Phase 7.
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
- [x] **Phase 5** — polish, deploy to b2b.seriestours.com
- [x] **Phase 6** — cost + markup rules, AI rate-sheet import, combined quoting
- [ ] **Phase 7** — garages, measured distances, day-by-day vehicle itineraries
      (built 19 Sept 2026); branded quote PDF and the customer itinerary
      (20 Sept 2026); **online booking with admin approval — not started**

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

### Garages, and garage-to-garage distance (19 Sept 2026)
A Kerala vehicle hire is billed **garage to garage**, not pickup to drop. A car
sent from Cochin to collect a party at Cochin airport has already driven that
stretch, and after releasing them in Madurai it still drives home empty. Both
runs are real diesel, and quoting only the distance the passengers were aboard
for loses them on every single hire.

So `Garage` is a catalogue entity, and `buildHops()` brackets every itinerary
with a run out to the first pickup and a run back from the last drop.

**`GarageVehicle` is a join, not a column.** Not every garage keeps every
vehicle. The agent picks the garage first and is then offered only what can be
dispatched from it. That narrowing is **also enforced in `quoteVehicle`** — the
dropdown is a convenience, the server check is what makes it true.

`Garage.address` is what Google routes from, so vagueness there is not
cosmetic: every quote from that garage inherits whatever place a loose address
resolves to. The admin form says so.

### Distances are measured, not typed (19 Sept 2026)
`src/lib/distance.ts` calls the Google **Routes API** (not legacy Distance
Matrix). Four things about it are load-bearing:

1. **Metres are stored as `Int`, km derived at the edge.** Same reasoning as
   money in paise: rounding each hop to km and summing afterwards drifts by
   several km across a ten-hop itinerary. `metersToKm` rounds UP, once, at the
   end — a hire is billed in whole km and the operator does not absorb the
   remainder.

2. **`RoadDistance` caches every hop.** Not an optimisation bolted on after:
   Cochin → Munnar is the same road for every agent who quotes it, and without
   the cache a busy day is a Routes API bill. It also keeps a quote refreshable
   when Google is briefly unreachable.

3. **`TRAFFIC_UNAWARE` is deliberate.** A quote is for a trip weeks away, so
   current traffic is noise — and noise that would make the same itinerary
   quote differently depending on when the button was pressed.

4. **The dev stub returns `source: "STUB"`, never `"MANUAL"`.** `MANUAL` means
   a human typed the number. Labelling a fabricated distance as hand-entered
   made the quote screen claim something untrue, which is why `HopSource` is
   wider than the persisted `DistanceSource`. The stub is gated on
   `NODE_ENV !== "production"` and is never cached.

**An ABSENT `distanceMeters` in Google's reply means ZERO, not missing** (found
in production, 19 Sept 2026). The Routes API serialises proto3, which omits any
field holding its default value, so a zero-metre route comes back as `{}` with
no distance field at all. That is completely ordinary here: a garage AT Cochin
airport quoting a pickup at Cochin airport is a genuine zero-kilometre leg.

Reading absent as missing rejected exactly those legs, and the message it
produced — "Google found no driving route between these two places, check the
spelling" — sent Sonet hunting a typo on a hop that had routed perfectly. The
real no-route case is an EMPTY `routes` array, and that is still refused.

**A leg that cannot be measured makes the whole trip unquotable.** Pricing what
we could measure and mentioning the rest produces a number that looks complete
and is short by however far the missing leg runs. The escape hatch is
`ItineraryDay.manualKm`, which skips routing for that day entirely and is
recorded so the quote can say the distance was not measured.

### Place names are picked, not typed (19 Sept 2026)
Typed place names are the weakest link in a measured itinerary, and the live
site proved it within one quote: a garage at "Cochin International Airport" and
a pickup typed as "Cochin Airport" are the same place to a person and two
strings to a router. Worse than an error is the case that does not error — a
misspelt resort resolving somewhere plausible but wrong, on a quote that reads
perfectly normally.

`src/lib/places.ts` calls Google **Places Autocomplete (New)**, and
`PlaceInput` turns the three place fields into comboboxes. Four things matter:

1. **It is proxied through our own route handler, never called from the
   browser.** The key is IP-restricted to the server, so a browser call would
   be rejected — and the key would be sitting in the page source. The handler
   re-checks the agent session, because a route handler is its own entry point
   and without that it is an open proxy onto a billed API.

2. **Suggestions are an accuracy aid, never a gate.** If Google is unreachable
   or the key lacks the Places API, the handler returns an empty list and the
   field behaves as the plain text input it has underneath. A quote must never
   depend on a lookup service being up.

3. **The field takes `structuredFormat.mainText`, not the full `text`.** The
   full value is the whole formatted address, which would make every itinerary
   row and every saved quote line unreadable. The secondary text is shown in
   the dropdown only, to tell two similar places apart while choosing.

4. **Debounced at 300ms with a 3-character minimum, and cached in-process.**
   Autocomplete bills per request; an undebounced field bills per keystroke.

**Production needs "Places API (New)" enabled on the key** and allowed under
its API restrictions — it is a separate API from Routes, and the key was
created with Routes only.

### Vehicle itineraries are day-by-day (19 Sept 2026)
This replaced the free-form leg list from 26 Aug. Agents plan in days — "day 2,
at Munnar, running up to Top Station" — so the form asks for exactly that.

- **The number of day rows is DERIVED from the hire dates**, never typed. An
  itinerary with a different number of days than the hire it prices should not
  be expressible.
- **Day N starts where day N-1 ended** (`chainDays`). Only the first pickup is
  a real choice. Letting both ends be typed allows an invisible gap, and that
  gap is unbilled distance the operator still pays for.
- **A day excursion is `from === to` with a via point.** One shape, not two:
  the route is Munnar → Top Station → Munnar, which measures correctly with no
  special case. The UI presents it as a "stay at the same place" tick and
  relabels the via field; the data underneath is unchanged.
- **Buffer km stay per day** and ride on that day's last hop, so a leg reads
  "Munnar → Thekkady, 95 km + 40 km sightseeing" rather than adding a
  zero-distance row.

**The pricing maths is untouched.** `measureItinerary` reduces the plan to the
same `VehicleLeg[]` the engine has always consumed, and `totalLegKm` still
hands the per-day / per-km logic one number.

**Measurement happens INSIDE `quoteVehicle`, not in the page.** That is what
makes the legs trustworthy: the priced screen and the save path both go through
it, so they cannot disagree, and a hand-edited query string cannot supply its
own kilometres. Verified — appending `&legKm=9000` to a URL carrying `days`
changes nothing. `VehicleQuoteInput.legs` is only read for quotes saved before
this existed.

`garageId`, `pax` and `days` are all OPTIONAL on `VehicleQuoteInput` for that
reason alone: older snapshots have no value for them and must keep rendering.

**Children are listed by age, not counted.** An age is what actually decides
anything downstream (a hotel's child policy, whether a seat is needed); a bare
count throws that away. For a vehicle it only affects capacity, where everyone
counts toward the total — erring toward suggesting a bigger vehicle rather than
one the party cannot fit in. Over capacity warns, it does not block: a small
child may genuinely not need a seat, and that is the agent's call.

**`Vehicle.capacity` is MAXIMUM PASSENGERS, not the seat count** (confirmed
with Sonet, 19 Sept 2026, who supplied the real figures). The two are often
different: a Fortuner has seven seats and carries four with luggage aboard, a
Hycross likewise. Four is the number a quote must be checked against, so four
is what the column holds.

This is why nothing in the UI says "seats" any more — "Toyota Fortuner, 4
seats" reads as a data-entry error to anyone who has seen one. Every label says
"up to N passengers", and the admin field is "Maximum passengers" with the
Fortuner example in its hint. If a future change reintroduces the word "seats"
against this column, it is wrong.

Sonet's figures: Dzire 3, Ertiga 5, Carens 5, Crysta 7, Hycross 4, Fortuner 4.
The Urbania and Tempo Traveller types take the number in their own name.

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

### "Depot" in the UI, `Garage` in the database (19 Sept 2026)
Sonet asked for the word "depot". Every user-facing string says Depot; the
Prisma models are still `Garage` / `GarageVehicle` and the columns still
`garageId`.

**That mismatch is deliberate.** Renaming a SQLite table means a Prisma table
REBUILD, and this project has already lost a production evening to exactly
that (see the P3009 note). The wording is what the user asked for; the table
name is invisible to them. If it is ever renamed, do it with `@@map` to the
existing table names so no data moves.

### "Included km" is what the price COVERS, not the allowance (20 Sept 2026)
Sonet caught this on a real quote: a 1,189 km trip priced against a 400 km
allowance printed "400 km included · extra km at ₹24.20 per km". The 789 km
over the allowance had ALREADY been charged and were in the total, so the
document was telling the customer they would be billed a second time for
kilometres they had just paid for.

`terms.includedKm` is now `max(allowance, tripKm)`:
- **Over the allowance** — the trip distance, because that is what the price
  bought.
- **Under it** — the allowance, because four days bought 1,000 km whether or
  not they were driven.

The option's headline uses the same figure, so it cannot contradict the terms
two lines below it.

**The allowance is an INPUT to the extra-km calculation, not a customer-facing
number.** It only ever meant "how far before we start charging per km".

### The quote may only CLAIM what it charged (20 Sept 2026)
The printed quote carried a fixed line — "toll, parking and interstate permits
are charged at actuals unless stated otherwise" — written before those charges
existed. Once they were in the price it told the customer to expect extra costs
they had already paid for. Found by reading a PDF Sonet downloaded, not by
looking at the code.

`QuoteOption.terms` now carries `includesTollParking` and `permitStates`, both
set from what `priceAncillaries` actually charged, and the document states only
those. `permitStates` is a LIST rather than a flag on purpose: a trip crossing
two states with a permit set for only one must name the one it covers — saying
"permits included" would be a promise the operator then pays for at a border.

**A sentence on a customer document must be derived from the pricing, never
kept in step with it by hand.**

### `dayIndex: -2` is the local-running allowance (20 Sept 2026)
It used to share `-1` with the depot bookends, because both were "not a day".
The printed quote summed everything at `-1` and reported 120 km of local
running as "vehicle positioning to and from base" — two different things the
customer pays for, added into one wrong sentence.

### The agent's document is an ITINERARY; the legs are the admin's (20 Sept 2026)
Sonet, reading a saved quote: *"we dont need to show our agent the legs and
there kms. lets that be only for admin view only for understaning and how much
toll and how much permit is been added."*

He is right, and for the same reason as the price breakdown. "Depot → Cochin
International Airport, 0 km" and "Local running at 2 stops (60 km each)" are
how a price was CALCULATED. Put them on a document an agent hands to their
customer and the customer starts negotiating a 60 km allowance that was never
a line item.

So the split is now:

- **The agent and the PDF** get a tour: title, overview, day by day with what
  happens and where they stop, what the price includes, and what it does not.
  Modelled on a mytourcab.com itinerary Sonet sent as the content he wants —
  the sections are his brief; the design is ours.
- **`/admin/quotes`** gets everything else: every measured leg with its
  kilometres, routed vs local-allowance vs buffer, and the full cost build-up
  line by line — which is where "how much toll, how much permit" is answered.
  Read-only: a quote is frozen at save time, and editing one here would
  silently rewrite a document an agent may already have sent.

**`src/lib/quote-pdf.tsx` no longer RECEIVES the legs at all.** Not rendered-
but-passed — removed from `QuotePdfInput`. Leaving them in the input and
choosing not to draw them is a decision the next person has to re-make; taking
them out means the customer's document cannot leak them however it is edited.

**`buildItineraryDocument` in `src/lib/itinerary-document.ts` is the one
builder**, with no server-only import, so the portal page and the PDF render
the same document. Two renderers deriving the same prose separately is how a
quote comes to claim two different things — which has already happened once
here, with toll and parking.

Every sentence it produces is DERIVED: from the day plan the agent typed, and
from what the pricing actually charged. "Driver's allowance included" appears
only when a bata line was really pushed, which is why `terms` gained
`includesDriverAllowance` rather than the document asserting it.

Where the agent left a day's notes blank the description is built from the
route ("Drive from Munnar to Thekkady, visiting Vandiperiyar en route"), so a
quote is never handed over with empty days. **Activities are the via points**,
which the agent already enters — no new field to type twice.

### A quote says WHICH VEHICLE it is for (20 Sept 2026)
It did not, anywhere: not on the saved quote, not on the PDF, not on the option
card. `QuoteOption.title` is "Per day hire" — how it is PRICED, which is no
answer at all to the question. Sonet asked it of a real quote.

`QuoteOption.subject` is `{ name, detail }` — "Toyota Crysta", "Up to 7
passengers" — and is **frozen onto the option** rather than looked up when a
quote is read, so retiring or renaming a vehicle cannot change what an
already-sent quote says it was for. `resolveSubject()` falls back to a lookup
by id for quotes saved before this existed, for DISPLAY only; the frozen value
always wins.

"Passengers", never "seats" — see `Vehicle.capacity` above.

### One reader for a frozen snapshot (20 Sept 2026)
`readSnapshot()` in `src/lib/quote-store.ts`. Three screens now read a saved
quote — the agent's page, the PDF route and the admin view — and three
hand-rolled `JSON.parse` blocks are three chances to disagree about what a
quote said. A malformed or older snapshot yields empty fields rather than
throwing: the priced lines are real rows, so a quote must still render.

### PDF page breaks are not free (20 Sept 2026)
Two layout faults, both found by rendering a real document rather than reading
the code:

- **`page.paddingBottom` must exceed the FIXED footer's height.** It was 48
  against a footer occupying about 60pt from the bottom. Nothing showed until
  the itinerary grew: "Grand total" then printed straight through the footer
  text and its amount went to page two alone. Now 74, which clears it on every
  page. If the footer ever gains a line, this has to grow with it.
- **A list and a total must be kept whole.** The included/excluded columns
  split across a page break and page one ended on a bullet with no text beside
  it. Both blocks are `wrap={false}`.

### Agents see a price, not a breakdown (19 Sept 2026)
Confirmed with Sonet, 19 Sept 2026. The portal and the PDF show **Total, GST,
Grand total** — no hire/bata/extra-km itemisation. An agent quotes one number
to their customer, and a line-by-line build-up only invites being negotiated
line by line.

**The lines are still stored.** They are what the quote was priced from and
what makes "why is this number what it is" answerable; they are simply not
rendered to the agent.

What a customer genuinely needs instead is the TERMS, so `QuoteOption.terms`
carries `includedKm` and `extraKmRateMinor` as numbers rather than as a
sentence buried in a line description, and both the quote and the PDF state
them. They are frozen into the snapshot with the option, so a saved quote
states the allowance it was priced on.

GST is `Setting.gstBps` (default 5%), applied at DISPLAY time and never folded
into a line: a tax is not a price. `withGst` lives in `settings-shared.ts`,
which has no server-only import, and the RATE is always passed in — a client
component must not be able to render a defaulted tax rate.

### Toll, parking and interstate permits — per VEHICLE (19 Sept 2026)
Quoted rather than excluded: "plus tolls at actuals" means the agent cannot
give their customer a final number, which is the point of the portal.

Both vary by vehicle type, because a 17-seat coach pays materially more at a
toll booth and to enter a state than a Dzire does. Quoting one figure for both
is wrong in one direction or the other every time.

- **`VehicleTollRate`** — cost per day, per vehicle, with
  `Setting.tollParkingPerDayMinor` as the fallback. Per day rather than per
  route: tolls vary hop by hop, no operator prices them individually, and one
  figure to keep current beats a matrix nobody maintains.
- **`StatePermit`** — cost per entry, unique on `(state, vehicleId)`.

**The asymmetry between them is deliberate.** Toll applies to EVERY hire, so a
vehicle with no rate falls back rather than blocking a quote. A permit only
applies when a trip actually crosses a border, so a missing one is **flagged
on the quote** — an uncharged permit is money handed over at a border with no
way to recover it, and silently charging zero would hide that.

Both are marked up by the VEHICLE rule, like driver allowance and extra km.
They are appended to every option **after** the options are built, not inside
each `options.push`, so a pricing mode added later cannot quietly omit them.

**Which states a trip enters is measured from the ROAD, not the stops**
(20 Sept 2026). Sonet rejected a "tick the states you enter" control for the
right reason: many agents are nowhere near South India and have no idea the
road to Bangalore crosses Tamil Nadu. It has to be automatic.

`src/lib/geocode.ts` takes the route's own polyline from the Routes API,
samples it every 20 km, and reverse-geocodes each sample to a state. Kochi to
Bangalore names no Tamil Nadu stop and crosses Tamil Nadu for most of its
length; this finds it, and charges the permit.

- **Cached on `RoadDistance.statesCsv`**, alongside the distance, because the
  road between two places does not change. A 545 km route costs about 21
  geocoding lookups ONCE, then none ever again.
- **NULL means UNKNOWN, never "crosses nothing".** Old cached rows, the dev
  stub, hand-entered days and geocoding failures all leave it null, and the
  quote then says the check was incomplete. A confident zero is the one
  outcome worth ruling out — silently charging no permit is money handed over
  at a border.
- **The named-place list is kept as a backstop**, unioned with the route. The
  route is authoritative; the names cover what it cannot reach.
- **Production needs the Geocoding API enabled** on the key, alongside Routes
  and Places. Without it, distances still work and the quote reports that
  transit states could not be checked.

A place NOT on the destination list is still reported as unknown — never
assumed local.

**Home is a property of the DEPOT, not a constant** (Sonet, 19 Sept 2026, and
he was right to push on it). `Garage.state` decides which states need a permit
for hires dispatched from it. A Chennai depot makes Tamil Nadu home and Kerala
the state needing a permit — the exact inverse of Kochi. A hardcoded Kerala
would have charged the wrong permits, or none, the day a second depot opened
outside the state, and nothing would have flagged it. Only Kochi exists today;
Chennai and Coimbatore are planned.

`allStates()` derives the pickers from the destination list, so adding a
destination in a new state makes that state available as a depot state and as
a permit state with no further change.

**The migration that added the vehicle dimension is hand-written.** Prisma's
generated version was the P3009 bug for the third time: a NOT NULL `vehicleId`
whose `INSERT ... SELECT` did not list it. The hand-written one fans each
state's existing fee out across every active vehicle — the honest reading,
since the fee used to apply to all of them — and was tested against a
populated copy and against its own half-finished state.

### Local running is per STOP, not a percentage (19 Sept 2026)
A percentage road margin was tried first and replaced the same day. Sonet's
correction was right and worth recording: **a percentage scales with distance
driven, which is backwards.** Local running happens where the party STOPS, not
on the long transfers — a 400 km transfer day needs no slack, a night at
Munnar needs a day around the tea estates.

`Setting.perStopKm` (default 60) is added for each **distinct place they
overnight at**. Per place, not per night: two nights at Munnar is still one
place to drive around. The final day's drop point does not count — nobody
drives around somewhere they are leaving from. `overnightStops()` in
`src/lib/itinerary.ts`, tested against Sonet's real 8-day trip, which yields
four stops: Munnar, Thekkady, Alleppey, Kovalam.

It rides as its own LEG, so every routed leg still matches exactly what anyone
gets from Google — and because pricing consumes legs, an allowance that was
not a leg would be measured and then quietly not charged.

**Still distinct from the per-day sightseeing buffer**, which is a specific
detour the agent knows about and enters themselves. This allowance is a
standing assumption; the buffer is a fact about one itinerary.

### Editing a saved quote (19 Sept 2026)
No new storage: the builder already reads its inputs from the query string and
`snapshotJson` already holds exactly those inputs, so `editUrlFor()` rebuilds
the URL and "edit" is the same screen reopened.

Saving with `?edit=REF` **replaces that quote and keeps the reference**, rather
than leaving a near-duplicate. An agent who has already given ST-2609-0003 to a
customer and then fixes a date needs it to stay ST-2609-0003. That does not
contradict snapshotting: freezing protects a quote from rates drifting
underneath it, which is a different thing from its own author changing it.

`editUrlFor` returns null for shapes the builder cannot reopen — a combined
trip, or a snapshot predating an input — so the button is hidden rather than
landing on a half-empty form.

### `VehicleQuoteInput` carries adults/childAges FLAT (19 Sept 2026)
It briefly had `pax?: PaxInput`, a nested object **nothing ever populated** —
the form submits `adults` and `childAges`, and the zod schema emits them flat.
It typechecked, and was silently always undefined, so every vehicle quote was
saved with a passenger count of zero. Found only when an edit URL came out
missing its passengers. If a field is optional and always absent, suspect the
shape rather than the data.

### Agent-side UX (19 Sept 2026)
Prompted by Sonet pointing at mytourcab.com. That is a B2C site and most of it
does not transfer — our agents are repeat professionals who want speed and
precision, not photography and "Book Now". Three things did:

- **`src/lib/destinations.ts` — one-tap destination chips.** The real win is
  ACCURACY, not speed: a tapped chip is spelled the same way every time, so the
  same trip measures the same distance whoever quotes it. Typed names are
  exactly where "Cochin Airport" vs "Cochin International Airport" came from.
  It also saves a billed Autocomplete request per tap. Free typing still works
  for anywhere not listed — a shortcut, never a restriction.
- **Steppers for passenger counts** instead of text boxes. A stepper cannot
  hold "two" or "2 ", and ±1 is what agents actually do.
- **A live summary bar** on the quote builder. Nine days of form is a long way
  to scroll back to check the party size or where the trip ends.

### The customer document is a real PDF, not browser print (19 Sept 2026)
Browser printing could never produce a document an agent hands over unedited.
Browsers stamp the page TITLE and the page URL into the header and footer, no
CSS reaches either, and the only control is a tick box in the print dialogue.
Sonet's objection settled it: he can untick it, his agents will not know to,
and he cannot brief every agency. **The HTML print page was deleted** rather
than left beside the PDF, because leaving it invites agents down the path that
does not work.

`/agent/quotes/[reference]/pdf` renders server-side with
`@react-pdf/renderer`. Not a headless browser: the box has 4GB, no swap, and
runs the ERP too. `?view=1` serves it inline for a preview instead of
downloading.

**The fonts must be COPIED INTO THE RUNTIME IMAGE.** They are read from disk
when a PDF is requested, not bundled into `.next`, and the runner stage copies
only `public`, `.next`, `node_modules`, `next.config.ts` and `prisma`. Without
`src/assets` the download returns a 500 and the agent sees a blank tab — which
is exactly what shipped. This is the same trap as `next.config.ts`: a file the
running server needs that the build does not carry over. `docker-entrypoint.sh`
now refuses to start without them. Note react-pdf caches a failed font load for
the process lifetime, so the fix only takes effect after a restart.

**The bundled Noto Sans in `src/assets/fonts` is not decoration.** The built-in
PDF fonts are WinAnsi and have no rupee sign — and they do not fail on one.
"₹" came out as "¹" and "→" as a quote mark, silently, so the document would
have looked subtly wrong rather than obviously broken. Verified by decoding the
generated PDF's own ToUnicode table, not by eye.

**Noto Sans has ₹ but NOT → (U+2192)** — checked against the font's cmap table
directly. The PDF says "Madurai Airport to Rameswaram"; an arrow would be a
blank box. Before adding any symbol to the PDF, check the font actually has it.

**Closed, 20 Sept 2026:** ligature glyphs ("fi" in "confirmed") extract wrongly
from the PDF's ToUnicode table, so a text extractor garbles those few words.
Sonet confirmed they DISPLAY correctly, so this is a limitation of whatever is
reading the file, not of the document. Do not spend time on it, and do not
trust a raw text dump of a generated PDF to tell you what it looks like —
render it to an image instead (`qlmanage -t -s 1400 -o <dir> <file.pdf>` on a
Mac renders page one).

### Branded quote printing (19 Sept 2026)
The agent prints a saved quote and hands it to THEIR customer, so the page
carries the agency's branding and **nothing of ours**. Series Tours appears
nowhere on it — the agent is reselling, and our name on that document shows
their customer exactly who the supplier is.

**The logo is NOT an `AgentDocument`.** Those are identity papers: sensitive,
admin-only, never served to the agent. A logo is the opposite — it exists to be
displayed, and the agent reads their own. One table would have meant one access
rule for two opposite kinds of file, so the logo lives in two nullable columns
on `Agent` and is served by `/agent/branding/logo`, which takes the agent id
**from the session, never from the URL**, so there is no id to tamper with.

Nullable as a pair: an agency with no logo prints an unbranded quote rather
than being unable to print at all.

**The page TITLE is the agency's, not ours** (19 Sept 2026). Browsers print
the document title in the page header and the URL in the footer, so a title of
"Series Tours B2B" put our name on every printed page however clean the HTML
was — found by reading a PDF Sonet actually printed, not by looking at the
markup. `generateMetadata` sets it to "<Agency> — Quotation <ref>".

The URL in the print footer is browser chrome that CSS cannot reach at all.
The only control is the print dialogue's "Headers and footers" tick box, so the
page says so in a banner rather than pretending the problem does not exist.

**Per-day distances come from `VehicleLeg.dayIndex`, never from parsing
`label`.** The label is display text and has already been reworded once; a
printed customer document must not break because somebody rewrites a string.
Absent on quotes saved before 19 Sept 2026, which simply show no per-day
column.

**Printing is the browser's own**, via `@media print` rules and
`window.print()`. No PDF library to keep current, and "Save as PDF" in the
print dialogue produces the file anyway.

**Do not hide the portal chrome with a `print:` utility class.** It was tried
and Tailwind emitted no rule for it — the class sat on the header looking
correct while the nav would still have printed. The rule is written by hand in
the print page's own `<style>` block, where it was verified present in
`document.styleSheets`. On this page that is not cosmetic: a silent failure
puts our name on their customer's document.

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
