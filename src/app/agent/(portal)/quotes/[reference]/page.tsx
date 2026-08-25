import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { getQuote } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import type { ProductType } from "@/lib/enums";

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
              {formatDateOnly(quote.travelStart) === formatDateOnly(quote.travelEnd)
                ? formatDateOnly(quote.travelStart)
                : `${formatDateOnly(quote.travelStart)} → ${formatDateOnly(quote.travelEnd)}`}
            </p>
            <p>
              <span className="text-slate-400">Agency: </span>
              {agent.agencyName}
            </p>
          </div>
          {usedOverride && <Badge tone="green">Your agency rate applied</Badge>}
        </div>

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
