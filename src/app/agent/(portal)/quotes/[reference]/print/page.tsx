import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { getQuote } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { formatDateDisplay } from "@/lib/dates";
import type { VehicleLeg, ItineraryDay } from "@/lib/quote-types";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * The quote an agent prints and hands to their own customer.
 *
 * It carries the AGENCY's branding and nothing of ours. That is the whole
 * point: the agent is reselling, and a Series Tours letterhead on the document
 * would show their customer exactly who their supplier is. There is no mention
 * of us anywhere on this page.
 *
 * Printing is the browser's own — @media print rules below hide the controls
 * and flatten the styling. No PDF library, so nothing to keep up to date, and
 * "Save as PDF" in the print dialogue produces the file either way.
 */
export default async function PrintQuotePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const agent = await requireAgent();

  // Scoped to this agent, like every other quote read — another agency's
  // reference must not resolve, least of all on a printable page.
  const quote = await getQuote(agent.id, reference);
  if (!quote) notFound();

  const row = await prisma.agent.findUnique({
    where: { id: agent.id },
    select: { logoStoredName: true, address: true, phone: true },
  });

  let legs: VehicleLeg[] = [];
  let days: ItineraryDay[] = [];
  try {
    const snapshot = JSON.parse(quote.snapshotJson) as {
      legs?: VehicleLeg[];
      input?: { days?: ItineraryDay[] };
    };
    legs = Array.isArray(snapshot.legs) ? snapshot.legs : [];
    days = Array.isArray(snapshot.input?.days) ? snapshot.input.days : [];
  } catch {
    legs = [];
    days = [];
  }
  const totalKm = legs.reduce((s, l) => s + l.km + l.bufferKm, 0);

  // Lines grouped back into the items the agent chose, so a combined trip
  // reads as the things they picked rather than one long list.
  const groups = new Map<number, { label: string; lines: typeof quote.lines }>();
  for (const line of quote.lines) {
    const idx = line.itemIndex ?? 0;
    const existing = groups.get(idx);
    if (existing) existing.lines.push(line);
    else groups.set(idx, { label: line.itemLabel ?? "", lines: [line] });
  }

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <style>{`
        @media print {
          /*
           * The portal's own header is hidden HERE, explicitly, rather than
           * with a print: utility class on the layout. Tailwind emitted no
           * rule for that class and the failure was silent — the class sat on
           * the element looking correct while the nav would still have
           * printed. On this page that is not a cosmetic bug: it would put
           * "Series Tours" on a document the agent hands to their own
           * customer, showing them exactly who the supplier is.
           *
           * This style block only exists on the print page, so the global
           * selector is scoped in practice.
           */
          header, nav { display: none !important; }
          .no-print { display: none !important; }
          body { background: #fff; }
          .print-sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
          /* Keep a line item and its amount on the same page. */
          tr { break-inside: avoid; }
        }
        @page { margin: 16mm; }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <PrintButton />
        <a href={`/agent/quotes/${quote.reference}`} className="text-sm text-blue-700 hover:underline">
          ← Back to quote
        </a>
        <span className="ml-auto text-xs text-slate-500">
          Your branding only — Series Tours does not appear on this page.
        </span>
      </div>

      <article className="print-sheet rounded-lg bg-white p-8 shadow-sm ring-1 ring-slate-200">
        {/* --- letterhead --------------------------------------------- */}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-5">
          <div>
            {row?.logoStoredName && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/agent/branding/logo"
                alt={agent.agencyName}
                className="mb-3 max-h-20 max-w-[16rem] object-contain"
              />
            )}
            <p className="text-lg font-semibold text-slate-900">{agent.agencyName}</p>
            {row?.address && (
              <p className="mt-1 max-w-xs whitespace-pre-line text-sm text-slate-600">{row.address}</p>
            )}
            <p className="mt-1 text-sm text-slate-600">
              {row?.phone}
              {row?.phone && agent.email && " · "}
              {agent.email}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Quotation</p>
            <p className="font-mono text-lg font-semibold text-slate-900">{quote.reference}</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatDateDisplay(quote.createdAt)}
            </p>
          </div>
        </header>

        {/* --- trip summary ------------------------------------------- */}
        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Travel dates</p>
            <p className="text-sm text-slate-900">
              {formatDateDisplay(quote.travelStart) === formatDateDisplay(quote.travelEnd)
                ? formatDateDisplay(quote.travelStart)
                : `${formatDateDisplay(quote.travelStart)} — ${formatDateDisplay(quote.travelEnd)}`}
            </p>
          </div>
          {quote.pax > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Travellers</p>
              <p className="text-sm text-slate-900">{quote.pax}</p>
            </div>
          )}
        </section>

        {/* --- the plan ----------------------------------------------- */}
        {days.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Itinerary</h2>
            <ol className="space-y-1 text-sm">
              {days.map((d, i) => {
                const local = d.from === d.to;
                const via = d.via.filter((v) => v.trim() !== "");
                return (
                  <li key={i} className="flex flex-wrap gap-x-2 text-slate-700">
                    <span className="w-14 shrink-0 text-slate-400">Day {i + 1}</span>
                    <span className="w-24 shrink-0 tabular-nums text-slate-500">
                      {formatDateDisplay(new Date(`${d.date}T00:00:00Z`))}
                    </span>
                    <span>
                      {local ? `At ${d.from}` : `${d.from} to ${d.to}`}
                      {via.length > 0 && (
                        <span className="text-slate-500">
                          {local ? ` — excursion to ${via.join(", ")}` : ` — via ${via.join(", ")}`}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
            {totalKm > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Approximately {totalKm.toLocaleString("en-IN")} km in total.
              </p>
            )}
          </section>
        )}

        {/* --- money -------------------------------------------------- */}
        <section className="mt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...groups.entries()].map(([idx, group]) => (
                <Fragmentish key={idx} label={group.label} multiple={groups.size > 1}>
                  {group.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-1.5 pr-4 text-slate-700">{line.description}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-900">
                        {formatMinor(line.totalMinor)}
                      </td>
                    </tr>
                  ))}
                </Fragmentish>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td className="pt-3 font-semibold text-slate-900">Total</td>
                <td className="pt-3 text-right text-base font-semibold tabular-nums text-slate-900">
                  {formatMinor(quote.totalMinor)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
          <p>
            This is a quotation and not a confirmed booking. Prices are held for the dates shown
            and are subject to availability at the time of booking.
          </p>
        </footer>
      </article>
    </div>
  );
}

/**
 * A group heading inside the table body.
 *
 * A combined trip shows which item each run of lines belongs to; a
 * single-product quote has one group and shows no heading at all, so it reads
 * exactly as it did before combined quoting existed.
 */
function Fragmentish({
  label,
  multiple,
  children,
}: {
  label: string;
  multiple: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {multiple && label && (
        <tr>
          <td colSpan={2} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </td>
        </tr>
      )}
      {children}
    </>
  );
}
