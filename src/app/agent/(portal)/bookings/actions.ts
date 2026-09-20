"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAgent } from "@/lib/auth";
import { requestBooking, submitPayment, BookingError } from "@/lib/booking";
import { toMinor } from "@/lib/money";
import { parseDateOnly } from "@/lib/dates";
import type { FormState } from "@/lib/validation";

// Server actions are their own entry point — the portal layout does not run
// for them — so the agent session is re-checked here every time.
async function requireAgentId(): Promise<string> {
  const agent = await getAgent();
  if (!agent) throw new Error("Not signed in.");
  return agent.id;
}

export async function requestBookingAction(
  quoteReference: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const agentId = await requireAgentId();
  const note = String(formData.get("agentNote") ?? "");

  let reference: string;
  try {
    reference = await requestBooking(agentId, quoteReference, note);
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  revalidatePath(`/agent/quotes/${quoteReference}`);
  revalidatePath("/agent/bookings");
  redirect(`/agent/bookings/${reference}?requested=1`);
}

export async function submitPaymentAction(
  bookingReference: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const agentId = await requireAgentId();

  const proof = formData.get("proof");
  if (!(proof instanceof File) || proof.size === 0) {
    return { ok: false, message: "Attach the screenshot or receipt for this payment." };
  }

  // Rupees in the form, paise in the database — toMinor is the only crossing.
  const amount = String(formData.get("amount") ?? "").trim();
  if (amount === "" || Number.isNaN(Number(amount))) {
    return { ok: false, message: "Enter the amount you paid." };
  }

  const paidOnRaw = String(formData.get("paidOn") ?? "").trim();
  let paidOn: Date | null = null;
  if (paidOnRaw !== "") {
    try {
      paidOn = parseDateOnly(paidOnRaw);
    } catch {
      return { ok: false, message: "That payment date is not a real date." };
    }
  }

  try {
    await submitPayment(
      agentId,
      bookingReference,
      {
        amountMinor: toMinor(amount),
        reference: String(formData.get("reference") ?? ""),
        paidOn,
        note: String(formData.get("note") ?? ""),
      },
      proof
    );
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  revalidatePath(`/agent/bookings/${bookingReference}`);
  return {
    ok: true,
    message: "Payment recorded. Series Tours will confirm it once they have checked the transfer.",
  };
}
