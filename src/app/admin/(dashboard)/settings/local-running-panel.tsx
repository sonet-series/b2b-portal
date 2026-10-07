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
        Kilometres added for each <strong>night</strong> of the hire, covering the driving around
        each stop rather than the transfers between them. A trip with six nights gets six times
        this figure.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Counted per night, not per place: two nights at Munnar is one place but{" "}
        <strong>two days of driving around it</strong>. Nights rather than days, so the arrival
        afternoon and the departure morning are not charged as two full days of sightseeing.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        The trip total is then rounded <strong>up to the next 50 km</strong>, so a quote states a
        round figure and never less distance than the vehicle will really drive.
      </p>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="w-40">
          <Field
            label="Per night"
            name="km"
            defaultValue={km}
            hint="Kilometres, e.g. 62 — measured against Sonet's own figures on 7 Oct 2026. Zero switches it off."
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
