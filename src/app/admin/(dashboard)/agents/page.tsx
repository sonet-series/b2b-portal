import { prisma } from "@/lib/db";
import { PageHeader, Table, Td, Badge, EmptyState, Card } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/handover";
import type { AgentStatus } from "@/lib/enums";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<AgentStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};

function AgentTable({
  agents,
}: {
  agents: {
    id: string;
    agencyName: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    altPhone: string | null;
    altEmail: string | null;
    status: string;
    createdAt: Date;
    mustChangePassword: boolean;
    _count: { rateCardEntries: number; documents: number };
  }[];
}) {
  return (
    <Table head={["Agency", "Contact", "Documents", "Status", "Rate card", "Registered", ""]}>
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
          <Td className="text-xs">
            {a._count.documents === 3 ? (
              <span className="text-slate-600">3 uploaded</span>
            ) : a._count.documents === 0 ? (
              <span className="text-slate-400">none</span>
            ) : (
              <span className="text-amber-700">{a._count.documents} of 3</span>
            )}
          </Td>
          <Td>
            <Badge tone={STATUS_TONE[a.status as AgentStatus] ?? "slate"}>
              {STATUS_LABEL[a.status as AgentStatus] ?? a.status}
            </Badge>
            {a.mustChangePassword && (
              <div className="mt-1 text-xs text-amber-700">temp password</div>
            )}
          </Td>
          <Td>
            {a._count.rateCardEntries === 0 ? (
              <span className="text-xs text-slate-500">defaults only</span>
            ) : (
              `${a._count.rateCardEntries} override${a._count.rateCardEntries === 1 ? "" : "s"}`
            )}
          </Td>
          <Td className="text-xs text-slate-500">{a.createdAt.toISOString().slice(0, 10)}</Td>
          <Td className="text-right">
            <a href={`/admin/agents/${a.id}`} className="text-sm text-blue-700 hover:underline">
              {a.status === "pending" ? "Review" : "Open"}
            </a>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export default async function AgentsPage() {
  const select = {
    id: true,
    agencyName: true,
    contactName: true,
    email: true,
    phone: true,
    address: true,
    altPhone: true,
    altEmail: true,
    status: true,
    createdAt: true,
    mustChangePassword: true,
    _count: { select: { rateCardEntries: true, documents: true } },
  } as const;

  const [pending, others] = await Promise.all([
    prisma.agent.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select }),
    prisma.agent.findMany({
      where: { NOT: { status: "pending" } },
      orderBy: [{ status: "asc" }, { agencyName: "asc" }],
      select,
    }),
  ]);

  return (
    <>
      <PageHeader title="Agents" description="Registrations, approvals, and per-agent rate cards." />

      <Card className="mb-6 border-slate-200 bg-slate-50">
        <p className="text-sm text-slate-600">
          This portal sends no email. After approving an agent you get a copy-ready message to pass
          on over WhatsApp or by phone.
        </p>
      </Card>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Awaiting review
          {pending.length > 0 && (
            <span className="ml-2">
              <Badge tone="amber">{pending.length}</Badge>
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting" hint="New registrations will appear here." />
        ) : (
          <AgentTable agents={pending} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">All other agents</h2>
        {others.length === 0 ? (
          <EmptyState title="No approved or rejected agents yet" />
        ) : (
          <AgentTable agents={others} />
        )}
      </section>
    </>
  );
}
