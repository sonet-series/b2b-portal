import { getAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { quoteItinerary } from "@/lib/quote";
import { PricingError } from "@/lib/pricing";
import { itineraryQuoteSchema, type FormState } from "@/lib/validation";
import { Card, Field, FormError, PageHeader, Select, EmptyState } from "@/components/ui";
import { SearchForm, todayIso } from "../search-form";
import { QuoteResults } from "../quote-results";
import { saveQuoteAction } from "../actions";
import type { QuoteResult } from "@/lib/quote-types";

export const dynamic = "force-dynamic";

export default async function PackageQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const agent = (await getAgent())!;
  const params = await searchParams;

  const packages = await prisma.itinerary.findMany({
    where: { active: true, rates: { some: { active: true } } },
    orderBy: [{ durationNights: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      durationNights: true,
      routeSummary: true,
      inclusions: true,
      exclusions: true,
    },
  });

  const parsed = itineraryQuoteSchema.safeParse(params);
  const attempted = Boolean(params.itineraryId);

  let result: QuoteResult | null = null;
  let error: string | null = null;
  const fieldErrors: Record<string, string> = {};

  if (attempted && !parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  } else if (parsed.success) {
    try {
      result = await quoteItinerary(agent.id, parsed.data);
    } catch (e) {
      error = e instanceof PricingError ? e.message : "Could not price that package.";
    }
  }

  const saveActions: Record<string, (prev: FormState) => Promise<FormState>> = {};
  if (result && parsed.success) {
    for (const option of result.options) {
      saveActions[option.key] = saveQuoteAction.bind(
        null,
        { productType: "itinerary", ...parsed.data },
        option.key
      );
    }
  }

  const selected = parsed.success ? packages.find((p) => p.id === parsed.data.itineraryId) : null;

  return (
    <>
      <PageHeader title="Package quote" description="Fixed itineraries, priced for your agency." />

      {packages.length === 0 ? (
        <EmptyState title="No packages available yet" hint="Series Tours has not published package pricing." />
      ) : (
        <>
          <SearchForm>
            <Select
              label="Package"
              name="itineraryId"
              required
              defaultValue={typeof params.itineraryId === "string" ? params.itineraryId : undefined}
              options={packages.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.durationNights}N)`,
              }))}
              error={fieldErrors.itineraryId}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Departure date"
                name="startDate"
                type="date"
                required
                min={todayIso()}
                defaultValue={typeof params.startDate === "string" ? params.startDate : ""}
                error={fieldErrors.startDate}
              />
              <Field
                label="Travellers"
                name="pax"
                type="number"
                min={1}
                required
                defaultValue={typeof params.pax === "string" ? params.pax : "2"}
                error={fieldErrors.pax}
              />
            </div>
          </SearchForm>

          {selected && (
            <Card className="mb-6">
              <h2 className="text-sm font-semibold text-slate-900">{selected.name}</h2>
              {selected.routeSummary && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                  {selected.routeSummary}
                </p>
              )}
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {selected.inclusions && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Includes</p>
                    <p className="mt-1 text-slate-600">{selected.inclusions}</p>
                  </div>
                )}
                {selected.exclusions && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Excludes</p>
                    <p className="mt-1 text-slate-600">{selected.exclusions}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {error && <FormError message={error} />}
          {result && <QuoteResults result={result} saveActions={saveActions} />}
        </>
      )}
    </>
  );
}
