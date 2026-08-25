import { PageHeader } from "@/components/ui";
import { ItineraryForm } from "../itinerary-form";
import { createItinerary } from "../actions";

export default function NewItineraryPage() {
  return (
    <>
      <PageHeader title="Add package" description="Pricing is added once the package is saved." />
      <ItineraryForm action={createItinerary} submitLabel="Create package" />
    </>
  );
}
