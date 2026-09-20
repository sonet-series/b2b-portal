"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Field, FormError, FormSuccess } from "@/components/ui";

/**
 * How much of a confirmed booking an agent pays up front.
 *
 * Of the GRAND TOTAL, stated on the panel, because "25%" is ambiguous until
 * you say of what — and a deposit computed before GST is short by the tax
 * every single time.
 */
export function DepositPanel({
  action,
  percent,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  percent: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">Booking deposit</h2>
      <p className="mt-1 text-sm text-slate-500">
        What an agent pays when you confirm a booking, as a percentage of the grand total
        including GST. Frozen onto each booking when you confirm it, so changing this affects
        the next one and never one already agreed.
      </p>
      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />
        <div className="w-40">
          <Field label="Deposit %" name="percent" required defaultValue={percent} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Card>
  );
}
