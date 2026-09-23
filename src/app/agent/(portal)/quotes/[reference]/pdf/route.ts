import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAgent } from "@/lib/auth";
import { getQuote, readSnapshot, resolveSubject } from "@/lib/quote-store";
import { readUpload, UploadError } from "@/lib/uploads";
import { renderQuotePdf } from "@/lib/quote-pdf";
import { gstBps } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * The quote as a real PDF.
 *
 * Browser printing stamps the page title and URL into the header and footer
 * and no CSS reaches them, so the document an agent hands their customer must
 * not come out of a print dialogue at all. This one is generated server-side
 * and carries nothing but the agency's own branding.
 *
 * A route handler is its own entry point, so the session is re-checked, and
 * the quote is fetched scoped to that agent — another agency's reference does
 * not resolve.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const agent = await getAgent();
  if (!agent) return new NextResponse("Not authorised", { status: 401 });

  const { reference } = await params;
  const quote = await getQuote(agent.id, reference);
  if (!quote) return new NextResponse("Not found", { status: 404 });

  const row = await prisma.agent.findUnique({
    where: { id: agent.id },
    select: { logoStoredName: true, logoMimeType: true, address: true, phone: true },
  });

  // One reader for the frozen snapshot, shared with the portal page and the
  // admin view, so three screens cannot come to disagree about what a quote
  // said. A malformed snapshot still produces a costed quote — the priced
  // lines are real rows — so the PDF is issued without the itinerary rather
  // than refused.
  const snapshot = readSnapshot(quote.snapshotJson);
  const input = snapshot.input as { adults?: number; childAges?: number[] } | undefined;
  const adults = typeof input?.adults === "number" ? input.adults : 0;
  const childAges = Array.isArray(input?.childAges) ? input.childAges : [];
  const subject = await resolveSubject(snapshot);

  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} adult${adults === 1 ? "" : "s"}`);
  if (childAges.length > 0) {
    parts.push(`${childAges.length} child${childAges.length === 1 ? "" : "ren"} (${childAges.join(", ")})`);
  }

  // A missing or unreadable logo file must not cost the agent their PDF.
  let logo: { data: Buffer; mime: string } | undefined;
  if (row?.logoStoredName && row.logoMimeType) {
    try {
      logo = { data: await readUpload(row.logoStoredName), mime: row.logoMimeType };
    } catch (e) {
      if (!(e instanceof UploadError)) throw e;
    }
  }

  const pdf = await renderQuotePdf({
    reference: quote.reference,
    createdAt: quote.createdAt,
    travelStart: quote.travelStart,
    travelEnd: quote.travelEnd,
    agencyName: agent.agencyName,
    email: agent.email,
    address: row?.address ?? null,
    phone: row?.phone ?? null,
    logo,
    party: parts.join(", ") || (quote.pax > 0 ? String(quote.pax) : ""),
    days: snapshot.days,
    alsoIncluded: snapshot.combinedItems.map((i) => i.label),
    subject,
    totalMinor: quote.totalMinor,
    gstBps: await gstBps(),
    terms: snapshot.option?.terms,
  });

  // The filename is what lands in the customer's inbox, so it carries the
  // agency's name and the reference rather than "download.pdf".
  const safeAgency = agent.agencyName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

  // ?view=1 opens it in the browser instead of downloading, so an agent can
  // read the document before sending it to a customer rather than downloading
  // a file to find out what is in it.
  const inline = new URL(request.url).searchParams.get("view") === "1";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeAgency}-${quote.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
