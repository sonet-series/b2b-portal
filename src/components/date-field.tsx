"use client";

import { useState } from "react";
import { FieldShell, cx } from "./ui";

/**
 * A date input that always reads and writes dd/mm/yyyy.
 *
 * Native <input type="date"> renders in the BROWSER's locale, not the app's —
 * on a US-defaulted machine it shows mm/dd/yyyy and there is no attribute that
 * changes it. Everyone using this portal is in India, so an ambiguous
 * 03/04/2026 is a real booking error waiting to happen.
 *
 * So the visible control is a plain text field under our control, and a hidden
 * input carries the ISO value the rest of the app already expects. Nothing on
 * the server side changes: actions and zod schemas keep receiving YYYY-MM-DD.
 */

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Real calendar check — rejects 31/02/2026, which a regex alone would pass. */
function displayToIso(display: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (!m) return null;

  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** Inserts the slashes as the agent types, so only digits need typing. */
function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateField({
  label,
  name,
  defaultValue = "",
  required,
  hint,
  error,
  min,
}: {
  label: string;
  name: string;
  /** ISO YYYY-MM-DD, as stored and as returned in the query string. */
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** ISO YYYY-MM-DD. Dates before this are rejected client-side. */
  min?: string;
}) {
  const [display, setDisplay] = useState(() => isoToDisplay(defaultValue));
  const [localError, setLocalError] = useState<string | null>(null);

  const iso = displayToIso(display);

  function handleChange(raw: string) {
    const formatted = autoFormat(raw);
    setDisplay(formatted);

    if (formatted === "") {
      setLocalError(required ? null : null); // emptiness is the server's business
      return;
    }
    if (formatted.length < 10) {
      setLocalError(null); // still typing
      return;
    }

    const parsed = displayToIso(formatted);
    if (!parsed) {
      setLocalError("That date does not exist — use dd/mm/yyyy");
    } else if (min && parsed < min) {
      setLocalError(`Must be on or after ${isoToDisplay(min)}`);
    } else {
      setLocalError(null);
    }
  }

  const shown = localError ?? error;

  return (
    <FieldShell label={label} name={name} hint={hint ?? "dd/mm/yyyy"} error={shown} required={required}>
      {/*
        Only the hidden field carries a name, so the display value is never
        submitted and the server keeps receiving ISO.
      */}
      <input type="hidden" name={name} value={iso ?? ""} />
      <input
        id={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        required={required}
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        aria-invalid={shown ? true : undefined}
        className={cx(
          "block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset",
          "placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600",
          "tabular-nums",
          shown ? "ring-red-400" : "ring-slate-300"
        )}
      />
    </FieldShell>
  );
}
