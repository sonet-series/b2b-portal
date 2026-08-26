import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadMarkupTable } from "@/lib/markup-store";
import { markupKey } from "@/lib/markup";
import { PageHeader, LinkButton, FormSuccess } from "@/components/ui";
import { HotelForm } from "../hotel-form";
import { RatesPanel } from "./rates-panel";
import {
  updateHotel,
  createHotelRate,
  updateHotelRate,
  archiveHotelRate,
  restoreHotelRate,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function HotelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;

  const hotel = await prisma.hotel.findUnique({
    where: { id },
    include: { rates: { orderBy: [{ active: "desc" }, { roomType: "asc" }, { validFrom: "asc" }] } },
  });
  if (!hotel) notFound();

  const table = await loadMarkupTable();
  const markup = {
    kerala: table.get(markupKey("hotel", "KERALA"))!,
    outsideKerala: table.get(markupKey("hotel", "OUTSIDE_KERALA"))!,
  };

  return (
    <>
      <PageHeader
        title={hotel.name}
        description={hotel.location}
        action={<LinkButton href="/admin/hotels">Back to hotels</LinkButton>}
      />

      {created && (
        <div className="mb-4">
          <FormSuccess message="Hotel created. Add its rates below." />
        </div>
      )}

      <HotelForm action={updateHotel.bind(null, hotel.id)} hotel={hotel} submitLabel="Save hotel" />

      <RatesPanel
        markup={markup}
        rates={hotel.rates}
        createAction={createHotelRate.bind(null, hotel.id)}
        updateAction={async (rateId, prev, fd) => {
          "use server";
          return updateHotelRate(rateId, hotel.id, prev, fd);
        }}
        archiveAction={async (rateId) => {
          "use server";
          await archiveHotelRate(rateId, hotel.id);
        }}
        restoreAction={async (rateId) => {
          "use server";
          await restoreHotelRate(rateId, hotel.id);
        }}
      />
    </>
  );
}
