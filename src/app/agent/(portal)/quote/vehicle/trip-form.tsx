"use client";

import { useState, useMemo } from "react";
import { Button, Select, FormError } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { PlaceInput } from "./place-input";
import { Stepper } from "@/components/stepper";
import { ProductThumbnail } from "@/components/product-photos";

/**
 * The vehicle trip builder.
 *
 * Agents plan in days, not in legs: "day 1 Cochin to Munnar, day 2 at Munnar
 * running up to Top Station, day 3 down to Thekkady". So the form asks for
 * exactly that, derives the number of day rows from the hire dates, and works
 * the kilometres out itself. Nobody types a distance unless Google cannot
 * find a place.
 *
 * Everything submits as query params on a plain GET form, like every other
 * quote screen, so a priced trip stays refreshable and shareable.
 */

export type GarageOption = {
  id: string;
  name: string;
  vehicles: { id: string; type: string; capacity: number; photoIds: string[] }[];
};

type DayRow = {
  date: string;
  from: string;
  to: string;
  via: string;
  bufferKm: string;
  /** What the day contains — sightseeing, stops, anything the customer reads. */
  notes: string;
  /** Local-day flag. Drives `to`, and relabels `via` as the excursion. */
  local: boolean;
};

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function blankRows(start: string, end: string): DayRow[] {
  const n = dayCount(start, end);
  const rows: DayRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({ date: addDays(start, i), from: "", to: "", via: "", bufferKm: "", notes: "", local: false });
  }
  return rows;
}

function dayCount(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

export function TripForm({
  garages,
  initial,
  fieldErrors,
}: {
  garages: GarageOption[];
  initial: {
    garageId: string;
    vehicleId: string;
    startDate: string;
    endDate: string;
    adults: string;
    childAges: string[];
    days: { date: string; from: string; to: string; via: string[]; bufferKm: string; notes: string }[];
  };
  fieldErrors: Record<string, string>;
}) {
  const [garageId, setGarageId] = useState(initial.garageId || garages[0]?.id || "");
  const [vehicleId, setVehicleId] = useState(initial.vehicleId);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [adults, setAdults] = useState(initial.adults || "2");
  const [childAges, setChildAges] = useState<string[]>(initial.childAges);
  const [days, setDays] = useState<DayRow[]>(() => {
    if (initial.days.length > 0) {
      return initial.days.map((d) => ({
        date: d.date,
        from: d.from,
        to: d.to,
        via: d.via.join(", "),
        bufferKm: d.bufferKm,
        notes: d.notes ?? "",
        local: d.to !== "" && d.to === d.from,
      }));
    }
    // Dates can arrive in the URL with no itinerary behind them — a half-built
    // quote someone bookmarked, or a link shared before the days were filled
    // in. The rows are derived from the dates, so derive them here too rather
    // than waiting for a date to be RETYPED before the itinerary appears.
    return blankRows(initial.startDate, initial.endDate);
  });

  const garage = garages.find((g) => g.id === garageId);
  // Only what this garage actually holds. A coach that lives at Cochin must
  // not be offerable out of Trivandrum.
  const vehicles = garage?.vehicles ?? [];
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const count = dayCount(startDate, endDate);

  /**
   * Grow or shrink the day rows to match the dates, keeping whatever is
   * already typed. The row count is derived, never typed — an itinerary with a
   * different number of days than the hire it prices should not be expressible.
   */
  function syncDays(start: string, end: string) {
    setDays((prev) =>
      blankRows(start, end).map((row, i) => ({
        ...row,
        // Keep whatever is already typed at that position.
        from: prev[i]?.from ?? "",
        to: prev[i]?.to ?? "",
        via: prev[i]?.via ?? "",
        bufferKm: prev[i]?.bufferKm ?? "",
        notes: prev[i]?.notes ?? "",
        local: prev[i]?.local ?? false,
      }))
    );
  }

  const update = (i: number, patch: Partial<DayRow>) =>
    setDays((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  // Day N starts where day N-1 ended. The vehicle is with the party for the
  // whole hire, so only the first pickup is a real choice; the rest follow.
  const chained = useMemo(() => {
    const out: { from: string; to: string }[] = [];
    days.forEach((d, i) => {
      const from = i === 0 ? d.from : out[i - 1].to || out[i - 1].from;
      out.push({ from, to: d.local ? from : d.to });
    });
    return out;
  }, [days]);

  const pax = (Number(adults) || 0) + childAges.length;
  const overCapacity = vehicle != null && pax > vehicle.capacity;

  /*
   * Kept although the form no longer ASKS for buffer km.
   *
   * Reopening an older quote with "Edit" rebuilds its URL including
   * dayBufferKm, so a quote saved when the field existed still carries its
   * allowance — and the summary bar should say so rather than quietly
   * dropping kilometres the hire is still priced on.
   */
  const bufferTotal = days.reduce((s, d) => s + (Number(d.bufferKm) || 0), 0);

  const routeSummary = chained
    .map((c, i) => (i === 0 ? c.from : c.to))
    .filter((p, i, arr) => p !== "" && (i === 0 || p !== arr[i - 1]));

  return (
    <div className="space-y-4">
      {/* What the agent has built so far. Nine days of form is a long way to
          scroll to re-check the party size or where the trip ends. */}
      {(count > 0 || vehicle) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md bg-slate-900 px-4 py-2.5 text-sm text-white">
          {count > 0 && (
            <span>
              <strong>{count}</strong> {count === 1 ? "day" : "days"}
            </span>
          )}
          <span>
            <strong>{pax}</strong> {pax === 1 ? "passenger" : "passengers"}
          </span>
          {vehicle && <span className="text-slate-300">{vehicle.type}</span>}
          {routeSummary.length > 1 && (
            <span className="min-w-0 flex-1 truncate text-slate-300">
              {routeSummary.join(" → ")}
            </span>
          )}
          {bufferTotal > 0 && (
            <span className="text-slate-400">+{bufferTotal} km sightseeing</span>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Depot"
          name="garageId"
          required
          value={garageId}
          onChange={(e) => {
            setGarageId(e.target.value);
            setVehicleId("");
          }}
          options={garages.map((g) => ({ value: g.id, label: g.name }))}
          hint="The hire is measured from here and back to here."
          error={fieldErrors.garageId}
        />
        <div>
          <Select
            label="Vehicle"
            name="vehicleId"
            required
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            options={[
              { value: "", label: vehicles.length === 0 ? "No vehicles at this depot" : "Choose a vehicle" },
              ...vehicles.map((v) => ({ value: v.id, label: `${v.type} — up to ${v.capacity} passengers` })),
            ]}
            error={fieldErrors.vehicleId}
          />
          {/*
            Beneath the vehicle it depicts, not off under the depot column.
            Renders nothing until one is chosen, and nothing for a vehicle with
            no photograph uploaded — so the form looks exactly as it did rather
            than showing an empty frame.
          */}
          {vehicle && (
            <ProductThumbnail
              photoIds={vehicle.photoIds}
              alt={vehicle.type}
              className="mt-2 h-20 w-32 rounded-md object-cover ring-1 ring-inset ring-slate-200"
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          label="Pick-up date"
          name="startDate"
          required
          defaultValue={initial.startDate}
          onIsoChange={(iso) => {
            setStartDate(iso);
            syncDays(iso, endDate);
          }}
          error={fieldErrors.startDate}
        />
        <DateField
          label="Drop date"
          name="endDate"
          required
          defaultValue={initial.endDate}
          hint="Same day for a one-way transfer."
          onIsoChange={(iso) => {
            setEndDate(iso);
            syncDays(startDate, iso);
          }}
          error={fieldErrors.endDate}
        />
      </div>

      {/* --- who is travelling ------------------------------------------- */}
      <div className="rounded-md bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Passengers</p>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Adults</span>
            <Stepper
              name="adults"
              label="Adults"
              min={1}
              max={60}
              value={Number(adults) || 1}
              onChange={(n) => setAdults(String(n))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Children</span>
            {childAges.length === 0 ? (
              <span className="text-sm text-slate-400">none</span>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                {childAges.map((age, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-slate-200"
                  >
                    <span className="text-xs text-slate-500">age</span>
                    <Stepper
                      compact
                      name="childAge"
                      label={`Child ${i + 1} age`}
                      min={0}
                      max={17}
                      value={Number(age) || 0}
                      onChange={(n) =>
                        setChildAges((cs) => cs.map((c, j) => (j === i ? String(n) : c)))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setChildAges((cs) => cs.filter((_, j) => j !== i))}
                      aria-label={`Remove child ${i + 1}`}
                      className="rounded px-1 text-sm text-slate-400 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </span>
            )}
            <Button type="button" tone="secondary" onClick={() => setChildAges((cs) => [...cs, "6"])}>
              Add child
            </Button>
          </div>
        </div>

        {fieldErrors.adults && <FormError message={fieldErrors.adults} />}
        {fieldErrors.childAges && <FormError message={fieldErrors.childAges} />}

        {overCapacity && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
            {pax} passengers, but a {vehicle!.type} carries up to {vehicle!.capacity}. You can
            still quote it — a small child may not need a seat of their own — but check before
            you send it.
          </p>
        )}
      </div>

      {/* --- the itinerary ------------------------------------------------ */}
      <div className="rounded-md bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Itinerary</p>
          <p className="text-xs text-slate-500">
            Distances are calculated for you, from the depot and back again.
          </p>
        </div>
        {/*
          Said once, at the top, rather than left to be inferred from a row of
          greyed-out boxes. Sonet, 21 Sept 2026: agents were "confused what to
          enter and where to enter the details".
        */}
        {count > 0 && (
          <p className="mb-3 text-sm text-slate-600">
            Type where the vehicle goes each day, or tap{" "}
            <span className="font-medium text-slate-700">Pick from our destinations</span>.
            Each day starts where the day before ended, so you only enter the destination.
          </p>
        )}

        {count === 0 ? (
          <p className="text-sm text-slate-500">Pick the dates above and the days will appear here.</p>
        ) : (
          <div className="space-y-3">
            {days.map((d, i) => (
              <div key={i} className="rounded-md bg-white p-3 ring-1 ring-inset ring-slate-200">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    Day {i + 1}
                    <span className="ml-2 font-normal text-slate-500">
                      {d.date.slice(8, 10)}/{d.date.slice(5, 7)}/{d.date.slice(0, 4)}
                    </span>
                  </p>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={d.local}
                      onChange={(e) => update(i, { local: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    Stay at the same place
                  </label>
                </div>

                <input type="hidden" name="dayDate" value={d.date} />
                <input type="hidden" name="dayTo" value={chained[i]?.to ?? ""} />

                {/*
                  Three fields, not five. "What happens this day" and "Buffer
                  km" were removed on Sonet's instruction, 21 Sept 2026 — the
                  grid asked for too much and agents could not tell which boxes
                  mattered. The DATA still carries both: older quotes hold
                  values for them and price on those values unchanged; the form
                  simply stops asking, and the parser already defaults them.
                */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      {i === 0 ? "Pick up from" : "Starts at"}
                      {i === 0 && <span className="ml-0.5 text-red-600">*</span>}
                    </span>
                    {i === 0 ? (
                      <PlaceInput
                        name="dayFrom"
                        value={d.from}
                        onChange={(v) => update(i, { from: v })}
                        placeholder="e.g. Cochin International Airport"
                        ariaLabel="Pick-up point"
                        quickPicks
                      />
                    ) : (
                      <>
                        {/* Chained, not typed: the vehicle cannot begin a day
                            somewhere other than where it finished the last. */}
                        <input type="hidden" name="dayFrom" value={chained[i]?.from ?? ""} />
                        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500 ring-1 ring-inset ring-slate-200">
                          {chained[i]?.from || `Wherever day ${i} ends`}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Carried over from day {i}
                        </p>
                      </>
                    )}
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      {d.local ? "Staying at" : "Drive to"}
                      {!d.local && <span className="ml-0.5 text-red-600">*</span>}
                    </span>
                    {d.local ? (
                      <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500 ring-1 ring-inset ring-slate-200">
                        {chained[i]?.from || `Wherever day ${i} ends`}
                      </p>
                    ) : (
                      <PlaceInput
                        value={d.to}
                        onChange={(v) => update(i, { to: v })}
                        placeholder="e.g. Munnar"
                        ariaLabel={`Day ${i + 1} destination`}
                        quickPicks
                      />
                    )}
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-700">
                      {d.local ? "Day trip to" : "Via"}
                      <span className="ml-1 font-normal text-slate-400">
                        {d.local ? "" : "(optional)"}
                      </span>
                    </span>
                    <PlaceInput
                      name="dayVia"
                      value={d.via}
                      onChange={(v) => update(i, { via: v })}
                      placeholder={d.local ? "e.g. Top Station" : "a stop on the way"}
                      ariaLabel={`Day ${i + 1} ${d.local ? "excursion" : "via point"}`}
                      quickPicks
                    />
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

        {fieldErrors["days.0.from"] && <FormError message={fieldErrors["days.0.from"]} />}

        {/*
          The buffer-km explanation went with its field. Local running is still
          charged — Setting.perStopKm adds an allowance for each place the party
          overnights at, automatically — it is simply no longer something an
          agent has to think about or get wrong.
        */}
      </div>
    </div>
  );
}
