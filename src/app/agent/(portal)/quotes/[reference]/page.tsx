import { Fragment, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { getQuote, readSnapshot, resolveSubject } from "@/lib/quote-store";
import { formatMinor } from "@/lib/money";
import { gstBps } from "@/lib/settings";
import { withGst, formatBps } from "@/lib/settings-shared";
import { formatDateDisplay } from "@/lib/dates";
import { buildItineraryDocument } from "@/lib/itinerary-document";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { VehiclePhoto } from "@/components/vehicle-photo";
import { DeleteQuote } from "./delete-quote";
import { editUrlFor } from "@/lib/quote-edit";
import { deleteQuoteAction } from "../actions";

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

  const snapshot = readSnapshot(quote.snapshotJson);
  const subject = await resolveSubject(snapshot);
  const terms = snapshot.option?.terms;

  // Null for shapes the builder cannot reopen — a combined trip, or a snapshot
  // from before an input existed. Better no button at all than one that lands
  // on a half-empty form.
  const editUrl = snapshot.input ? editUrlFor(snapshot.input, quote.reference) : null;

  /*
   * The document the agent hands their own customer.
   *
   * Deliberately NOT the measured legs. Confirmed with Sonet, 20 Sept 2026:
   * the road segments, the depot positioning runs and the local-running
   * allowance are operational figures that explain a price — they belong on
   * the admin screens, and on a customer's itinerary they only invite an
   * argument about numbers that were never charges. What the customer needs is
   * the trip, the included distance, and what happens past it.
   */
  const doc = buildItineraryDocument({ days: snapshot.days, subject, terms });

  // Only what the pricing actually charged, so the clauses can be joined with
  // no combination able to produce a stray separator.
  const termsParts: ReactNode[] = [];
  if (terms?.includedKm != null) {
    termsParts.push(
      <>
        <strong className="text-slate-900">{terms.includedKm.toLocaleString("en-IN")} km</strong>{" "}
        included
      </>
    );
  }
  if (terms?.extraKmRateMinor != null) {
    termsParts.push(
      <>
        extra km at{" "}
        <strong className="text-slate-900">{formatMinor(terms.extraKmRateMinor)}</strong> per km
      </>
    );
  }
  if (terms?.includesTollParking) termsParts.push(<>toll and parking included</>);
  if ((terms?.permitStates?.length ?? 0) > 0) {
    termsParts.push(<>{terms!.permitStates!.join(" and ")} permit included</>);
  }

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
          {/*
            The vehicle, as a picture. Portal only — the customer's PDF carries
            the agency's branding and nothing of ours, and a supplier's vehicle
            photograph on their letterhead is what it exists to keep off.
          */}
          <VehiclePhoto
            vehicleId={subject?.vehicleId}
            alt={subject?.name ?? "Vehicle"}
            className="h-24 w-36 shrink-0 rounded-md object-cover ring-1 ring-inset ring-slate-200"
          />
          <div className="flex-1 text-sm text-slate-600">
            <p>
              <span className="text-slate-400">Travel: </span>
              {formatDateDisplay(quote.travelStart) === formatDateDisplay(quote.travelEnd)
                ? formatDateDisplay(quote.travelStart)
                : `${formatDateDisplay(quote.travelStart)} → ${formatDateDisplay(quote.travelEnd)}`}
            </p>
            {/*
              Which vehicle the quote is for. It said nowhere at all until
              Sonet asked of a saved quote — "Per day hire" is how it was
              priced, not what it was for.
            */}
            {subject && (
              <p>
                <span className="text-slate-400">Vehicle: </span>
                <span className="font-medium text-slate-900">{subject.name}</span>
                {subject.detail && (
                  <span className="text-slate-500"> · {subject.detail.toLowerCase()}</span>
                )}
              </p>
            )}
            <p>
              <span className="text-slate-400">Agency: </span>
              {agent.agencyName}
            </p>
          </div>
          {usedOverride && <Badge tone="green">Your agency rate applied</Badge>}
        </div>

        {doc && (
          <section className="mt-6 rounded-md bg-slate-50 p-5 ring-1 ring-inset ring-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">{doc.title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{doc.subtitle}</p>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Overview
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{doc.overview}</p>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Day-by-day itinerary
            </h3>
            <ol className="mt-2 divide-y divide-slate-200">
              {doc.days.map((d) => (
                <li key={d.label} className="py-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {d.label}
                    <span className="mx-2 font-normal text-slate-300">—</span>
                    {d.heading}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {formatDateDisplay(new Date(`${d.date}T00:00:00Z`))}
                    </span>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{d.description}</p>
                  {d.activities.length > 0 && (
                    <p className="mt-1 text-sm text-slate-500">
                      <span className="font-medium text-slate-600">Sightseeing: </span>
                      {d.activities.join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ol>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  What&rsquo;s included
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {doc.included.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-green-600">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  What&rsquo;s not included
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {doc.excluded.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-slate-300">✕</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/*
          Deliberately no cost breakdown. Confirmed with Sonet, 19 Sept 2026:
          an agent quotes one number to their customer, and a line-by-line
          build-up of hire, driver allowance and extra km only invites being
          negotiated line by line. The LINES ARE STILL STORED — they are what
          the quote was priced from, and the admin can read them at
          /admin/quotes — they are simply not shown here.
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

        {/*
          Assembled as a LIST and joined, never as conditional separators —
          the same rule as the quote builder. Hand-placed bullets left a flat
          transfer, which has no kilometre allowance, reading "· toll and
          parking included" and starting on a separator.
        */}
        {termsParts.length > 0 && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
            {termsParts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && " · "}
                {part}
              </Fragment>
            ))}
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
