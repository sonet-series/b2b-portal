import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/auth";
import { readUpload, UploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * A payment proof, for the admin.
 *
 * A route handler is its own entry point, so the admin session is checked here
 * — the dashboard layout does not run for it. This is a picture of somebody's
 * bank account, so it follows the same rule as the identity documents: never
 * written under public/, and only ever served by an authenticated route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string; paymentId: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return new NextResponse("Not authorised", { status: 401 });

  const { reference, paymentId } = await params;
  const payment = await prisma.bookingPayment.findFirst({
    where: { id: paymentId, booking: { reference } },
    select: { storedName: true, mimeType: true },
  });
  if (!payment) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readUpload(payment.storedName);
  } catch (e) {
    if (e instanceof UploadError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": payment.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
