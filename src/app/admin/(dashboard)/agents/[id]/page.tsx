import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { listRateOptions } from "@/lib/rate-options";
import { STATUS_LABEL, approvalMessage } from "@/lib/handover";
import type { AgentStatus } from "@/lib/enums";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { ReviewPanel } from "./review-panel";
import { TempPasswordPanel } from "./handover-panel";
import { RateCardPanel } from "./rate-card-panel";
import { DocumentsPanel } from "./documents-panel";
import { TierPanel } from "./tier-panel";
import { effectiveTier, deriveTier } from "@/lib/tier";
import { AGENT_TIER_LABEL, type AgentTier } from "@/lib/enums";
import { CopyBlock } from "@/components/copy-block";
import {
  approveAgent,
  rejectAgent,
  issueTempPassword,
  addRateCardEntry,
  removeRateCardEntry,
  setAgentTier,
} from "../actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<AgentStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      rateCardEntries: { orderBy: { productType: "asc" } },
      documents: true,
    },
  });
  if (!agent) notFound();

  const tier = effectiveTier(agent);

  const [options, otherAgents] = await Promise.all([
    // Priced for THIS agent's tier, so the "default" column shows the number
    // they would actually be charged without an override.
    listRateOptions(tier),
    prisma.agent.findMany({
      where: { status: "approved", NOT: { id } },
      select: { id: true, agencyName: true, _count: { select: { rateCardEntries: true } } },
      orderBy: { agencyName: "asc" },
    }),
  ]);

  const byReference = new Map(options.map((o) => [o.referenceId, o]));
  const overrides = agent.rateCardEntries.map((e) => {
    const option = byReference.get(e.referenceId);
    // The default shown must be for the CHARGE being overridden, not the row's
    // headline rate — otherwise an extra-bed override looks wildly discounted.
    const chargeOption = option?.charges.find((c) => c.charge === e.charge);
    return {
      id: e.id,
      productType: e.productType,
      referenceId: e.referenceId,
      charge: e.charge,
      overridePriceMinor: e.overridePriceMinor,
      notes: e.notes,
      label: option?.label ?? null,
      defaultMinor: chargeOption?.defaultMinor ?? null,
    };
  });

  const status = agent.status as AgentStatus;

  return (
    <>
      <PageHeader
        title={agent.agencyName}
        description={`${agent.contactName} · ${agent.email} · ${agent.phone}`}
        action={<LinkButton href="/admin/agents">Back to agents</LinkButton>}
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-slate-500">Status: </span>
              <Badge tone={STATUS_TONE[status] ?? "slate"}>{STATUS_LABEL[status] ?? status}</Badge>
              <span className="ml-2 text-slate-500">Tier: </span>
              <Badge tone={tier === "KERALA" ? "green" : "blue"}>{AGENT_TIER_LABEL[tier]}</Badge>
            </p>
            <p className="max-w-md">
              <span className="text-slate-500">Address: </span>
              {agent.address ? (
                <span className="whitespace-pre-wrap">{agent.address}</span>
              ) : (
                <span className="text-slate-400">not recorded</span>
              )}
            </p>
            {(agent.altPhone || agent.altEmail) && (
              <p>
                <span className="text-slate-500">Also: </span>
                {[agent.altEmail, agent.altPhone].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="text-slate-500">
              Registered {agent.createdAt.toISOString().slice(0, 10)}
              {agent.approvedAt && ` · approved ${agent.approvedAt.toISOString().slice(0, 10)}`}
              {agent.lastLoginAt
                ? ` · last signed in ${agent.lastLoginAt.toISOString().slice(0, 10)}`
                : " · never signed in"}
            </p>
            {agent.mustChangePassword && (
              <p className="text-amber-700">On a temporary password — must change it at next sign-in.</p>
            )}
          </div>
          {agent.adminNotes && (
            <div className="max-w-sm rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Internal notes</p>
              <p className="mt-1 whitespace-pre-wrap">{agent.adminNotes}</p>
            </div>
          )}
        </div>
      </Card>

      <TierPanel
        action={setAgentTier.bind(null, agent.id)}
        derivedTier={agent.derivedTier as AgentTier}
        derivedReason={deriveTier(agent.address).reason}
        tierOverride={agent.tierOverride}
        effective={tier}
      />

      <DocumentsPanel agentId={agent.id} documents={agent.documents} />

      {status === "pending" && (
        <div className="mb-6">
          <ReviewPanel
            approveAction={approveAgent.bind(null, agent.id)}
            rejectAction={rejectAgent.bind(null, agent.id)}
            agentOptions={otherAgents
              .filter((a) => a._count.rateCardEntries > 0)
              .map((a) => ({
                value: a.id,
                label: `Copy from ${a.agencyName} (${a._count.rateCardEntries} overrides)`,
              }))}
          />
        </div>
      )}

      {status === "approved" && (
        <>
          {/*
            The handover step. This portal sends no email by design, so this
            message IS the notification — server-rendered rather than held in
            form state, so Sonet can come back for it at any time.
          */}
          <Card className="mb-6 border-emerald-200">
            <h2 className="text-base font-semibold text-slate-900">Let them know</h2>
            <p className="mb-3 mt-1 text-sm text-slate-500">
              Nothing is emailed. Copy this and send it over WhatsApp, or read it out.
              {agent.lastLoginAt === null && " They have not signed in yet."}
            </p>
            <CopyBlock
              text={approvalMessage({
                contactName: agent.contactName,
                agencyName: agent.agencyName,
                email: agent.email,
              })}
              label="Copy WhatsApp message"
            />
            <p className="mt-3 text-xs text-slate-500">
              They sign in with the password they chose at registration. If they no longer have it,
              issue a temporary password below.
            </p>
          </Card>

          <TempPasswordPanel action={issueTempPassword.bind(null, agent.id)} />
          <RateCardPanel
            overrides={overrides}
            options={options}
            addAction={addRateCardEntry.bind(null, agent.id)}
            removeAction={async (entryId) => {
              "use server";
              await removeRateCardEntry(entryId, agent.id);
            }}
          />
        </>
      )}

      {status === "rejected" && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-900">
            This registration was rejected. The agent cannot sign in.
          </p>
        </Card>
      )}
    </>
  );
}
