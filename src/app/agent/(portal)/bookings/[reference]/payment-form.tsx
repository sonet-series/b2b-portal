"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Field, MoneyField, FormError, FormSuccess, TextArea } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { toMajor } from "@/lib/money";

/**
 * Filing a payment that happened somewhere else.
 *
 * The amount is PRE-FILLED with whatever is due next — the deposit, or the
 * balance once the deposit is settled — because that is what an agent is
 * almost always paying, and retyping it is where a digit gets dropped. It
 * stays editable: part payments are a fact of this trade.
 */
export function PaymentForm({
  action,
  suggestedMinor,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  suggestedMinor: number;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <FormError message={state.ok ? undefined : state.message} />
      <FormSuccess message={state.ok ? state.message : undefined} />

      <div className="grid gap-4 sm:grid-cols-3">
        <MoneyField
          label="Amount paid"
          name="amount"
          required
          defaultValue={suggestedMinor > 0 ? String(toMajor(suggestedMinor)) : ""}
        />
        <DateField label="Date paid" name="paidOn" />
        <Field
          label="Bank / UPI reference"
          name="reference"
          placeholder="UTR or transaction id"
          hint="So Series Tours can find it on their statement."
        />
      </div>

      <div>
        <label htmlFor="proof" className="mb-1 block text-sm font-medium text-slate-700">
          Screenshot or receipt<span className="ml-0.5 text-red-600">*</span>
        </label>
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="mt-1 text-xs text-slate-500">
          JPG, PNG, WEBP or PDF, up to 5MB. Required — Series Tours confirms every payment
          against the proof.
        </p>
      </div>

      <TextArea label="Note" name="note" hint="Anything Series Tours should know about this transfer." />

      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record this payment"}
      </Button>
    </form>
  );
}
