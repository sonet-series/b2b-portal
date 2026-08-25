"use client";

import { useActionState } from "react";
import { changeAdminPasswordAction } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/validation";
import { Button, Field, FormError } from "@/components/ui";

export function AdminChangePasswordForm() {
  const [state, action, pending] = useActionState(changeAdminPasswordAction, EMPTY_FORM_STATE);
  const err = state.errors ?? {};

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.message} />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        required
        autoComplete="current-password"
        error={err.currentPassword}
      />
      <Field
        label="New password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        hint="At least 10 characters."
        error={err.password}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        required
        autoComplete="new-password"
        error={err.confirmPassword}
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
