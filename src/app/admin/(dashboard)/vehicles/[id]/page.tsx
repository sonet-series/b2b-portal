import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadMarkupTable } from "@/lib/markup-store";
import { markupKey } from "@/lib/markup";
import { PageHeader, LinkButton, FormSuccess } from "@/components/ui";
import { VehicleForm } from "../vehicle-form";
import { RatesPanel } from "./rates-panel";
import { PhotoPanel } from "./photo-panel";
import {
  updateVehicle,
  uploadVehiclePhoto,
  removeVehiclePhoto,
  createVehicleRate,
  updateVehicleRate,
  archiveVehicleRate,
  restoreVehicleRate,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { rates: { orderBy: [{ active: "desc" }, { rateType: "asc" }, { validFrom: "asc" }] } },
  });
  if (!vehicle) notFound();

  const table = await loadMarkupTable();
  const markup = {
    kerala: table.get(markupKey("vehicle", "KERALA"))!,
    outsideKerala: table.get(markupKey("vehicle", "OUTSIDE_KERALA"))!,
  };

  return (
    <>
      <PageHeader
        title={vehicle.type}
        description={`Carries up to ${vehicle.capacity} passengers`}
        action={<LinkButton href="/admin/vehicles">Back to vehicles</LinkButton>}
      />

      {created && (
        <div className="mb-4">
          <FormSuccess message="Vehicle created. Add its rates below." />
        </div>
      )}

      <VehicleForm action={updateVehicle.bind(null, vehicle.id)} vehicle={vehicle} submitLabel="Save vehicle" />

      <PhotoPanel
        vehicleId={vehicle.id}
        vehicleType={vehicle.type}
        hasPhoto={Boolean(vehicle.photoStoredName)}
        // The stored name changes on every upload, so it busts the browser
        // cache for a URL whose path never does.
        photoVersion={vehicle.photoStoredName ?? "none"}
        uploadAction={uploadVehiclePhoto.bind(null, vehicle.id)}
        removeAction={async () => {
          "use server";
          await removeVehiclePhoto(vehicle.id);
        }}
      />

      <RatesPanel
        markup={markup}
        rates={vehicle.rates}
        createAction={createVehicleRate.bind(null, vehicle.id)}
        updateAction={async (rateId, prev, fd) => {
          "use server";
          return updateVehicleRate(rateId, vehicle.id, prev, fd);
        }}
        archiveAction={async (rateId) => {
          "use server";
          await archiveVehicleRate(rateId, vehicle.id);
        }}
        restoreAction={async (rateId) => {
          "use server";
          await restoreVehicleRate(rateId, vehicle.id);
        }}
      />
    </>
  );
}
