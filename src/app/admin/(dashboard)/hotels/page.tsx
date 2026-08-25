import { prisma } from "@/lib/db";
import { PageHeader, LinkButton, Table, Td, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HotelsPage() {
  const hotels = await prisma.hotel.findMany({
    orderBy: [{ active: "desc" }, { location: "asc" }, { name: "asc" }],
    include: { _count: { select: { rates: { where: { active: true } } } } },
  });

  return (
    <>
      <PageHeader
        title="Hotels"
        description="Properties and their default room rates."
        action={<LinkButton href="/admin/hotels/new" tone="primary">Add hotel</LinkButton>}
      />

      {hotels.length === 0 ? (
        <EmptyState
          title="No hotels yet"
          hint="Add your first property to start building the hotel catalogue."
        />
      ) : (
        <Table head={["Hotel", "Location", "Stars", "Active rates", ""]}>
          {hotels.map((h) => (
            <tr key={h.id} className={h.active ? undefined : "bg-slate-50"}>
              <Td>
                <span className="font-medium text-slate-900">{h.name}</span>
                {!h.active && (
                  <span className="ml-2">
                    <Badge tone="slate">Inactive</Badge>
                  </span>
                )}
              </Td>
              <Td>{h.location}</Td>
              <Td>{h.starCategory ? `${h.starCategory}★` : "—"}</Td>
              <Td>
                {h._count.rates === 0 ? (
                  <Badge tone="amber">No rates</Badge>
                ) : (
                  h._count.rates
                )}
              </Td>
              <Td className="text-right">
                <a href={`/admin/hotels/${h.id}`} className="text-sm text-blue-700 hover:underline">
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
