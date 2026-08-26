"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import type { AnyQuoteInput } from "@/lib/quote-types";

/**
 * The trip an agent is assembling.
 *
 * Held in sessionStorage rather than the URL: adding items means moving
 * between the four product screens, and a cart of six items would make an
 * unusable query string. Nothing is written to the database until the agent
 * saves — the same rule single-product quoting already follows.
 *
 * Only INPUTS and the chosen option key are stored. No prices: the whole cart
 * is re-priced server-side on every render of the trip page and again on save,
 * so a stale or edited total can never reach a Quote record.
 */

export type TripItem = {
  /** Local id, so removing the right row does not depend on array position. */
  id: string;
  input: AnyQuoteInput;
  optionKey: string;
  /** Display only, so the bar can name things without a server round-trip. */
  label: string;
};

const KEY = "st-trip-cart-v1";

type TripContext = {
  items: TripItem[];
  add: (item: Omit<TripItem, "id">) => void;
  remove: (id: string) => void;
  clear: () => void;
  ready: boolean;
};

const Ctx = createContext<TripContext | null>(null);

export function TripCartProvider({ children }: { children: React.ReactNode }) {
  /**
   * Read once, lazily, on the first client render rather than in an effect.
   * An effect would set state synchronously and cascade a re-render, and would
   * also flash an empty cart before the stored one appeared.
   *
   * `ready` exists because the SERVER renders with no cart at all: the first
   * client render must match that, or hydration mismatches.
   */
  const [items, setItems] = useState<TripItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: TripItem[] = [];
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) stored = JSON.parse(raw) as TripItem[];
    } catch {
      // Corrupt or unavailable storage: start empty rather than break the page.
    }
    // One state update, in a microtask, so the effect body itself stays
    // side-effect-only.
    queueMicrotask(() => {
      setItems(stored);
      setReady(true);
    });
  }, []);

  const persist = useCallback((next: TripItem[]) => {
    setItems(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private browsing or a full quota — the cart still works for this page.
    }
  }, []);

  const add = useCallback(
    (item: Omit<TripItem, "id">) =>
      persist([...items, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]),
    [items, persist]
  );
  const remove = useCallback((id: string) => persist(items.filter((i) => i.id !== id)), [items, persist]);
  const clear = useCallback(() => persist([]), [persist]);

  return <Ctx.Provider value={{ items, add, remove, clear, ready }}>{children}</Ctx.Provider>;
}

export function useTripCart(): TripContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTripCart must be used inside TripCartProvider");
  return ctx;
}

/** Persistent bar, so the trip is visible from every quote screen. */
export function TripCartBar() {
  const { items, ready } = useTripCart();
  if (!ready || items.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-sm text-slate-600">
          <strong className="text-slate-900">{items.length}</strong>{" "}
          item{items.length === 1 ? "" : "s"} in this trip
        </span>
        <span className="hidden text-xs text-slate-500 sm:inline">
          {items.map((i) => i.label.split(" · ")[0]).join(" · ")}
        </span>
        <Link
          href="/agent/trip"
          className="ml-auto rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Review trip
        </Link>
      </div>
    </div>
  );
}
