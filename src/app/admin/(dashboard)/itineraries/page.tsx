import { prisma } from "@/lib/db";
import { PageHeader, LinkButton, Table, Td, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ItinerariesPage() {
  const itineraries = await prisma.itinerary.findMany({
    orderBy: [{ active: "desc" }, { durationNights: "asc" }, { name: "asc" }],
    include: { _count: { select: { rates: { where: { active: true } } } } },
  });

  return (
    <>
      <PageHeader
        title="Packages"
        description="Fixed itineraries and their seasonal pricing."
        action={<LinkButton href="/admin/itineraries/new" tone="primary">Add package</LinkButton>}
      />

      {itineraries.length === 0 ? (
        <EmptyState title="No packages yet" hint="Add your first itinerary to start the catalogue." />
      ) : (
        <Table head={["Package", "Nights", "Active rates", ""]}>
          {itineraries.map((i) => (
            <tr key={i.id} className={i.active ? undefined : "bg-slate-50"}>
              <Td>
                <span className="font-medium text-slate-900">{i.name}</span>
                {!i.active && (
                  <span className="ml-2">
                    <Badge tone="slate">Inactive</Badge>
                  </span>
                )}
              </Td>
              <Td>{i.durationNights}</Td>
              <Td>{i._count.rates === 0 ? <Badge tone="amber">No pricing</Badge> : i._count.rates}</Td>
              <Td className="text-right">
                <a href={`/admin/itineraries/${i.id}`} className="text-sm text-blue-700 hover:underline">
                  Edit
                </a>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
