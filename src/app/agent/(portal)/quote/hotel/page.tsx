import { requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { quoteHotel } from "@/lib/quote";
import { PricingError } from "@/lib/pricing";
import { hotelQuoteSchema, type FormState } from "@/lib/validation";
import { Field, FormError, PageHeader, Select, EmptyState } from "@/components/ui";
import { SearchForm, todayIso } from "../search-form";
import { QuoteResults } from "../quote-results";
import { saveQuoteAction } from "../actions";
import type { QuoteResult } from "@/lib/quote-types";

export const dynamic = "force-dynamic";

export default async function HotelQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const agent = await requireAgent();
  const params = await searchParams;

  const hotels = await prisma.hotel.findMany({
    where: { active: true, rates: { some: { active: true } } },
    orderBy: [{ location: "asc" }, { name: "asc" }],
    select: { id: true, name: true, location: true },
  });

  const parsed = hotelQuoteSchema.safeParse(params);
  const attempted = Boolean(params.hotelId);

  let result: QuoteResult | null = null;
  let error: string | null = null;
  const fieldErrors: Record<string, string> = {};

  if (attempted && !parsed.success) {
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] ??= issue.message;
    }
  } else if (parsed.success) {
    try {
      result = await quoteHotel(agent.id, parsed.data);
    } catch (e) {
      error = e instanceof PricingError ? e.message : "Could not price that stay.";
    }
  }

  const saveActions: Record<string, (prev: FormState) => Promise<FormState>> = {};
  if (result && parsed.success) {
    for (const option of result.options) {
      saveActions[option.key] = saveQuoteAction.bind(
        null,
        { productType: "hotel", ...parsed.data },
        option.key
      );
    }
  }

  return (
    <>
      <PageHeader title="Hotel quote" description="Room rates for your agency, priced instantly." />

      {hotels.length === 0 ? (
        <EmptyState title="No hotels available yet" hint="Series Tours has not published hotel rates." />
      ) : (
        <>
          <SearchForm>
            <Select
              label="Hotel"
              name="hotelId"
              required
              defaultValue={typeof params.hotelId === "string" ? params.hotelId : undefined}
              options={hotels.map((h) => ({ value: h.id, label: `${h.name} — ${h.location}` }))}
              error={fieldErrors.hotelId}
            />
            <div className="grid gap-4 sm:grid-cols-4">
              <Field
                label="Check-in"
                name="checkIn"
                type="date"
                required
                min={todayIso()}
                defaultValue={typeof params.checkIn === "string" ? params.checkIn : ""}
                error={fieldErrors.checkIn}
              />
              <Field
                label="Check-out"
                name="checkOut"
                type="date"
                required
                min={todayIso()}
                defaultValue={typeof params.checkOut === "string" ? params.checkOut : ""}
                error={fieldErrors.checkOut}
              />
              <Field
                label="Rooms"
                name="rooms"
                type="number"
                min={1}
                required
                defaultValue={typeof params.rooms === "string" ? params.rooms : "1"}
                error={fieldErrors.rooms}
              />
              <Field
                label="Extra beds"
                name="extraBeds"
                type="number"
                min={0}
                defaultValue={typeof params.extraBeds === "string" ? params.extraBeds : "0"}
                hint="Total, all rooms."
                error={fieldErrors.extraBeds}
              />
            </div>
          </SearchForm>

          {error && <FormError message={error} />}
          {result && <QuoteResults result={result} saveActions={saveActions} />}
        </>
      )}
    </>
  );
}
