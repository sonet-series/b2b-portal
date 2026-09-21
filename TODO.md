# TODO — Series Tours B2B Portal

Work Sonet has asked for that is **not built yet**. He adds to this by saying
"to do list"; everything here is meant to be completed, not merely noted.

Newest at the bottom. When something ships, move it to *Done* with the commit
that did it, rather than deleting it — a list that only ever shrinks loses the
record of what was asked and when.

---

## 1. Guest, travel and accommodation details on a booking
**Asked 21 Sept 2026.** *"Let the agent enter the guest detail and arrival and
departure details, also let them enter the details where each day guest are
staying."*

Three related things, all attached to a booking rather than a quote — a quote
is a price, and none of this changes one:

- **Guest details** — the lead passenger at least, and probably the full party.
  Worth settling whether hotels need each guest's name and ID, because that
  decides whether this is one name or a list.
- **Arrival and departure** — flight or train number, and the time. The driver
  needs it, and it is the single most common thing an operator chases an agent
  for.
- **Where the party stays each night.** Sits naturally on the existing
  itinerary day rows, which already carry from/to. It would also improve the
  customer's itinerary: "overnight at ..." per day.

Open questions before building:
- Is this captured when the booking is REQUESTED, or after it is confirmed?
  Asking for flight numbers before Sonet has agreed a rate may be premature.
- Does the accommodation field need to link to a hotel in the catalogue, or is
  free text right? Free text is faster and covers hotels we do not carry.
- Does any of it belong on the customer-facing PDF, or is it operational only?

---

## 2. Push a confirmed, deposit-paid booking into the ERP
**Asked 21 Sept 2026.** *"Once booking is confirmed and advance 25% is paid,
then that booking need to be entered into our erp automatically."*

> **⚠️ This reverses the first rule in CLAUDE.md**, which says this portal has
> no connection to the Frappe/ERPNext ERP — no shared database, no API calls,
> no sync in either direction. That rule also says the reversal is Sonet's to
> make explicitly, which he now has. It is recorded here rather than treated
> as routine, because the isolation is currently enforced by **Docker network
> topology**: the portal sits on `edge`, the ERP on `frappe_default`, and
> there is no route between them. Building this means changing that, and how
> it changes is a decision in itself.

**Do not start this without agreeing the mechanism.** The options are not
equivalent:

| Approach | What it costs |
|---|---|
| Put the portal on `frappe_default` | Simplest, and throws away the isolation entirely. CLAUDE.md explicitly forbids this "for consistency" — it would need to be forbidden for a *reason* instead. |
| A one-way outbound call to the ERP's REST API | Portal reaches the ERP but not the reverse. Needs a narrow network path and an ERP API key held by the portal. |
| The ERP pulls from a portal endpoint | Keeps the portal ignorant of the ERP entirely — arguably the most faithful to the existing rule. Needs work on the ERP side, which is a different codebase. |
| An export file Sonet imports | No coupling at all, but not "automatically", which is what was asked. |

Also to settle:
- **What a booking becomes in the ERP** — a Sales Order? A Customer plus a
  Sales Order? Which company, which item codes?
- **Idempotency.** If the push fails halfway or runs twice, the ERP must not
  end up with two orders for one booking. A `Booking.erpReference` column and
  a "pushed" state, most likely.
- **Failure must not break the portal.** Same rule as the booking email: the
  booking is already confirmed and paid, so a push that cannot reach the ERP
  has to be retryable and visible, never a lost order or an error page.
- **Trigger point.** "Confirmed AND 25% approved" — note that the deposit is
  only really paid once Sonet has APPROVED the payment, not when the agent
  files it.

---

## Done

_(nothing moved here yet)_
