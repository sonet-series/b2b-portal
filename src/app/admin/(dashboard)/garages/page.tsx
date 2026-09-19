import { prisma } from "@/lib/db";
import { PageHeader, LinkButton, Table, Td, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GaragesPage() {
  const garages = await prisma.garage.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { vehicles: { where: { active: true } } } } },
  });

  return (
    <>
      <PageHeader
        title="Depots"
        description="Where vehicles are dispatched from. Every hire is measured depot to depot."
        action={<LinkButton href="/admin/garages/new" tone="primary">Add depot</LinkButton>}
      />

      {garages.length === 0 ? (
        <EmptyState
          title="No depots yet"
          hint="Agents cannot quote a vehicle until at least one depot exists with vehicles at it."
        />
      ) : (
        <Table head={["Depot", "State", "Address", "Vehicles", ""]}>
          {garages.map((g) => (
            <tr key={g.id} className={g.active ? undefined : "bg-slate-50"}>
              <Td>
                <span className="font-medium text-slate-900">{g.name}</span>
                {!g.active && (
                  <span className="ml-2">
                    <Badge tone="slate">Inactive</Badge>
                  </span>
                )}
              </Td>
              <Td>{g.state}</Td>
              <Td className="text-slate-500">{g.address}</Td>
              <Td>
                {g._count.vehicles === 0 ? <Badge tone="amber">No vehicles</Badge> : g._count.vehicles}
              </Td>
              <Td className="text-right">
                <a href={`/admin/garages/${g.id}`} className="text-sm text-blue-700 hover:underline">
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
