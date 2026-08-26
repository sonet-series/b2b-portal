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

export type ItineraryRateValues = {
  pricingMode: string;
  seasonLabel: string;
  validFrom: Date;
  validTo: Date;
  priceKeralaMinor: number;
  priceOutsideKeralaMinor: number;
  singleSupplementKeralaMinor: number | null;
  singleSupplementOutsideKeralaMinor: number | null;
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
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  rate?: ItineraryRateValues;
  submitLabel: string;
  onDone?: () => void;
}) {
  // Twin-sharing prices per head and needs a solo supplement; a flat package
  // price ignores headcount entirely. Showing both sets at once would imply
  // the supplement applies to flat rates, which the schema rejects.
  const [mode, setMode] = useState<ItineraryPricingMode>(
    (rate?.pricingMode as ItineraryPricingMode) ?? "PER_PERSON_TWIN_SHARING"
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
          <Field
            label="Valid from"
            name="validFrom"
            type="date"
            required
            defaultValue={rate ? formatDateOnly(rate.validFrom) : ""}
            error={err.validFrom}
          />
          <Field
            label="Valid to"
            name="validTo"
            type="date"
            required
            defaultValue={rate ? formatDateOnly(rate.validTo) : ""}
            hint="Inclusive."
            error={err.validTo}
          />
        </div>

        <div className="rounded-md bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {ITINERARY_PRICING_MODE_LABEL[mode]}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField
              label={perPerson ? "Kerala — per person" : "Kerala — package price"}
              name="priceKeralaMinor"
              required
              defaultValue={rate ? toMajor(rate.priceKeralaMinor) : ""}
              hint={perPerson ? "On twin sharing." : "Flat, whatever the headcount."}
              error={err.priceKeralaMinor}
            />
            <MoneyField
              label={perPerson ? "Outside Kerala — per person" : "Outside Kerala — package price"}
              name="priceOutsideKeralaMinor"
              required
              defaultValue={rate ? toMajor(rate.priceOutsideKeralaMinor) : ""}
              hint="Both tiers are required."
              error={err.priceOutsideKeralaMinor}
            />

            {perPerson ? (
              <>
                <MoneyField
                  label="Kerala — single supplement"
                  name="singleSupplementKeralaMinor"
                  defaultValue={
                    rate?.singleSupplementKeralaMinor
                      ? toMajor(rate.singleSupplementKeralaMinor)
                      : ""
                  }
                  hint="Without it, solo cannot be quoted."
                  error={err.singleSupplementKeralaMinor}
                />
                <MoneyField
                  label="Outside Kerala — single supplement"
                  name="singleSupplementOutsideKeralaMinor"
                  defaultValue={
                    rate?.singleSupplementOutsideKeralaMinor
                      ? toMajor(rate.singleSupplementOutsideKeralaMinor)
                      : ""
                  }
                  hint="Set both or neither."
                  error={err.singleSupplementOutsideKeralaMinor}
                />
              </>
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
        </div>

        <Checkbox label="Active" name="active" defaultChecked={rate?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
