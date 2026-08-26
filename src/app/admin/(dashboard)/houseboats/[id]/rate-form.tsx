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

export type HouseboatRateValues = {
  cruisePackage: string;
  pricingMode: string;
  mealPlan: string;
  seasonLabel: string;
  validFrom: Date;
  validTo: Date;
  rateKeralaMinor: number;
  rateOutsideKeralaMinor: number;
  includedPax: number | null;
  extraPaxKeralaMinor: number | null;
  extraPaxOutsideKeralaMinor: number | null;
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
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  rate?: HouseboatRateValues;
  submitLabel: string;
  onDone?: () => void;
}) {
  // The mode decides which price fields mean anything. Switching it swaps the
  // fields rather than showing all of them greyed out — the irrelevant ones
  // are rejected by the schema anyway, so showing them only invites errors.
  const [mode, setMode] = useState<HouseboatPricingMode>(
    (rate?.pricingMode as HouseboatPricingMode) ?? "WHOLE_BOAT"
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
            {mode === "WHOLE_BOAT" ? "Whole-boat pricing" : "Per-person pricing"}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField
              label={`Kerala — ${mode === "WHOLE_BOAT" ? "per cruise" : "per person"}`}
              name="rateKeralaMinor"
              required
              defaultValue={rate ? toMajor(rate.rateKeralaMinor) : ""}
              hint={mode === "WHOLE_BOAT" ? "Whole boat, one cruise." : "One person, one cruise."}
              error={err.rateKeralaMinor}
            />
            <MoneyField
              label={`Outside Kerala — ${mode === "WHOLE_BOAT" ? "per cruise" : "per person"}`}
              name="rateOutsideKeralaMinor"
              required
              defaultValue={rate ? toMajor(rate.rateOutsideKeralaMinor) : ""}
              hint="Both tiers are required."
              error={err.rateOutsideKeralaMinor}
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
                  hint="Covered by the rate above."
                  error={err.includedPax}
                />
                <MoneyField
                  label="Kerala — extra pax"
                  name="extraPaxKeralaMinor"
                  defaultValue={rate?.extraPaxKeralaMinor ? toMajor(rate.extraPaxKeralaMinor) : ""}
                  hint="Per person beyond included."
                  error={err.extraPaxKeralaMinor}
                />
                <MoneyField
                  label="Outside Kerala — extra pax"
                  name="extraPaxOutsideKeralaMinor"
                  defaultValue={
                    rate?.extraPaxOutsideKeralaMinor ? toMajor(rate.extraPaxOutsideKeralaMinor) : ""
                  }
                  hint="Set both or neither."
                  error={err.extraPaxOutsideKeralaMinor}
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
        </div>

        <Checkbox label="Active" name="active" defaultChecked={rate?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
