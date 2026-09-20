import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { listPhotoIdsFor } from "@/lib/product-photos";
import { ProductGallery } from "@/components/product-photos";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The fleet, with photographs — for looking at BEFORE quoting.
 *
 * Sonet, 20 Sept 2026: agents need to see every vehicle type before they build
 * a quote. The picker shows one at a time and only once chosen, which answers
 * "is this the car I meant" but not "which car should I sell them" — and that
 * second question is the one an agent is actually asking when their customer
 * says "what have you got for six people".
 *
 * Every photograph here is downloadable, singly or as a zip, because the agent
 * is going to forward them to their own customer. That is NOT a walk-back of
 * keeping our pictures off the branded PDF: a file an agent chooses to send is
 * a different thing from our imagery printed on their letterhead.
 */
export default async function FleetPage() {
  await requireAgent();

  /*
   * The same filter as the quote picker: active, and with a live rate. A
   * vehicle nobody can be quoted has no business being browsed — an agent who
   * shows their customer a Fortuner they cannot then price has been misled by
   * their own supplier.
   */
  const vehicles = await prisma.vehicle.findMany({
    where: { active: true, rates: { some: { active: true } } },
    // Sonet's order, set in the admin. Tie-breakers match the admin list, so
    // what he arranges there is exactly what an agent sees here.
    orderBy: [{ sortOrder: "asc" }, { capacity: "asc" }, { type: "asc" }],
    select: {
      id: true,
      type: true,
      capacity: true,
      garages: {
        where: { active: true, garage: { active: true } },
        select: { garage: { select: { id: true, name: true } } },
      },
    },
  });

  const photos = await listPhotoIdsFor("vehicle", vehicles.map((v) => v.id));

  return (
    <>
      <PageHeader
        title="Our fleet"
        description="Every vehicle you can quote, with photographs you can send on to your customer."
      />

      {vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles available yet"
          hint="Series Tours has not published vehicle rates."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => {
            const photoIds = photos.get(vehicle.id) ?? [];
            const depots = [...new Set(vehicle.garages.map((g) => g.garage.name))];
            const firstDepot = vehicle.garages[0]?.garage.id;
            return (
              <Card key={vehicle.id}>
                {photoIds.length > 0 ? (
                  <ProductGallery
                    photoIds={photoIds}
                    alt={vehicle.type}
                    download={{ kind: "vehicle", id: vehicle.id }}
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-400 ring-1 ring-inset ring-slate-200">
                    No photographs yet
                  </div>
                )}

                <h2 className="mt-3 font-medium text-slate-900">{vehicle.type}</h2>
                <p className="text-sm text-slate-500">
                  Up to {vehicle.capacity} passenger{vehicle.capacity === 1 ? "" : "s"}
                </p>
                {depots.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    From {depots.join(", ")}
                  </p>
                )}

                {/*
                  Carries a depot as well as the vehicle. The picker offers
                  only what a depot can dispatch, so a vehicle preselected
                  without one is not selectable at all.
                */}
                <Link
                  href={
                    firstDepot
                      ? `/agent/quote/vehicle?garageId=${firstDepot}&vehicleId=${vehicle.id}`
                      : "/agent/quote/vehicle"
                  }
                  className="mt-3 inline-block text-sm text-blue-700 hover:underline"
                >
                  Quote this vehicle →
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
