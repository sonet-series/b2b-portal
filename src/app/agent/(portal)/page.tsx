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
    description: "Build the route day by day. We measure the kilometres.",
    accent: "from-amber-50 to-white ring-amber-200/70",
    icon: "M3 13l1.5-4.5A2 2 0 0 1 6.4 7h7.2a2 2 0 0 1 1.9 1.5L17 13m-14 0h14m-14 0v3.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V16m12-3v3.5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5V16M6 15.5h.01M14 15.5h.01",
  },
  {
    href: "/agent/quote/hotel",
    label: "Hotels only",
    description: "Room rates on your agency's own contracted prices.",
    accent: "from-sky-50 to-white ring-sky-200/70",
    icon: "M3 17V6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v11M3 17h14M3 17v-2h14v2M8 9h4a2 2 0 0 1 2 2v4M11 9V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8",
  },
  {
    href: "/agent/quote/houseboat",
    label: "Houseboat only",
    description: "Day cruises and overnight stays in the backwaters.",
    accent: "from-emerald-50 to-white ring-emerald-200/70",
    icon: "M3 15h14l-1.5 3H4.5L3 15Zm2-1V9a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v5M7 8V6h6v2M2 18c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1",
  },
  {
    href: "/agent/quote/package",
    label: "Tour package",
    description: "A ready-made itinerary, per person or per group.",
    accent: "from-violet-50 to-white ring-violet-200/70",
    icon: "M4 7h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm4 0V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M3 11h14",
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
          <Link key={p.href} href={p.href} className="group block">
            <Card
              className={`h-full bg-gradient-to-br ${p.accent} ring-1 transition-shadow hover:shadow-md`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-white/80 p-2 text-slate-700 ring-1 ring-inset ring-white">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4}
                       strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d={p.icon} />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{p.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                  <p className="mt-3 text-sm font-medium text-blue-700 group-hover:underline">
                    Get a quote &rarr;
                  </p>
                </div>
              </div>
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
