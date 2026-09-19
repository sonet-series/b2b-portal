"use client";

import { useEffect, useRef, useState } from "react";
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * The cells of one month, Monday-first, padded with nulls so the grid lines up.
 *
 * Monday-first because that is the working week here; a Sunday-first grid is
 * a small thing to misread and dates are the one field where misreading is
 * expensive.
 */
function monthCells(year: number, month: number): (number | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // 0 = Monday
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length }, (_, i) => i + 1),
  ];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function DateField({
  label,
  name,
  defaultValue = "",
  required,
  hint,
  error,
  min,
  onIsoChange,
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
  /** Called with the ISO value (or "") whenever a complete date is typed. */
  onIsoChange?: (iso: string) => void;
}) {
  const [display, setDisplay] = useState(() => isoToDisplay(defaultValue));
  const [localError, setLocalError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const iso = displayToIso(display);

  // The month the calendar opens on: whatever is already chosen, else the
  // earliest date allowed, else today.
  const [view, setView] = useState(() => {
    const base = displayToIso(isoToDisplay(defaultValue)) ?? min ?? new Date().toISOString().slice(0, 10);
    return { year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) - 1 };
  });

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(day: number) {
    const chosen = `${view.year}-${pad(view.month + 1)}-${pad(day)}`;
    setDisplay(isoToDisplay(chosen));
    setLocalError(null);
    onIsoChange?.(chosen);
    setOpen(false);
  }

  function shiftMonth(by: number) {
    setView((v) => {
      const d = new Date(Date.UTC(v.year, v.month + by, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  function handleChange(raw: string) {
    const formatted = autoFormat(raw);
    setDisplay(formatted);

    if (formatted === "") {
      onIsoChange?.("");
      setLocalError(null); // emptiness is the server's business
      return;
    }
    if (formatted.length < 10) {
      setLocalError(null); // still typing
      return;
    }

    const parsed = displayToIso(formatted);
    onIsoChange?.(parsed ?? "");
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

      <div ref={boxRef} className="relative">
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
            "block w-full rounded-md border-0 py-2 pl-3 pr-10 text-sm text-slate-900 shadow-sm ring-1 ring-inset",
            "placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600",
            "tabular-nums",
            shown ? "ring-red-400" : "ring-slate-300"
          )}
        />

        {/* Typing still works exactly as before — the calendar is an
            alternative, not a replacement. Agents who know the date are
            faster on the keyboard; everyone else picks. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Open calendar for ${label}`}
          aria-expanded={open}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-slate-400 hover:text-blue-700"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M5.5 2a.75.75 0 0 1 .75.75V4h7.5V2.75a.75.75 0 0 1 1.5 0V4h.75A2 2 0 0 1 18 6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h.75V2.75A.75.75 0 0 1 5.5 2ZM4 8v8h12V8H4Z" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-30 mt-1 w-72 rounded-md bg-white p-3 shadow-lg ring-1 ring-slate-200">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                ‹
              </button>
              <p className="text-sm font-medium text-slate-900">
                {MONTHS[view.month]} {view.year}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="py-1 text-[0.65rem] font-medium uppercase text-slate-400">
                  {w}
                </span>
              ))}
              {monthCells(view.year, view.month).map((day, i) => {
                if (day === null) return <span key={i} />;
                const cell = `${view.year}-${pad(view.month + 1)}-${pad(day)}`;
                const disabled = min !== undefined && cell < min;
                const selected = iso === cell;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(day)}
                    aria-current={selected ? "date" : undefined}
                    className={cx(
                      "rounded py-1.5 text-sm tabular-nums",
                      selected
                        ? "bg-blue-600 font-semibold text-white"
                        : disabled
                          ? "cursor-not-allowed text-slate-300"
                          : "text-slate-700 hover:bg-blue-50"
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </FieldShell>
  );
}
