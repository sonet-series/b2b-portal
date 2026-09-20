"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Badge, Button, Card, FormError, FormSuccess } from "@/components/ui";

/**
 * Whether booking emails are on, and a button to prove it.
 *
 * Both halves exist because the only way to check used to be to request a real
 * booking and then read container logs — which on a live system means creating
 * a fake booking somebody has to clean up afterwards. Configuration an operator
 * cannot see is configuration nobody trusts.
 */
export function EmailPanel({
  action,
  status,
}: {
  action: (prev: FormState) => Promise<FormState>;
  status: {
    configured: boolean;
    host?: string;
    port?: number;
    user?: string;
    from?: string;
    to?: string;
    hasPassword: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState) => action(prev),
    EMPTY_FORM_STATE
  );

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Booking notifications</h2>
        <Badge tone={status.configured ? "green" : "slate"}>
          {status.configured ? "On" : "Off"}
        </Badge>
      </div>

      {status.configured ? (
        <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <Row label="Server" value={`${status.host}:${status.port}`} />
          <Row label="Sends to" value={status.to ?? "—"} />
          <Row label="From" value={status.from ?? "—"} />
          <Row
            label="Sign-in"
            value={
              status.user
                ? `${status.user} · ${status.hasPassword ? "password set" : "NO PASSWORD SET"}`
                : "none (unauthenticated relay)"
            }
          />
        </dl>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          <code className="rounded bg-slate-100 px-1">SMTP_HOST</code> is not set in{" "}
          <code className="rounded bg-slate-100 px-1">.env.production</code>, so no email is sent
          when an agent requests a booking. Requests still arrive on the Bookings screen —
          nothing is lost, you just have to look.
        </p>
      )}

      <form action={formAction} className="mt-4 space-y-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />
        <Button type="submit" disabled={pending || !status.configured}>
          {pending ? "Sending…" : "Send a test email"}
        </Button>
      </form>

      <p className="mt-3 text-xs text-slate-500">
        Changing these values needs an edit to <code>.env.production</code> and a redeploy — they
        are read from the environment at startup, not from the database, because a password does
        not belong in a table.
      </p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="break-all text-slate-700">{value}</dd>
    </div>
  );
}
