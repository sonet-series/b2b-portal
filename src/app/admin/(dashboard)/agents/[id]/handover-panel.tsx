"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE } from "@/lib/validation";
import { Card, Button, FormError, FormSuccess } from "@/components/ui";
import { CopyBlock } from "@/components/copy-block";
import type { HandoverState } from "../actions";

const EMPTY: HandoverState = EMPTY_FORM_STATE;

/**
 * Issues a temporary password and shows it once. Reissuing replaces it — the
 * plaintext is never stored, so there is nothing to look up later.
 */
export function TempPasswordPanel({
  action,
}: {
  action: (prev: HandoverState) => Promise<HandoverState>;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: HandoverState) => action(prev),
    EMPTY
  );

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Account access</h2>
      <p className="mt-1 text-sm text-slate-500">
        No email is sent by this portal. Issue a temporary password here and pass it on yourself —
        the agent is forced to change it at next sign-in.
      </p>

      {state.handover?.tempPassword && (
        <div className="mt-4 space-y-3">
          <FormSuccess message={state.message} />
          <div className="rounded-md bg-amber-50 px-3 py-2 ring-1 ring-inset ring-amber-200">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Temporary password
            </p>
            <p className="mt-1 font-mono text-lg text-amber-900">{state.handover.tempPassword}</p>
            <p className="mt-1 text-xs text-amber-800">Shown once. Reissue if you lose it.</p>
          </div>
          <CopyBlock text={state.handover.message} label="Copy WhatsApp message" />
        </div>
      )}

      {!state.ok && state.message && (
        <div className="mt-4">
          <FormError message={state.message} />
        </div>
      )}

      <form action={formAction} className="mt-4">
        <Button type="submit" tone="secondary" disabled={pending}>
          {pending
            ? "Issuing…"
            : state.handover?.tempPassword
              ? "Issue a new one"
              : "Issue temporary password"}
        </Button>
      </form>
    </Card>
  );
}
