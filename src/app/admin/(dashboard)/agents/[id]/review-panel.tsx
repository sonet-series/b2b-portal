"use client";

import { useActionState, useState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, FormError, Select, TextArea } from "@/components/ui";


/**
 * Approve and assign the rate card in one action, as the blueprint requires.
 *
 * Copying an existing agent's overrides is the fast path for "same deal as
 * agency X". Leaving it on defaults is a real choice, not a gap — the fallback
 * rule means an agent with no overrides is quoted catalogue prices and can
 * trade immediately.
 */
export function ReviewPanel({
  approveAction,
  rejectAction,
  agentOptions,
}: {
  approveAction: (prev: FormState, fd: FormData) => Promise<FormState>;
  rejectAction: (prev: FormState, fd: FormData) => Promise<FormState>;
  agentOptions: { value: string; label: string }[];
}) {
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [approveState, approve, approving] = useActionState(approveAction, EMPTY_FORM_STATE);
  const [rejectState, reject, rejecting] = useActionState(rejectAction, EMPTY_FORM_STATE);

  // No success branch here on purpose: approving or rejecting changes the
  // agent's status, so the server re-renders this page into its approved or
  // rejected layout and this component unmounts. The handover message lives
  // there, server-rendered, rather than in state that is about to be thrown away.

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Review this registration</h2>
      <p className="mt-1 text-sm text-slate-500">
        Check the GST or licence number before approving.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("approve")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === "approve" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "text-slate-500"
          }`}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === "reject" ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "text-slate-500"
          }`}
        >
          Reject
        </button>
      </div>

      {mode === "approve" ? (
        <form action={approve} className="mt-4 space-y-4">
          <FormError message={approveState.ok ? undefined : approveState.message} />
          <Select
            label="Rate card"
            name="copyRateCardFromAgentId"
            options={[{ value: "none", label: "Default rates only (no overrides)" }, ...agentOptions]}
            hint="Copying clones that agent's overrides. Defaults apply wherever there is no override."
          />
          <TextArea label="Internal notes" name="adminNotes" hint="Never shown to the agent." />
          <Button type="submit" disabled={approving}>
            {approving ? "Approving…" : "Approve and assign rate card"}
          </Button>
        </form>
      ) : (
        <form action={reject} className="mt-4 space-y-4">
          <FormError message={rejectState.ok ? undefined : rejectState.message} />
          <TextArea
            label="Reason"
            name="adminNotes"
            hint="Internal only. Nothing is sent to the agent."
          />
          <Button type="submit" tone="danger" disabled={rejecting}>
            {rejecting ? "Rejecting…" : "Reject registration"}
          </Button>
        </form>
      )}
    </Card>
  );
}
