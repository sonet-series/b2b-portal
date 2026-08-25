"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, TextArea } from "@/components/ui";

type Itinerary = {
  name: string;
  durationNights: number;
  routeSummary: string | null;
  inclusions: string | null;
  exclusions: string | null;
  active: boolean;
};

export function ItineraryForm({
  action,
  itinerary,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  itinerary?: Itinerary;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const err = state.errors ?? {};

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field
              label="Package name"
              name="name"
              required
              placeholder="5N/6D Munnar – Thekkady – Alleppey"
              defaultValue={itinerary?.name}
              error={err.name}
            />
          </div>
          <Field
            label="Nights"
            name="durationNights"
            type="number"
            min={0}
            required
            defaultValue={itinerary?.durationNights ?? ""}
            error={err.durationNights}
          />
        </div>

        <TextArea
          label="Route summary"
          name="routeSummary"
          rows={4}
          defaultValue={itinerary?.routeSummary ?? ""}
          hint="Day by day. Shown to agents."
          error={err.routeSummary}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="Inclusions" name="inclusions" defaultValue={itinerary?.inclusions ?? ""} error={err.inclusions} />
          <TextArea label="Exclusions" name="exclusions" defaultValue={itinerary?.exclusions ?? ""} error={err.exclusions} />
        </div>

        <Checkbox label="Active" name="active" defaultChecked={itinerary?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
