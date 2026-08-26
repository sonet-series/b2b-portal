"use client";

import { useActionState, useState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { VEHICLE_RATE_TYPE, VEHICLE_RATE_TYPE_LABEL, type VehicleRateType } from "@/lib/enums";
import { toMajor } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, MoneyField, Select } from "@/components/ui";

export type VehicleRateValues = {
  rateType: string;
  seasonLabel: string;
  validFrom: Date;
  validTo: Date;
  rateKeralaMinor: number;
  rateOutsideKeralaMinor: number;
  includedKmPerDay: number | null;
  extraKmKeralaMinor: number | null;
  extraKmOutsideKeralaMinor: number | null;
  driverAllowanceKeralaMinor: number | null;
  driverAllowanceOutsideKeralaMinor: number | null;
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
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  rate?: VehicleRateValues;
  submitLabel: string;
  onDone?: () => void;
}) {
  // The km allowance and driver bata only apply to per-day rates; the schema
  // rejects them on the other two, so the form hides them rather than
  // collecting values that would be refused.
  const [rateType, setRateType] = useState<VehicleRateType>(
    (rate?.rateType as VehicleRateType) ?? "PER_DAY"
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
            {VEHICLE_RATE_TYPE_LABEL[rateType]}
          </p>

          <div className="grid gap-4 sm:grid-cols-4">
            <MoneyField
              label="Kerala rate"
              name="rateKeralaMinor"
              required
              defaultValue={rate ? toMajor(rate.rateKeralaMinor) : ""}
              hint={RATE_UNIT[rateType]}
              error={err.rateKeralaMinor}
            />
            <MoneyField
              label="Outside-Kerala rate"
              name="rateOutsideKeralaMinor"
              required
              defaultValue={rate ? toMajor(rate.rateOutsideKeralaMinor) : ""}
              hint="Both tiers are required."
              error={err.rateOutsideKeralaMinor}
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
                  label="Kerala — extra km"
                  name="extraKmKeralaMinor"
                  defaultValue={rate?.extraKmKeralaMinor ? toMajor(rate.extraKmKeralaMinor) : ""}
                  hint="Beyond the allowance."
                  error={err.extraKmKeralaMinor}
                />
                <MoneyField
                  label="Outside Kerala — extra km"
                  name="extraKmOutsideKeralaMinor"
                  defaultValue={
                    rate?.extraKmOutsideKeralaMinor ? toMajor(rate.extraKmOutsideKeralaMinor) : ""
                  }
                  hint="Set both or neither."
                  error={err.extraKmOutsideKeralaMinor}
                />
                <MoneyField
                  label="Kerala — driver allowance"
                  name="driverAllowanceKeralaMinor"
                  defaultValue={
                    rate?.driverAllowanceKeralaMinor ? toMajor(rate.driverAllowanceKeralaMinor) : ""
                  }
                  hint="Bata / night halt, per day."
                  error={err.driverAllowanceKeralaMinor}
                />
                <MoneyField
                  label="Outside Kerala — driver allowance"
                  name="driverAllowanceOutsideKeralaMinor"
                  defaultValue={
                    rate?.driverAllowanceOutsideKeralaMinor
                      ? toMajor(rate.driverAllowanceOutsideKeralaMinor)
                      : ""
                  }
                  hint="Set both or neither."
                  error={err.driverAllowanceOutsideKeralaMinor}
                />
              </>
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
