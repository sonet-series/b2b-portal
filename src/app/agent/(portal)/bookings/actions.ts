"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAgent } from "@/lib/auth";
import {
  requestBooking,
  submitPayment,
  saveTripDetails,
  saveGuests,
  saveStay,
  parseClockTime,
  BookingError,
} from "@/lib/booking";
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

// ---------------------------------------------------------------------------
// Trip details
// ---------------------------------------------------------------------------

/** "" -> null, so a cleared box clears the column rather than storing "". */
function orNull(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

function dateOrNull(raw: FormDataEntryValue | null): Date | null | "bad" {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  try {
    return parseDateOnly(s);
  } catch {
    return "bad";
  }
}

export async function saveTripDetailsAction(
  reference: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const agentId = await requireAgentId();

  const arrivalDate = dateOrNull(formData.get("arrivalDate"));
  const departureDate = dateOrNull(formData.get("departureDate"));
  if (arrivalDate === "bad" || departureDate === "bad") {
    return { ok: false, message: "Those travel dates are not real dates." };
  }

  // Refused rather than silently dropped: a half-read time is how a driver
  // ends up at the airport at the wrong hour.
  const arrivalTimeRaw = String(formData.get("arrivalTime") ?? "").trim();
  const departureTimeRaw = String(formData.get("departureTime") ?? "").trim();
  const arrivalTime = parseClockTime(arrivalTimeRaw);
  const departureTime = parseClockTime(departureTimeRaw);
  if ((arrivalTimeRaw !== "" && !arrivalTime) || (departureTimeRaw !== "" && !departureTime)) {
    return { ok: false, message: "Enter times as HH:MM on the 24-hour clock, like 06:40 or 18:15." };
  }

  try {
    await saveTripDetails(agentId, reference, {
      leadGuestName: orNull(formData.get("leadGuestName")),
      leadGuestPhone: orNull(formData.get("leadGuestPhone")),
      leadGuestEmail: orNull(formData.get("leadGuestEmail")),
      arrivalDate,
      arrivalTime,
      arrivalFlight: orNull(formData.get("arrivalFlight")),
      arrivalFrom: orNull(formData.get("arrivalFrom")),
      departureDate,
      departureTime,
      departureFlight: orNull(formData.get("departureFlight")),
      departureTo: orNull(formData.get("departureTo")),
    });
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  revalidatePath(`/agent/bookings/${reference}`);
  return { ok: true, message: "Trip details saved." };
}

export async function saveGuestsAction(
  reference: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const agentId = await requireAgentId();

  // Parallel repeated params, zipped by index — the same shape the itinerary
  // days use, so a plain form produces them with no serialising.
  const names = formData.getAll("guestName").map((v) => String(v));
  const ages = formData.getAll("guestAge").map((v) => String(v).trim());

  const guests = names.map((name, i) => {
    const raw = ages[i] ?? "";
    const age = raw === "" ? null : Number(raw);
    return { name, age: Number.isInteger(age) && age! >= 0 && age! < 120 ? age : null };
  });

  try {
    await saveGuests(agentId, reference, guests);
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  revalidatePath(`/agent/bookings/${reference}`);
  const kept = guests.filter((g) => g.name.trim() !== "").length;
  return { ok: true, message: `${kept} guest${kept === 1 ? "" : "s"} saved.` };
}

export async function saveStayAction(
  reference: string,
  dayIndex: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const agentId = await requireAgentId();

  try {
    await saveStay(agentId, reference, dayIndex, {
      property: orNull(formData.get("property")),
      confirmationRef: orNull(formData.get("confirmationRef")),
      notes: orNull(formData.get("notes")),
    });
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }

  revalidatePath(`/agent/bookings/${reference}`);
  return { ok: true, message: "Saved." };
}
