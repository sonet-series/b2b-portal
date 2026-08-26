"use client";

import { useActionState, useState } from "react";
import { saveMarkupRule } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/validation";
import { MARKUP_KIND, MARKUP_KIND_LABEL, type MarkupKind } from "@/lib/enums";
import { applyMarkup } from "@/lib/markup";
import { formatMinor } from "@/lib/money";
import { Button, FormError, FormSuccess, Select, Field } from "@/components/ui";

/** A ₹10,000 cost, so the effect of a rule is legible at a glance. */
const SAMPLE_COST = 10_000_00;

export function MarkupRow({
  productType,
  productLabel,
  tier,
  tierLabel,
  kind: initialKind,
  value: initialValue,
}: {
  productType: string;
  productLabel: string;
  tier: string;
  tierLabel: string;
  kind: MarkupKind;
  /** paise for FLAT, basis points for PERCENT */
  value: number;
}) {
  const [state, action, pending] = useActionState(saveMarkupRule, EMPTY_FORM_STATE);
  const [kind, setKind] = useState<MarkupKind>(initialKind);
  // Both units are stored ×100, so the human-facing figure is the same maths.
  const [amount, setAmount] = useState(String(initialValue / 100));

  const numeric = Number(amount);
  const preview =
    Number.isFinite(numeric) && numeric >= 0
      ? applyMarkup(SAMPLE_COST, {
          productType: productType as "hotel",
          tier: tier as "KERALA",
          kind,
          value: Math.round(numeric * 100),
        })
      : null;

  return (
    <form action={action} className="grid items-end gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_8rem_10rem_9rem_1fr_auto]">
      <input type="hidden" name="productType" value={productType} />
      <input type="hidden" name="tier" value={tier} />

      <div>
        <p className="text-sm font-medium text-slate-900">{productLabel}</p>
        <p className="text-xs text-slate-500">{tierLabel}</p>
      </div>

      <Select
        label="Type"
        name="kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as MarkupKind)}
        options={MARKUP_KIND.map((k) => ({ value: k, label: MARKUP_KIND_LABEL[k] }))}
      />

      <Field
        label={kind === "FLAT" ? "Amount (₹)" : "Percentage (%)"}
        name="amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={state.errors?.amount}
      />

      <div className="text-xs text-slate-500">
        <p className="font-medium uppercase tracking-wide">₹10,000 cost</p>
        <p className="mt-1 text-sm tabular-nums text-slate-900">
          {preview === null ? "—" : formatMinor(preview)}
        </p>
      </div>

      <div className="min-w-0">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />
      </div>

      <Button type="submit" tone="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
