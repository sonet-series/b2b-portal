"use client";

import { useState, useTransition } from "react";
import { updateStagedRow, confirmImport, discardImport } from "../actions";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { MEAL_PLAN, MEAL_PLAN_LABEL } from "@/lib/enums";
import { applyMarkup } from "@/lib/markup";
import { formatMinor, toMinor } from "@/lib/money";
import { Badge, Button, Card, FormError } from "@/components/ui";
import { DateField } from "@/components/date-field";
import type { ProductMarkup } from "@/components/sell-preview";

export type StagedRow = {
  id: string;
  roomType: string;
  mealPlan: string;
  seasonLabel: string;
  validFrom: string;
  validTo: string;
  costInput: string;
  confidence: string;
  issues: string | null;
  included: boolean;
};

const cell =
  "block w-full rounded-md border-0 px-2 py-1.5 text-sm text-slate-900 shadow-sm ring-1 " +
  "ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-blue-600";

/**
 * The review step, which is the point of the whole feature.
 *
 * Nothing here has touched the catalogue. Every row is editable, LOW-confidence
 * rows say why, and both agent-facing prices are shown next to the cost — Sonet
 * confirms against the prices customers will actually be quoted, not a raw
 * number he would have to mark up in his head.
 */
export function ReviewTable({
  rows: initial,
  hotelId,
  importId,
  markup,
}: {
  rows: StagedRow[];
  hotelId: string;
  importId: string;
  markup: ProductMarkup;
}) {
  const [rows, setRows] = useState(initial);
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [pending, start] = useTransition();

  const update = (id: string, patch: Partial<StagedRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const next = { ...row, ...patch };
    start(async () => {
      await updateStagedRow(id, hotelId, importId, {
        roomType: next.roomType,
        mealPlan: next.mealPlan,
        seasonLabel: next.seasonLabel,
        validFrom: next.validFrom,
        validTo: next.validTo,
        costInput: next.costInput,
        included: next.included,
      });
    });
  };

  const sell = (cost: string, tier: "kerala" | "outsideKerala") => {
    if (!/^\d[\d,]*(\.\d{1,2})?$/.test(cost.trim())) return null;
    return applyMarkup(toMinor(cost.trim()), {
      productType: "hotel",
      tier: tier === "kerala" ? "KERALA" : "OUTSIDE_KERALA",
      ...markup[tier],
    });
  };

  const includedCount = rows.filter((r) => r.included).length;
  const lowCount = rows.filter((r) => r.included && r.confidence === "LOW").length;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Use", "Room type", "Meal", "Season", "From", "To", "Cost", "Kerala", "Outside"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const k = sell(row.costInput, "kerala");
              const o = sell(row.costInput, "outsideKerala");
              return (
                <tr key={row.id} className={row.included ? undefined : "bg-slate-50 opacity-60"}>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => update(row.id, { included: e.target.checked })}
                      aria-label="Include this row"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input className={cell} value={row.roomType} onChange={(e) => update(row.id, { roomType: e.target.value })} aria-label="Room type" />
                    {row.confidence === "LOW" && (
                      <div className="mt-1">
                        <Badge tone="amber">Check this</Badge>
                        {row.issues && <p className="mt-1 max-w-56 text-xs text-amber-800">{row.issues}</p>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select className={cell} value={row.mealPlan} onChange={(e) => update(row.id, { mealPlan: e.target.value })} aria-label="Meal plan">
                      {MEAL_PLAN.map((m) => (
                        <option key={m} value={m}>{MEAL_PLAN_LABEL[m]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input className={cell} value={row.seasonLabel} onChange={(e) => update(row.id, { seasonLabel: e.target.value })} aria-label="Season label" />
                  </td>
                  <td className="px-3 py-2 align-top w-40">
                    <DateField label="" name={`from-${row.id}`} defaultValue={row.validFrom} onIsoChange={(iso) => update(row.id, { validFrom: iso })} />
                  </td>
                  <td className="px-3 py-2 align-top w-40">
                    <DateField label="" name={`to-${row.id}`} defaultValue={row.validTo} onIsoChange={(iso) => update(row.id, { validTo: iso })} />
                  </td>
                  <td className="px-3 py-2 align-top w-28">
                    <input className={`${cell} tabular-nums`} inputMode="decimal" value={row.costInput} onChange={(e) => update(row.id, { costInput: e.target.value })} aria-label="Cost per night" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-slate-900">
                    {k === null ? "—" : formatMinor(k)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-slate-900">
                    {o === null ? "—" : formatMinor(o)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card className="mt-4">
        <FormError message={state.ok ? undefined : state.message} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{includedCount}</strong> of {rows.length} rows will be
            added{lowCount > 0 && <> · <span className="text-amber-700">{lowCount} still flagged</span></>}
            {pending && <span className="ml-2 text-xs text-slate-400">saving…</span>}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              tone="danger"
              onClick={() => {
                if (confirm("Discard this import? Nothing will be added.")) {
                  start(async () => { await discardImport(importId, hotelId); });
                }
              }}
            >
              Discard
            </Button>
            <Button
              type="button"
              disabled={pending || includedCount === 0}
              onClick={() =>
                start(async () => {
                  const result = await confirmImport(importId, hotelId, EMPTY_FORM_STATE);
                  if (result) setState(result);
                })
              }
            >
              {pending ? "Importing…" : `Import ${includedCount} rate${includedCount === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
