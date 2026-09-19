"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Field, FormError, FormSuccess } from "@/components/ui";

/**
 * Local running allowed at each place the party stays overnight.
 *
 * Separate from the markup rules above it: a markup turns cost into a sell
 * price, this adds distance. Mixing them in one panel would suggest they are
 * the same kind of number.
 */
export function LocalRunningPanel({
  action,
  km,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  km: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <Card className="mt-8">
      <h2 className="text-base font-semibold text-slate-900">Local running</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Kilometres added for each place the party stays overnight, covering driving around that
        stop rather than the transfer to it. A trip with nights at Munnar, Thekkady, Alleppey and
        Kovalam gets four times this figure.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Counted per <strong>place</strong>, not per night — two nights at Munnar is still one place
        to drive around. The final drop point does not count, since they are leaving from there.
      </p>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="w-40">
          <Field
            label="Per stop"
            name="km"
            defaultValue={km}
            hint="Kilometres, e.g. 60. Zero switches it off."
            error={state.errors?.km}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save allowance"}
        </Button>
      </form>

      <p className="mt-3 text-xs text-slate-500">
        Applies to quotes priced from now on. Saved quotes keep the distance they were priced with.
      </p>
    </Card>
  );
}
