"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, TextArea } from "@/components/ui";

type Tour = {
  name: string;
  startPlace: string;
  nights: number;
  allowanceKm: number;
  notes: string | null;
  active: boolean;
};

export function TourForm({
  action,
  tour,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  tour?: Tour;
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
          label="Tour name"
          name="name"
          required
          placeholder="e.g. Munnar, Thekkady & Alleppey — 4 nights"
          defaultValue={tour?.name}
          hint="What an agent picks it by. Include the duration — the same route at two lengths is two tours."
          error={err.name}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Starts at"
            name="startPlace"
            required
            placeholder="e.g. Cochin International Airport"
            defaultValue={tour?.startPlace}
            hint="Day 1 runs from here."
            error={err.startPlace}
          />
          <Field
            label="Nights"
            name="nights"
            type="number"
            min={1}
            required
            defaultValue={tour?.nights ?? ""}
            hint="Days = nights + 1. Changing this adds or removes day rows."
            error={err.nights}
          />
          <Field
            label="Kilometre allowance"
            name="allowanceKm"
            type="number"
            min={1}
            required
            defaultValue={tour?.allowanceKm ?? ""}
            /*
             * The hint states what the number IS, because it is the one field
             * here that decides money. It is Sonet's commercial figure — the
             * round one he already quotes — not something measured, and the
             * screen should not let anyone think the system will correct it.
             */
            hint="Your figure for the whole trip, including sightseeing at each stop — e.g. 650. This is what the hire is priced on and what the quote states."
            error={err.allowanceKm}
          />
        </div>

        <TextArea
          label="Internal notes"
          name="notes"
          defaultValue={tour?.notes ?? ""}
          hint="Shown to agents when they pick the tour. Never on the customer's document."
          error={err.notes}
        />

        <Checkbox label="Active" name="active" defaultChecked={tour?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
