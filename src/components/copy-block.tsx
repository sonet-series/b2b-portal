"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "./ui";

/**
 * The handover step. v1 sends no email — Sonet copies this and pastes it into
 * WhatsApp or reads it out — so the copy button is the actual delivery
 * mechanism, not a convenience.
 */
export function CopyBlock({
  text,
  label = "Copy message",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  // The Clipboard API only exists in a secure context. Over plain HTTP the
  // copy button is dead, and this is the handover step — the one thing that
  // must not fail quietly. Warn up front rather than on click.
  //
  // useSyncExternalStore rather than an effect: this is a browser-only value
  // that never changes, and it needs a server snapshot to avoid a hydration
  // mismatch.
  const insecure = useSyncExternalStore(
    () => () => {},
    () => !window.isSecureContext || !navigator.clipboard,
    () => false
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API needs a secure context; over plain http on a LAN it
      // throws. Tell the user to select manually rather than failing silently.
      setFailed(true);
    }
  }

  return (
    <div className="space-y-2">
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-slate-900 px-3 py-2.5 text-xs leading-relaxed text-slate-100">
        {text}
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" tone="secondary" onClick={copy} disabled={insecure}>
          {copied ? "Copied ✓" : label}
        </Button>
        {(failed || insecure) && (
          <span className="text-xs text-amber-700">
            {insecure
              ? "Copying needs HTTPS — this page is not on a secure connection. Select the text above and copy manually."
              : "Clipboard unavailable — select the text above and copy manually."}
          </span>
        )}
      </div>
    </div>
  );
}
