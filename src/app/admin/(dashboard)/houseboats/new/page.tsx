import { PageHeader } from "@/components/ui";
import { HouseboatForm } from "../houseboat-form";
import { createHouseboat } from "../actions";

export default function NewHouseboatPage() {
  return (
    <>
      <PageHeader title="Add houseboat" description="Rates are added once the boat is saved." />
      <HouseboatForm action={createHouseboat} submitLabel="Create houseboat" />
    </>
  );
}
