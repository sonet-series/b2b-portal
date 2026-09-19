"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Deleting a quote, behind a confirmation.
 *
 * Two clicks rather than a browser confirm(): the dialogue is easy to dismiss
 * without reading, and this is the one destructive action an agent has. The
 * second click says what will happen rather than asking "are you sure".
 */
export function DeleteQuote({
  reference,
  action,
}: {
  reference: string;
  action: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-slate-500 hover:text-red-700 hover:underline"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-600">Delete {reference} permanently?</span>
      <form action={action}>
        <Button type="submit" tone="danger">
          Yes, delete
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-sm text-slate-500 hover:underline"
      >
        Cancel
      </button>
    </span>
  );
}
