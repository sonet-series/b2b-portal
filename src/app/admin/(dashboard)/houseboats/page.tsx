import { prisma } from "@/lib/db";
import { PageHeader, LinkButton, Table, Td, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HouseboatsPage() {
  const boats = await prisma.houseboat.findMany({
    orderBy: [{ active: "desc" }, { location: "asc" }, { name: "asc" }],
    include: { _count: { select: { rates: { where: { active: true } } } } },
  });

  return (
    <>
      <PageHeader
        title="Houseboats"
        description="Boats and their cruise rates. Rates can be whole-boat or per-person."
        action={<LinkButton href="/admin/houseboats/new" tone="primary">Add houseboat</LinkButton>}
      />

      {boats.length === 0 ? (
        <EmptyState title="No houseboats yet" hint="Add your first boat to start the catalogue." />
      ) : (
        <Table head={["Houseboat", "Location", "Category", "Bedrooms", "Active rates", ""]}>
          {boats.map((b) => (
            <tr key={b.id} className={b.active ? undefined : "bg-slate-50"}>
              <Td>
                <span className="font-medium text-slate-900">{b.name}</span>
                {b.operator && <div className="text-xs text-slate-500">{b.operator}</div>}
                {!b.active && (
                  <span className="ml-2">
                    <Badge tone="slate">Inactive</Badge>
                  </span>
                )}
              </Td>
              <Td>{b.location}</Td>
              <Td>{b.category}</Td>
              <Td>{b.bedrooms}</Td>
              <Td>{b._count.rates === 0 ? <Badge tone="amber">No rates</Badge> : b._count.rates}</Td>
              <Td className="text-right">
                <a href={`/admin/houseboats/${b.id}`} className="text-sm text-blue-700 hover:underline">
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
