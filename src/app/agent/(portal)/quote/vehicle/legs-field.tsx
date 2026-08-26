"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * The itinerary builder for a vehicle quote.
 *
 * Agents book one vehicle for a whole trip but work out the distance leg by
 * leg — Cochin → Munnar, then a day's sightseeing at Munnar, then Munnar →
 * Thekkady, and so on. A single "estimated distance" box threw all of that
 * away and left a number nobody could check.
 *
 * Each row submits three parallel repeated params (legLabel / legKm /
 * legBufferKm), which a plain GET form produces with no serialising, so the
 * inputs stay in the query string like every other quote screen.
 */

type Row = { id: number; label: string; km: string; bufferKm: string };

let nextId = 0;
const blank = (): Row => ({ id: nextId++, label: "", km: "", bufferKm: "" });

const controlClass =
  "block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 " +
  "ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset " +
  "focus:ring-blue-600";

export function LegsField({ initial }: { initial: { label: string; km: string; bufferKm: string }[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0 ? initial.map((r) => ({ ...r, id: nextId++ })) : [blank(), blank()]
  );

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const transferKm = rows.reduce((s, r) => s + num(r.km), 0);
  const bufferKm = rows.reduce((s, r) => s + num(r.bufferKm), 0);
  const total = transferKm + bufferKm;

  return (
    <div className="rounded-md bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Itinerary</p>
        <p className="text-xs text-slate-500">
          One vehicle for the whole trip. Add a leg per hop.
        </p>
      </div>

      <div className="space-y-2">
        <div className="hidden gap-2 px-1 text-xs font-medium text-slate-500 sm:grid sm:grid-cols-[1fr_7rem_8rem_2.5rem]">
          <span>Leg</span>
          <span>Distance (km)</span>
          <span>Sightseeing (km)</span>
          <span />
        </div>

        {rows.map((row, i) => (
          <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_7rem_8rem_2.5rem]">
            <input
              name="legLabel"
              value={row.label}
              onChange={(e) => update(row.id, { label: e.target.value })}
              placeholder={i === 0 ? "Cochin → Munnar" : "Next stop"}
              aria-label={`Leg ${i + 1} description`}
              className={controlClass}
            />
            <input
              name="legKm"
              value={row.km}
              onChange={(e) => update(row.id, { km: e.target.value })}
              inputMode="numeric"
              placeholder="0"
              aria-label={`Leg ${i + 1} distance in km`}
              className={`${controlClass} tabular-nums`}
            />
            <input
              name="legBufferKm"
              value={row.bufferKm}
              onChange={(e) => update(row.id, { bufferKm: e.target.value })}
              inputMode="numeric"
              placeholder="0"
              aria-label={`Leg ${i + 1} sightseeing buffer in km`}
              className={`${controlClass} tabular-nums`}
            />
            <button
              type="button"
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== row.id) : rs))}
              disabled={rows.length === 1}
              aria-label={`Remove leg ${i + 1}`}
              className="rounded-md px-2 text-sm text-slate-400 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" tone="secondary" onClick={() => setRows((rs) => [...rs, blank()])}>
          Add leg
        </Button>

        <p className="text-sm text-slate-600 tabular-nums">
          {transferKm.toLocaleString("en-IN")} km transfers
          {bufferKm > 0 && <> + {bufferKm.toLocaleString("en-IN")} km sightseeing</>}
          {" = "}
          <strong className="text-slate-900">{total.toLocaleString("en-IN")} km</strong>
        </p>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Sightseeing km are local running at that stop, on top of the transfer distance. Leave a
        leg blank to skip it. Point-to-point transfers need no legs at all.
      </p>
    </div>
  );
}
