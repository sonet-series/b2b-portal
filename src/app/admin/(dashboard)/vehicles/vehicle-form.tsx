"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, TextArea } from "@/components/ui";

type Vehicle = { type: string; capacity: number; notes: string | null; active: boolean };

export function VehicleForm({
  action,
  vehicle,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  vehicle?: Vehicle;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const err = state.errors ?? {};

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Vehicle type"
            name="type"
            required
            placeholder="Innova Crysta"
            defaultValue={vehicle?.type}
            error={err.type}
          />
          <Field
            label="Capacity"
            name="capacity"
            type="number"
            min={1}
            required
            defaultValue={vehicle?.capacity ?? ""}
            hint="Seats, excluding driver."
            error={err.capacity}
          />
        </div>

        <TextArea
          label="Internal notes"
          name="notes"
          defaultValue={vehicle?.notes ?? ""}
          hint="Never shown to agents."
          error={err.notes}
        />

        <Checkbox label="Active" name="active" defaultChecked={vehicle?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
