import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getQuoteForAdmin, readSnapshot, resolveSubject } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { gstBps } from "@/lib/settings";
import { withGst, formatBps } from "@/lib/settings-shared";
import { formatDateDisplay } from "@/lib/dates";
import { effectiveTier } from "@/lib/tier";
import { AGENT_TIER_LABEL } from "@/lib/enums";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hotel",
  houseboat: "Houseboat",
  vehicle: "Vehicle",
  itinerary: "Package",
  combined: "Combined trip",
};

/**
 * The operator's view of a saved quote.
 *
 * This screen exists because the agent's no longer shows any of it. Confirmed
 * with Sonet, 20 Sept 2026: an agent quotes one number to their customer, and
 * the measured legs, the depot positioning runs, the local-running allowance
 * and the toll and permit amounts are for understanding the price, not for
 * handing over. They still have to be readable by somebody, and this is where.
 *
 * Read-only on purpose. A quote is frozen at save time; changing one here
 * would silently rewrite a document an agent may already have sent.
 */
export default async function AdminQuotePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const quote = await getQuoteForAdmin(reference);
  if (!quote) notFound();

  const snapshot = readSnapshot(quote.snapshotJson);
  const subject = await resolveSubject(snapshot);
  const terms = snapshot.option?.terms;
  const totals = withGst(quote.totalMinor, await gstBps());

  const input = snapshot.input;
  const garageId =
    input?.productType === "vehicle" ? input.garageId : undefined;
  const depot = garageId
    ? await prisma.garage.findUnique({
        where: { id: garageId },
        select: { name: true, state: true, address: true },
      })
    : null;

  const tier = effectiveTier(quote.agent);
  const legs = snapshot.legs;
  const legTotal = legs.reduce((s, l) => s + l.km + l.bufferKm, 0);

  /** -1 is the two depot runs; -2 is the local-running allowance. */
  const legKind = (dayIndex?: number) =>
    dayIndex === -1 ? "Depot run" : dayIndex === -2 ? "Local allowance" : dayIndex != null ? `Day ${dayIndex + 1}` : "—";

  return (
    <>
      <PageHeader
        title={`Quote ${quote.reference}`}
        description={`${PRODUCT_LABEL[quote.productType] ?? quote.productType} · ${quote.agent.agencyName} · quoted ${quote.createdAt.toISOString().slice(0, 10)}`}
        action={<LinkButton href="/admin/quotes">All quotes</LinkButton>}
      />

      <Card>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Agency</dt>
            <dd className="text-slate-900">
              <Link href={`/admin/agents/${quote.agent.id}`} className="text-blue-700 hover:underline">
                {quote.agent.agencyName}
              </Link>
              <span className="block text-xs text-slate-500">{quote.agent.email}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Priced as</dt>
            <dd className="text-slate-900">{AGENT_TIER_LABEL[tier]}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Travel</dt>
            <dd className="text-slate-900">
              {formatDateDisplay(quote.travelStart) === formatDateDisplay(quote.travelEnd)
                ? formatDateDisplay(quote.travelStart)
                : `${formatDateDisplay(quote.travelStart)} → ${formatDateDisplay(quote.travelEnd)}`}
            </dd>
          </div>
          {subject && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Vehicle</dt>
              <dd className="text-slate-900">
                {subject.name}
                {subject.detail && (
                  <span className="block text-xs text-slate-500">{subject.detail}</span>
                )}
              </dd>
            </div>
          )}
          {depot && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Depot</dt>
              <dd className="text-slate-900">
                {depot.name}
                <span className="block text-xs text-slate-500">
                  {depot.state} · home state for permits
                </span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Passengers</dt>
            <dd className="text-slate-900">{quote.pax > 0 ? quote.pax : "—"}</dd>
          </div>
        </dl>

        {snapshot.revisedAt && (
          <p className="mt-4">
            <Badge tone="amber">
              Edited {formatDateDisplay(new Date(snapshot.revisedAt))} — reference kept
            </Badge>
          </p>
        )}
      </Card>

      {snapshot.days.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Day plan</h2>
          <ol className="mt-2 divide-y divide-slate-100 text-sm">
            {snapshot.days.map((d, i) => {
              const local = d.from === d.to;
              const via = d.via.filter((v) => v.trim() !== "");
              return (
                <li key={i} className="flex flex-wrap gap-x-3 py-2 text-slate-700">
                  <span className="w-12 shrink-0 text-slate-400">Day {i + 1}</span>
                  <span className="w-24 shrink-0 tabular-nums text-slate-500">
                    {formatDateDisplay(new Date(`${d.date}T00:00:00Z`))}
                  </span>
                  <span className="flex-1">
                    {local ? `At ${d.from}` : `${d.from} → ${d.to}`}
                    {via.length > 0 && (
                      <span className="text-slate-500">
                        {local ? ` · excursion to ${via.join(", ")}` : ` · via ${via.join(", ")}`}
                      </span>
                    )}
                    {d.bufferKm > 0 && (
                      <span className="text-slate-500"> · +{d.bufferKm} km sightseeing</span>
                    )}
                    {d.manualKm != null && (
                      <span className="text-amber-700"> · {d.manualKm} km entered by hand</span>
                    )}
                    {d.notes && <span className="block text-slate-500">{d.notes}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {legs.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Measured distance
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            What the price was calculated on, garage to garage. Not shown to the agent or on the
            customer&rsquo;s PDF.
          </p>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {legs.map((leg, i) => (
                <tr key={i}>
                  <td className="w-28 py-1.5 pr-3 text-xs text-slate-400">
                    {legKind(leg.dayIndex)}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-700">{leg.label || `Leg ${i + 1}`}</td>
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
                <td className="pt-2 font-medium text-slate-900" colSpan={2}>
                  Total distance
                </td>
                <td
                  className="pt-2 text-right font-semibold tabular-nums text-slate-900"
                  colSpan={2}
                >
                  {legTotal.toLocaleString("en-IN")} km
                </td>
              </tr>
            </tfoot>
          </table>

          {snapshot.itinerary && (
            <p className="mt-3 text-xs text-slate-500">
              Routed {snapshot.itinerary.routedKm.toLocaleString("en-IN")} km · local allowance{" "}
              {snapshot.itinerary.localKm.toLocaleString("en-IN")} km at{" "}
              {snapshot.itinerary.stops.length} stop
              {snapshot.itinerary.stops.length === 1 ? "" : "s"}
              {snapshot.itinerary.stops.length > 0 && ` (${snapshot.itinerary.stops.join(", ")})`} ·
              agent sightseeing buffer {snapshot.itinerary.bufferKm.toLocaleString("en-IN")} km
              {snapshot.itinerary.anyManual && " · includes a hand-entered distance"}
            </p>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Cost build-up
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Every line the quote was priced from, including toll, parking and interstate permits.
          The agent sees only the totals below.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="py-1.5 text-left font-semibold">Line</th>
              <th className="py-1.5 text-right font-semibold">Qty</th>
              <th className="py-1.5 text-right font-semibold">Unit</th>
              <th className="py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quote.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5 pr-3 text-slate-700">
                  {line.description}
                  {line.usedOverride && (
                    <span className="ml-2 text-xs text-green-700">agency rate</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                  {line.quantity.toLocaleString("en-IN")}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                  {formatMinor(line.unitMinor)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-900">
                  {formatMinor(line.totalMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 divide-y divide-slate-100 text-sm">
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

        {terms && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
            Stated to the customer:{" "}
            {terms.includedKm != null && `${terms.includedKm.toLocaleString("en-IN")} km included`}
            {terms.extraKmRateMinor != null &&
              ` · extra km at ${formatMinor(terms.extraKmRateMinor)}`}
            {terms.includesDriverAllowance && " · driver allowance included"}
            {terms.includesTollParking && " · toll and parking included"}
            {(terms.permitStates?.length ?? 0) > 0 &&
              ` · ${terms.permitStates!.join(" and ")} permit included`}
          </p>
        )}
      </Card>
    </>
  );
}
