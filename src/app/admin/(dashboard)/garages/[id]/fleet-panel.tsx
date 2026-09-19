"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, FormError, FormSuccess, Badge } from "@/components/ui";

type Row = { id: string; type: string; capacity: number; hasRates: boolean; here: boolean };

/**
 * Which vehicles this garage holds.
 *
 * Not every garage keeps every vehicle. An agent picks the garage first and is
 * then offered only what can genuinely be sent from it, so a 26-seat coach
 * that lives at Cochin cannot be quoted out of Trivandrum.
 */
export function FleetPanel({
  action,
  vehicles,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  vehicles: Row[];
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Vehicles at this garage</h2>
      <p className="mt-1 text-sm text-slate-500">
        Agents quoting from this garage see only what is ticked here.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        {vehicles.length === 0 ? (
          <p className="text-sm text-slate-500">
            No vehicles in the catalogue yet. Add one under Vehicles first.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md ring-1 ring-inset ring-slate-200">
            {vehicles.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  name="vehicleIds"
                  value={v.id}
                  defaultChecked={v.here}
                  id={`veh-${v.id}`}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <label htmlFor={`veh-${v.id}`} className="flex-1 text-sm text-slate-900">
                  {v.type}
                  <span className="ml-2 text-slate-500">{v.capacity} seats</span>
                </label>
                {!v.hasRates && <Badge tone="amber">No rates</Badge>}
              </li>
            ))}
          </ul>
        )}

        <Button type="submit" disabled={pending || vehicles.length === 0}>
          {pending ? "Saving…" : "Save fleet"}
        </Button>
      </form>
    </Card>
  );
}
