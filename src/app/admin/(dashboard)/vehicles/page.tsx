import { prisma } from "@/lib/db";
import { PageHeader, LinkButton, Table, Td, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const vehicles = await prisma.vehicle.findMany({
    orderBy: [{ active: "desc" }, { capacity: "asc" }, { type: "asc" }],
    include: { _count: { select: { rates: { where: { active: true } } } } },
  });

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Vehicle types and their default rates."
        action={<LinkButton href="/admin/vehicles/new" tone="primary">Add vehicle</LinkButton>}
      />

      {vehicles.length === 0 ? (
        <EmptyState title="No vehicles yet" hint="Add your first vehicle type to start the catalogue." />
      ) : (
        <Table head={["Vehicle", "Capacity", "Active rates", ""]}>
          {vehicles.map((v) => (
            <tr key={v.id} className={v.active ? undefined : "bg-slate-50"}>
              <Td>
                <span className="font-medium text-slate-900">{v.type}</span>
                {!v.active && (
                  <span className="ml-2">
                    <Badge tone="slate">Inactive</Badge>
                  </span>
                )}
              </Td>
              <Td>{v.capacity} seats</Td>
              <Td>{v._count.rates === 0 ? <Badge tone="amber">No rates</Badge> : v._count.rates}</Td>
              <Td className="text-right">
                <a href={`/admin/vehicles/${v.id}`} className="text-sm text-blue-700 hover:underline">
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
