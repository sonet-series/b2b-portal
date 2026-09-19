"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A place field that suggests real place names as you type.
 *
 * Typed place names are what the whole itinerary is measured from, and two
 * spellings of the same place are two different places to a router. Picking
 * from Google's own list means the string we route on is one Google already
 * recognises.
 *
 * It stays an ordinary text input underneath: the agent can type anything and
 * submit it. If suggestions are unavailable the field simply behaves as it did
 * before, because a quote must never depend on a lookup service being up.
 */

type Suggestion = { main: string; secondary: string };

/** Matches MIN_QUERY_LENGTH in src/lib/places.ts. */
const MIN_QUERY = 3;

const control =
  "block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 " +
  "ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset " +
  "focus:ring-blue-600";

export function PlaceInput({
  name,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  name?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when a suggestion is chosen, so the resulting value change does not
  // immediately fetch again and reopen the list the agent just dismissed.
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    // Nothing is cleared here on purpose: setting state straight out of an
    // effect body is a re-render the rule rightly objects to. Whether the list
    // shows is derived at render time from the query length instead, so a
    // shortened query hides stale suggestions without touching state.
    if (q.length < MIN_QUERY) return;

    // Debounced, because autocomplete bills per request and an undebounced
    // field would send one for every keystroke.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/agent/quote/vehicle/places?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        setItems(data.suggestions ?? []);
        // Only open the list if this field is the one being typed in. Every
        // field re-mounts with a value after the form submits, and without
        // this check they ALL sprang open at once over the whole itinerary.
        const focused = inputRef.current !== null && document.activeElement === inputRef.current;
        setOpen(focused && (data.suggestions ?? []).length > 0);
        setActive(-1);
      } catch {
        // Offline, or the lookup failed. The field still works as plain text.
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Derived, not stored: a query the agent has shortened below the minimum
  // must not keep showing what it matched a moment ago.
  const visible = value.trim().length >= MIN_QUERY ? items : [];

  const pick = (s: Suggestion) => {
    justPicked.current = true;
    onChange(s.main);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => visible.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || visible.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % visible.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i <= 0 ? visible.length - 1 : i - 1));
          } else if (e.key === "Enter" && active >= 0) {
            // Only swallow Enter when a suggestion is highlighted, so Enter
            // still submits the form the rest of the time.
            e.preventDefault();
            pick(visible[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        role="combobox"
        autoComplete="off"
        className={control}
      />

      {open && visible.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200"
        >
          {visible.map((s, i) => (
            <li key={`${s.main}-${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={`block w-full px-3 py-2 text-left ${
                  i === active ? "bg-blue-50 text-blue-900" : "text-slate-900"
                }`}
              >
                <span className="font-medium">{s.main}</span>
                {s.secondary && <span className="ml-2 text-slate-500">{s.secondary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
