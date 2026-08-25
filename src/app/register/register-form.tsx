"use client";

import { useActionState } from "react";
import { registerAgent } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/validation";
import { Button, Field, FormError, FormSuccess } from "@/components/ui";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAgent, EMPTY_FORM_STATE);
  const err = state.errors ?? {};

  if (state.ok) {
    return (
      <div className="space-y-4">
        <FormSuccess message={state.message} />
        <p className="text-sm text-slate-600">
          Registrations are reviewed by hand — we check your GST or licence number before opening
          access. You will not be able to sign in until that is done.
        </p>
        <a href="/login" className="inline-block text-sm text-blue-700 hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.message} />

      <Field label="Agency name" name="agencyName" required error={err.agencyName} />
      <Field label="Contact name" name="contactName" required error={err.contactName} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" name="phone" type="tel" required placeholder="+91 " error={err.phone} />
        <Field label="Email" name="email" type="email" required autoComplete="username" error={err.email} />
      </div>

      <Field
        label="GST or licence number"
        name="gstOrLicenseNumber"
        required
        hint="We verify this before approving your account."
        error={err.gstOrLicenseNumber}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 10 characters."
          error={err.password}
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          error={err.confirmPassword}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Submit registration"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already registered?{" "}
        <a href="/login" className="text-blue-700 hover:underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
