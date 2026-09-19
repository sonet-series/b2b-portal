"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Field, FormError, FormSuccess } from "@/components/ui";

/**
 * The road margin added to every measured vehicle distance.
 *
 * Separate from the markup rules above it: a markup turns cost into a sell
 * price, this corrects a distance. Mixing them in one panel would suggest they
 * are the same kind of number.
 */
export function MarginPanel({
  action,
  percent,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  percent: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <Card className="mt-8">
      <h2 className="text-base font-semibold text-slate-900">Road margin</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Google returns the shortest practical route. Real driving is longer — diversions, one-ways,
        a wrong turn, the stretch from the main road to a resort gate. This percentage is added to
        the measured distance on every vehicle quote.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        It is shown as its own line on the quote, so each leg still matches what anyone gets from
        Google. It is <strong>not</strong> the same as a day&rsquo;s sightseeing buffer, which is a
        specific detour the agent knows about and adds themselves.
      </p>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="w-40">
          <Field
            label="Margin"
            name="percent"
            defaultValue={percent}
            hint="Percent, e.g. 5 or 7.5. Zero switches it off."
            error={state.errors?.percent}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save margin"}
        </Button>
      </form>

      <p className="mt-3 text-xs text-slate-500">
        Applies to quotes priced from now on. Saved quotes keep the distance they were priced with.
      </p>
    </Card>
  );
}
