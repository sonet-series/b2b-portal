import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader, LinkButton, FormSuccess } from "@/components/ui";
import { HouseboatForm } from "../houseboat-form";
import { RatesPanel } from "./rates-panel";
import {
  updateHouseboat,
  createHouseboatRate,
  updateHouseboatRate,
  archiveHouseboatRate,
  restoreHouseboatRate,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function HouseboatDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;

  const boat = await prisma.houseboat.findUnique({
    where: { id },
    include: {
      rates: {
        orderBy: [{ active: "desc" }, { cruisePackage: "asc" }, { pricingMode: "asc" }, { validFrom: "asc" }],
      },
    },
  });
  if (!boat) notFound();

  return (
    <>
      <PageHeader
        title={boat.name}
        description={`${boat.category} · ${boat.bedrooms} bedroom${boat.bedrooms === 1 ? "" : "s"} · ${boat.location}`}
        action={<LinkButton href="/admin/houseboats">Back to houseboats</LinkButton>}
      />

      {created && (
        <div className="mb-4">
          <FormSuccess message="Houseboat created. Add its rates below." />
        </div>
      )}

      <HouseboatForm
        action={updateHouseboat.bind(null, boat.id)}
        houseboat={boat}
        submitLabel="Save houseboat"
      />

      <RatesPanel
        rates={boat.rates}
        createAction={createHouseboatRate.bind(null, boat.id)}
        updateAction={async (rateId, prev, fd) => {
          "use server";
          return updateHouseboatRate(rateId, boat.id, prev, fd);
        }}
        archiveAction={async (rateId) => {
          "use server";
          await archiveHouseboatRate(rateId, boat.id);
        }}
        restoreAction={async (rateId) => {
          "use server";
          await restoreHouseboatRate(rateId, boat.id);
        }}
      />
    </>
  );
}
