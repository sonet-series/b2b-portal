import Link from "next/link";
import { requireAgent } from "@/lib/auth";
import { listQuotes } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { Card, PageHeader, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The first question the portal asks.
 *
 * Agents arrive knowing what kind of enquiry they are holding — a cab request,
 * a room, a backwater night, a whole package — and each of those needs a
 * different set of questions next. Asking once, up front, means nobody is
 * shown a form full of fields that do not apply to them.
 */
const PRODUCTS = [
  {
    href: "/agent/quote/vehicle",
    label: "Cab only",
    description: "A vehicle for a trip. Build the route day by day and we work out the kilometres.",
  },
  {
    href: "/agent/quote/hotel",
    label: "Hotels only",
    description: "Room rates on your agency's own contracted prices.",
  },
  {
    href: "/agent/quote/houseboat",
    label: "Houseboat only",
    description: "Day cruises and overnight stays in the backwaters.",
  },
  {
    href: "/agent/quote/package",
    label: "Tour package",
    description: "A ready-made itinerary, priced per person or per group.",
  },
];

export default async function AgentHomePage() {
  const agent = await requireAgent();
  const recent = (await listQuotes(agent.id)).slice(0, 5);

  return (
    <>
      <PageHeader
        title={`Welcome, ${agent.contactName}`}
        description="Instant quotes on your agency's own rates. What are you quoting for?"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {PRODUCTS.map((p) => (
          <Link key={p.href} href={p.href} className="block">
            <Card className="h-full transition-colors hover:border-blue-300 hover:bg-blue-50/40">
              <p className="font-medium text-slate-900">{p.label}</p>
              <p className="mt-1 text-sm text-slate-500">{p.description}</p>
              <p className="mt-3 text-sm text-blue-700">Get a quote →</p>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-4 text-sm text-slate-500">
        Need more than one of these on the same trip?{" "}
        <Link href="/agent/trip" className="text-blue-700 hover:underline">
          Build a combined trip
        </Link>{" "}
        — quote each part, add it, and save the whole thing as one quote.
      </p>

      {recent.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Recent quotes</h2>
            <Link href="/agent/quotes" className="text-sm text-blue-700 hover:underline">
              View all
            </Link>
          </div>
          <Card>
            <ul className="divide-y divide-slate-100">
              {recent.map((q) => (
                <li key={q.reference} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Link
                    href={`/agent/quotes/${q.reference}`}
                    className="font-mono text-sm text-blue-700 hover:underline"
                  >
                    {q.reference}
                  </Link>
                  <Badge>{q.productType}</Badge>
                  <span className="text-sm text-slate-500">
                    {q.travelStart === q.travelEnd ? q.travelStart : `${q.travelStart} → ${q.travelEnd}`}
                  </span>
                  <span className="ml-auto font-medium text-slate-900">
                    {formatMinor(q.totalMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <p className="mt-8 text-xs text-slate-500">
        All prices are quotations only. Nothing on this portal reserves inventory or takes payment.
      </p>
    </>
  );
}
