"use client";

import { applyMarkup, describeMarkup } from "@/lib/markup";
import type { MarkupKind } from "@/lib/enums";
import { formatMinor, toMinor } from "@/lib/money";

/**
 * Shows what a cost actually becomes for each agency tier, live, as Sonet
 * types it.
 *
 * The catalogue stores cost and nothing else, so without this the admin is
 * entering a number and hoping — the agent-facing prices would only be visible
 * by quoting something afterwards. Sonet asked to see the real prices before
 * saving, which is also the only way a typo in the markup settings is obvious.
 */

export type PreviewRule = { kind: MarkupKind; value: number };

export function SellPreview({
  costInput,
  kerala,
  outsideKerala,
  label = "Agent sees",
}: {
  /** Raw text straight from the cost field, may be empty or nonsense. */
  costInput: string;
  kerala: PreviewRule;
  outsideKerala: PreviewRule;
  label?: string;
}) {
  const trimmed = costInput.trim();
  const valid = /^\d[\d,]*(\.\d{1,2})?$/.test(trimmed);

  if (!valid) {
    return (
      <p className="text-xs text-slate-400">
        {label}: enter a cost to see the Kerala and outside-Kerala prices.
      </p>
    );
  }

  const cost = toMinor(trimmed);
  const k = applyMarkup(cost, { productType: "hotel", tier: "KERALA", ...kerala });
  const o = applyMarkup(cost, { productType: "hotel", tier: "OUTSIDE_KERALA", ...outsideKerala });

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
      <span className="font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-slate-700">
        Kerala <strong className="tabular-nums text-slate-900">{formatMinor(k)}</strong>
        <span className="ml-1 text-slate-400">({describeMarkup(kerala)})</span>
      </span>
      <span className="text-slate-700">
        Outside <strong className="tabular-nums text-slate-900">{formatMinor(o)}</strong>
        <span className="ml-1 text-slate-400">({describeMarkup(outsideKerala)})</span>
      </span>
    </div>
  );
}

/** The rules a rate form needs, in the shape the server passes down. */
export type ProductMarkup = { kerala: PreviewRule; outsideKerala: PreviewRule };
