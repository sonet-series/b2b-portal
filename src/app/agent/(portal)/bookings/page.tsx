import Link from "next/link";
import { requireAgent } from "@/lib/auth";
import { listBookingsForAgent } from "@/lib/booking";
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

export default async function AgentBookingsPage() {
  const agent = await requireAgent();
  const bookings = await listBookingsForAgent(agent.id);

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Requests you have made against saved quotes, and what is still to pay."
      />

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          hint="Open a saved quote and request a booking to get started."
        />
      ) : (
        <Table head={["Booking", "Quote", "Travel", "Grand total", "Balance", "Status", ""]}>
          {bookings.map((b) => (
            <tr key={b.reference}>
              <Td>
                <span className="font-mono font-medium text-slate-900">{b.reference}</span>
              </Td>
              <Td className="font-mono text-xs text-slate-500">{b.quote.reference}</Td>
              <Td className="whitespace-nowrap text-xs">
                {formatDateDisplay(b.quote.travelStart)} → {formatDateDisplay(b.quote.travelEnd)}
              </Td>
              <Td className="tabular-nums">{formatMinor(b.money.totals.grossMinor)}</Td>
              <Td className="tabular-nums">
                {b.status === "CONFIRMED" ? (
                  b.money.settled ? (
                    <span className="text-emerald-700">Paid</span>
                  ) : (
                    formatMinor(b.money.balanceMinor)
                  )
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                <Badge tone={TONE[b.status as BookingStatus]}>
                  {BOOKING_STATUS_LABEL[b.status as BookingStatus]}
                </Badge>
              </Td>
              <Td className="text-right">
                <Link
                  href={`/agent/bookings/${b.reference}`}
                  className="text-sm text-blue-700 hover:underline"
                >
                  Open
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
