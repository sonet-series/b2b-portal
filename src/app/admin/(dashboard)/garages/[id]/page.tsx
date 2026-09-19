import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader, FormSuccess } from "@/components/ui";
import { allStates } from "@/lib/destinations";
import { GarageForm } from "../garage-form";
import { FleetPanel } from "./fleet-panel";
import { updateGarage, setGarageFleet } from "../actions";

export const dynamic = "force-dynamic";

export default async function GaragePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const garage = await prisma.garage.findUnique({
    where: { id },
    include: { vehicles: true },
  });
  if (!garage) notFound();

  const vehicles = await prisma.vehicle.findMany({
    where: { active: true },
    orderBy: [{ capacity: "asc" }, { type: "asc" }],
    include: { _count: { select: { rates: { where: { active: true } } } } },
  });

  const here = new Set(garage.vehicles.filter((v) => v.active).map((v) => v.vehicleId));

  return (
    <>
      <PageHeader title={garage.name} description={garage.address} />

      {sp.created === "1" && <FormSuccess message="Depot created. Now tick which vehicles it holds." />}

      <div className="space-y-6">
        <GarageForm
          action={updateGarage.bind(null, garage.id)}
          garage={{
            name: garage.name,
            address: garage.address,
            state: garage.state,
            active: garage.active,
          }}
          submitLabel="Save depot"
          states={allStates()}
        />

        <FleetPanel
          action={setGarageFleet.bind(null, garage.id)}
          vehicles={vehicles.map((v) => ({
            id: v.id,
            type: v.type,
            capacity: v.capacity,
            hasRates: v._count.rates > 0,
            here: here.has(v.id),
          }))}
        />
      </div>
    </>
  );
}
