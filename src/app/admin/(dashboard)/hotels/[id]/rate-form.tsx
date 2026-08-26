"use client";

import { useActionState, useState } from "react";
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
import { DateField } from "@/components/date-field";
import { SellPreview, type ProductMarkup } from "@/components/sell-preview";

export type HotelRateValues = {
  roomType: string;
  mealPlan: string;
  seasonLabel: string;
  validFrom: Date;
  validTo: Date;
  costPerNightMinor: number;
  extraBedCostMinor: number | null;
  active: boolean;
};

const MEAL_OPTIONS = MEAL_PLAN.map((m) => ({ value: m, label: MEAL_PLAN_LABEL[m] }));

export function HotelRateForm({
  action,
  rate,
  submitLabel,
  onDone,
  markup,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  rate?: HotelRateValues;
  submitLabel: string;
  onDone?: () => void;
  markup: ProductMarkup;
}) {
  // Tracked so the preview updates as Sonet types, before anything is saved.
  const [cost, setCost] = useState(rate ? String(toMajor(rate.costPerNightMinor)) : "");
  const [extraBed, setExtraBed] = useState(
    rate?.extraBedCostMinor ? String(toMajor(rate.extraBedCostMinor)) : ""
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
            Cost per night — what the hotel charges us
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              label="Cost per night"
              name="costPerNightMinor"
              required
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              hint="Net rate from the hotel. Agent prices are derived from this."
              error={err.costPerNightMinor}
            />
          </div>
          <div className="mt-3">
            <SellPreview costInput={cost} kerala={markup.kerala} outsideKerala={markup.outsideKerala} />
          </div>
        </div>

        <div className="rounded-md bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Extra bed — optional, same hotel markup
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              label="Extra bed cost"
              name="extraBedCostMinor"
              value={extraBed}
              onChange={(e) => setExtraBed(e.target.value)}
              hint="Leave blank if no extra bed is offered."
              error={err.extraBedCostMinor}
            />
          </div>
          {extraBed.trim() !== "" && (
            <div className="mt-3">
              <SellPreview
                costInput={extraBed}
                kerala={markup.kerala}
                outsideKerala={markup.outsideKerala}
                label="Extra bed"
              />
            </div>
          )}
        </div>

        <Checkbox label="Active" name="active" defaultChecked={rate?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
