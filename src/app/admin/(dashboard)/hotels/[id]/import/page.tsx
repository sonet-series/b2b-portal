import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isStubMode } from "@/lib/rate-sheet-ai";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { UploadForm } from "./upload-form";
import { uploadRateSheet } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hotel = await prisma.hotel.findUnique({ where: { id }, select: { name: true } });
  if (!hotel) notFound();

  const previous = await prisma.rateSheetImport.findMany({
    where: { hotelId: id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, originalName: true, status: true, createdAt: true, _count: { select: { rows: true } } },
  });

  return (
    <>
      <PageHeader
        title={`Import rates — ${hotel.name}`}
        description="Upload the sheet the hotel sent. Every row is reviewed before anything is saved."
        action={<LinkButton href={`/admin/hotels/${id}`}>Back to hotel</LinkButton>}
      />

      <div className="mb-6">
        <UploadForm action={uploadRateSheet.bind(null, id)} stubMode={isStubMode()} />
      </div>

      {previous.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Earlier uploads</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {previous.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <a href={`/admin/hotels/${id}/import/${p.id}`} className="text-blue-700 hover:underline">
                  {p.originalName}
                </a>
                <span className="text-xs text-slate-500">
                  {p._count.rows} row{p._count.rows === 1 ? "" : "s"} · {p.status.toLowerCase().replace("_", " ")}
                </span>
                <span className="ml-auto text-xs text-slate-400">
                  {p.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
