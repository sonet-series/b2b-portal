import { requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { quoteVehicle } from "@/lib/quote";
import { PricingError } from "@/lib/pricing";
import { vehicleQuoteSchema, parseVehicleLegs, type FormState } from "@/lib/validation";
import { FormError, PageHeader, Select, EmptyState } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { LegsField } from "./legs-field";
import { SearchForm, todayIso } from "../search-form";
import { QuoteResults } from "../quote-results";
import { saveQuoteAction } from "../actions";
import type { QuoteResult } from "@/lib/quote-types";

export const dynamic = "force-dynamic";

export default async function VehicleQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const agent = await requireAgent();
  const params = await searchParams;

  const vehicles = await prisma.vehicle.findMany({
    where: { active: true, rates: { some: { active: true } } },
    orderBy: [{ capacity: "asc" }, { type: "asc" }],
    select: { id: true, type: true, capacity: true },
  });

  // Legs arrive as parallel repeated params; zip them before validating.
  const legRows = parseVehicleLegs(params);
  const parsed = vehicleQuoteSchema.safeParse({ ...params, legs: legRows });
  const attempted = Boolean(params.vehicleId);

  let result: QuoteResult | null = null;
  let error: string | null = null;
  const fieldErrors: Record<string, string> = {};

  if (attempted && !parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  } else if (parsed.success) {
    try {
      result = await quoteVehicle({ id: agent.id, tier: agent.tier }, parsed.data);
    } catch (e) {
      error = e instanceof PricingError ? e.message : "Could not price that hire.";
    }
  }

  const saveActions: Record<string, (prev: FormState) => Promise<FormState>> = {};
  if (result && parsed.success) {
    for (const option of result.options) {
      saveActions[option.key] = saveQuoteAction.bind(
        null,
        { productType: "vehicle", ...parsed.data },
        option.key
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Vehicle quote"
        description="Per-day, per-km, and point-to-point transfer rates, priced side by side."
      />

      {vehicles.length === 0 ? (
        <EmptyState title="No vehicles available yet" hint="Series Tours has not published vehicle rates." />
      ) : (
        <>
          <SearchForm>
            <Select
              label="Vehicle"
              name="vehicleId"
              required
              defaultValue={typeof params.vehicleId === "string" ? params.vehicleId : undefined}
              options={vehicles.map((v) => ({
                value: v.id,
                label: `${v.type} — ${v.capacity} seats`,
              }))}
              error={fieldErrors.vehicleId}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField
                label="Start date"
                name="startDate"
                
                required
                min={todayIso()}
                defaultValue={typeof params.startDate === "string" ? params.startDate : ""}
                error={fieldErrors.startDate}
              />
              <DateField
                label="End date"
                name="endDate"
                
                required
                min={todayIso()}
                defaultValue={typeof params.endDate === "string" ? params.endDate : ""}
                hint="Same day for a transfer."
                error={fieldErrors.endDate}
              />
            </div>

            <LegsField initial={legRows} />
            {fieldErrors.legs && <FormError message={fieldErrors.legs} />}
          </SearchForm>

          {error && <FormError message={error} />}
          {result && <QuoteResults
              result={result}
              saveActions={saveActions}
              input={parsed.success ? { productType: "vehicle", ...parsed.data } : undefined}
            />}
        </>
      )}
    </>
  );
}
