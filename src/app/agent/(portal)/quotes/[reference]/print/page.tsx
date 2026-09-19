import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
 * It carries the AGENCY's branding and nothing of ours — the agent is
 * reselling, and our name on the document shows their customer exactly who
 * the supplier is.
 *
 * That includes the page TITLE. Browsers print the document title in the page
 * header and the URL in the footer, so a title of "Series Tours B2B" put us on
 * every printed page no matter how clean the HTML was. The title below is the
 * agency's own. The URL in the footer is browser chrome that CSS cannot reach
 * — the print dialogue's "Headers and footers" tick box is the only control,
 * which is why the page says so out loud.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ reference: string }>;
}): Promise<Metadata> {
  const { reference } = await params;
  const agent = await requireAgent();
  return { title: `${agent.agencyName} — Quotation ${reference}` };
}

export default async function PrintQuotePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const agent = await requireAgent();

  // Scoped to this agent, like every quote read — another agency's reference
  // must not resolve, least of all on a printable page.
  const quote = await getQuote(agent.id, reference);
  if (!quote) notFound();

  const row = await prisma.agent.findUnique({
    where: { id: agent.id },
    select: { logoStoredName: true, address: true, phone: true },
  });

  let legs: VehicleLeg[] = [];
  let days: ItineraryDay[] = [];
  let adults = 0;
  let childAges: number[] = [];
  try {
    const snapshot = JSON.parse(quote.snapshotJson) as {
      legs?: VehicleLeg[];
      input?: { days?: ItineraryDay[]; adults?: number; childAges?: number[] };
    };
    legs = Array.isArray(snapshot.legs) ? snapshot.legs : [];
    days = Array.isArray(snapshot.input?.days) ? snapshot.input.days : [];
    adults = typeof snapshot.input?.adults === "number" ? snapshot.input.adults : 0;
    childAges = Array.isArray(snapshot.input?.childAges) ? snapshot.input.childAges : [];
  } catch {
    legs = [];
    days = [];
  }

  // "4 adults, 1 child (8)" rather than a bare 5. The ages are what a hotel or
  // a seat allocation actually turns on, and the customer reading this is the
  // person who can spot them being wrong.
  const partyParts: string[] = [];
  if (adults > 0) partyParts.push(`${adults} adult${adults === 1 ? "" : "s"}`);
  if (childAges.length > 0) {
    partyParts.push(
      `${childAges.length} child${childAges.length === 1 ? "" : "ren"} (${childAges.join(", ")})`
    );
  }
  const party = partyParts.join(", ");

  // Grouped by the dayIndex each leg CARRIES, never by parsing its label.
  const legsForDay = (i: number) => legs.filter((l) => l.dayIndex === i);
  const kmForDay = (i: number) =>
    legsForDay(i).reduce((s, l) => s + l.km + l.bufferKm, 0);
  const garageLegs = legs.filter((l) => l.dayIndex === -1);
  const garageKm = garageLegs.reduce((s, l) => s + l.km + l.bufferKm, 0);
  const totalKm = legs.reduce((s, l) => s + l.km + l.bufferKm, 0);
  // Older quotes have no dayIndex, so per-day totals cannot be shown for them.
  const haveDayTotals = legs.some((l) => typeof l.dayIndex === "number");

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
           * The portal's own header is hidden HERE rather than with a print:
           * utility class on the layout. Tailwind emitted no rule for that
           * class and the failure was silent — it sat on the element looking
           * correct while the nav would still have printed.
           */
          header, nav { display: none !important; }
          .no-print { display: none !important; }
          body { background: #fff; }
          .sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
          .band { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tr, .day-row { break-inside: avoid; }
          thead { display: table-header-group; }
        }
        @page { margin: 14mm; }
      `}</style>

      <div className="no-print mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <PrintButton />
          <a href={`/agent/quotes/${quote.reference}`} className="text-sm text-blue-700 hover:underline">
            ← Back to quote
          </a>
        </div>

        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          In the print dialogue, untick <strong>Headers and footers</strong>. Browsers otherwise
          add the page address along the bottom, and that is the one place your supplier&rsquo;s
          name would still appear.
        </p>

        {!row?.logoStoredName && (
          <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900 ring-1 ring-inset ring-blue-200">
            No logo yet — this will print with your agency name as text.{" "}
            <a href="/agent/branding" className="font-medium underline">
              Upload your logo
            </a>{" "}
            and it appears on every quote from then on.
          </p>
        )}
      </div>

      <article className="sheet overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        {/* --- letterhead ------------------------------------------------ */}
        <header className="band border-b-4 border-slate-900 px-8 pt-8 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              {row?.logoStoredName ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/agent/branding/logo"
                  alt={agent.agencyName}
                  className="mb-3 max-h-24 max-w-[18rem] object-contain"
                />
              ) : null}
              <p className="text-2xl font-bold tracking-tight text-slate-900">{agent.agencyName}</p>
              {row?.address && (
                <p className="mt-1 max-w-sm whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {row.address}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-600">
                {row?.phone}
                {row?.phone && agent.email && " · "}
                {agent.email}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Quotation
              </p>
              <p className="font-mono text-2xl font-bold text-slate-900">{quote.reference}</p>
              <p className="mt-1 text-sm text-slate-500">{formatDateDisplay(quote.createdAt)}</p>
            </div>
          </div>
        </header>

        <div className="px-8 pb-8">
          {/* --- trip facts ---------------------------------------------- */}
          <section className="flex flex-wrap overflow-hidden rounded-md ring-1 ring-slate-200">
            <Fact label="Travel dates">
              {formatDateDisplay(quote.travelStart) === formatDateDisplay(quote.travelEnd)
                ? formatDateDisplay(quote.travelStart)
                : `${formatDateDisplay(quote.travelStart)} — ${formatDateDisplay(quote.travelEnd)}`}
            </Fact>
            {days.length > 0 && (
              <Fact label="Duration">
                {days.length} {days.length === 1 ? "day" : "days"}
                {days.length > 1 && ` / ${days.length - 1} nights`}
              </Fact>
            )}
            {(party || quote.pax > 0) && (
              <Fact label="Travellers">{party || quote.pax}</Fact>
            )}
            {totalKm > 0 && (
              <Fact label="Distance">{totalKm.toLocaleString("en-IN")} km</Fact>
            )}
          </section>

          {/* --- the day-by-day plan ------------------------------------- */}
          {days.length > 0 && (
            <section className="mt-7">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Detailed itinerary
              </h2>

              <ol className="space-y-0">
                {days.map((d, i) => {
                  const local = d.from === d.to;
                  const via = d.via.filter((v) => v.trim() !== "");
                  const km = kmForDay(i);
                  return (
                    <li
                      key={i}
                      className="day-row grid grid-cols-[3.5rem_1fr_auto] gap-x-4 border-b border-slate-100 py-3 last:border-0"
                    >
                      <div>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
                          Day {i + 1}
                        </p>
                        <p className="text-xs tabular-nums text-slate-500">
                          {formatDateDisplay(new Date(`${d.date}T00:00:00Z`)).slice(0, 5)}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {local ? d.from : `${d.from} → ${d.to}`}
                        </p>
                        {via.length > 0 && (
                          <p className="mt-0.5 text-sm text-slate-600">
                            {local ? "Excursion to " : "Via "}
                            {via.join(", ")}
                          </p>
                        )}
                        {local && via.length === 0 && (
                          <p className="mt-0.5 text-sm text-slate-600">At leisure</p>
                        )}
                        {d.bufferKm > 0 && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            Includes {d.bufferKm} km local sightseeing
                          </p>
                        )}
                      </div>

                      {haveDayTotals && (
                        <p className="whitespace-nowrap text-sm tabular-nums text-slate-500">
                          {km > 0 ? `${km.toLocaleString("en-IN")} km` : "—"}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>

              {haveDayTotals && garageKm > 0 && (
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm">
                  <span className="text-slate-500">
                    Vehicle positioning to and from base
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {garageKm.toLocaleString("en-IN")} km
                  </span>
                </div>
              )}
              {totalKm > 0 && (
                <div className="mt-1 flex justify-between text-sm font-medium">
                  <span className="text-slate-700">Total distance</span>
                  <span className="tabular-nums text-slate-900">
                    {totalKm.toLocaleString("en-IN")} km
                  </span>
                </div>
              )}
            </section>
          )}

          {/* --- money ---------------------------------------------------- */}
          <section className="mt-7">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Cost
            </h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {[...groups.entries()].map(([idx, group]) => (
                  <ItemGroup key={idx} label={group.label} multiple={groups.size > 1}>
                    {group.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-2 pr-4 text-slate-700">{line.description}</td>
                        <td className="py-2 text-right tabular-nums text-slate-900">
                          {formatMinor(line.totalMinor)}
                        </td>
                      </tr>
                    ))}
                  </ItemGroup>
                ))}
              </tbody>
              <tfoot>
                <tr className="band border-t-2 border-slate-900 bg-slate-50">
                  <td className="py-3 pl-2 text-base font-bold text-slate-900">Total</td>
                  <td className="py-3 pr-2 text-right text-xl font-bold tabular-nums text-slate-900">
                    {formatMinor(quote.totalMinor)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <footer className="mt-8 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
            <p>
              This is a quotation and not a confirmed booking. Prices are held for the dates shown
              and remain subject to availability at the time of booking.
            </p>
            <p className="mt-3 font-medium text-slate-700">{agent.agencyName}</p>
          </footer>
        </div>
      </article>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[11rem] flex-1 border-r border-slate-200 bg-white px-4 py-3 last:border-r-0">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{children}</p>
    </div>
  );
}

/**
 * A heading inside the cost table for one item of a combined trip.
 *
 * A single-product quote has one group and shows no heading, so it reads
 * exactly as it did before combined quoting existed.
 */
function ItemGroup({
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
          <td colSpan={2} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </td>
        </tr>
      )}
      {children}
    </>
  );
}
