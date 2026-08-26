import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadMarkupTable } from "@/lib/markup-store";
import { markupKey } from "@/lib/markup";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { ReviewTable } from "./review-table";

export const dynamic = "force-dynamic";

export default async function ReviewImportPage({
  params,
}: {
  params: Promise<{ id: string; importId: string }>;
}) {
  const { id, importId } = await params;

  const record = await prisma.rateSheetImport.findFirst({
    where: { id: importId, hotelId: id },
    include: { hotel: true, rows: { orderBy: { sortOrder: "asc" } } },
  });
  if (!record) notFound();

  const table = await loadMarkupTable();
  const markup = {
    kerala: table.get(markupKey("hotel", "KERALA"))!,
    outsideKerala: table.get(markupKey("hotel", "OUTSIDE_KERALA"))!,
  };

  const stub = record.model.startsWith("dev-stub");

  return (
    <>
      <PageHeader
        title={`Review extracted rates — ${record.hotel.name}`}
        description={`From ${record.originalName}`}
        action={<LinkButton href={`/admin/hotels/${id}`}>Back to hotel</LinkButton>}
      />

      {record.status !== "PENDING_REVIEW" && (
        <Card className="mb-4 border-slate-200 bg-slate-50">
          <p className="text-sm text-slate-600">
            This import was already {record.status === "CONFIRMED" ? "imported" : "discarded"}.
          </p>
        </Card>
      )}

      {stub && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-900">These rows are fabricated.</p>
          <p className="mt-1 text-sm text-red-900">
            No <code>ANTHROPIC_API_KEY</code> is set, so no extraction ran and the rows below are a
            development stub. This can never happen in production — the key is required there.
          </p>
        </Card>
      )}

      <Card className="mb-4 border-blue-200 bg-blue-50">
        <p className="text-sm text-blue-900">
          <strong>Nothing has been saved yet.</strong> Check every row — anything flagged needed
          guessing — and correct it here. The Kerala and outside-Kerala columns are the prices
          agents will actually be quoted, worked out from the cost.
        </p>
        {record.notes && <p className="mt-2 text-sm text-blue-900">Model note: {record.notes}</p>}
        <p className="mt-2 text-xs text-blue-800">Extracted by {record.model}</p>
      </Card>

      {record.rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No rates could be read from this file. Try a clearer scan, or add the rates by hand.
          </p>
        </Card>
      ) : (
        <ReviewTable rows={record.rows} hotelId={id} importId={importId} markup={markup} />
      )}
    </>
  );
}
