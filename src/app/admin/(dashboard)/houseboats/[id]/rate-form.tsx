"use client";

import { useActionState, useState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import {
  MEAL_PLAN,
  MEAL_PLAN_LABEL,
  CRUISE_PACKAGE,
  CRUISE_PACKAGE_LABEL,
  HOUSEBOAT_PRICING_MODE,
  HOUSEBOAT_PRICING_MODE_LABEL,
  type HouseboatPricingMode,
} from "@/lib/enums";
import { toMajor } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, MoneyField, Select } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { SellPreview, type ProductMarkup } from "@/components/sell-preview";

export type HouseboatRateValues = {
  cruisePackage: string;
  pricingMode: string;
  mealPlan: string;
  seasonLabel: string;
  validFrom: Date;
  validTo: Date;
  costMinor: number;
  includedPax: number | null;
  extraPaxCostMinor: number | null;
  minPax: number | null;
  maxPax: number;
  active: boolean;
};

const MEAL_OPTIONS = MEAL_PLAN.map((m) => ({ value: m, label: MEAL_PLAN_LABEL[m] }));
const PACKAGE_OPTIONS = CRUISE_PACKAGE.map((c) => ({ value: c, label: CRUISE_PACKAGE_LABEL[c] }));
const MODE_OPTIONS = HOUSEBOAT_PRICING_MODE.map((m) => ({
  value: m,
  label: HOUSEBOAT_PRICING_MODE_LABEL[m],
}));

export function HouseboatRateForm({
  action,
  rate,
  submitLabel,
  onDone,
  markup,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  rate?: HouseboatRateValues;
  submitLabel: string;
  onDone?: () => void;
  markup: ProductMarkup;
}) {
  // The mode decides which price fields mean anything. Switching it swaps the
  // fields rather than showing all of them greyed out — the irrelevant ones
  // are rejected by the schema anyway, so showing them only invites errors.
  const [mode, setMode] = useState<HouseboatPricingMode>(
    (rate?.pricingMode as HouseboatPricingMode) ?? "WHOLE_BOAT"
  );

  const [cost, setCost] = useState(rate ? String(toMajor(rate.costMinor)) : "");
  const [extraPax, setExtraPax] = useState(
    rate?.extraPaxCostMinor ? String(toMajor(rate.extraPaxCostMinor)) : ""
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

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Cruise package"
            name="cruisePackage"
            required
            options={PACKAGE_OPTIONS}
            defaultValue={rate?.cruisePackage ?? "OVERNIGHT_22HR"}
            error={err.cruisePackage}
          />
          <Select
            label="Pricing mode"
            name="pricingMode"
            required
            options={MODE_OPTIONS}
            value={mode}
            onChange={(e) => setMode(e.target.value as HouseboatPricingMode)}
            hint="Set per duration — a boat can sell whole-boat overnight and per-person on a day cruise."
            error={err.pricingMode}
          />
          <Select
            label="Meal plan"
            name="mealPlan"
            required
            options={MEAL_OPTIONS}
            defaultValue={rate?.mealPlan ?? "AP"}
            error={err.mealPlan}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
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
            {mode === "WHOLE_BOAT" ? "Whole-boat cost" : "Per-person cost"}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField
              label={mode === "WHOLE_BOAT" ? "Cost per cruise" : "Cost per person"}
              name="costMinor"
              required
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              hint="What the operator charges us."
              error={err.costMinor}
            />

            {mode === "WHOLE_BOAT" ? (
              <>
                <Field
                  label="Included pax"
                  name="includedPax"
                  type="number"
                  min={1}
                  required
                  defaultValue={rate?.includedPax ?? ""}
                  hint="Covered by the cost above."
                  error={err.includedPax}
                />
                <MoneyField
                  label="Extra pax cost"
                  name="extraPaxCostMinor"
                  value={extraPax}
                  onChange={(e) => setExtraPax(e.target.value)}
                  hint="Per person beyond included."
                  error={err.extraPaxCostMinor}
                />
              </>
            ) : (
              <Field
                label="Minimum pax"
                name="minPax"
                type="number"
                min={1}
                defaultValue={rate?.minPax ?? ""}
                hint="Smaller parties are quoted at this count."
                error={err.minPax}
              />
            )}

            <Field
              label="Maximum pax"
              name="maxPax"
              type="number"
              min={1}
              required
              defaultValue={rate?.maxPax ?? ""}
              hint="Boat capacity."
              error={err.maxPax}
            />
          </div>

          <div className="mt-3 space-y-1">
            <SellPreview costInput={cost} kerala={markup.kerala} outsideKerala={markup.outsideKerala} />
            {mode === "WHOLE_BOAT" && extraPax.trim() !== "" && (
              <SellPreview
                costInput={extraPax}
                kerala={markup.kerala}
                outsideKerala={markup.outsideKerala}
                label="Extra pax"
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
