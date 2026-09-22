# TODO — Series Tours B2B Portal

Work Sonet has asked for that is **not built yet**. He adds to this by saying
"to do list"; everything here is meant to be completed, not merely noted.

Newest at the bottom. When something ships, move it to *Done* with the commit
that did it, rather than deleting it — a list that only ever shrinks loses the
record of what was asked and when.

---

## Done

### 1. Guest, travel and accommodation details on a booking
**Asked 21 Sept, built 22 Sept 2026.** Lead guest and contact, arrival and
departure (date, time, flight/train, where from/to), a guest list, and one
accommodation row per night seeded from the itinerary. Three separate forms,
because these details arrive over days from different people and one Save
button would mean holding all of it until the last piece turns up.

Answers to the questions this file raised:
- **When** — any time after the request, not only after confirmation. Flight
  numbers arrive late and the driver needs them regardless. Refused once a
  booking is declined or cancelled; there is no trip to detail.
- **How many guests** — a list. Hotels ask for names one at a time, and the
  screen shows "2 of 4 named" against the party size on the quote.
- **Accommodation** — free text. Agents book plenty of properties Series Tours
  does not carry, and a catalogue picker would be unusable exactly then.
- **On the PDF** — no. It is operational, for the driver and the hotels.

Times are `"HH:MM"` STRINGS, not DateTimes: a flight lands at 06:40 local, and
storing that as an instant means picking a timezone that will eventually send
a driver at the wrong hour. `25:99` is refused rather than stored half-read.

### 2. Push a confirmed, deposit-paid booking into the ERP
**Asked 21 Sept, built 22 Sept 2026.** `src/lib/erp.ts`.

**The mechanism, decided:** an outbound HTTPS call to the ERP's own public
REST API, exactly as any third party integrating with it would. That satisfies
"automatically" while keeping every clause of the original rule except the one
Sonet deliberately changed:

- Outbound only. The ERP never calls the portal and holds no credentials here.
- **No Docker network change.** The portal stays on `edge` with no route to
  `frappe_default`; it resolves the ERP by public hostname and is refused by
  the same authentication as anyone on the internet. Moving this container onto
  `frappe_default` is still forbidden.
- No shared database. It posts a document and reads back a name.

- **Trigger** — the moment a payment is APPROVED that covers the deposit.
  Approved, not filed: `bookingMoney` counts only approved rows, so that
  distinction holds for free.
- **Idempotent** — `Booking.erpReference` is set once and a booking that has
  one is never sent again. Verified: approving the balance payment afterwards
  sent nothing and left the attempt count at 1.
- **Cannot break the portal** — failures are recorded on the booking and shown
  on the admin screen with the ERP's verbatim error and a retry, never thrown
  at whoever just approved real money.
- **Posts NET of GST.** ERPNext applies its own tax template; posting gross
  would tax the tax.

Still needs from Sonet: `ERP_URL`, `ERP_API_KEY`, `ERP_API_SECRET`,
`ERP_COMPANY`, `ERP_ITEM_CODE` in `.env.production`, and confirmation that each
agency exists as a Customer in the ERP (or `ERP_DEFAULT_CUSTOMER` set instead).
Until those are set the feature says "not configured" on the booking screen and
does nothing.
