import { prisma } from "@/lib/db";
import { Card, PageHeader, LinkButton, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [hotels, houseboats, vehicles, itineraries, pendingAgents, approvedAgents] =
    await Promise.all([
      prisma.hotel.count({ where: { active: true } }),
      prisma.houseboat.count({ where: { active: true } }),
      prisma.vehicle.count({ where: { active: true } }),
      prisma.itinerary.count({ where: { active: true } }),
      prisma.agent.count({ where: { status: "pending" } }),
      prisma.agent.count({ where: { status: "approved" } }),
    ]);

  const catalogue = [
    { label: "Hotels", count: hotels, href: "/admin/hotels" },
    { label: "Houseboats", count: houseboats, href: "/admin/houseboats" },
    { label: "Vehicles", count: vehicles, href: "/admin/vehicles" },
    { label: "Packages", count: itineraries, href: "/admin/itineraries" },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        description="Catalogue and agent status at a glance."
      />

      {pendingAgents > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-900">
              <strong>{pendingAgents}</strong> agent{pendingAgents === 1 ? "" : "s"} waiting for
              approval.
            </p>
            <LinkButton href="/admin/agents" tone="primary">
              Review signups
            </LinkButton>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {catalogue.map((item) => (
          <Card key={item.href}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {item.label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{item.count}</p>
            <a
              href={item.href}
              className="mt-2 inline-block text-sm text-blue-700 hover:underline"
            >
              Manage →
            </a>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Agents</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
          <span>
            <Badge tone="green">{approvedAgents}</Badge> approved
          </span>
          <span>
            <Badge tone={pendingAgents > 0 ? "amber" : "slate"}>{pendingAgents}</Badge> pending
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Agent registration and approval land in Phase 3.
        </p>
      </Card>
    </>
  );
}
