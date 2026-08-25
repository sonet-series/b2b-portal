import { PageHeader } from "@/components/ui";
import { VehicleForm } from "../vehicle-form";
import { createVehicle } from "../actions";

export default function NewVehiclePage() {
  return (
    <>
      <PageHeader title="Add vehicle" description="Rates are added once the vehicle is saved." />
      <VehicleForm action={createVehicle} submitLabel="Create vehicle" />
    </>
  );
}
