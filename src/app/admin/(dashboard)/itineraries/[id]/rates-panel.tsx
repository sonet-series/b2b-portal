"use client";

import { useState } from "react";
import { formatMinor } from "@/lib/money";
import { formatDateDisplay } from "@/lib/dates";
import { ITINERARY_PRICING_MODE_LABEL, type ItineraryPricingMode } from "@/lib/enums";
import { Badge, Button, EmptyState, Table, Td } from "@/components/ui";
import { ItineraryRateForm, type ItineraryRateValues } from "./rate-form";
import type { FormState } from "@/lib/validation";
import { applyMarkup } from "@/lib/markup";
import type { ProductMarkup } from "@/components/sell-preview";
import type { AgentTier } from "@/lib/enums";

export type RateRow = ItineraryRateValues & { id: string };

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
      productType: "itinerary",
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
          <h2 className="text-base font-semibold text-slate-900">Pricing</h2>
          <p className="text-sm text-slate-500">
            One row per season and pricing mode. A package sold both ways in the same season gets
            two rows — agents then see two priced options.
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
          <ItineraryRateForm action={createAction} submitLabel="Add rate" markup={markup} onDone={() => setAdding(false)} />
          <button type="button" onClick={() => setAdding(false)} className="mt-2 text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <ItineraryRateForm
            action={updateAction.bind(null, editing.id)}
            rate={editing}
            submitLabel="Save rate" markup={markup}
            onDone={() => setEditingId(null)}
          />
          <button type="button" onClick={() => setEditingId(null)} className="mt-2 text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      )}

      {rates.length === 0 ? (
        <EmptyState title="No pricing yet" hint="Agents cannot quote this package until it has at least one rate." />
      ) : (
        <Table head={["Pricing mode", "Season", "Cost", "Kerala", "Outside Kerala", "Details", ""]}>
          {rates.map((r) => {
            const perPerson = r.pricingMode === "PER_PERSON_TWIN_SHARING";
            return (
              <tr key={r.id} className={r.active ? undefined : "bg-slate-50 text-slate-400"}>
                <Td>
                  <Badge tone={perPerson ? "green" : "blue"}>
                    {ITINERARY_PRICING_MODE_LABEL[r.pricingMode as ItineraryPricingMode] ?? r.pricingMode}
                  </Badge>
                  {!r.active && (
                    <span className="ml-2">
                      <Badge tone="slate">Archived</Badge>
                    </span>
                  )}
                </Td>
                <Td>
                  <div>{r.seasonLabel}</div>
                  <div className="text-xs text-slate-500">
                    {formatDateDisplay(r.validFrom)} → {formatDateDisplay(r.validTo)}
                  </div>
                </Td>
                <Td className="font-medium whitespace-nowrap">
                  {formatMinor(sell(r.costMinor, "KERALA"))}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    {perPerson ? "/ person" : "flat"}
                  </span>
                </Td>
                <Td className="font-medium whitespace-nowrap">
                  {formatMinor(sell(r.costMinor, "OUTSIDE_KERALA"))}
                </Td>
                <Td className="text-xs">
                  {perPerson ? (
                    r.singleSupplementCostMinor ? (
                      <div>
                        single +{formatMinor(sell(r.singleSupplementCostMinor, "KERALA"))} /{" "}
                        {formatMinor(sell(r.singleSupplementCostMinor, "OUTSIDE_KERALA"))}
                      </div>
                    ) : (
                      <span className="text-amber-700">no single supplement</span>
                    )
                  ) : r.maxPax ? (
                    <div>max {r.maxPax} pax</div>
                  ) : (
                    <div className="text-slate-500">no pax limit</div>
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
            );
          })}
        </Table>
      )}
    </section>
  );
}
