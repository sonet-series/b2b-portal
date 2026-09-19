import { requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { quoteVehicle } from "@/lib/quote";
import { PricingError } from "@/lib/pricing";
import { usingDistanceStub } from "@/lib/distance";
import {
  vehicleQuoteSchema,
  parseVehicleLegs,
  parseItineraryDays,
  parseChildAges,
  type FormState,
} from "@/lib/validation";
import { FormError, PageHeader, EmptyState, Card } from "@/components/ui";
import { TripForm, type GarageOption } from "./trip-form";
import { SearchForm } from "../search-form";
import { QuoteResults } from "../quote-results";
import { saveQuoteAction } from "../actions";
import type { QuoteResult } from "@/lib/quote-types";

export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");

export default async function VehicleQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const agent = await requireAgent();
  const params = await searchParams;

  // Only garages that can actually dispatch something: an active vehicle, at
  // this garage, with a live rate. A garage offering a vehicle nobody can be
  // quoted is worse than no garage at all.
  const garages = await prisma.garage.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      vehicles: {
        where: { active: true, vehicle: { active: true, rates: { some: { active: true } } } },
        include: { vehicle: { select: { id: true, type: true, capacity: true } } },
      },
    },
  });

  const garageOptions: GarageOption[] = garages
    .map((g) => ({ id: g.id, name: g.name, vehicles: g.vehicles.map((v) => v.vehicle) }))
    .filter((g) => g.vehicles.length > 0);

  const dayRows = parseItineraryDays(params);
  const childAges = parseChildAges(params);
  // Quotes bookmarked before the itinerary builder existed carry typed legs.
  const legRows = parseVehicleLegs(params);

  const parsed = vehicleQuoteSchema.safeParse({
    ...params,
    legs: legRows,
    ...(dayRows.length > 0 ? { days: dayRows } : {}),
    ...(childAges.length > 0 ? { childAges } : {}),
  });
  const attempted = Boolean(params.vehicleId);

  let result: QuoteResult | null = null;
  let error: string | null = null;
  const fieldErrors: Record<string, string> = {};

  if (attempted && !parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  } else if (attempted && parsed.success) {
    try {
      result = await quoteVehicle({ id: agent.id, tier: agent.tier }, parsed.data);
    } catch (e) {
      error = e instanceof PricingError ? e.message : "Could not price that hire.";
    }
  }

  const saveActions: Record<string, (prev: FormState) => Promise<FormState>> = {};
  if (result && parsed.success) {
    for (const option of result.options) {
      saveActions[option.key] = saveQuoteAction.bind(
        null,
        { productType: "vehicle", ...parsed.data },
        option.key
      );
    }
  }

  const itin = result?.itinerary;

  return (
    <>
      <PageHeader
        title="Vehicle quote"
        description="Build the trip day by day. Distances are measured garage to garage."
      />

      {garageOptions.length === 0 ? (
        <EmptyState
          title="No vehicles available yet"
          hint="Series Tours has not published a garage with vehicles and rates."
        />
      ) : (
        <>
          {usingDistanceStub() && (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
              Development mode — road distances below are fabricated, not measured. Set
              GOOGLE_MAPS_API_KEY to use real ones.
            </p>
          )}

          <SearchForm>
            <TripForm
              garages={garageOptions}
              fieldErrors={fieldErrors}
              initial={{
                garageId: str(params.garageId),
                vehicleId: str(params.vehicleId),
                startDate: str(params.startDate),
                endDate: str(params.endDate),
                adults: str(params.adults),
                childAges,
                days: dayRows,
              }}
            />
          </SearchForm>

          {error && <FormError message={error} />}

          {itin && (
            <Card className="mb-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">Distance</h2>
                <p className="text-sm text-slate-600 tabular-nums">
                  {itin.routedKm.toLocaleString("en-IN")} km on the road
                  {itin.bufferKm > 0 && <> + {itin.bufferKm.toLocaleString("en-IN")} km sightseeing</>}
                  {" = "}
                  <strong className="text-slate-900">{itin.totalKm.toLocaleString("en-IN")} km</strong>
                </p>
              </div>

              <ul className="divide-y divide-slate-100 text-sm">
                {itin.legs.map((leg, i) => (
                  <li key={i} className="flex items-baseline gap-3 py-1.5">
                    <span className="flex-1 text-slate-700">{leg.label}</span>
                    <span className="tabular-nums text-slate-900">{leg.km.toLocaleString("en-IN")} km</span>
                    {leg.bufferKm > 0 && (
                      <span className="tabular-nums text-slate-500">
                        +{leg.bufferKm.toLocaleString("en-IN")} km
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-xs text-slate-500">
                Includes the run out from the garage and back to it after the drop — both are
                chargeable distance the vehicle actually covers.
                {itin.anyManual && " Some distances were entered by hand rather than measured."}
              </p>
            </Card>
          )}

          {result && (
            <QuoteResults
              result={result}
              saveActions={saveActions}
              input={parsed.success ? { productType: "vehicle", ...parsed.data } : undefined}
            />
          )}
        </>
      )}
    </>
  );
}
