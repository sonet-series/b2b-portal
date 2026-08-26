import { Card, Badge } from "@/components/ui";
import { DOCUMENT_KIND, type DocumentKind } from "@/lib/enums";

const LABEL: Record<DocumentKind, string> = {
  PAN_CARD: "PAN card",
  BUSINESS_PROOF: "Business proof",
  VISITING_CARD: "Visiting card",
};

export type DocumentRow = {
  kind: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The three documents, shown together at the point of approval — Sonet decides
 * on the strength of these, so they belong on the review screen rather than
 * behind another click.
 *
 * Images render inline as previews; PDFs cannot be thumbnailed without a
 * renderer, so they get an explicit open/download pair instead.
 */
export function DocumentsPanel({
  agentId,
  documents,
}: {
  agentId: string;
  documents: DocumentRow[];
}) {
  const byKind = new Map(documents.map((d) => [d.kind, d]));

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Documents</h2>
        <p className="text-sm text-slate-500">Check these before approving.</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {DOCUMENT_KIND.map((kind) => {
          const doc = byKind.get(kind);
          const href = `/admin/agents/${agentId}/documents/${kind}`;

          if (!doc) {
            return (
              <div
                key={kind}
                className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3"
              >
                <p className="text-sm font-medium text-slate-700">{LABEL[kind]}</p>
                <p className="mt-2 text-xs text-amber-700">Not provided</p>
                <p className="mt-1 text-xs text-slate-500">
                  Registered before documents were required.
                </p>
              </div>
            );
          }

          const isImage = doc.mimeType.startsWith("image/");

          return (
            <div key={kind} className="overflow-hidden rounded-md border border-slate-200">
              <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-medium text-slate-900">{LABEL[kind]}</p>
                <Badge tone={isImage ? "blue" : "slate"}>{isImage ? "Image" : "PDF"}</Badge>
              </div>

              {isImage ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="block bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={href}
                    alt={`${LABEL[kind]} uploaded by this agency`}
                    className="h-40 w-full object-contain"
                  />
                </a>
              ) : (
                <div className="flex h-40 items-center justify-center bg-slate-50 px-3 text-center">
                  <span className="text-xs text-slate-500">
                    PDF — open it to read
                  </span>
                </div>
              )}

              <div className="space-y-1 px-3 py-2">
                <p className="truncate text-xs text-slate-500" title={doc.originalName}>
                  {doc.originalName} · {formatSize(doc.sizeBytes)}
                </p>
                <p className="flex gap-3 text-sm">
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                    Open
                  </a>
                  <a href={`${href}?download=1`} className="text-blue-700 hover:underline">
                    Download
                  </a>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
