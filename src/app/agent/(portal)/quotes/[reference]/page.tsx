import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { getQuote } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { gstBps } from "@/lib/settings";
import { withGst, formatBps } from "@/lib/settings-shared";
import { formatDateDisplay } from "@/lib/dates";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { DeleteQuote } from "./delete-quote";
import { editUrlFor } from "@/lib/quote-edit";
import { deleteQuoteAction } from "../actions";
import type { VehicleLeg, ItineraryDay, AnyQuoteInput } from "@/lib/quote-types";

export const dynamic = "force-dynamic";

/** "combined" is not a ProductType — a mixed trip is not one of the four. */
const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hotel",
  houseboat: "Houseboat",
  vehicle: "Vehicle",
  itinerary: "Package",
  combined: "Combined trip",
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
  const totals = withGst(quote.totalMinor, await gstBps());

  // The itinerary a vehicle quote's distance was built from. Frozen at save
  // time alongside the rest of the inputs.
  let legs: VehicleLeg[] = [];
  let days: ItineraryDay[] = [];
  let editUrl: string | null = null;
  let terms: { includedKm?: number; extraKmRateMinor?: number } | undefined;
  try {
    const snapshot = JSON.parse(quote.snapshotJson) as {
      legs?: VehicleLeg[];
      input?: AnyQuoteInput & { days?: ItineraryDay[] };
      option?: { terms?: { includedKm?: number; extraKmRateMinor?: number } };
    };
    legs = Array.isArray(snapshot.legs) ? snapshot.legs : [];
    // The day plan the agent typed, as opposed to the road segments it was
    // measured into. Absent on quotes saved before the itinerary builder, and
    // on hand-typed leg quotes, both of which still render their legs below.
    days = Array.isArray(snapshot.input?.days) ? snapshot.input.days : [];
    // Null for shapes the builder cannot reopen — a combined trip, or a
    // snapshot from before an input existed. Better no button at all than one
    // that lands on a half-empty form.
    editUrl = snapshot.input ? editUrlFor(snapshot.input, quote.reference) : null;
    terms = snapshot.option?.terms;
  } catch {
    // A quote saved before legs existed, or malformed JSON — show the priced
    // lines regardless rather than failing the whole page.
    legs = [];
    days = [];
    editUrl = null;
    terms = undefined;
  }
  const legTotal = legs.reduce((s, l) => s + l.km + l.bufferKm, 0);

  return (
    <>
      <PageHeader
        title={`Quote ${quote.reference}`}
        description={`${PRODUCT_LABEL[quote.productType] ?? quote.productType} · quoted ${quote.createdAt.toISOString().slice(0, 10)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href={`/agent/quotes/${quote.reference}/pdf`} tone="primary">
              Download PDF
            </LinkButton>
            <a
              href={`/agent/quotes/${quote.reference}/pdf?view=1`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-700 hover:underline"
            >
              Preview
            </a>
            {editUrl && <LinkButton href={editUrl}>Edit</LinkButton>}
            <LinkButton href="/agent/quotes">All quotes</LinkButton>
            <DeleteQuote
              reference={quote.reference}
              action={deleteQuoteAction.bind(null, quote.reference)}
            />
          </div>
        }
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

        {days.length > 0 && (
          <section className="mt-5 rounded-md bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Day plan
            </h2>
            <ol className="mt-2 space-y-1 text-sm">
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
                      {local ? `At ${d.from}` : `${d.from} → ${d.to}`}
                      {via.length > 0 && (
                        <span className="text-slate-500">
                          {local ? ` · excursion to ${via.join(", ")}` : ` · via ${via.join(", ")}`}
                        </span>
                      )}
                      {d.bufferKm > 0 && (
                        <span className="text-slate-500"> · +{d.bufferKm} km sightseeing</span>
                      )}
                      {d.notes && (
                        <span className="block text-slate-500">{d.notes}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

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

        {/*
          Deliberately no cost breakdown. Confirmed with Sonet, 19 Sept 2026:
          an agent quotes one number to their customer, and a line-by-line
          build-up of hire, driver allowance and extra km only invites being
          negotiated line by line. The LINES ARE STILL STORED — they are what
          the quote was priced from, and the admin can still read them — they
          are simply not shown here.
        */}
        <dl className="mt-5 divide-y divide-slate-100 text-sm">
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-slate-600">Total</dt>
            <dd className="tabular-nums text-slate-900">{formatMinor(totals.netMinor)}</dd>
          </div>
          <div className="flex items-baseline justify-between py-2">
            <dt className="text-slate-600">GST {formatBps(totals.gstBps)}</dt>
            <dd className="tabular-nums text-slate-900">{formatMinor(totals.gstMinor)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t-2 border-slate-300 py-3">
            <dt className="text-base font-semibold text-slate-900">Grand total</dt>
            <dd className="text-xl font-semibold tabular-nums text-slate-900">
              {formatMinor(totals.grossMinor)}
            </dd>
          </div>
        </dl>

        {(terms?.includedKm != null || terms?.extraKmRateMinor != null) && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
            {terms.includedKm != null && (
              <>
                <strong className="text-slate-900">
                  {terms.includedKm.toLocaleString("en-IN")} km
                </strong>{" "}
                included
              </>
            )}
            {terms.includedKm != null && terms.extraKmRateMinor != null && " · "}
            {terms.extraKmRateMinor != null && (
              <>
                extra km at{" "}
                <strong className="text-slate-900">{formatMinor(terms.extraKmRateMinor)}</strong> per
                km
              </>
            )}
          </p>
        )}

        <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
          This is a quotation, not a booking. Prices were frozen when the quote was saved and are
          not affected by later rate changes. Nothing has been reserved and no payment is due.
        </p>
      </Card>
    </>
  );
}
