"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { HOUSEBOAT_CATEGORY } from "@/lib/enums";
import { Button, Card, Checkbox, Field, FormError, FormSuccess, Select, TextArea } from "@/components/ui";

type Houseboat = {
  name: string;
  operator: string | null;
  category: string;
  bedrooms: number;
  location: string;
  amenities: string | null;
  notes: string | null;
  active: boolean;
};

const CATEGORY_OPTIONS = HOUSEBOAT_CATEGORY.map((c) => ({ value: c, label: c }));

export function HouseboatForm({
  action,
  houseboat,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  houseboat?: Houseboat;
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
          <Field label="Houseboat name" name="name" required defaultValue={houseboat?.name} error={err.name} />
          <Field
            label="Operator"
            name="operator"
            defaultValue={houseboat?.operator ?? ""}
            hint="Third-party operator, if we don't run it."
            error={err.operator}
          />
          <Select
            label="Category"
            name="category"
            required
            options={CATEGORY_OPTIONS}
            defaultValue={houseboat?.category ?? "Deluxe"}
            error={err.category}
          />
          <Field
            label="Bedrooms"
            name="bedrooms"
            type="number"
            min={1}
            required
            defaultValue={houseboat?.bedrooms ?? 1}
            error={err.bedrooms}
          />
          <Field
            label="Location"
            name="location"
            required
            placeholder="Alleppey"
            defaultValue={houseboat?.location}
            error={err.location}
          />
        </div>

        <TextArea
          label="Amenities"
          name="amenities"
          defaultValue={houseboat?.amenities ?? ""}
          hint="Agent-visible. e.g. AC bedrooms 9pm–6am, upper deck, sundeck."
          error={err.amenities}
        />
        <TextArea
          label="Internal notes"
          name="notes"
          defaultValue={houseboat?.notes ?? ""}
          hint="Never shown to agents."
          error={err.notes}
        />

        <Checkbox
          label="Active"
          name="active"
          defaultChecked={houseboat?.active ?? true}
          hint="Inactive houseboats are hidden from agent quotes but keep their history."
        />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
