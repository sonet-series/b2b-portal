"use client";

import { useActionState, useState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { PRODUCT_TYPE, type ProductType } from "@/lib/enums";
import { formatMinor } from "@/lib/money";
import { Badge, Button, Card, EmptyState, FormError, FormSuccess, MoneyField, Select, Table, Td, TextArea } from "@/components/ui";

/** One selectable priced row, pre-flattened on the server. */
export type RateOption = {
  productType: ProductType;
  referenceId: string;
  label: string;
  defaultMinor: number;
};

export type OverrideRow = {
  id: string;
  productType: string;
  referenceId: string;
  overridePriceMinor: number;
  notes: string | null;
  /** Null when the underlying rate has since been deleted. */
  label: string | null;
  defaultMinor: number | null;
};

const PRODUCT_LABEL: Record<ProductType, string> = {
  hotel: "Hotel",
  houseboat: "Houseboat",
  vehicle: "Vehicle",
  itinerary: "Package",
};

export function RateCardPanel({
  overrides,
  options,
  addAction,
  removeAction,
}: {
  overrides: OverrideRow[];
  options: RateOption[];
  addAction: (prev: FormState, fd: FormData) => Promise<FormState>;
  removeAction: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [productType, setProductType] = useState<ProductType>("hotel");
  const [state, formAction, pending] = useActionState(addAction, EMPTY_FORM_STATE);
  const err = state.errors ?? {};

  const visible = options.filter((o) => o.productType === productType);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Rate card</h2>
          <p className="text-sm text-slate-500">
            Per-agent price overrides. Anything without an override is quoted at the catalogue
            default — a missing override never blocks a quote.
          </p>
        </div>
        {!adding && (
          <Button tone="secondary" onClick={() => setAdding(true)}>
            Add override
          </Button>
        )}
      </div>

      {adding && (
        <Card className="mb-4">
          <form action={formAction} className="space-y-4">
            <FormError message={state.ok ? undefined : state.message} />
            <FormSuccess message={state.ok ? state.message : undefined} />

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Product type"
                name="productType"
                required
                options={PRODUCT_TYPE.map((p) => ({ value: p, label: PRODUCT_LABEL[p] }))}
                value={productType}
                onChange={(e) => setProductType(e.target.value as ProductType)}
              />
              <div className="sm:col-span-2">
                <Select
                  label="Rate"
                  name="referenceId"
                  required
                  options={
                    visible.length > 0
                      ? visible.map((o) => ({
                          value: o.referenceId,
                          label: `${o.label} — default ${formatMinor(o.defaultMinor)}`,
                        }))
                      : [{ value: "", label: "No active rates for this product type" }]
                  }
                  error={err.referenceId}
                />
              </div>
            </div>

            <MoneyField
              label="Override price"
              name="overridePriceMinor"
              required
              hint="Replaces the default for this agent only."
              error={err.overridePriceMinor}
            />
            <TextArea label="Notes" name="notes" hint="Internal only." error={err.notes} />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending || visible.length === 0}>
                {pending ? "Saving…" : "Save override"}
              </Button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {overrides.length === 0 ? (
        <EmptyState
          title="No overrides"
          hint="This agent is quoted catalogue default rates on everything."
        />
      ) : (
        <Table head={["Product", "Rate", "Default", "This agent", ""]}>
          {overrides.map((o) => (
            <tr key={o.id}>
              <Td>
                <Badge tone="blue">{PRODUCT_LABEL[o.productType as ProductType] ?? o.productType}</Badge>
              </Td>
              <Td>
                {o.label ?? (
                  <span className="text-amber-700">Rate deleted — this override does nothing</span>
                )}
                {o.notes && <div className="text-xs text-slate-500">{o.notes}</div>}
              </Td>
              <Td className="text-slate-500">
                {o.defaultMinor != null ? formatMinor(o.defaultMinor) : "—"}
              </Td>
              <Td className="font-medium text-slate-900">{formatMinor(o.overridePriceMinor)}</Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => removeAction(o.id)}
                  className="text-sm text-red-700 hover:underline"
                >
                  Remove
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
