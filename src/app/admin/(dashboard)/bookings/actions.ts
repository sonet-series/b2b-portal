"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { decideBooking, cancelBooking, decidePayment, BookingError } from "@/lib/booking";
import { toMinor } from "@/lib/money";
import { pushBookingToErpQuietly, pushBookingToErp } from "@/lib/erp";
import type { FormState } from "@/lib/validation";

// Server actions are their own entry point — the dashboard layout does not run
// for them — so every one of these re-checks the admin session itself.
async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

function refresh(reference: string) {
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${reference}`);
  revalidatePath("/admin");
}

/**
 * Confirm, at a rate Sonet may have changed.
 *
 * The agreed total is read from the form every time rather than only when it
 * differs: the field is pre-filled with the quoted figure, so "unchanged" and
 * "deliberately re-entered the same number" are the same action, and treating
 * them differently would be a distinction nobody made.
 */
export async function confirmBookingAction(
  reference: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const total = String(formData.get("agreedTotal") ?? "").trim();
  if (total === "" || Number.isNaN(Number(total))) {
    return { ok: false, message: "Enter the total you are agreeing to, before GST." };
  }

  const note = String(formData.get("adminNote") ?? "").trim();

  try {
    await decideBooking(reference, "CONFIRMED", {
      agreedTotalMinor: toMinor(total),
      adminNote: note,
    });
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  refresh(reference);
  return { ok: true, message: "Booking confirmed. The agent can now record their deposit." };
}

export async function declineBookingAction(
  reference: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  // Required, unlike on a confirmation. An agent told "no" with no reason will
  // ask why, and the answer belongs on the record rather than in a phone call.
  const note = String(formData.get("adminNote") ?? "").trim();
  if (note === "") {
    return { ok: false, message: "Give the agent a reason — they will ask otherwise." };
  }

  try {
    await decideBooking(reference, "DECLINED", { adminNote: note });
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  refresh(reference);
  return { ok: true, message: "Booking declined." };
}

export async function cancelBookingAction(
  reference: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const note = String(formData.get("adminNote") ?? "").trim();
  if (note === "") {
    return { ok: false, message: "Say why it is being cancelled." };
  }

  try {
    await cancelBooking(reference, note);
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  refresh(reference);
  return { ok: true, message: "Booking cancelled." };
}

/**
 * Approve or reject one recorded payment.
 *
 * Until this runs, the money counts for nothing — that is the whole point of
 * Sonet reviewing them, and why `bookingMoney` only totals APPROVED rows.
 */
export async function decidePaymentAction(
  reference: string,
  paymentId: string,
  decision: "APPROVED" | "REJECTED",
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const note = String(formData.get("adminNote") ?? "").trim();

  if (decision === "REJECTED" && note === "") {
    return { ok: false, message: "Say why this payment is being rejected." };
  }

  try {
    await decidePayment(paymentId, decision, note);
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  /*
   * The moment the deposit is genuinely paid, the ERP gets the booking.
   *
   * Here rather than on confirmation, because Sonet asked for "confirmed AND
   * advance 25% paid" — and paid means HE approved it, not that the agent
   * filed a screenshot. `pushBookingToErp` re-checks both conditions itself
   * and does nothing when they are not met, so approving a later balance
   * payment cannot send a second order.
   *
   * Quietly: he has just approved real money, and an unreachable ERP must not
   * turn that into a failed action he repeats. Failures land on the booking
   * with a retry button.
   */
  if (decision === "APPROVED") await pushBookingToErpQuietly(reference);

  refresh(reference);
  return {
    ok: true,
    message: decision === "APPROVED" ? "Payment approved." : "Payment rejected.",
  };
}

/** Sonet's manual retry, when a push failed or the ERP was configured later. */
export async function retryErpPushAction(
  reference: string,
  _prev: FormState
): Promise<FormState> {
  await requireAdmin();
  const result = await pushBookingToErp(reference);
  refresh(reference);

  if (result.ok) {
    return {
      ok: true,
      message: result.alreadySent
        ? `Already in the ERP as ${result.reference}.`
        : `Sent to the ERP as ${result.reference}.`,
    };
  }
  return { ok: false, message: result.reason };
}
