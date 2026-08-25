import { prisma } from "@/lib/db";
import { PageHeader, Table, Td, Badge, EmptyState, Card } from "@/components/ui";
import type { AgentStatus } from "@/lib/enums";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<AgentStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};

/**
 * Read-only for now. Approve / reject and rate-card assignment are Phase 3;
 * this exists so the nav link resolves and so signups are visible in the
 * meantime.
 */
export default async function AgentsPage() {
  const agents = await prisma.agent.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { rateCardEntries: true } } },
  });

  return (
    <>
      <PageHeader title="Agents" description="Registrations and their approval status." />

      <Card className="mb-6 border-blue-200 bg-blue-50">
        <p className="text-sm text-blue-900">
          Approving agents and assigning rate cards arrives in Phase 3. This list is read-only.
        </p>
      </Card>

      {agents.length === 0 ? (
        <EmptyState title="No registrations yet" hint="Agent signups will appear here." />
      ) : (
        <Table head={["Agency", "Contact", "GST / licence", "Status", "Rate card", "Registered"]}>
          {agents.map((a) => (
            <tr key={a.id}>
              <Td>
                <span className="font-medium text-slate-900">{a.agencyName}</span>
              </Td>
              <Td>
                <div>{a.contactName}</div>
                <div className="text-xs text-slate-500">
                  {a.email} · {a.phone}
                </div>
              </Td>
              <Td className="font-mono text-xs">{a.gstOrLicenseNumber}</Td>
              <Td>
                <Badge tone={STATUS_TONE[a.status as AgentStatus] ?? "slate"}>{a.status}</Badge>
              </Td>
              <Td>
                {a._count.rateCardEntries === 0 ? (
                  <span className="text-xs text-slate-500">defaults only</span>
                ) : (
                  `${a._count.rateCardEntries} override${a._count.rateCardEntries === 1 ? "" : "s"}`
                )}
              </Td>
              <Td className="text-xs text-slate-500">
                {a.createdAt.toISOString().slice(0, 10)}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
