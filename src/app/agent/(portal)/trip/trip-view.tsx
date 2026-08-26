"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTripCart } from "@/components/trip-cart";
import { priceTripAction, saveTripAction } from "./actions";
import { formatMinor } from "@/lib/money";
import { Badge, Button, Card, EmptyState, FormError, PageHeader } from "@/components/ui";
import type { PricedCart } from "@/lib/quote-types";

const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hotel",
  houseboat: "Houseboat",
  vehicle: "Vehicle",
  itinerary: "Package",
};

export function TripView() {
  const { items, remove, clear, ready } = useTripCart();
  const [cart, setCart] = useState<PricedCart | null>(null);
  const [problems, setProblems] = useState<{ index: number; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pricing, startPricing] = useTransition();
  const [saving, startSaving] = useTransition();

  // Re-priced from the server whenever the cart changes, so what is shown is
  // current catalogue pricing rather than whatever was true when each item was
  // added — a trip assembled over ten minutes must not mix old and new rates.
  useEffect(() => {
    // Only ever kicks off async work — no synchronous setState, which would
    // cascade a re-render. The empty case is derived below instead.
    if (!ready || items.length === 0) return;
    startPricing(async () => {
      const payload = items.map((i) => ({ input: i.input, optionKey: i.optionKey }));
      const result = await priceTripAction(payload);
      setCart(result.cart);
      setProblems(result.problems);
    });
  }, [items, ready]);

  if (!ready) return null;

  // Derived rather than cleared in the effect, so an emptied cart cannot show
  // a stale total for a frame.
  const priced = items.length === 0 ? null : cart;

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="Current trip" description="Build a whole trip, then save it as one quote." />
        <EmptyState
          title="Nothing added yet"
          hint="Price a vehicle, hotel, houseboat or package, then choose Add to trip."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {(["vehicle", "houseboat", "hotel", "package"] as const).map((p) => (
            <Link
              key={p}
              href={`/agent/quote/${p}`}
              className="rounded-md bg-white px-3 py-2 text-sm text-blue-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              Quote a {p === "package" ? "package" : p}
            </Link>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Current trip"
        description="One quote, one total. Prices refresh from the current catalogue each time this page loads."
      />

      {error && (
        <div className="mb-4">
          <FormError message={error} />
        </div>
      )}

      {problems.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-900">Some items need attention</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {problems.map((p) => (
              <li key={p.index}>
                Item {p.index + 1}: {p.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((item, index) => {
          const pricedItem = priced?.items.find((p) => p.index === index);
          return (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone="blue">{PRODUCT_LABEL[item.input.productType] ?? item.input.productType}</Badge>
                  <p className="mt-1 font-medium text-slate-900">{item.label}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums text-slate-900">
                    {pricedItem ? formatMinor(pricedItem.subtotalMinor) : pricing ? "…" : "—"}
                  </p>
                  {pricedItem?.usedOverride && <Badge tone="green">Your agency rate</Badge>}
                </div>
              </div>

              {pricedItem && (
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {pricedItem.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-slate-600">{line.description}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-slate-500">
                          {line.quantity} × {formatMinor(line.unitMinor)}
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right tabular-nums font-medium text-slate-900">
                          {formatMinor(line.totalMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <button
                type="button"
                onClick={() => remove(item.id)}
                className="mt-3 text-sm text-red-700 hover:underline"
              >
                Remove
              </button>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trip total</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">
              {priced ? formatMinor(priced.totalMinor) : pricing ? "…" : "—"}
            </p>
            {priced && (
              <p className="mt-1 text-xs text-slate-500">
                {priced.travelStart} → {priced.travelEnd} · {items.length} item
                {items.length === 1 ? "" : "s"}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              tone="secondary"
              onClick={() => {
                if (confirm("Remove every item from this trip?")) clear();
              }}
            >
              Clear trip
            </Button>
            <Button
              type="button"
              disabled={saving || pricing || problems.length > 0}
              onClick={() =>
                startSaving(async () => {
                  setError(null);
                  const payload = items.map((i) => ({ input: i.input, optionKey: i.optionKey }));
                  const result = await saveTripAction(payload);
                  if (result && "error" in result) setError(result.error);
                  else clear();
                })
              }
            >
              {saving ? "Saving…" : "Save as one quote"}
            </Button>
          </div>
        </div>
        {problems.length > 0 && (
          <p className="mt-3 text-xs text-amber-700">
            Fix or remove the flagged items before saving — a trip is never saved with pieces
            missing.
          </p>
        )}
      </Card>
    </>
  );
}
