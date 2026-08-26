import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { getQuote } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { formatDateDisplay } from "@/lib/dates";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import type { ProductType } from "@/lib/enums";
import type { VehicleLeg } from "@/lib/quote-types";

export const dynamic = "force-dynamic";

const PRODUCT_LABEL: Record<ProductType, string> = {
  hotel: "Hotel",
  houseboat: "Houseboat",
  vehicle: "Vehicle",
  itinerary: "Package",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const agent = await requireAgent();

  // Scoped to this agent — another agency's reference must not resolve.
  const quote = await getQuote(agent.id, reference);
  if (!quote) notFound();

  const usedOverride = quote.lines.some((l) => l.usedOverride);

  // The itinerary a vehicle quote's distance was built from. Frozen at save
  // time alongside the rest of the inputs.
  let legs: VehicleLeg[] = [];
  try {
    const snapshot = JSON.parse(quote.snapshotJson) as { legs?: VehicleLeg[] };
    legs = Array.isArray(snapshot.legs) ? snapshot.legs : [];
  } catch {
    // A quote saved before legs existed, or malformed JSON — show the priced
    // lines regardless rather than failing the whole page.
    legs = [];
  }
  const legTotal = legs.reduce((s, l) => s + l.km + l.bufferKm, 0);

  return (
    <>
      <PageHeader
        title={`Quote ${quote.reference}`}
        description={`${PRODUCT_LABEL[quote.productType as ProductType] ?? quote.productType} · quoted ${quote.createdAt.toISOString().slice(0, 10)}`}
        action={<LinkButton href="/agent/quotes">All quotes</LinkButton>}
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-sm text-slate-600">
            <p>
              <span className="text-slate-400">Travel: </span>
              {formatDateDisplay(quote.travelStart) === formatDateDisplay(quote.travelEnd)
                ? formatDateDisplay(quote.travelStart)
                : `${formatDateDisplay(quote.travelStart)} → ${formatDateDisplay(quote.travelEnd)}`}
            </p>
            <p>
              <span className="text-slate-400">Agency: </span>
              {agent.agencyName}
            </p>
          </div>
          {usedOverride && <Badge tone="green">Your agency rate applied</Badge>}
        </div>

        {legs.length > 0 && (
          <section className="mt-5 rounded-md bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Itinerary
            </h2>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-slate-200">
                {legs.map((leg, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 text-slate-700">
                      {leg.label || `Leg ${i + 1}`}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-slate-600">
                      {leg.km.toLocaleString("en-IN")} km
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-slate-500">
                      {leg.bufferKm > 0
                        ? `+ ${leg.bufferKm.toLocaleString("en-IN")} km sightseeing`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td className="pt-2 font-medium text-slate-900">Total distance</td>
                  <td className="pt-2 text-right font-semibold tabular-nums text-slate-900" colSpan={2}>
                    {legTotal.toLocaleString("en-IN")} km
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 text-left font-semibold">Item</th>
              <th className="pb-2 text-right font-semibold">Qty × unit</th>
              <th className="pb-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quote.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2 pr-3 text-slate-700">{line.description}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right text-slate-500">
                  {line.quantity} × {formatMinor(line.unitMinor)}
                </td>
                <td className="whitespace-nowrap py-2 text-right font-medium text-slate-900">
                  {formatMinor(line.totalMinor)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300">
              <td className="pt-3 font-semibold text-slate-900" colSpan={2}>
                Total
              </td>
              <td className="whitespace-nowrap pt-3 text-right text-lg font-semibold text-slate-900">
                {formatMinor(quote.totalMinor)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
          This is a quotation, not a booking. Prices were frozen when the quote was saved and are
          not affected by later rate changes. Nothing has been reserved and no payment is due.
        </p>
      </Card>
    </>
  );
}
