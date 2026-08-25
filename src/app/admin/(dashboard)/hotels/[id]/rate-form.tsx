"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { MEAL_PLAN, MEAL_PLAN_LABEL } from "@/lib/enums";
import { toMajor } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import {
  Button,
  Card,
  Checkbox,
  Field,
  FormError,
  FormSuccess,
  MoneyField,
  Select,
} from "@/components/ui";

export type HotelRateValues = {
  roomType: string;
  mealPlan: string;
  seasonLabel: string;
  validFrom: Date;
  validTo: Date;
  ratePerNightMinor: number;
  extraBedRateMinor: number | null;
  active: boolean;
};

const MEAL_OPTIONS = MEAL_PLAN.map((m) => ({ value: m, label: MEAL_PLAN_LABEL[m] }));

export function HotelRateForm({
  action,
  rate,
  submitLabel,
  onDone,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  rate?: HotelRateValues;
  submitLabel: string;
  onDone?: () => void;
}) {
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
          <Field
            label="Room type"
            name="roomType"
            required
            placeholder="Deluxe"
            defaultValue={rate?.roomType}
            error={err.roomType}
          />
          <Select
            label="Meal plan"
            name="mealPlan"
            required
            options={MEAL_OPTIONS}
            defaultValue={rate?.mealPlan ?? "CP"}
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
            hint="Shown on the quote."
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

        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField
            label="Rate per night"
            name="ratePerNightMinor"
            required
            defaultValue={rate ? toMajor(rate.ratePerNightMinor) : ""}
            error={err.ratePerNightMinor}
          />
          <MoneyField
            label="Extra bed rate"
            name="extraBedRateMinor"
            defaultValue={rate?.extraBedRateMinor ? toMajor(rate.extraBedRateMinor) : ""}
            hint="Optional, per night."
            error={err.extraBedRateMinor}
          />
        </div>

        <Checkbox label="Active" name="active" defaultChecked={rate?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
