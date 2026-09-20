import Link from "next/link";
import { listBookingsForAdmin } from "@/lib/booking";
import { formatMinor } from "@/lib/money";
import { formatDateDisplay } from "@/lib/dates";
import { BOOKING_STATUS_LABEL, type BookingStatus } from "@/lib/enums";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONE: Record<BookingStatus, "amber" | "green" | "red" | "slate"> = {
  REQUESTED: "amber",
  CONFIRMED: "green",
  DECLINED: "red",
  CANCELLED: "slate",
};

export default async function AdminBookingsPage() {
  const bookings = await listBookingsForAdmin();
  const waiting = bookings.filter((b) => b.status === "REQUESTED").length;
  const payments = bookings.reduce(
    (n, b) => n + b.payments.filter((p) => p.status === "SUBMITTED").length,
    0
  );

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Requests from agents, and the payments they have filed against them."
      />

      {(waiting > 0 || payments > 0) && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          {waiting > 0 && (
            <>
              <strong>{waiting}</strong> booking{waiting === 1 ? "" : "s"} awaiting your approval
            </>
          )}
          {waiting > 0 && payments > 0 && " · "}
          {payments > 0 && (
            <>
              <strong>{payments}</strong> payment{payments === 1 ? "" : "s"} to verify
            </>
          )}
        </p>
      )}

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          hint="Requests appear here as soon as an agent asks to book a saved quote."
        />
      ) : (
        <Table head={["Booking", "Agency", "Travel", "Agreed", "Balance", "Status", ""]}>
          {bookings.map((b) => {
            const toVerify = b.payments.filter((p) => p.status === "SUBMITTED").length;
            return (
              <tr key={b.reference}>
                <Td>
                  <span className="font-mono font-medium text-slate-900">{b.reference}</span>
                  <span className="block font-mono text-xs text-slate-400">
                    {b.quote.reference}
                  </span>
                </Td>
                <Td>{b.agent.agencyName}</Td>
                <Td className="whitespace-nowrap text-xs">
                  {formatDateDisplay(b.quote.travelStart)} → {formatDateDisplay(b.quote.travelEnd)}
                </Td>
                <Td className="tabular-nums">{formatMinor(b.money.totals.grossMinor)}</Td>
                <Td className="tabular-nums">
                  {b.status === "CONFIRMED"
                    ? b.money.settled
                      ? "Paid"
                      : formatMinor(b.money.balanceMinor)
                    : "—"}
                </Td>
                <Td>
                  <Badge tone={TONE[b.status as BookingStatus]}>
                    {BOOKING_STATUS_LABEL[b.status as BookingStatus]}
                  </Badge>
                  {toVerify > 0 && (
                    <span className="ml-2">
                      <Badge tone="amber">{toVerify} to verify</Badge>
                    </span>
                  )}
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/admin/bookings/${b.reference}`}
                    className="text-sm text-blue-700 hover:underline"
                  >
                    Open
                  </Link>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
