import { loadMarkupTable, ensureMarkupRules } from "@/lib/markup-store";
import { markupKey } from "@/lib/markup";
import { PRODUCT_TYPE, AGENT_TIER, AGENT_TIER_LABEL, type ProductType } from "@/lib/enums";
import { Card, PageHeader } from "@/components/ui";
import { MarkupRow } from "./markup-row";
import { LocalRunningPanel } from "./local-running-panel";
import { perStopKm, tollParkingPerDayMinor } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { toMajor } from "@/lib/money";
import { ALL_DESTINATIONS, HOME_STATE } from "@/lib/destinations";
import { ChargesPanel } from "./charges-panel";
import { savePerStopKm, saveTollParking, saveStatePermit } from "./actions";

export const dynamic = "force-dynamic";

const PRODUCT_LABEL: Record<ProductType, string> = {
  hotel: "Hotels",
  vehicle: "Vehicles",
  houseboat: "Houseboats",
  itinerary: "Packages",
};

export default async function SettingsPage() {
  const stopKm = await perStopKm();
  const tollPerDay = await tollParkingPerDayMinor();
  const permits = await prisma.statePermit.findMany({
    where: { active: true },
    include: { vehicle: { select: { type: true } } },
    orderBy: [{ state: "asc" }, { vehicleId: "asc" }],
  });
  const tollRates = await prisma.vehicleTollRate.findMany({
    include: { vehicle: { select: { type: true } } },
    orderBy: { vehicle: { type: "asc" } },
  });
  const vehicles = await prisma.vehicle.findMany({
    where: { active: true },
    orderBy: [{ capacity: "asc" }, { type: "asc" }],
    select: { id: true, type: true },
  });
  // Only states the destination list can actually recognise on an itinerary —
  // offering one we cannot detect would create a fee that never applies.
  const knownStates = [...new Set(ALL_DESTINATIONS.map((d) => d.state))]
    .filter((st) => st !== HOME_STATE)
    .sort();
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

      <LocalRunningPanel action={savePerStopKm} km={String(stopKm)} />

      <ChargesPanel
        tollAction={saveTollParking}
        permitAction={saveStatePermit}
        tollDefault={String(toMajor(tollPerDay))}
        tollRates={tollRates.map((r) => ({ vehicle: r.vehicle.type, cost: String(toMajor(r.costMinor)) }))}
        permits={permits.map((p) => ({
          state: p.state,
          vehicle: p.vehicle.type,
          cost: String(toMajor(p.costMinor)),
        }))}
        knownStates={knownStates}
        vehicles={vehicles}
      />
    </>
  );
}
