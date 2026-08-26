"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, FileField, FormError } from "@/components/ui";

export function UploadForm({
  action,
  stubMode,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  stubMode: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <Card>
      <form action={formAction} className="space-y-4">
        <FormError message={state.message} />

        {stubMode && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-inset ring-red-200">
            No <code>ANTHROPIC_API_KEY</code> is set, so uploading will produce fabricated
            development rows rather than reading your file.
          </div>
        )}

        <FileField
          label="Rate sheet"
          name="rateSheet"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp,text/csv,text/plain"
          hint="PDF, photo or scan, or a CSV export — up to 5MB."
          error={state.errors?.rateSheet}
        />

        <Button type="submit" disabled={pending}>
          {pending ? "Reading the sheet…" : "Extract rates"}
        </Button>

        <p className="text-xs text-slate-500">
          Extraction can take up to a minute on a long sheet. Nothing is saved until you review and
          confirm the rows.
        </p>
      </form>
    </Card>
  );
}
