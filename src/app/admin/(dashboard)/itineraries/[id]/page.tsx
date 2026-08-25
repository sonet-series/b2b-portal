import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader, LinkButton, FormSuccess } from "@/components/ui";
import { ItineraryForm } from "../itinerary-form";
import { RatesPanel } from "./rates-panel";
import {
  updateItinerary,
  createItineraryRate,
  updateItineraryRate,
  archiveItineraryRate,
  restoreItineraryRate,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ItineraryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;

  const itinerary = await prisma.itinerary.findUnique({
    where: { id },
    include: { rates: { orderBy: [{ active: "desc" }, { pricingMode: "asc" }, { validFrom: "asc" }] } },
  });
  if (!itinerary) notFound();

  return (
    <>
      <PageHeader
        title={itinerary.name}
        description={`${itinerary.durationNights} night${itinerary.durationNights === 1 ? "" : "s"}`}
        action={<LinkButton href="/admin/itineraries">Back to packages</LinkButton>}
      />

      {created && (
        <div className="mb-4">
          <FormSuccess message="Package created. Add its pricing below." />
        </div>
      )}

      <ItineraryForm
        action={updateItinerary.bind(null, itinerary.id)}
        itinerary={itinerary}
        submitLabel="Save package"
      />

      <RatesPanel
        rates={itinerary.rates}
        createAction={createItineraryRate.bind(null, itinerary.id)}
        updateAction={async (rateId, prev, fd) => {
          "use server";
          return updateItineraryRate(rateId, itinerary.id, prev, fd);
        }}
        archiveAction={async (rateId) => {
          "use server";
          await archiveItineraryRate(rateId, itinerary.id);
        }}
        restoreAction={async (rateId) => {
          "use server";
          await restoreItineraryRate(rateId, itinerary.id);
        }}
      />
    </>
  );
}
