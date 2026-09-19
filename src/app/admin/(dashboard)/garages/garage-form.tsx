"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Checkbox, Field, FormError, FormSuccess } from "@/components/ui";

type Garage = { name: string; address: string; active: boolean };

export function GarageForm({
  action,
  garage,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  garage?: Garage;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const err = state.errors ?? {};

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <Field
          label="Depot name"
          name="name"
          required
          placeholder="Cochin"
          defaultValue={garage?.name}
          hint="What agents see in the depot list."
          error={err.name}
        />

        <Field
          label="Address"
          name="address"
          required
          placeholder="Series Tours, NH 66, Edappally, Kochi, Kerala 682024"
          defaultValue={garage?.address}
          hint="Every hire from this depot is measured from here, so be specific — a bare town name can resolve anywhere in the district."
          error={err.address}
        />

        <Checkbox label="Active" name="active" defaultChecked={garage?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
