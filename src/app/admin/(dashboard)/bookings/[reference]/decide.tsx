"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, FormError, FormSuccess, MoneyField, TextArea } from "@/components/ui";
import { toMajor, formatMinor } from "@/lib/money";
import { withGst, formatBps } from "@/lib/settings-shared";
import { depositOf } from "@/lib/booking-shared";

/**
 * Confirming a booking, at a rate Sonet may change.
 *
 * "on approval final rate might change" — so the total is a field, pre-filled
 * with what was quoted. The GST, grand total and deposit are recomputed as he
 * types, because the number he is agreeing to is the one the agent will be
 * asked to pay, and finding out afterwards that 25% of it is not what anyone
 * expected is the argument this screen exists to avoid.
 */
export function ConfirmForm({
  action,
  quotedMinor,
  gstBps,
  depositBps,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  quotedMinor: number;
  gstBps: number;
  depositBps: number;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.ok ? undefined : state.message} />
      <FormSuccess message={state.ok ? state.message : undefined} />

      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Agreed total (before GST)"
          name="agreedTotal"
          required
          defaultValue={String(toMajor(quotedMinor))}
          hint={`Quoted ${formatMinor(quotedMinor)}. Change it if the final rate differs.`}
        />
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm ring-1 ring-inset ring-slate-200">
          <p className="text-xs uppercase tracking-wide text-slate-400">At the quoted rate</p>
          <p className="mt-1 text-slate-600">
            GST {formatBps(gstBps)}: {formatMinor(withGst(quotedMinor, gstBps).gstMinor)}
          </p>
          <p className="font-medium text-slate-900">
            Grand total: {formatMinor(withGst(quotedMinor, gstBps).grossMinor)}
          </p>
          <p className="mt-1 text-slate-600">
            Deposit {formatBps(depositBps)}:{" "}
            {formatMinor(depositOf(withGst(quotedMinor, gstBps).grossMinor, depositBps))}
          </p>
        </div>
      </div>

      <TextArea
        label="Note to the agent"
        name="adminNote"
        hint="If you changed the rate, say why here — an unexplained change is the one they argue with."
      />

      <Button type="submit" tone="primary" disabled={pending}>
        {pending ? "Confirming…" : "Confirm booking"}
      </Button>
    </form>
  );
}

/** Declining, or cancelling one already confirmed. A reason is required. */
export function NoteForm({
  action,
  label,
  submitLabel,
  hint,
  tone = "danger",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  submitLabel: string;
  hint: string;
  tone?: "danger" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.ok ? undefined : state.message} />
      <FormSuccess message={state.ok ? state.message : undefined} />
      <TextArea label={label} name="adminNote" hint={hint} />
      <Button type="submit" tone={tone} disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

/** Approving or rejecting one filed payment. */
export function PaymentDecision({
  approve,
  reject,
}: {
  approve: (prev: FormState, formData: FormData) => Promise<FormState>;
  reject: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [approveState, approveAction, approving] = useActionState(approve, EMPTY_FORM_STATE);
  const [rejectState, rejectAction, rejecting] = useActionState(reject, EMPTY_FORM_STATE);
  const problem = (!approveState.ok && approveState.message) || (!rejectState.ok && rejectState.message);

  return (
    <div className="mt-3 space-y-2">
      <FormError message={problem || undefined} />
      {/*
        One note field, two submit buttons — each in its own form so the note
        travels with whichever was pressed. Rejecting requires it; approving
        does not, which is why the placeholder says so.
      */}
      <form action={approveAction} className="flex flex-wrap items-end gap-2">
        <input
          type="hidden"
          name="adminNote"
          value=""
        />
        <Button type="submit" disabled={approving || rejecting}>
          {approving ? "Approving…" : "Approve payment"}
        </Button>
      </form>
      <form action={rejectAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <input
            name="adminNote"
            placeholder="Reason for rejecting"
            className="block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>
        <Button type="submit" tone="danger" disabled={approving || rejecting}>
          {rejecting ? "Rejecting…" : "Reject"}
        </Button>
      </form>
    </div>
  );
}
