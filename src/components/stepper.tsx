"use client";

import { cx } from "./ui";

/**
 * A − N + control for small counts.
 *
 * Passenger counts were plain text boxes, which meant selecting the contents
 * before retyping and left room for "2 " or "two". A stepper cannot hold a
 * value that is not a number, and adjusting by one is the thing agents
 * actually do most.
 *
 * The value is still rendered into a real input so the surrounding GET form
 * submits it unchanged — the quote URL keeps working exactly as before.
 */
export function Stepper({
  name,
  value,
  onChange,
  min = 0,
  max = 60,
  label,
  compact,
}: {
  name?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
  compact?: boolean;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md bg-white ring-1 ring-inset ring-slate-300",
        compact ? "gap-0" : "gap-0"
      )}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
        className={cx(
          "flex items-center justify-center rounded-l-md text-slate-500",
          "hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300",
          compact ? "h-8 w-7" : "h-9 w-9"
        )}
      >
        −
      </button>

      <input
        type="text"
        name={name}
        readOnly
        value={value}
        aria-label={label}
        className={cx(
          "border-0 bg-transparent p-0 text-center text-sm tabular-nums text-slate-900 focus:ring-0",
          compact ? "w-7" : "w-9"
        )}
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
        className={cx(
          "flex items-center justify-center rounded-r-md text-slate-500",
          "hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300",
          compact ? "h-8 w-7" : "h-9 w-9"
        )}
      >
        +
      </button>
    </span>
  );
}
