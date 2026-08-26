"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { AGENT_TIER, AGENT_TIER_LABEL, type AgentTier } from "@/lib/enums";
import { Badge, Button, Card, FormError, FormSuccess, Select } from "@/components/ui";

/**
 * The tier decides which of the two catalogue defaults this agency is quoted.
 *
 * The derived guess is shown alongside, and stays visible after an override, so
 * "we guessed Kerala from the PIN code, Sonet set outside-Kerala" remains
 * readable rather than collapsing into a single unexplained value.
 */
export function TierPanel({
  action,
  derivedTier,
  derivedReason,
  tierOverride,
  effective,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  derivedTier: AgentTier;
  derivedReason: string;
  tierOverride: string | null;
  effective: AgentTier;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Pricing tier</h2>
          <p className="mt-1 text-sm text-slate-500">
            Which set of catalogue rates this agency is quoted, unless a rate-card override applies.
          </p>
        </div>
        <Badge tone={effective === "KERALA" ? "green" : "blue"}>
          {AGENT_TIER_LABEL[effective]}
        </Badge>
      </div>

      <div className="mt-3 space-y-1 text-sm text-slate-600">
        <p>
          <span className="text-slate-400">Auto-detected: </span>
          {AGENT_TIER_LABEL[derivedTier]}{" "}
          <span className="text-slate-400">— {derivedReason}</span>
        </p>
        <p>
          <span className="text-slate-400">Your setting: </span>
          {tierOverride ? (
            <span className="font-medium text-slate-900">
              {AGENT_TIER_LABEL[tierOverride as AgentTier]}
            </span>
          ) : (
            <span className="text-slate-400">none — using the auto-detected tier</span>
          )}
        </p>
      </div>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56">
          <Select
            label="Set tier"
            name="tierOverride"
            defaultValue={tierOverride ?? "auto"}
            options={[
              { value: "auto", label: `Use auto-detected (${AGENT_TIER_LABEL[derivedTier]})` },
              ...AGENT_TIER.map((t) => ({ value: t, label: AGENT_TIER_LABEL[t] })),
            ]}
          />
        </div>
        <Button type="submit" tone="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save tier"}
        </Button>
      </form>

      <div className="mt-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />
      </div>
    </Card>
  );
}
