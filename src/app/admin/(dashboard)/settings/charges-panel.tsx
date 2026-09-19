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
  tollPerDay,
  permits,
  knownStates,
}: {
  tollAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  permitAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  tollPerDay: string;
  permits: { state: string; cost: string }[];
  /** States the destination list can actually recognise on an itinerary. */
  knownStates: string[];
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
        <div className="w-48">
          <Field
            label="Toll and parking"
            name="amount"
            defaultValue={tollPerDay}
            hint="Cost per day of hire, in ₹."
            error={tollState.errors?.amount}
          />
        </div>
        <Button type="submit" disabled={tollPending}>
          {tollPending ? "Saving…" : "Save"}
        </Button>
      </form>

      <p className="mt-2 max-w-2xl text-xs text-slate-500">
        Per day rather than per route: tolls vary hop by hop and no operator prices them
        individually. One figure to keep current beats a matrix nobody maintains.
      </p>

      <div className="mt-7 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Interstate permits</h3>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Charged once per state the trip enters. Kerala is home, so it is never charged.
        </p>

        {permits.length > 0 && (
          <div className="mt-3">
            <Table head={["State", "Cost per entry"]}>
              {permits.map((p) => (
                <tr key={p.state}>
                  <Td>{p.state}</Td>
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
          Only states on the destination list can be recognised on an itinerary. If an agent types
          a place we do not know, the quote says so rather than quietly assuming no permit is due.
        </p>
      </div>
    </Card>
  );
}
