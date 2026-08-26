"use client";

import { useActionState } from "react";
import { registerAgent } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/validation";
import { DOCUMENT_KIND } from "@/lib/enums";
import { Button, Field, FileField, FormError, FormSuccess, TextArea } from "@/components/ui";

/**
 * Mirrors src/lib/uploads.ts. Duplicated as plain strings rather than imported
 * because that module is server-only — it touches the filesystem.
 */
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const DOC_LABEL: Record<string, string> = {
  PAN_CARD: "PAN card",
  BUSINESS_PROOF: "Business proof document",
  VISITING_CARD: "Visiting card",
};
const DOC_HINT: Record<string, string> = {
  PAN_CARD: "The agency's PAN card.",
  BUSINESS_PROOF: "Your business registration, licence, or equivalent.",
  VISITING_CARD: "A current visiting card.",
};

function SectionHeading({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="border-b border-slate-200 pb-2">
      <h2 className="text-sm font-semibold text-slate-900">{children}</h2>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAgent, EMPTY_FORM_STATE);
  const err = state.errors ?? {};
  const was = state.values ?? {};

  if (state.ok) {
    return (
      <div className="space-y-4">
        <FormSuccess message={state.message} />
        <p className="text-sm text-slate-600">
          Registrations are reviewed by hand — we check your documents before opening access. You
          will not be able to sign in until that is done.
        </p>
        <a href="/login" className="inline-block text-sm text-blue-700 hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.message} />

      <div className="space-y-4">
        <SectionHeading>Agency details</SectionHeading>

        <Field label="Agency name" name="agencyName"
          defaultValue={was.agencyName ?? ""} required error={err.agencyName} />
        <Field label="Contact name" name="contactName"
          defaultValue={was.contactName ?? ""} required error={err.contactName} />
        <TextArea
          label="Agency address"
          name="address"
          defaultValue={was.address ?? ""}
          rows={3}
          required
          hint="Full postal address, including city and PIN code."
          error={err.address}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" name="phone"
          defaultValue={was.phone ?? ""} type="tel" required placeholder="+91 " error={err.phone} />
          <Field
            label="Alternative number"
            name="altPhone"
          defaultValue={was.altPhone ?? ""}
            type="tel"
            hint="Optional."
            error={err.altPhone}
          />
          <Field
            label="Email"
            name="email"
          defaultValue={was.email ?? ""}
            type="email"
            required
            autoComplete="username"
            error={err.email}
          />
          <Field
            label="Alternative email"
            name="altEmail"
          defaultValue={was.altEmail ?? ""}
            type="email"
            hint="Optional."
            error={err.altEmail}
          />
        </div>
      </div>

      <div className="space-y-4">
        <SectionHeading note="JPG, PNG, WEBP or PDF — up to 5MB each.">Documents</SectionHeading>

        {state.errors && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
            Your browser clears file selections when a form is returned, so please choose the three
            documents again.
          </p>
        )}

        {DOCUMENT_KIND.map((kind) => (
          <FileField
            key={kind}
            label={DOC_LABEL[kind]}
            name={kind}
            required
            accept={ACCEPT}
            hint={DOC_HINT[kind]}
            error={err[kind]}
          />
        ))}
      </div>

      <div className="space-y-4">
        <SectionHeading>Sign-in details</SectionHeading>
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
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Uploading…" : "Submit registration"}
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
