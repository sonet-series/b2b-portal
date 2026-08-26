"use client";

import { useActionState, useState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { VEHICLE_RATE_TYPE, VEHICLE_RATE_TYPE_LABEL, type VehicleRateType } from "@/lib/enums";
import { toMajor } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, MoneyField, Select } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { SellPreview, type ProductMarkup } from "@/components/sell-preview";

export type VehicleRateValues = {
  rateType: string;
  seasonLabel: string;
  validFrom: Date;
  validTo: Date;
  costMinor: number;
  includedKmPerDay: number | null;
  extraKmCostMinor: number | null;
  driverAllowanceCostMinor: number | null;
  active: boolean;
};

const TYPE_OPTIONS = VEHICLE_RATE_TYPE.map((t) => ({ value: t, label: VEHICLE_RATE_TYPE_LABEL[t] }));

const RATE_UNIT: Record<VehicleRateType, string> = {
  PER_KM: "Per kilometre.",
  PER_DAY: "Per day, including the km allowance below.",
  TRANSFER: "Flat, point to point.",
};

export function VehicleRateForm({
  action,
  rate,
  submitLabel,
  onDone,
  markup,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  rate?: VehicleRateValues;
  submitLabel: string;
  onDone?: () => void;
  markup: ProductMarkup;
}) {
  // The km allowance and driver bata only apply to per-day rates; the schema
  // rejects them on the other two, so the form hides them rather than
  // collecting values that would be refused.
  const [rateType, setRateType] = useState<VehicleRateType>(
    (rate?.rateType as VehicleRateType) ?? "PER_DAY"
  );

  const [cost, setCost] = useState(rate ? String(toMajor(rate.costMinor)) : "");
  const [extraKm, setExtraKm] = useState(
    rate?.extraKmCostMinor ? String(toMajor(rate.extraKmCostMinor)) : ""
  );
  const [bata, setBata] = useState(
    rate?.driverAllowanceCostMinor ? String(toMajor(rate.driverAllowanceCostMinor)) : ""
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

        <div className="grid gap-4 sm:grid-cols-4">
          <Select
            label="Rate type"
            name="rateType"
            required
            options={TYPE_OPTIONS}
            value={rateType}
            onChange={(e) => setRateType(e.target.value as VehicleRateType)}
            error={err.rateType}
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
            {VEHICLE_RATE_TYPE_LABEL[rateType]} — cost
          </p>

          <div className="grid gap-4 sm:grid-cols-4">
            <MoneyField
              label="Cost"
              name="costMinor"
              required
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              hint={RATE_UNIT[rateType]}
              error={err.costMinor}
            />

            {rateType === "PER_DAY" && (
              <>
                <Field
                  label="Included km / day"
                  name="includedKmPerDay"
                  type="number"
                  min={1}
                  defaultValue={rate?.includedKmPerDay ?? ""}
                  hint="Before extra-km billing."
                  error={err.includedKmPerDay}
                />
                <MoneyField
                  label="Extra km cost"
                  name="extraKmCostMinor"
                  value={extraKm}
                  onChange={(e) => setExtraKm(e.target.value)}
                  hint="Beyond the allowance."
                  error={err.extraKmCostMinor}
                />
                <MoneyField
                  label="Driver allowance cost"
                  name="driverAllowanceCostMinor"
                  value={bata}
                  onChange={(e) => setBata(e.target.value)}
                  hint="Bata / night halt, per day."
                  error={err.driverAllowanceCostMinor}
                />
              </>
            )}
          </div>

          <div className="mt-3 space-y-1">
            <SellPreview costInput={cost} kerala={markup.kerala} outsideKerala={markup.outsideKerala} />
            {rateType === "PER_DAY" && extraKm.trim() !== "" && (
              <SellPreview costInput={extraKm} kerala={markup.kerala} outsideKerala={markup.outsideKerala} label="Extra km" />
            )}
            {rateType === "PER_DAY" && bata.trim() !== "" && (
              <SellPreview costInput={bata} kerala={markup.kerala} outsideKerala={markup.outsideKerala} label="Driver allowance" />
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
