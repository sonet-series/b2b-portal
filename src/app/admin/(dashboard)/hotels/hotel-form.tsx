"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, TextArea } from "@/components/ui";

type Hotel = {
  name: string;
  location: string;
  starCategory: number | null;
  notes: string | null;
  active: boolean;
};

export function HotelForm({
  action,
  hotel,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hotel?: Hotel;
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
            label="Hotel name"
            name="name"
            required
            defaultValue={hotel?.name}
            error={err.name}
          />
          <Field
            label="Location"
            name="location"
            required
            placeholder="Munnar"
            defaultValue={hotel?.location}
            error={err.location}
          />
          <Field
            label="Star category"
            name="starCategory"
            type="number"
            min={1}
            max={7}
            defaultValue={hotel?.starCategory ?? ""}
            hint="Optional"
            error={err.starCategory}
          />
        </div>

        <TextArea
          label="Internal notes"
          name="notes"
          defaultValue={hotel?.notes ?? ""}
          hint="Never shown to agents."
          error={err.notes}
        />

        <Checkbox
          label="Active"
          name="active"
          defaultChecked={hotel?.active ?? true}
          hint="Inactive hotels are hidden from agent quotes but keep their history."
        />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
