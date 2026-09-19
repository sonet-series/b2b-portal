"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Field, FormError, FormSuccess, Table, Td } from "@/components/ui";

/**
 * Toll, parking and interstate permits.
 *
 * Both are entered as COST, like everything else in the catalogue, and marked
 * up by the vehicle rule — they are charges on a vehicle hire, so they follow
 * the vehicle's markup rather than having a rule of their own to keep in step.
 */
export function ChargesPanel({
  tollAction,
  permitAction,
  tollDefault,
  tollRates,
  permits,
  knownStates,
  vehicles,
}: {
  tollAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  permitAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Used by any vehicle without its own rate. */
  tollDefault: string;
  tollRates: { vehicle: string; cost: string }[];
  permits: { state: string; vehicle: string; cost: string }[];
  /** States the destination list can actually recognise on an itinerary. */
  knownStates: string[];
  vehicles: { id: string; type: string }[];
}) {
  const [tollState, tollForm, tollPending] = useActionState(tollAction, EMPTY_FORM_STATE);
  const [permitState, permitForm, permitPending] = useActionState(permitAction, EMPTY_FORM_STATE);

  return (
    <Card className="mt-8">
      <h2 className="text-base font-semibold text-slate-900">Toll, parking and permits</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Added to every vehicle quote so the agent can give their customer a final number, rather
        than &ldquo;plus tolls at actuals&rdquo;. Enter <strong>cost</strong> — the vehicle markup
        turns it into the agent price.
      </p>

      <form action={tollForm} className="mt-5 flex flex-wrap items-end gap-3">
        <FormError message={tollState.ok ? undefined : tollState.message} />
        <FormSuccess message={tollState.ok ? tollState.message : undefined} />
        <div className="w-56">
          <label htmlFor="tollVehicle" className="mb-1 block text-sm font-medium text-slate-700">
            Vehicle
          </label>
          <select
            id="tollVehicle"
            name="vehicleId"
            className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300"
          >
            {/* The blank value is the fallback every unset vehicle uses. Toll
                applies to every hire, so something must always answer. */}
            <option value="">All vehicles (default)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.type}
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <Field
            label="Cost per day"
            name="amount"
            placeholder="300"
            error={tollState.errors?.amount}
          />
        </div>
        <Button type="submit" disabled={tollPending}>
          {tollPending ? "Saving…" : "Save"}
        </Button>
      </form>

      <p className="mt-2 max-w-2xl text-xs text-slate-500">
        Per day rather than per route: tolls vary hop by hop and no operator prices them
        individually. A coach pays more at a booth than a sedan, so set the bigger vehicles
        separately — anything left unset uses the default of ₹{tollDefault} per day.
      </p>

      {tollRates.length > 0 && (
        <div className="mt-3">
          <Table head={["Vehicle", "Toll and parking per day"]}>
            {tollRates.map((r) => (
              <tr key={r.vehicle}>
                <Td>{r.vehicle}</Td>
                <Td>₹{r.cost}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <div className="mt-7 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Interstate permits</h3>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Charged once per state the trip enters. Kerala is home, so it is never charged.
        </p>

        {permits.length > 0 && (
          <div className="mt-3">
            <Table head={["State", "Vehicle", "Cost per entry"]}>
              {permits.map((p) => (
                <tr key={`${p.state}-${p.vehicle}`}>
                  <Td>{p.state}</Td>
                  <Td>{p.vehicle}</Td>
                  <Td>₹{p.cost}</Td>
                </tr>
              ))}
            </Table>
          </div>
        )}

        <form action={permitForm} className="mt-4 flex flex-wrap items-end gap-3">
          <FormError message={permitState.ok ? undefined : permitState.message} />
          <FormSuccess message={permitState.ok ? permitState.message : undefined} />
          <div className="w-52">
            <label htmlFor="state" className="mb-1 block text-sm font-medium text-slate-700">
              State
            </label>
            <select
              id="state"
              name="state"
              className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300"
            >
              {knownStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div className="w-56">
            <label htmlFor="permitVehicle" className="mb-1 block text-sm font-medium text-slate-700">
              Vehicle
            </label>
            <select
              id="permitVehicle"
              name="vehicleId"
              className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.type}
                </option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <Field
              label="Cost per entry"
              name="amount"
              placeholder="1500"
              error={permitState.errors?.amount}
            />
          </div>
          <Button type="submit" disabled={permitPending}>
            {permitPending ? "Saving…" : "Set permit"}
          </Button>
        </form>

        <p className="mt-3 max-w-2xl text-xs text-slate-500">
          Set per state <em>and</em> vehicle — a coach is not charged what a sedan is. A trip
          entering a state with no fee set for that vehicle is flagged on the quote rather than
          quietly costing nothing, and the same goes for a place not on the destination list.
        </p>
      </div>
    </Card>
  );
}
