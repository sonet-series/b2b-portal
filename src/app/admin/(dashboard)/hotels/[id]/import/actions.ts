"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { storeUpload, discardUploads, UploadError } from "@/lib/uploads";
import { extractHotelRates, ExtractionError, isStubMode } from "@/lib/rate-sheet-ai";
import { writeHotelRate } from "../../actions";
import type { FormState } from "@/lib/validation";

async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

/** Spreadsheets and CSVs are read as text; PDFs and images go to the model directly. */
const TEXT_TYPES = ["text/csv", "text/plain", "text/tab-separated-values"];

/**
 * Uploads a rate sheet and stages what the AI proposes.
 *
 * Nothing reaches HotelRate here. The result is a review screen.
 */
export async function uploadRateSheet(
  hotelId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const file = formData.get("rateSheet");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errors: { rateSheet: "Choose a rate sheet to upload" } };
  }

  let stored;
  try {
    stored = await storeUpload(file, "Rate sheet", { extraTypes: TEXT_TYPES });
  } catch (e) {
    return {
      ok: false,
      errors: { rateSheet: e instanceof UploadError ? e.message : "That file could not be read" },
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const asText = TEXT_TYPES.includes(stored.mimeType)
    ? new TextDecoder().decode(bytes)
    : undefined;

  let extraction;
  try {
    extraction = await extractHotelRates({
      bytes,
      mimeType: stored.mimeType,
      originalName: stored.originalName,
      text: asText,
    });
  } catch (e) {
    // The file is only useful alongside its extraction; without one it is litter.
    await discardUploads([stored.storedName]);
    return {
      ok: false,
      message: e instanceof ExtractionError ? e.message : "Extraction failed. Please try again.",
    };
  }

  const created = await prisma.rateSheetImport.create({
    data: {
      hotelId,
      storedName: stored.storedName,
      originalName: stored.originalName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      model: extraction.model,
      notes: extraction.notes || null,
      rows: {
        create: extraction.rows.map((r, i) => ({
          roomType: r.roomType,
          mealPlan: r.mealPlan,
          seasonLabel: r.seasonLabel,
          validFrom: r.validFrom,
          validTo: r.validTo,
          costInput: r.costPerNight,
          confidence: r.confidence,
          issues: r.issues || null,
          sortOrder: i,
        })),
      },
    },
    select: { id: true },
  });

  redirect(`/admin/hotels/${hotelId}/import/${created.id}`);
}

/** Saves the reviewer's edits to one staged row. Still nothing written to HotelRate. */
export async function updateStagedRow(
  rowId: string,
  hotelId: string,
  importId: string,
  fields: { roomType: string; mealPlan: string; seasonLabel: string; validFrom: string; validTo: string; costInput: string; included: boolean }
): Promise<void> {
  await requireAdmin();
  await prisma.rateSheetRow.update({ where: { id: rowId }, data: fields });
  revalidatePath(`/admin/hotels/${hotelId}/import/${importId}`);
}

/**
 * Writes the reviewed rows.
 *
 * Every included row goes through writeHotelRate — the same validated path as
 * manual entry. A row that fails validation stops the confirm and is reported,
 * rather than being skipped: half an imported rate sheet is a silent pricing
 * gap nobody would notice.
 */
export async function confirmImport(
  importId: string,
  hotelId: string,
  _prev: FormState
): Promise<FormState> {
  await requireAdmin();

  const record = await prisma.rateSheetImport.findUnique({
    where: { id: importId },
    include: { rows: { orderBy: { sortOrder: "asc" } } },
  });
  if (!record) return { ok: false, message: "That import no longer exists." };
  if (record.status !== "PENDING_REVIEW") {
    return { ok: false, message: "This import has already been dealt with." };
  }

  const included = record.rows.filter((r) => r.included);
  if (included.length === 0) {
    return { ok: false, message: "No rows are selected — nothing to import." };
  }

  // Validate everything BEFORE writing anything, so a bad row on line 40
  // cannot leave rows 1–39 already committed.
  const problems: string[] = [];
  for (const [i, row] of included.entries()) {
    const fields = {
      roomType: row.roomType,
      mealPlan: row.mealPlan,
      seasonLabel: row.seasonLabel,
      validFrom: row.validFrom,
      validTo: row.validTo,
      costPerNightMinor: row.costInput,
      active: "on",
    };
    const check = await import("@/lib/validation").then((m) => m.hotelRateSchema.safeParse(fields));
    if (!check.success) {
      const first = check.error.issues[0];
      problems.push(`Row ${i + 1} (${row.roomType || "unnamed"}): ${first.message}`);
    }
  }
  if (problems.length > 0) {
    return {
      ok: false,
      message: `Fix these before importing — nothing has been written:\n${problems.slice(0, 5).join("\n")}`,
    };
  }

  for (const row of included) {
    const result = await writeHotelRate(hotelId, {
      roomType: row.roomType,
      mealPlan: row.mealPlan,
      seasonLabel: row.seasonLabel,
      validFrom: row.validFrom,
      validTo: row.validTo,
      costPerNightMinor: row.costInput,
      active: "on",
    });
    if (!result.ok) {
      return { ok: false, message: "A row failed to write. Some rates may already have been added — check the hotel's rates." };
    }
  }

  await prisma.rateSheetImport.update({
    where: { id: importId },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });

  revalidatePath(`/admin/hotels/${hotelId}`);
  redirect(`/admin/hotels/${hotelId}?imported=${included.length}`);
}

export async function discardImport(importId: string, hotelId: string): Promise<void> {
  await requireAdmin();
  await prisma.rateSheetImport.update({ where: { id: importId }, data: { status: "DISCARDED" } });
  revalidatePath(`/admin/hotels/${hotelId}`);
  redirect(`/admin/hotels/${hotelId}`);
}

export { isStubMode };
