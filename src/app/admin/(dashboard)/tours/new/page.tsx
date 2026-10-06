import { PageHeader } from "@/components/ui";
import { TourForm } from "../tour-form";
import { createTour } from "../actions";

export const dynamic = "force-dynamic";

export default function NewTourPage() {
  return (
    <>
      <PageHeader
        title="Add a standard tour"
        description="Name it, say how long it runs and what kilometre allowance you quote. The day plan comes next."
      />
      <TourForm action={createTour} submitLabel="Create tour" />
    </>
  );
}
