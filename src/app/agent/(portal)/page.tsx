import { getAgent } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const PRODUCTS = [
  { label: "Vehicles", description: "Per day, per km, and point-to-point transfers." },
  { label: "Houseboats", description: "Day cruises and overnight cruises in the backwaters." },
  { label: "Hotels", description: "Room rates across our property list." },
  { label: "Packages", description: "Fixed itineraries, priced per person or per group." },
];

export default async function AgentHomePage() {
  const agent = await getAgent();

  return (
    <>
      <PageHeader
        title={`Welcome, ${agent?.contactName ?? "there"}`}
        description="Your account is approved. Instant quoting opens shortly."
      />

      <Card className="mb-6 border-blue-200 bg-blue-50">
        <p className="text-sm text-blue-900">
          Quote screens are being built now. Once live, you will get instant pricing on all four
          product types using the rates assigned to your agency.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {PRODUCTS.map((p) => (
          <Card key={p.label}>
            <p className="font-medium text-slate-900">{p.label}</p>
            <p className="mt-1 text-sm text-slate-500">{p.description}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">Coming soon</p>
          </Card>
        ))}
      </div>
    </>
  );
}
