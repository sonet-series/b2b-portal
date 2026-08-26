"use client";

import { useActionState, useState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import {
  ITINERARY_PRICING_MODE,
  ITINERARY_PRICING_MODE_LABEL,
  type ItineraryPricingMode,
} from "@/lib/enums";
import { toMajor } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, MoneyField, Select } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { SellPreview, type ProductMarkup } from "@/components/sell-preview";

export type ItineraryRateValues = {
  pricingMode: string;
  seasonLabel: string;
  validFrom: Date;
  validTo: Date;
  costMinor: number;
  singleSupplementCostMinor: number | null;
  maxPax: number | null;
  active: boolean;
};

const MODE_OPTIONS = ITINERARY_PRICING_MODE.map((m) => ({
  value: m,
  label: ITINERARY_PRICING_MODE_LABEL[m],
}));

export function ItineraryRateForm({
  action,
  rate,
  submitLabel,
  onDone,
  markup,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  rate?: ItineraryRateValues;
  submitLabel: string;
  onDone?: () => void;
  markup: ProductMarkup;
}) {
  // Twin-sharing prices per head and needs a solo supplement; a flat package
  // price ignores headcount entirely. Showing both sets at once would imply
  // the supplement applies to flat rates, which the schema rejects.
  const [mode, setMode] = useState<ItineraryPricingMode>(
    (rate?.pricingMode as ItineraryPricingMode) ?? "PER_PERSON_TWIN_SHARING"
  );

  const [cost, setCost] = useState(rate ? String(toMajor(rate.costMinor)) : "");
  const [supplement, setSupplement] = useState(
    rate?.singleSupplementCostMinor ? String(toMajor(rate.singleSupplementCostMinor)) : ""
  );

  const [state, formAction, pending] = useActionState(
    async (prev: FormState, fd: FormData) => {
      const next = await action(prev, fd);
      if (next.ok) onDone?.();
      return next;
    },
    EMPTY_FORM_STATE
  );
  const err = state.errors ?? {};
  const perPerson = mode === "PER_PERSON_TWIN_SHARING";

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-4">
          <Select
            label="Pricing mode"
            name="pricingMode"
            required
            options={MODE_OPTIONS}
            value={mode}
            onChange={(e) => setMode(e.target.value as ItineraryPricingMode)}
            error={err.pricingMode}
          />
          <Field
            label="Season label"
            name="seasonLabel"
            required
            placeholder="Peak"
            defaultValue={rate?.seasonLabel}
            error={err.seasonLabel}
          />
          <DateField
            label="Valid from"
            name="validFrom"
            
            required
            defaultValue={rate ? formatDateOnly(rate.validFrom) : ""}
            error={err.validFrom}
          />
          <DateField
            label="Valid to"
            name="validTo"
            
            required
            defaultValue={rate ? formatDateOnly(rate.validTo) : ""}
            hint="Inclusive."
            error={err.validTo}
          />
        </div>

        <div className="rounded-md bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {ITINERARY_PRICING_MODE_LABEL[mode]} — cost
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField
              label={perPerson ? "Cost per person" : "Package cost"}
              name="costMinor"
              required
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              hint={perPerson ? "On twin sharing." : "Flat, whatever the headcount."}
              error={err.costMinor}
            />

            {perPerson ? (
              <MoneyField
                label="Single supplement cost"
                name="singleSupplementCostMinor"
                value={supplement}
                onChange={(e) => setSupplement(e.target.value)}
                hint="Without it, solo cannot be quoted."
                error={err.singleSupplementCostMinor}
              />
            ) : (
              <Field
                label="Maximum pax"
                name="maxPax"
                type="number"
                min={1}
                defaultValue={rate?.maxPax ?? ""}
                hint="Optional ceiling. Blank means no limit."
                error={err.maxPax}
              />
            )}
          </div>

          <div className="mt-3 space-y-1">
            <SellPreview costInput={cost} kerala={markup.kerala} outsideKerala={markup.outsideKerala} />
            {perPerson && supplement.trim() !== "" && (
              <SellPreview costInput={supplement} kerala={markup.kerala} outsideKerala={markup.outsideKerala} label="Single supplement" />
            )}
          </div>
        </div>

        <Checkbox label="Active" name="active" defaultChecked={rate?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
