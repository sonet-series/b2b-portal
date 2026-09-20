import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAgent } from "@/lib/auth";
import { readUpload, UploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * The agent's own proof of payment, back again.
 *
 * A route handler is its own entry point, so the session is checked here — and
 * the payment is looked up THROUGH the booking's agentId, so one agency cannot
 * read another's bank screenshot by guessing an id. That is the same rule the
 * identity documents follow, and for the same reason: this is a picture of
 * somebody's bank account.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string; paymentId: string }> }
) {
  const agent = await getAgent();
  if (!agent) return new NextResponse("Not authorised", { status: 401 });

  const { reference, paymentId } = await params;
  const payment = await prisma.bookingPayment.findFirst({
    where: { id: paymentId, booking: { reference, agentId: agent.id } },
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
