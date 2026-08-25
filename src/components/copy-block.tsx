"use client";

import { useState } from "react";
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
      <div className="flex items-center gap-3">
        <Button type="button" tone="secondary" onClick={copy}>
          {copied ? "Copied ✓" : label}
        </Button>
        {failed && (
          <span className="text-xs text-amber-700">
            Clipboard unavailable — select the text above and copy manually.
          </span>
        )}
      </div>
    </div>
  );
}
