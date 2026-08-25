"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/validation";
import { Button, Field, FormError } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.message} />
      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
