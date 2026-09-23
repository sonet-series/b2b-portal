import { requireAgent } from "@/lib/auth";
import { listPhotoIds, listPhotoIdsFor } from "@/lib/product-photos";
import { gstBps } from "@/lib/settings";
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
import { FormError, PageHeader, EmptyState } from "@/components/ui";
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
  const gst = await gstBps();
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
        // The same fleet order as /agent/fleet and the admin list. One order
        // for the catalogue: an agent who browses the fleet and then opens the
        // picker should not have to hunt for what was third a moment ago.
        orderBy: [
          { vehicle: { sortOrder: "asc" } },
          { vehicle: { capacity: "asc" } },
          { vehicle: { type: "asc" } },
        ],
        include: { vehicle: { select: { id: true, type: true, capacity: true } } },
      },
    },
  });

  /*
   * Photographs for every vehicle on offer, in ONE query rather than one per
   * vehicle: the picker has to know what each has before the agent chooses,
   * and a depot can dispatch a dozen types.
   */
  const vehiclePhotos = await listPhotoIdsFor(
    "vehicle",
    [...new Set(garages.flatMap((g) => g.vehicles.map((v) => v.vehicle.id)))]
  );

  const garageOptions: GarageOption[] = garages
    .map((g) => ({
      id: g.id,
      name: g.name,
      vehicles: g.vehicles.map((v) => ({
        ...v.vehicle,
        photoIds: vehiclePhotos.get(v.vehicle.id) ?? [],
      })),
    }))
    .filter((g) => g.vehicles.length > 0);

  // Present when the agent came here from "Edit" on a saved quote. Saving
  // then replaces that quote rather than leaving a near-duplicate behind.
  const editingReference = typeof params.edit === "string" ? params.edit : null;

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
  /*
   * "Attempted" means the agent pressed Get quote, not that a vehicle is named
   * in the URL.
   *
   * It was `Boolean(params.vehicleId)`, which was true of any link that
   * preselected a vehicle — so arriving from the fleet page landed on a form
   * already covered in red "required" messages for dates nobody had been asked
   * for yet. The form is a GET, so a real submission always carries startDate,
   * even empty; a preselecting link carries none.
   */
  const attempted = params.startDate !== undefined;

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

  /*
   * The product's photographs, resolved NOW rather than frozen onto the
   * option — a picture uploaded after a quote existed should appear on it, and
   * a removed one should stop.
   */
  const resultPhotoIds =
    result && parsed.success ? await listPhotoIds("vehicle", parsed.data.vehicleId) : [];

  const saveActions: Record<string, (prev: FormState) => Promise<FormState>> = {};
  if (result && parsed.success) {
    for (const option of result.options) {
      saveActions[option.key] = saveQuoteAction.bind(
        null,
        { productType: "vehicle", ...parsed.data },
        option.key,
        editingReference
      );
    }
  }


  return (
    <>
      <PageHeader
        title={editingReference ? `Editing ${editingReference}` : "Vehicle quote"}
        description={
          editingReference
            ? "Change anything and save — the quote keeps its reference and is re-priced at today's rates."
            : "Build the trip day by day. Distances are measured depot to depot."
        }
      />

      {garageOptions.length === 0 ? (
        <EmptyState
          title="No vehicles available yet"
          hint="Series Tours has not published a depot with vehicles and rates."
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

          {/*
            The measured legs are NOT shown here.
            Sonet, 24 Sept 2026: "this box is not required to show to the
            agents in the get quote area." Same reasoning as removing them from
            the saved quote and the PDF on 20 Sept — "Depot to Cochin, 0 km"
            and a 60 km local-running allowance are how a price was CALCULATED.
            An agent who can see them starts explaining them to a customer.
            They are on /admin/quotes, where they explain a price to the person
            who set it.
          */}

          {result && (
            <QuoteResults
              result={result}
              gstBps={gst}
              saveActions={saveActions}
              input={parsed.success ? { productType: "vehicle", ...parsed.data } : undefined}
              photoIds={resultPhotoIds}
            />
          )}
        </>
      )}
    </>
  );
}
