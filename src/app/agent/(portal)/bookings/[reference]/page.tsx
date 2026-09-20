import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAgent } from "@/lib/auth";
import { getBooking } from "@/lib/booking";
import { formatMinor } from "@/lib/money";
import { formatBps } from "@/lib/settings-shared";
import { formatDateDisplay } from "@/lib/dates";
import { BOOKING_STATUS_LABEL, PAYMENT_STATUS_LABEL, type BookingStatus, type PaymentStatus } from "@/lib/enums";
import { Badge, Card, LinkButton, PageHeader, FormSuccess } from "@/components/ui";
import { PaymentForm } from "./payment-form";
import { submitPaymentAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<BookingStatus, "amber" | "green" | "red" | "slate"> = {
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

export default async function AgentBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ requested?: string }>;
}) {
  const { reference } = await params;
  const { requested } = await searchParams;
  const agent = await requireAgent();

  // Scoped to this agent — another agency's booking must not resolve.
  const booking = await getBooking(reference, agent.id);
  if (!booking) notFound();

  const status = booking.status as BookingStatus;
  const { money } = booking;

  return (
    <>
      <PageHeader
        title={`Booking ${booking.reference}`}
        description={`Against quote ${booking.quote.reference} · requested ${formatDateDisplay(booking.requestedAt)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href={`/agent/quotes/${booking.quote.reference}`}>View quote</LinkButton>
            <LinkButton href="/agent/bookings">All bookings</LinkButton>
          </div>
        }
      />

      {requested === "1" && (
        <FormSuccess message="Booking requested. Series Tours will confirm the final rate — nothing is held until they do." />
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-sm text-slate-600">
            <p>
              <span className="text-slate-400">Travel: </span>
              {formatDateDisplay(booking.quote.travelStart)} → {formatDateDisplay(booking.quote.travelEnd)}
            </p>
            <p>
              <span className="text-slate-400">Agency: </span>
              {agent.agencyName}
            </p>
          </div>
          <Badge tone={STATUS_TONE[status]}>{BOOKING_STATUS_LABEL[status]}</Badge>
        </div>

        {status === "REQUESTED" && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            Series Tours has not confirmed this yet. The final rate may differ from the quote —
            nothing is held and nothing is payable until they approve it.
          </p>
        )}

        {booking.adminNote && (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
            <span className="font-medium">From Series Tours: </span>
            {booking.adminNote}
          </p>
        )}

        {/*
          The agreed rate, not the quoted one. Sonet may have changed it when
          he approved; showing the quote's figure here would have the agent
          paying against a number nobody agreed to.
        */}
        <dl className="mt-5 divide-y divide-slate-100 text-sm">
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-slate-600">Agreed total</dt>
            <dd className="tabular-nums text-slate-900">{formatMinor(money.totals.netMinor)}</dd>
          </div>
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-slate-600">GST {formatBps(money.totals.gstBps)}</dt>
            <dd className="tabular-nums text-slate-900">{formatMinor(money.totals.gstMinor)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t-2 border-slate-300 py-3">
            <dt className="text-base font-semibold text-slate-900">Grand total</dt>
            <dd className="text-xl font-semibold tabular-nums text-slate-900">
              {formatMinor(money.totals.grossMinor)}
            </dd>
          </div>
        </dl>

        {status === "CONFIRMED" && (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Figure
              label={`Deposit (${formatBps(booking.depositBps)})`}
              value={formatMinor(money.depositMinor)}
              hint={money.depositSettled ? "Received" : `${formatMinor(money.depositDueMinor)} still due`}
              tone={money.depositSettled ? "green" : "amber"}
            />
            <Figure label="Paid so far" value={formatMinor(money.paidMinor)} hint="Approved payments only" />
            <Figure
              label="Balance"
              value={formatMinor(money.balanceMinor)}
              hint={money.settled ? "Fully paid" : "Outstanding"}
              tone={money.settled ? "green" : undefined}
            />
          </div>
        )}

        {money.pendingMinor > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            {formatMinor(money.pendingMinor)} is awaiting approval by Series Tours. It does not
            count toward the balance until they confirm it.
          </p>
        )}
      </Card>

      {status === "CONFIRMED" && !money.settled && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Record a payment</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pay Series Tours as you normally do, then file it here with a screenshot or receipt.
            No payment is taken through this portal.
            {!money.depositSettled && (
              <>
                {" "}
                The deposit of{" "}
                <strong className="font-medium text-slate-700">
                  {formatMinor(money.depositDueMinor)}
                </strong>{" "}
                is due first.
              </>
            )}
          </p>
          <PaymentForm
            action={submitPaymentAction.bind(null, booking.reference)}
            suggestedMinor={money.depositSettled ? money.balanceMinor : money.depositDueMinor}
          />
        </Card>
      )}

      {booking.payments.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Payments</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {booking.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-900">{formatMinor(payment.amountMinor)}</p>
                  <p className="text-xs text-slate-500">
                    {payment.paidOn ? `Paid ${formatDateDisplay(payment.paidOn)}` : "No payment date given"}
                    {payment.reference && ` · ref ${payment.reference}`}
                    {" · filed "}
                    {formatDateDisplay(payment.submittedAt)}
                  </p>
                  {payment.note && <p className="mt-1 text-xs text-slate-500">{payment.note}</p>}
                  {payment.adminNote && (
                    <p className="mt-1 text-xs text-slate-700">
                      <span className="font-medium">Series Tours: </span>
                      {payment.adminNote}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/agent/bookings/${booking.reference}/proof/${payment.id}`}
                    target="_blank"
                    className="text-xs text-blue-700 hover:underline"
                  >
                    Proof
                  </Link>
                  <Badge tone={PAYMENT_TONE[payment.status as PaymentStatus]}>
                    {PAYMENT_STATUS_LABEL[payment.status as PaymentStatus]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-6 text-xs text-slate-500">
        No payment is taken through this portal. Amounts recorded here are your own record of
        transfers made to Series Tours, confirmed by them.
      </p>
    </>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "amber";
}) {
  const ring =
    tone === "green"
      ? "ring-emerald-200 bg-emerald-50"
      : tone === "amber"
        ? "ring-amber-200 bg-amber-50"
        : "ring-slate-200 bg-slate-50";
  return (
    <div className={`rounded-md px-3 py-2 ring-1 ring-inset ${ring}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
