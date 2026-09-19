"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, FormError, FormSuccess } from "@/components/ui";

export function LogoForm({
  action,
  hasLogo,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hasLogo: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.ok ? undefined : state.message} />
      <FormSuccess message={state.ok ? state.message : undefined} />

      <div>
        <label htmlFor="logo" className="mb-1 block text-sm font-medium text-slate-700">
          {hasLogo ? "Replace logo" : "Upload logo"}
        </label>
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="mt-1 text-xs text-slate-500">
          JPG, PNG or WEBP, up to 5MB. A wide logo on a transparent or white background prints
          best.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Uploading…" : hasLogo ? "Replace logo" : "Upload logo"}
      </Button>
    </form>
  );
}
