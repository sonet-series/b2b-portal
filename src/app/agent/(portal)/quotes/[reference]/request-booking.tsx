"use client";

import { useActionState, useState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, FormError, TextArea } from "@/components/ui";

/**
 * Asking Series Tours to turn this quote into a trip.
 *
 * Deliberately a two-step: the button reveals a short form rather than
 * submitting immediately. Requesting a booking is the first thing on this
 * screen an agent cannot undo themselves, and a single mis-click next to
 * "Download PDF" should not start one.
 */
export function RequestBooking({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  if (!open) {
    return (
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Ready to book?</h2>
            <p className="mt-1 text-sm text-slate-500">
              Series Tours confirms the final rate before anything is held. No payment is taken
              through this portal.
            </p>
          </div>
          <Button type="button" tone="primary" onClick={() => setOpen(true)}>
            Request booking
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">Request this booking</h2>
      <form action={formAction} className="mt-3 space-y-4">
        <FormError message={state.ok ? undefined : state.message} />
        <TextArea
          label="Anything Series Tours should know"
          name="agentNote"
          hint="Flight times, a name for the lead passenger, special requests. Optional."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" tone="primary" disabled={pending}>
            {pending ? "Requesting…" : "Send request"}
          </Button>
          <Button type="button" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          This asks Series Tours to confirm. The rate may change — they will tell you before
          anything is held, and nothing is payable until they approve it.
        </p>
      </form>
    </Card>
  );
}
