"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Checkbox, Field, FormError, FormSuccess } from "@/components/ui";

type Garage = { name: string; address: string; state: string; active: boolean };

export function GarageForm({
  action,
  garage,
  submitLabel,
  states,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  garage?: Garage;
  submitLabel: string;
  /** Every state the destination list knows about. */
  states: string[];
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

        <div className="w-64">
          <label htmlFor="state" className="mb-1 block text-sm font-medium text-slate-700">
            State
          </label>
          <select
            id="state"
            name="state"
            defaultValue={garage?.state ?? "Kerala"}
            className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300"
          >
            {states.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Home for any hire from here. A trip that stays in this state pays no interstate
            permit; one that leaves it does.
          </p>
        </div>

        <Checkbox label="Active" name="active" defaultChecked={garage?.active ?? true} />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
