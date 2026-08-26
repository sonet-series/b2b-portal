import { loadMarkupTable, ensureMarkupRules } from "@/lib/markup-store";
import { markupKey } from "@/lib/markup";
import { PRODUCT_TYPE, AGENT_TIER, AGENT_TIER_LABEL, type ProductType } from "@/lib/enums";
import { Card, PageHeader } from "@/components/ui";
import { MarkupRow } from "./markup-row";

export const dynamic = "force-dynamic";

const PRODUCT_LABEL: Record<ProductType, string> = {
  hotel: "Hotels",
  vehicle: "Vehicles",
  houseboat: "Houseboats",
  itinerary: "Packages",
};

export default async function SettingsPage() {
  // Self-heals if a rule is somehow missing, so the screen can never show a
  // blank row that silently falls back to a default nobody can see.
  await ensureMarkupRules();
  const table = await loadMarkupTable();

  return (
    <>
      <PageHeader
        title="Markup settings"
        description="How cost becomes the price each agency tier is quoted."
      />

      <Card className="mb-6 border-blue-200 bg-blue-50">
        <p className="text-sm text-blue-900">
          The catalogue stores <strong>cost only</strong>. Both agent prices are worked out from
          these rules every time something is quoted, so a change here applies immediately — no
          re-entering rates.
        </p>
        <p className="mt-2 text-sm text-blue-900">
          Quotes already saved are <strong>not</strong> affected. They keep the prices they were
          saved with.
        </p>
      </Card>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {PRODUCT_TYPE.map((product) =>
          AGENT_TIER.map((tier) => {
            const rule = table.get(markupKey(product, tier))!;
            return (
              <MarkupRow
                key={`${product}-${tier}`}
                productType={product}
                productLabel={PRODUCT_LABEL[product]}
                tier={tier}
                tierLabel={AGENT_TIER_LABEL[tier]}
                kind={rule.kind}
                value={rule.value}
              />
            );
          })
        )}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Ancillary charges — extra bed, extra pax, driver allowance, extra km, single supplement —
        use their parent product&rsquo;s rule. A hotel&rsquo;s extra bed is marked up by the hotel
        rule.
      </p>
    </>
  );
}
