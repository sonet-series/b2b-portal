import { prisma } from "@/lib/db";
import { measureItinerary } from "@/lib/itinerary";
import { usingDistanceStub } from "@/lib/distance";
import { perNightKm } from "@/lib/settings";
import { formatDateOnly, MS_PER_DAY } from "@/lib/dates";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import type { ItineraryDay } from "@/lib/quote-types";

export const dynamic = "force-dynamic";

/**
 * What the portal thinks a trip runs, against what Sonet knows it runs.
 *
 * Sonet, 6 Oct 2026, with six real circuits and their kilometres: *"check how
 * much b2b is quoting and how much difference its show from my km and the b2b
 * km"*. That cannot be answered by reasoning about the code. The portal's
 * figure is Google's distance plus a flat local-running allowance, and nobody
 * has ever put the result beside what an operator would quote.
 *
 * This runs the SAME path a real quote runs — `measureItinerary`, with the
 * depot bookends and the per-stop allowance, against the live Routes API — so
 * the numbers here are the numbers an agent is being given. It prices nothing
 * and writes nothing.
 *
 * It is a measuring instrument, not a feature for agents. It lives in the
 * admin because the answer it produces changes what the pricing model should
 * be, and that is a decision Sonet makes.
 */

type Route = {
  label: string;
  /** Sonet's own figure, km. */
  his: number;
  days: string[];
  /** Day index -> places visited on the way. A day trip is an out-and-back. */
  via?: Record<number, string[]>;
  /** True where the night count is MY reading of his route, not his statement. */
  assumed?: string;
};

const AIRPORT = "Cochin International Airport";

/*
 * His six, written as the DAY PLAN an agent would build — because that is the
 * thing the portal measures. A repeated place is a day spent there.
 *
 * Two nights at Munnar throughout: his 350 km for Cochin–Munnar–Cochin only
 * makes sense with a full day in the hills, since the drive alone is around
 * 260 km return. Where a night count is my reading rather than his statement,
 * the row says so — the point is the SHAPE of the gap, not a verdict on one
 * number.
 */
const ROUTES: Route[] = [
  {
    label: "Cochin – Munnar – Cochin",
    his: 350,
    days: ["Munnar", "Munnar", AIRPORT],
    assumed: "2 nights, both at Munnar",
  },
  {
    label: "Cochin – Munnar – Alleppey",
    his: 550,
    days: ["Munnar", "Munnar", "Alleppey", AIRPORT],
    assumed: "3 nights; dropped back at Cochin",
  },
  {
    label: "Cochin – Munnar – Thekkady – Alleppey – Cochin",
    his: 650,
    days: ["Munnar", "Munnar", "Thekkady", "Alleppey", AIRPORT],
    assumed: "4 nights",
  },
  {
    label: "Cochin – Munnar – Thekkady – Alleppey – Kovalam – Trivandrum",
    his: 1150,
    days: ["Munnar", "Munnar", "Thekkady", "Alleppey", "Kovalam", "Kovalam", "Trivandrum"],
    assumed: "6 nights",
  },
  {
    label: "… + Kanyakumari day trip – Trivandrum",
    his: 1350,
    days: ["Munnar", "Munnar", "Thekkady", "Alleppey", "Kovalam", "Kovalam", "Kovalam", "Trivandrum"],
    via: { 6: ["Kanyakumari"] },
    assumed: "7 nights; Kanyakumari as a day trip from Kovalam",
  },
  {
    label: "Cochin – Munnar – Thekkady – Madurai – Rameswaram – Kanyakumari – Trivandrum – Alleppey – Cochin",
    his: 1650,
    days: [
      "Munnar", "Munnar", "Thekkady", "Madurai", "Rameswaram",
      "Kanyakumari", "Trivandrum", "Alleppey", AIRPORT,
    ],
    assumed: "8 nights",
  },
];

function planOf(route: Route): ItineraryDay[] {
  // Dates are arbitrary: TRAFFIC_UNAWARE means the measurement does not depend
  // on when it is taken, which is the whole reason that setting was chosen.
  const start = Date.UTC(2026, 10, 10);
  return route.days.map((to, i) => ({
    date: formatDateOnly(new Date(start + i * MS_PER_DAY)),
    from: i === 0 ? AIRPORT : "",
    to,
    via: route.via?.[i] ?? [],
    bufferKm: 0,
  }));
}

export default async function KmCheckPage() {
  const stub = usingDistanceStub();
  const garage = await prisma.garage.findFirst({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const stopKm = await perNightKm();

  type Row = {
    route: Route;
    routedKm?: number;
    localKm?: number;
    totalKm?: number;
    stops?: string[];
    error?: string;
  };

  const rows: Row[] = [];
  if (garage && !stub) {
    for (const route of ROUTES) {
      try {
        const m = await measureItinerary(garage.address, planOf(route));
        rows.push({
          route,
          routedKm: m.routedKm,
          localKm: m.localKm,
          totalKm: m.totalKm,
          stops: m.stops,
        });
      } catch (e) {
        rows.push({ route, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Distance check"
        description="What the portal measures a trip at, against the figures you quote from experience."
      />

      {stub && (
        <Card className="mb-6">
          <Badge tone="amber">Not measuring</Badge>
          <p className="mt-2 text-sm text-slate-600">
            No <code className="rounded bg-slate-100 px-1">GOOGLE_MAPS_API_KEY</code> is set, so
            distances here would be fabricated by the development stub. This page only has
            something to say on the server, where the key is.
          </p>
        </Card>
      )}

      {!garage && !stub && (
        <Card className="mb-6">
          <p className="text-sm text-slate-600">
            No active depot. A hire is measured depot to depot, so there is nothing to measure
            from.
          </p>
        </Card>
      )}

      {rows.length > 0 && (
        <>
          <p className="-mt-2 mb-4 text-sm text-slate-500">
            Measured from <strong>{garage?.name}</strong> ({garage?.address}), with{" "}
            <strong>{stopKm} km</strong> of local running allowed per night, rounded up to the next
            50 km. This is the
            same calculation a real quote uses — nothing here is priced or saved.
          </p>

          <Table head={["Route", "Yours", "Routed", "Local", "Portal", "Difference"]}>
            {rows.map((r) => {
              const diff = r.totalKm != null ? r.totalKm - r.route.his : null;
              const pct =
                diff != null && r.route.his > 0 ? Math.round((diff / r.route.his) * 100) : null;
              return (
                <tr key={r.route.label}>
                  <Td>
                    <span className="font-medium text-slate-900">{r.route.label}</span>
                    {r.route.assumed && (
                      <span className="block text-xs text-slate-400">
                        assumed: {r.route.assumed}
                      </span>
                    )}
                    {r.stops && (
                      <span className="block text-xs text-slate-400">
                        stops counted: {r.stops.join(", ")}
                      </span>
                    )}
                    {r.error && (
                      <span className="block text-xs text-red-600">{r.error}</span>
                    )}
                  </Td>
                  <Td className="tabular-nums">{r.route.his.toLocaleString("en-IN")}</Td>
                  <Td className="tabular-nums text-slate-500">
                    {r.routedKm?.toLocaleString("en-IN") ?? "—"}
                  </Td>
                  <Td className="tabular-nums text-slate-500">
                    {r.localKm?.toLocaleString("en-IN") ?? "—"}
                  </Td>
                  <Td className="tabular-nums font-medium text-slate-900">
                    {r.totalKm?.toLocaleString("en-IN") ?? "—"}
                  </Td>
                  <Td className="tabular-nums">
                    {diff == null ? (
                      "—"
                    ) : (
                      <span
                        className={
                          Math.abs(pct ?? 0) <= 5
                            ? "text-emerald-700"
                            : diff < 0
                              ? "text-red-700"
                              : "text-amber-700"
                        }
                      >
                        {diff >= 0 ? "+" : ""}
                        {diff.toLocaleString("en-IN")} ({pct! >= 0 ? "+" : ""}
                        {pct}%)
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>

          <Card className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900">Reading this</h2>
            <dl className="mt-3 space-y-2 text-sm text-slate-600">
              <div>
                <dt className="inline font-medium text-slate-900">Routed — </dt>
                <dd className="inline">
                  what Google measures depot to depot, including the run out to the first pickup
                  and home from the last drop.
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-slate-900">Local — </dt>
                <dd className="inline">
                  the sightseeing allowance the portal adds, {stopKm} km for each NIGHT, plus
                  whatever rounds the trip up to the next 50 km.
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-slate-900">Portal — </dt>
                <dd className="inline">routed plus local. What a hire is actually priced on.</dd>
              </div>
              <div>
                <dt className="inline font-medium text-slate-900">Difference — </dt>
                <dd className="inline">
                  portal minus yours. <strong>Negative is the one that costs money</strong>: the
                  portal is counting fewer kilometres than the vehicle will really drive, and
                  nobody is charging for the rest.
                </dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </>
  );
}
