import Link from "next/link";
import { notFound } from "next/navigation";
import { getBooking } from "@/lib/booking";
import { erpStatus } from "@/lib/erp";
import { formatMinor } from "@/lib/money";
import { formatBps } from "@/lib/settings-shared";
import { formatDateDisplay } from "@/lib/dates";
import {
  BOOKING_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type BookingStatus,
  type PaymentStatus,
} from "@/lib/enums";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { ConfirmForm, NoteForm, PaymentDecision, ErpPanel } from "./decide";
import {
  confirmBookingAction,
  declineBookingAction,
  cancelBookingAction,
  decidePaymentAction,
  retryErpPushAction,
} from "../actions";

export const dynamic = "force-dynamic";

const TONE: Record<BookingStatus, "amber" | "green" | "red" | "slate"> = {
  REQUESTED: "amber",
  CONFIRMED: "green",
  DECLINED: "red",
  CANCELLED: "slate",
};

const PAYMENT_TONE: Record<PaymentStatus, "amber" | "green" | "red"> = {
  SUBMITTED: "amber",
  APPROVED: "green",
  REJECTED: "red",
};

export default async function AdminBookingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  // Unscoped: /admin is gated by its own layout and every action re-checks.
  const booking = await getBooking(reference);
  if (!booking) notFound();

  const status = booking.status as BookingStatus;
  const { money } = booking;

  return (
    <>
      <PageHeader
        title={`Booking ${booking.reference}`}
        description={`${booking.agent.agencyName} · requested ${formatDateDisplay(booking.requestedAt)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href={`/admin/quotes/${booking.quote.reference}`}>
              Quote {booking.quote.reference}
            </LinkButton>
            <LinkButton href="/admin/bookings">All bookings</LinkButton>
          </div>
        }
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid flex-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Agency</dt>
              <dd className="text-slate-900">
                {booking.agent.agencyName}
                <span className="block text-xs text-slate-500">
                  {[booking.agent.phone, booking.agent.email].filter(Boolean).join(" · ")}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Travel</dt>
              <dd className="text-slate-900">
                {formatDateDisplay(booking.quote.travelStart)} →{" "}
                {formatDateDisplay(booking.quote.travelEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Quoted</dt>
              <dd className="text-slate-900">{formatMinor(booking.quote.totalMinor)} net</dd>
            </div>
          </dl>
          <Badge tone={TONE[status]}>{BOOKING_STATUS_LABEL[status]}</Badge>
        </div>

        {booking.agentNote && (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
            <span className="font-medium">From {booking.agent.agencyName}: </span>
            {booking.agentNote}
          </p>
        )}
        {booking.adminNote && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
            <span className="font-medium">Your note: </span>
            {booking.adminNote}
          </p>
        )}
      </Card>

      {status === "REQUESTED" && (
        <>
          <Card className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900">Confirm</h2>
            <p className="mt-1 text-sm text-slate-500">
              The agent sees the agreed total, not the quoted one. Changing it here does not
              touch the quote — that stays a record of what was priced.
            </p>
            <div className="mt-4">
              <ConfirmForm
                action={confirmBookingAction.bind(null, booking.reference)}
                quotedMinor={booking.agreedTotalMinor}
                gstBps={booking.gstBps}
                depositBps={booking.depositBps}
              />
            </div>
          </Card>

          <Card className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900">Decline</h2>
            <div className="mt-3">
              <NoteForm
                action={declineBookingAction.bind(null, booking.reference)}
                label="Reason"
                submitLabel="Decline booking"
                hint="Required. The agent will ask otherwise, and the answer belongs on the record."
              />
            </div>
          </Card>
        </>
      )}

      {status === "CONFIRMED" && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Money</h2>
          <dl className="mt-3 divide-y divide-slate-100 text-sm">
            <Row label="Agreed total" value={formatMinor(money.totals.netMinor)} />
            <Row
              label={`GST ${formatBps(money.totals.gstBps)}`}
              value={formatMinor(money.totals.gstMinor)}
            />
            <Row strong label="Grand total" value={formatMinor(money.totals.grossMinor)} />
            <Row
              label={`Deposit ${formatBps(booking.depositBps)}`}
              value={formatMinor(money.depositMinor)}
            />
            <Row label="Approved payments" value={formatMinor(money.paidMinor)} />
            <Row strong label="Balance" value={formatMinor(money.balanceMinor)} />
          </dl>

          {money.pendingMinor > 0 && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              {formatMinor(money.pendingMinor)} filed and waiting on you. It is not counted above
              until you approve it.
            </p>
          )}
          {money.overpaid && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
              Approved payments exceed the grand total. Somebody is owed a refund or a credit.
            </p>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <NoteForm
              action={cancelBookingAction.bind(null, booking.reference)}
              label="Cancel this booking"
              submitLabel="Cancel booking"
              hint="Required. Cancelling releases the quote so the agent can edit or re-request it."
            />
          </div>
        </Card>
      )}

      {(booking.leadGuestName ||
        booking.arrivalDate ||
        booking.departureDate ||
        booking.guests.length > 0 ||
        booking.stays.some((s) => s.property)) && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Trip details</h2>
          <p className="mt-1 text-sm text-slate-500">
            Entered by the agency. Read-only here — it is theirs to keep current.
          </p>

          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            {booking.leadGuestName && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Lead guest</dt>
                <dd className="text-slate-900">
                  {booking.leadGuestName}
                  <span className="block text-xs text-slate-500">
                    {[booking.leadGuestPhone, booking.leadGuestEmail].filter(Boolean).join(" · ")}
                  </span>
                </dd>
              </div>
            )}
            {booking.arrivalDate && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Arrives</dt>
                <dd className="text-slate-900">
                  {formatDateDisplay(booking.arrivalDate)}
                  {booking.arrivalTime && ` at ${booking.arrivalTime}`}
                  <span className="block text-xs text-slate-500">
                    {[booking.arrivalFlight, booking.arrivalFrom && `from ${booking.arrivalFrom}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </dd>
              </div>
            )}
            {booking.departureDate && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Departs</dt>
                <dd className="text-slate-900">
                  {formatDateDisplay(booking.departureDate)}
                  {booking.departureTime && ` at ${booking.departureTime}`}
                  <span className="block text-xs text-slate-500">
                    {[booking.departureFlight, booking.departureTo && `to ${booking.departureTo}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          {booking.guests.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Guests ({booking.guests.length} of {booking.quote.pax})
              </h3>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">
                {booking.guests.map((g) => (
                  <li key={g.id}>
                    {g.name}
                    {g.age != null && <span className="text-slate-500"> ({g.age})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {booking.stays.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Accommodation
              </h3>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {booking.stays.map((stay) => (
                  <li key={stay.id} className="flex flex-wrap gap-x-3 py-1.5">
                    <span className="w-16 shrink-0 text-slate-400">Night {stay.dayIndex + 1}</span>
                    <span className="w-24 shrink-0 text-slate-500">
                      {formatDateDisplay(stay.date)}
                    </span>
                    <span className="w-28 shrink-0 text-slate-600">{stay.place}</span>
                    <span className="flex-1 text-slate-900">
                      {stay.property || <span className="text-slate-400">not booked yet</span>}
                      {stay.confirmationRef && (
                        <span className="text-slate-500"> · {stay.confirmationRef}</span>
                      )}
                      {stay.notes && <span className="block text-xs text-slate-500">{stay.notes}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {status === "CONFIRMED" && (
        <ErpPanel
          action={retryErpPushAction.bind(null, booking.reference)}
          status={erpStatus()}
          reference={booking.erpReference}
          pushedAt={booking.erpPushedAt ? formatDateDisplay(booking.erpPushedAt) : null}
          error={booking.erpError}
          attempts={booking.erpAttempts}
          depositSettled={money.depositSettled}
        />
      )}

      {booking.payments.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Payments filed</h2>
          <p className="mt-1 text-sm text-slate-500">
            Each one is a claim until you approve it. Only approved payments count toward the
            balance.
          </p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {booking.payments.map((payment) => (
              <li key={payment.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {formatMinor(payment.amountMinor)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {payment.paidOn
                        ? `Paid ${formatDateDisplay(payment.paidOn)}`
                        : "No payment date given"}
                      {payment.reference && ` · ref ${payment.reference}`}
                      {" · filed "}
                      {formatDateDisplay(payment.submittedAt)}
                    </p>
                    {payment.note && <p className="mt-1 text-xs text-slate-600">{payment.note}</p>}
                    {payment.adminNote && (
                      <p className="mt-1 text-xs text-slate-700">
                        <span className="font-medium">Your note: </span>
                        {payment.adminNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/bookings/${booking.reference}/proof/${payment.id}`}
                      target="_blank"
                      className="text-xs text-blue-700 hover:underline"
                    >
                      View proof
                    </Link>
                    <Badge tone={PAYMENT_TONE[payment.status as PaymentStatus]}>
                      {PAYMENT_STATUS_LABEL[payment.status as PaymentStatus]}
                    </Badge>
                  </div>
                </div>

                {payment.status === "SUBMITTED" && (
                  <PaymentDecision
                    approve={decidePaymentAction.bind(
                      null,
                      booking.reference,
                      payment.id,
                      "APPROVED"
                    )}
                    reject={decidePaymentAction.bind(
                      null,
                      booking.reference,
                      payment.id,
                      "REJECTED"
                    )}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-2 ${strong ? "border-t-2 border-slate-300" : ""}`}>
      <dt className={strong ? "font-semibold text-slate-900" : "text-slate-600"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-slate-900" : "text-slate-900"}`}>
        {value}
      </dd>
    </div>
  );
}
