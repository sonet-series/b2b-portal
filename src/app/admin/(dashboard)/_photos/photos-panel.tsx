"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, FormError, FormSuccess } from "@/components/ui";

/**
 * Upload, reorder and remove the photographs agents see while quoting.
 *
 * One panel for all three catalogue types — a vehicle, a hotel and a houseboat
 * differ only in how many pictures they may hold, and duplicating this three
 * times would mean fixing every future bug three times.
 *
 * Deliberately says where the photographs DO and do not appear. The customer's
 * PDF carries the agency's branding and nothing of ours, and somebody looking
 * at an upload box has every reason to assume otherwise.
 */
export function PhotosPanel({
  kind,
  photoIds,
  limit,
  alt,
  uploadAction,
  deleteAction,
  coverAction,
}: {
  kind: "vehicle" | "hotel" | "houseboat";
  /** Cover first. */
  photoIds: readonly string[];
  limit: number;
  alt: string;
  uploadAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  deleteAction: (photoId: string) => Promise<void>;
  coverAction: (photoId: string) => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(uploadAction, EMPTY_FORM_STATE);
  const room = limit - photoIds.length;

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Photographs</h2>
        <p className="text-xs text-slate-500">
          {photoIds.length} of {limit} used
        </p>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Shown to agents while they quote this {kind} and on the saved quote. They are{" "}
        <strong className="font-medium text-slate-700">not</strong> printed on the
        customer&rsquo;s PDF — that document carries the agency&rsquo;s branding and nothing of
        ours. The first photograph is the cover, used wherever only one fits.
      </p>

      {photoIds.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-4">
          {photoIds.map((photoId, i) => (
            <li key={photoId} className="w-40">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- session-checked route handler, not a static asset */}
                <img
                  src={`/admin/photos/${photoId}`}
                  alt={`${alt} ${i + 1}`}
                  className="h-28 w-40 rounded-md object-cover ring-1 ring-inset ring-slate-200"
                />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    COVER
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs">
                {i > 0 && (
                  <form action={coverAction.bind(null, photoId)}>
                    <button type="submit" className="text-blue-700 hover:underline">
                      Make cover
                    </button>
                  </form>
                )}
                <form action={deleteAction.bind(null, photoId)}>
                  <button type="submit" className="text-red-700 hover:underline">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        {room <= 0 ? (
          <p className="text-sm text-slate-500">
            This {kind} has the maximum of {limit} photographs. Remove one to add another.
          </p>
        ) : (
          <div>
            <label htmlFor="photos" className="mb-1 block text-sm font-medium text-slate-700">
              Add photographs
            </label>
            <input
              id="photos"
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <p className="mt-1 text-xs text-slate-500">
              JPG, PNG or WEBP, up to 5MB each. Room for {room} more. Landscape shots work best —
              they are displayed wide and cropped to fit.
            </p>
          </div>
        )}

        {room > 0 && (
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        )}
      </form>
    </Card>
  );
}
