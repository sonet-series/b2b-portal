import Link from "next/link";
import { listAllQuotes } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/components/ui";

export const dynamic = "force-dynamic";

/** "combined" is not a ProductType — a mixed trip is not one of the four. */
const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hotel",
  houseboat: "Houseboat",
  vehicle: "Vehicle",
  itinerary: "Package",
  combined: "Combined trip",
};

export default async function AdminQuotesPage() {
  const quotes = await listAllQuotes();

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Every quote the portal has priced, across all agencies. Agents see one number; this is where the build-up behind it lives."
      />

      {quotes.length === 0 ? (
        <EmptyState
          title="Nothing quoted yet"
          hint="Quotes appear here as soon as an approved agent saves one."
        />
      ) : (
        <Table head={["Reference", "Agency", "Product", "Travel dates", "Total", "Quoted", ""]}>
          {quotes.map((q) => (
            <tr key={q.reference}>
              <Td>
                <span className="font-mono font-medium text-slate-900">{q.reference}</span>
              </Td>
              <Td>{q.agencyName}</Td>
              <Td>
                <Badge tone="blue">{PRODUCT_LABEL[q.productType] ?? q.productType}</Badge>
              </Td>
              <Td className="whitespace-nowrap">
                {q.travelStart === q.travelEnd
                  ? q.travelStart
                  : `${q.travelStart} → ${q.travelEnd}`}
              </Td>
              <Td className="font-medium text-slate-900">{formatMinor(q.totalMinor)}</Td>
              <Td className="text-xs text-slate-500">{q.createdAt.toISOString().slice(0, 10)}</Td>
              <Td className="text-right">
                <Link
                  href={`/admin/quotes/${q.reference}`}
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
