"use client";

import { useActionState } from "react";
import { agentLoginAction } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/validation";
import { Button, Field, FormError } from "@/components/ui";

export function AgentLoginForm() {
  const [state, action, pending] = useActionState(agentLoginAction, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.message} />
      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        New agency?{" "}
        <a href="/register" className="text-blue-700 hover:underline">
          Register here
        </a>
      </p>
      <p className="text-center text-xs text-slate-400">
        Forgotten your password? Contact Series Tours — we will issue a temporary one.
      </p>
    </form>
  );
}
