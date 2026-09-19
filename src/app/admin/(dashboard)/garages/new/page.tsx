import { PageHeader } from "@/components/ui";
import { allStates } from "@/lib/destinations";
import { GarageForm } from "../garage-form";
import { createGarage } from "../actions";

export default function NewGaragePage() {
  return (
    <>
      <PageHeader title="Add depot" description="Somewhere vehicles are dispatched from." />
      <GarageForm action={createGarage} submitLabel="Create depot" states={allStates()} />
    </>
  );
}
