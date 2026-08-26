import { requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { quoteHouseboat } from "@/lib/quote";
import { PricingError } from "@/lib/pricing";
import { houseboatQuoteSchema, type FormState } from "@/lib/validation";
import { Field, FormError, PageHeader, Select, EmptyState } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { SearchForm, todayIso } from "../search-form";
import { QuoteResults } from "../quote-results";
import { saveQuoteAction } from "../actions";
import type { QuoteResult } from "@/lib/quote-types";

export const dynamic = "force-dynamic";

export default async function HouseboatQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const agent = await requireAgent();
  const params = await searchParams;

  const boats = await prisma.houseboat.findMany({
    where: { active: true, rates: { some: { active: true } } },
    orderBy: [{ location: "asc" }, { name: "asc" }],
    select: { id: true, name: true, location: true, category: true, bedrooms: true },
  });

  const parsed = houseboatQuoteSchema.safeParse(params);
  const attempted = Boolean(params.houseboatId);

  let result: QuoteResult | null = null;
  let error: string | null = null;
  const fieldErrors: Record<string, string> = {};

  if (attempted && !parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  } else if (parsed.success) {
    try {
      result = await quoteHouseboat({ id: agent.id, tier: agent.tier }, parsed.data);
    } catch (e) {
      error = e instanceof PricingError ? e.message : "Could not price that cruise.";
    }
  }

  const saveActions: Record<string, (prev: FormState) => Promise<FormState>> = {};
  if (result && parsed.success) {
    for (const option of result.options) {
      saveActions[option.key] = saveQuoteAction.bind(
        null,
        { productType: "houseboat", ...parsed.data },
        option.key
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Houseboat quote"
        description="Boats sold whole or per person appear as separate priced options."
      />

      {boats.length === 0 ? (
        <EmptyState title="No houseboats available yet" hint="Series Tours has not published cruise rates." />
      ) : (
        <>
          <SearchForm>
            <Select
              label="Houseboat"
              name="houseboatId"
              required
              defaultValue={typeof params.houseboatId === "string" ? params.houseboatId : undefined}
              options={boats.map((b) => ({
                value: b.id,
                label: `${b.name} — ${b.location} · ${b.category} · ${b.bedrooms} bedroom${b.bedrooms === 1 ? "" : "s"}`,
              }))}
              error={fieldErrors.houseboatId}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField
                label="Cruise date"
                name="travelDate"
                
                required
                min={todayIso()}
                defaultValue={typeof params.travelDate === "string" ? params.travelDate : ""}
                hint="Check-in day."
                error={fieldErrors.travelDate}
              />
              <Field
                label="Passengers"
                name="pax"
                type="number"
                min={1}
                required
                defaultValue={typeof params.pax === "string" ? params.pax : "2"}
                error={fieldErrors.pax}
              />
            </div>
          </SearchForm>

          {error && <FormError message={error} />}
          {result && <QuoteResults
              result={result}
              saveActions={saveActions}
              input={parsed.success ? { productType: "houseboat", ...parsed.data } : undefined}
            />}
        </>
      )}
    </>
  );
}
