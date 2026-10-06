import { notFound } from "next/navigation";
import { getTour, routeSummary, dayCount } from "@/lib/tours";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { TourForm } from "../tour-form";
import { DayPlan } from "../day-plan";
import { updateTour, saveTourDays, setTourActive } from "../actions";

export const dynamic = "force-dynamic";

export default async function TourPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tour = await getTour(id);
  if (!tour) notFound();

  const planned = tour.days.filter((d) => d.to.trim() !== "").length;
  const complete = planned === dayCount(tour.nights);

  return (
    <>
      <PageHeader
        title={tour.name}
        description={routeSummary(tour) || "No day plan yet"}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href="/admin/tours">All tours</LinkButton>
            <form action={setTourActive.bind(null, tour.id, !tour.active)}>
              <button
                type="submit"
                className="text-sm text-blue-700 hover:underline"
              >
                {tour.active ? "Archive" : "Restore"}
              </button>
            </form>
          </div>
        }
      />

      {/*
        A tour with blank days is HIDDEN from agents rather than offered
        half-built — a picker that fills in an itinerary with gaps is worse
        than one that does not offer the tour at all. Said here, because
        otherwise it is invisible and inexplicable.
      */}
      {!complete && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="amber">Not yet available to agents</Badge>
            <p className="text-sm text-slate-600">
              {planned} of {dayCount(tour.nights)} days have somewhere to end. Agents will not see
              this tour until the plan is complete.
            </p>
          </div>
        </Card>
      )}

      <TourForm
        action={updateTour.bind(null, tour.id)}
        tour={tour}
        submitLabel="Save tour"
      />

      <DayPlan
        action={saveTourDays.bind(null, tour.id)}
        startPlace={tour.startPlace}
        days={tour.days}
      />
    </>
  );
}
