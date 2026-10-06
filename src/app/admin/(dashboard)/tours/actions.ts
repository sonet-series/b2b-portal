"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { tourSchema, tourDaySchema, formObject, toFormState, type FormState } from "@/lib/validation";
import { dayCount, nextTourSortOrder, reorderTour, viaToCsv } from "@/lib/tours";

/*
 * Server actions are their OWN entry point — the dashboard layout does not run
 * for them — so every one of these re-checks the session itself.
 */
async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

export async function createTour(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = tourSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  /*
   * A new tour is created with its day rows BLANK but present — one per night
   * plus the departure day.
   *
   * Created here rather than left for the edit screen to conjure, because the
   * number of days is derived from `nights` and must stay derived. A screen
   * that adds a row when you press a button is a screen where the day count
   * and the night count can disagree, and that disagreement reaches the quote
   * as an itinerary of the wrong length.
   */
  const tour = await prisma.tourTemplate.create({
    data: {
      ...parsed.data,
      notes: parsed.data.notes || null,
      sortOrder: await nextTourSortOrder(),
      days: {
        create: Array.from({ length: dayCount(parsed.data.nights) }, (_, i) => ({
          dayIndex: i,
          to: "",
        })),
      },
    },
  });

  revalidatePath("/admin/tours");
  redirect(`/admin/tours/${tour.id}?created=1`);
}

export async function updateTour(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const parsed = tourSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const existing = await prisma.tourTemplate.findUnique({
    where: { id },
    select: { nights: true },
  });
  if (!existing) return { ok: false, message: "That tour no longer exists." };

  await prisma.$transaction(async (tx) => {
    await tx.tourTemplate.update({
      where: { id },
      data: { ...parsed.data, notes: parsed.data.notes || null },
    });

    /*
     * Changing the night count re-shapes the day list, and it does so WITHOUT
     * touching the days that survive.
     *
     * Deleting them all and recreating would be fewer lines and would throw
     * away a plan somebody typed, because shortening a 6-night tour to 5 is
     * usually a correction to the last day, not a decision to start again.
     */
    const want = dayCount(parsed.data.nights);
    const had = dayCount(existing.nights);
    if (want < had) {
      await tx.tourTemplateDay.deleteMany({
        where: { templateId: id, dayIndex: { gte: want } },
      });
    } else if (want > had) {
      for (let i = had; i < want; i++) {
        await tx.tourTemplateDay.create({ data: { templateId: id, dayIndex: i, to: "" } });
      }
    }
  });

  revalidatePath("/admin/tours");
  revalidatePath(`/admin/tours/${id}`);
  return { ok: true, message: "Saved." };
}

/**
 * The day plan, saved as a whole.
 *
 * All rows at once rather than one Save per day: the plan is one thing, and a
 * half-saved itinerary is a tour that quotes a route nobody chose.
 */
export async function saveTourDays(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const tour = await prisma.tourTemplate.findUnique({
    where: { id },
    select: { nights: true },
  });
  if (!tour) return { ok: false, message: "That tour no longer exists." };

  // Parallel repeated fields, zipped back by index — the same shape, and the
  // same reasoning, as the itinerary builder's day rows.
  const tos = formData.getAll("dayTo").map(String);
  const vias = formData.getAll("dayVia").map(String);
  const want = dayCount(tour.nights);
  if (tos.length !== want) {
    return {
      ok: false,
      message: `Expected ${want} days for ${tour.nights} nights but the form sent ${tos.length}. Reload and try again.`,
    };
  }

  // Validated BEFORE anything is written, so a bad row at day 6 cannot leave
  // days 1–5 committed — the same all-or-nothing rule as the rate-sheet import.
  const rows: { dayIndex: number; to: string; viaCsv: string | null }[] = [];
  const errors: Record<string, string> = {};
  for (let i = 0; i < want; i++) {
    const parsed = tourDaySchema.safeParse({ to: tos[i] ?? "", via: vias[i] ?? "" });
    if (!parsed.success) {
      errors[`day${i}`] = parsed.error.issues[0]?.message ?? "Check this day";
      continue;
    }
    rows.push({
      dayIndex: i,
      to: parsed.data.to,
      viaCsv: viaToCsv((parsed.data.via ?? "").split(",")),
    });
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Every day needs somewhere to end.", errors };
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.tourTemplateDay.upsert({
        where: { templateId_dayIndex: { templateId: id, dayIndex: r.dayIndex } },
        create: { templateId: id, ...r },
        update: { to: r.to, viaCsv: r.viaCsv },
      })
    )
  );

  revalidatePath("/admin/tours");
  revalidatePath(`/admin/tours/${id}`);
  return { ok: true, message: "Day plan saved." };
}

export async function moveTour(id: string, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  await reorderTour(id, direction);
  revalidatePath("/admin/tours");
}

/**
 * Archive, never delete — a tour that has been quoted against is referenced by
 * `VehicleQuoteInput.tourId` on frozen snapshots, and those quotes still have
 * to reprice to the same number when reopened.
 */
export async function setTourActive(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await prisma.tourTemplate.update({ where: { id }, data: { active } });
  revalidatePath("/admin/tours");
  revalidatePath(`/admin/tours/${id}`);
}
