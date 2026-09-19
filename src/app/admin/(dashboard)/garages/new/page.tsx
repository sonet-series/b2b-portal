import { PageHeader } from "@/components/ui";
import { GarageForm } from "../garage-form";
import { createGarage } from "../actions";

export default function NewGaragePage() {
  return (
    <>
      <PageHeader title="Add garage" description="A depot vehicles are dispatched from." />
      <GarageForm action={createGarage} submitLabel="Create garage" />
    </>
  );
}
