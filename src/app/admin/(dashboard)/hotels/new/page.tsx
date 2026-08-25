import { PageHeader } from "@/components/ui";
import { HotelForm } from "../hotel-form";
import { createHotel } from "../actions";

export default function NewHotelPage() {
  return (
    <>
      <PageHeader title="Add hotel" description="Rates are added once the hotel is saved." />
      <HotelForm action={createHotel} submitLabel="Create hotel" />
    </>
  );
}
