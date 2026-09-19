"use client";

import { useActionState, useState } from "react";
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

  // Controlled, so "all vehicles" is one click rather than one click per row.
  // A main garage usually does hold the whole fleet; the per-garage list earns
  // its keep at the smaller depots, not here.
  const [here, setHere] = useState<Set<string>>(
    () => new Set(vehicles.filter((v) => v.here).map((v) => v.id))
  );
  const allSelected = vehicles.length > 0 && here.size === vehicles.length;

  const toggle = (id: string, on: boolean) =>
    setHere((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

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
          <>
            <label className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) =>
                  setHere(e.target.checked ? new Set(vehicles.map((v) => v.id)) : new Set())
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              All vehicles
              <span className="ml-auto font-normal text-slate-500">
                {here.size} of {vehicles.length} selected
              </span>
            </label>

            <ul className="mt-2 divide-y divide-slate-100 rounded-md ring-1 ring-inset ring-slate-200">
              {vehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    name="vehicleIds"
                    value={v.id}
                    checked={here.has(v.id)}
                    onChange={(e) => toggle(v.id, e.target.checked)}
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
          </>
        )}

        <Button type="submit" disabled={pending || vehicles.length === 0}>
          {pending ? "Saving…" : "Save fleet"}
        </Button>
      </form>
    </Card>
  );
}
