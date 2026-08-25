import { getAgent } from "@/lib/auth";
import { listQuotes } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import type { ProductType } from "@/lib/enums";

export const dynamic = "force-dynamic";

const PRODUCT_LABEL: Record<ProductType, string> = {
  hotel: "Hotel",
  houseboat: "Houseboat",
  vehicle: "Vehicle",
  itinerary: "Package",
};

export default async function QuotesPage() {
  const agent = (await getAgent())!;
  const quotes = await listQuotes(agent.id);

  return (
    <>
      <PageHeader
        title="Saved quotes"
        description="Quotes you have saved. These are prices, not bookings — nothing is held or confirmed."
      />

      {quotes.length === 0 ? (
        <EmptyState
          title="No saved quotes yet"
          hint="Price something on one of the quote screens and save it to keep a reference."
        />
      ) : (
        <Table head={["Reference", "Product", "Travel dates", "Total", "Quoted", ""]}>
          {quotes.map((q) => (
            <tr key={q.reference}>
              <Td>
                <span className="font-mono font-medium text-slate-900">{q.reference}</span>
              </Td>
              <Td>
                <Badge tone="blue">{PRODUCT_LABEL[q.productType as ProductType] ?? q.productType}</Badge>
              </Td>
              <Td className="whitespace-nowrap">
                {q.travelStart === q.travelEnd
                  ? q.travelStart
                  : `${q.travelStart} → ${q.travelEnd}`}
              </Td>
              <Td className="font-medium text-slate-900">{formatMinor(q.totalMinor)}</Td>
              <Td className="text-xs text-slate-500">
                {q.createdAt.toISOString().slice(0, 10)}
              </Td>
              <Td className="text-right">
                <a href={`/agent/quotes/${q.reference}`} className="text-sm text-blue-700 hover:underline">
                  Open
                </a>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
