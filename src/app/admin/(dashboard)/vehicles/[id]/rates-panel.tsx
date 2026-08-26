"use client";

import { useState } from "react";
import { formatMinor } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { VEHICLE_RATE_TYPE_LABEL, type VehicleRateType } from "@/lib/enums";
import { Badge, Button, EmptyState, Table, Td } from "@/components/ui";
import { VehicleRateForm, type VehicleRateValues } from "./rate-form";
import type { FormState } from "@/lib/validation";

export type RateRow = VehicleRateValues & { id: string };

export function RatesPanel({
  rates,
  createAction,
  updateAction,
  archiveAction,
  restoreAction,
}: {
  rates: RateRow[];
  createAction: (prev: FormState, fd: FormData) => Promise<FormState>;
  updateAction: (id: string, prev: FormState, fd: FormData) => Promise<FormState>;
  archiveAction: (id: string) => Promise<void>;
  restoreAction: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = rates.find((r) => r.id === editingId);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Rates</h2>
          <p className="text-sm text-slate-500">
            Per-day, per-km, and flat transfer rates can all coexist for the same vehicle.
          </p>
        </div>
        {!adding && !editing && (
          <Button tone="secondary" onClick={() => setAdding(true)}>
            Add rate
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4">
          <VehicleRateForm action={createAction} submitLabel="Add rate" onDone={() => setAdding(false)} />
          <button type="button" onClick={() => setAdding(false)} className="mt-2 text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <VehicleRateForm
            action={updateAction.bind(null, editing.id)}
            rate={editing}
            submitLabel="Save rate"
            onDone={() => setEditingId(null)}
          />
          <button type="button" onClick={() => setEditingId(null)} className="mt-2 text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      )}

      {rates.length === 0 ? (
        <EmptyState title="No rates yet" hint="Agents cannot quote this vehicle until it has at least one rate." />
      ) : (
        <Table head={["Rate type", "Season", "Kerala", "Outside Kerala", "Per-day extras", ""]}>
          {rates.map((r) => (
            <tr key={r.id} className={r.active ? undefined : "bg-slate-50 text-slate-400"}>
              <Td>
                <span className="font-medium text-slate-900">
                  {VEHICLE_RATE_TYPE_LABEL[r.rateType as VehicleRateType] ?? r.rateType}
                </span>
                {!r.active && (
                  <span className="ml-2">
                    <Badge tone="slate">Archived</Badge>
                  </span>
                )}
              </Td>
              <Td>
                <div>{r.seasonLabel}</div>
                <div className="text-xs text-slate-500">
                  {formatDateOnly(r.validFrom)} → {formatDateOnly(r.validTo)}
                </div>
              </Td>
              <Td className="font-medium whitespace-nowrap">{formatMinor(r.rateKeralaMinor)}</Td>
              <Td className="font-medium whitespace-nowrap">{formatMinor(r.rateOutsideKeralaMinor)}</Td>
              <Td className="text-xs">
                {r.rateType === "PER_DAY" ? (
                  <>
                    <div>{r.includedKmPerDay ? `${r.includedKmPerDay} km/day` : "no km allowance"}</div>
                    {r.extraKmRateMinor && <div className="text-slate-500">+{formatMinor(r.extraKmRateMinor)}/km</div>}
                    {r.driverAllowanceMinor && (
                      <div className="text-slate-500">bata {formatMinor(r.driverAllowanceMinor)}</div>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </Td>
              <Td className="text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(r.id);
                  }}
                  className="text-sm text-blue-700 hover:underline"
                >
                  Edit
                </button>
                <span className="mx-2 text-slate-300">·</span>
                {r.active ? (
                  <button type="button" onClick={() => archiveAction(r.id)} className="text-sm text-red-700 hover:underline">
                    Archive
                  </button>
                ) : (
                  <button type="button" onClick={() => restoreAction(r.id)} className="text-sm text-emerald-700 hover:underline">
                    Restore
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
