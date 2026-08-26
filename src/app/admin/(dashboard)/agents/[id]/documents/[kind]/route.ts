import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { readUpload, UploadError } from "@/lib/uploads";
import { isDocumentKind } from "@/lib/enums";

/**
 * Serves one agent document to the admin.
 *
 * These are identity documents — a PAN card is sensitive personal data — so
 * they are stored outside public/ and this is the only way to read one. Every
 * request re-checks the admin session; a route handler is its own entry point
 * and the dashboard layout does not run for it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  if (!(await getAdminSession())) {
    return new NextResponse("Not authorised", { status: 401 });
  }

  const { id, kind } = await params;
  if (!isDocumentKind(kind)) {
    return new NextResponse("Unknown document", { status: 404 });
  }

  const document = await prisma.agentDocument.findUnique({
    where: { agentId_kind: { agentId: id, kind } },
    select: { storedName: true, originalName: true, mimeType: true },
  });
  if (!document) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readUpload(document.storedName);
  } catch (e) {
    if (e instanceof UploadError) return new NextResponse("Not found", { status: 404 });
    // The row exists but the file does not — worth distinguishing from a 404,
    // because it means the upload directory and the database have diverged.
    return new NextResponse("The stored file is missing", { status: 410 });
  }

  // `inline` so images and PDFs preview in the browser; ?download=1 forces a save.
  const url = new URL(request.url);
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
  const safeName = document.originalName.replace(/["\\\r\n]/g, "_");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${safeName}"`,
      // Never cached by a proxy, and not written to disk by the browser.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
