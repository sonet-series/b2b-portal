import { Card } from "@/components/ui";
import { routeSummary, type Tour } from "@/lib/tours";

/**
 * The circuits Series Tours sells, offered before the agent plans anything.
 *
 * Sonet, 6 Oct 2026: *"b2b agents wont be know how many km there trip will
 * running"*. He is right, and it is not a failure of diligence on their part —
 * an agency in Delhi selling a Kerala holiday has no way to know that Munnar
 * to Thekkady is 95 km. Asking them to build the plan day by day asks them to
 * know Kerala's roads before they can quote a price.
 *
 * Plain LINKS, not a control. Every input on this screen already travels in
 * the query string, so choosing a tour is a navigation: the server fills in
 * the day plan and the end date on the next render. No client scripting, and
 * the result is a URL the agent can bookmark or send to a colleague, like
 * every other quote here.
 *
 * A starting point, never a restriction — the same relationship the
 * destination chips have to free typing. Every day stays editable afterwards,
 * and an agent planning something that is not on this list simply ignores it.
 */
export function TourPicker({
  tours,
  selected,
  params,
}: {
  tours: Tour[];
  selected: Tour | null;
  /** What the agent has already entered, so choosing a tour keeps it. */
  params: { garageId: string; vehicleId: string; startDate: string; adults: string };
}) {
  if (tours.length === 0 && !selected) return null;

  /*
   * Carries the rest of the form forward, but deliberately NOT the dates or
   * the day rows: a different tour is a different plan, and keeping the old
   * days would silently graft one itinerary onto another's allowance.
   */
  const href = (id: string | null) => {
    const p = new URLSearchParams();
    if (id) p.set("tourId", id);
    if (params.garageId) p.set("garageId", params.garageId);
    if (params.vehicleId) p.set("vehicleId", params.vehicleId);
    if (params.startDate) p.set("startDate", params.startDate);
    if (params.adults) p.set("adults", params.adults);
    return `/agent/quote/vehicle?${p.toString()}`;
  };

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Start from a standard tour</h2>
        {selected && (
          <a href={href(null)} className="text-sm text-blue-700 hover:underline">
            Plan my own trip instead
          </a>
        )}
      </div>

      {selected ? (
        <div className="mt-3 rounded-md bg-blue-50 p-4 ring-1 ring-inset ring-blue-200">
          <p className="text-sm font-semibold text-blue-900">{selected.name}</p>
          <p className="mt-1 text-sm text-blue-800">{routeSummary(selected)}</p>
          <p className="mt-2 text-sm text-blue-700">
            {selected.nights} night{selected.nights === 1 ? "" : "s"} ·{" "}
            <strong>{selected.allowanceKm.toLocaleString("en-IN")} km included</strong>
          </p>
          {selected.notes && <p className="mt-2 text-sm text-blue-700">{selected.notes}</p>}
          <p className="mt-3 text-xs text-blue-700">
            {/*
              Said plainly, because an agent who does not know the day plan can
              be changed will work around it — and the whole point is that this
              saves them work rather than boxing them in.
            */}
            Choose a start date below and the day-by-day plan fills itself in. You can change any
            day afterwards.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">
            Pick the route your customer is buying and the whole trip is planned for you —
            including how many kilometres it runs.
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {tours.map((t) => (
              <li key={t.id}>
                <a
                  href={href(t.id)}
                  className="-mx-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded px-2 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className="min-w-56 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{t.name}</span>
                    <span className="block text-sm text-slate-500">{routeSummary(t)}</span>
                  </span>
                  <span className="whitespace-nowrap text-sm text-slate-600">
                    {t.nights} night{t.nights === 1 ? "" : "s"}
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="tabular-nums">
                      {t.allowanceKm.toLocaleString("en-IN")} km
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
