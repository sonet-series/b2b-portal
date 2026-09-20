"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, FormError, FormSuccess } from "@/components/ui";

/**
 * Upload, replace or remove the photograph agents see while quoting.
 *
 * `photoVersion` is appended to the image URL so a replaced photograph appears
 * immediately. Without it the browser keeps showing the old one from its own
 * cache — the URL never changes, only the bytes behind it — and the upload
 * looks as though it silently failed.
 */
export function PhotoPanel({
  vehicleId,
  vehicleType,
  hasPhoto,
  photoVersion,
  uploadAction,
  removeAction,
}: {
  vehicleId: string;
  vehicleType: string;
  hasPhoto: boolean;
  photoVersion: string;
  uploadAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  removeAction: () => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(uploadAction, EMPTY_FORM_STATE);

  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">Photograph</h2>
      <p className="mt-1 text-sm text-slate-500">
        Shown to agents while they quote this vehicle and on the saved quote. It is{" "}
        <strong className="font-medium text-slate-700">not</strong> printed on the customer&rsquo;s
        PDF — that document carries the agency&rsquo;s branding and nothing of ours.
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-6">
        <div className="flex h-32 w-48 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 ring-1 ring-inset ring-slate-200">
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by a session-checked route handler, not a static asset next/image can optimise
            <img
              src={`/admin/vehicles/${vehicleId}/photo?v=${photoVersion}`}
              alt={vehicleType}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xs text-slate-400">No photograph</span>
          )}
        </div>

        <form action={formAction} className="min-w-64 flex-1 space-y-3">
          <FormError message={state.ok ? undefined : state.message} />
          <FormSuccess message={state.ok ? state.message : undefined} />

          <div>
            <label
              htmlFor="photo"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {hasPhoto ? "Replace photograph" : "Upload photograph"}
            </label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <p className="mt-1 text-xs text-slate-500">
              JPG, PNG or WEBP, up to 5MB. A landscape shot of the whole vehicle works best — it
              is displayed wide and cropped to fit.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : hasPhoto ? "Replace photograph" : "Upload photograph"}
            </Button>
          </div>
        </form>
      </div>

      {hasPhoto && (
        <form action={removeAction} className="mt-4 border-t border-slate-100 pt-4">
          <Button type="submit" tone="danger">
            Remove photograph
          </Button>
        </form>
      )}
    </Card>
  );
}
