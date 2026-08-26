"use client";

import { useState } from "react";
import { formatMinor } from "@/lib/money";
import { formatDateDisplay } from "@/lib/dates";
import { MEAL_PLAN_LABEL, type MealPlan } from "@/lib/enums";
import { Badge, Button, EmptyState, Table, Td } from "@/components/ui";
import { HotelRateForm, type HotelRateValues } from "./rate-form";
import type { FormState } from "@/lib/validation";
import { applyMarkup } from "@/lib/markup";
import type { ProductMarkup } from "@/components/sell-preview";
import type { AgentTier } from "@/lib/enums";

export type RateRow = HotelRateValues & { id: string };

/**
 * Rates are managed inline on the hotel page rather than on their own routes.
 * Entering a season's rates is the bulk of the data-entry work, and bouncing
 * through a separate page per rate makes that materially slower.
 */
export function RatesPanel({
  rates,
  createAction,
  updateAction,
  archiveAction,
  restoreAction,
  markup,
}: {
  rates: RateRow[];
  createAction: (prev: FormState, fd: FormData) => Promise<FormState>;
  updateAction: (id: string, prev: FormState, fd: FormData) => Promise<FormState>;
  archiveAction: (id: string) => Promise<void>;
  restoreAction: (id: string) => Promise<void>;
  markup: ProductMarkup;
}) {
  // Sell prices are never stored; the panel derives them the same way a quote
  // does, so what Sonet sees here is what an agent would be charged.
  const sell = (costMinor: number, tier: AgentTier) =>
    applyMarkup(costMinor, {
      productType: "hotel",
      tier,
      ...(tier === "KERALA" ? markup.kerala : markup.outsideKerala),
    });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = rates.find((r) => r.id === editingId);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Rates</h2>
          <p className="text-sm text-slate-500">
            Default prices. A per-agent override replaces these; without one, these apply.
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
          <HotelRateForm
            action={createAction}
            submitLabel="Add rate" markup={markup}
            onDone={() => setAdding(false)}
          />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <HotelRateForm
            action={updateAction.bind(null, editing.id)}
            rate={editing}
            submitLabel="Save rate" markup={markup}
            onDone={() => setEditingId(null)}
          />
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="mt-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

      {rates.length === 0 ? (
        <EmptyState
          title="No rates yet"
          hint="Agents cannot quote this hotel until it has at least one rate."
        />
      ) : (
        <Table head={["Room type", "Meal plan", "Season", "Cost", "Kerala", "Outside Kerala", "Extra bed", ""]}>
          {rates.map((r) => (
            <tr key={r.id} className={r.active ? undefined : "bg-slate-50 text-slate-400"}>
              <Td>
                <span className="font-medium text-slate-900">{r.roomType}</span>
                {!r.active && (
                  <span className="ml-2">
                    <Badge tone="slate">Archived</Badge>
                  </span>
                )}
              </Td>
              <Td>{MEAL_PLAN_LABEL[r.mealPlan as MealPlan] ?? r.mealPlan}</Td>
              <Td>
                <div>{r.seasonLabel}</div>
                <div className="text-xs text-slate-500">
                  {formatDateDisplay(r.validFrom)} → {formatDateDisplay(r.validTo)}
                </div>
              </Td>
              <Td className="whitespace-nowrap text-slate-500">{formatMinor(r.costPerNightMinor)}</Td>
              <Td className="font-medium whitespace-nowrap">{formatMinor(sell(r.costPerNightMinor, "KERALA"))}</Td>
              <Td className="font-medium whitespace-nowrap">{formatMinor(sell(r.costPerNightMinor, "OUTSIDE_KERALA"))}</Td>
              <Td className="text-xs whitespace-nowrap">
                {r.extraBedCostMinor ? (
                  <>
                    <div>{formatMinor(sell(r.extraBedCostMinor, "KERALA"))}</div>
                    <div className="text-slate-500">
                      {formatMinor(sell(r.extraBedCostMinor, "OUTSIDE_KERALA"))} outside
                    </div>
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
                  <button
                    type="button"
                    onClick={() => archiveAction(r.id)}
                    className="text-sm text-red-700 hover:underline"
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => restoreAction(r.id)}
                    className="text-sm text-emerald-700 hover:underline"
                  >
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
