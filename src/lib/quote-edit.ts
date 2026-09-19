import type { AnyQuoteInput } from "./quote-types";

/**
 * Rebuilds the quote-builder URL from a saved quote's inputs.
 *
 * Editing needs no new storage at all: the builder already reads everything it
 * needs from the query string, and `Quote.snapshotJson` already holds exactly
 * those inputs. So "edit" is just the same screen, re-opened with the values
 * it was submitted with.
 *
 * Returns null for a shape this cannot reopen — a combined trip, or a snapshot
 * from before an input existed — so the caller can hide the button rather than
 * offer one that lands on an empty form.
 */
export function editUrlFor(input: AnyQuoteInput, reference: string): string | null {
  if (input.productType !== "vehicle") return null;

  const p = new URLSearchParams();
  p.set("vehicleId", input.vehicleId);
  if (input.garageId) p.set("garageId", input.garageId);
  p.set("startDate", input.startDate);
  p.set("endDate", input.endDate);
  if (input.adults) p.set("adults", String(input.adults));
  for (const age of input.childAges ?? []) p.append("childAge", String(age));

  const days = input.days ?? [];
  if (days.length === 0) return null;

  for (const d of days) {
    // Appended in lockstep — the parser zips these back together by index, so
    // every day must contribute exactly one of each or they shear apart.
    p.append("dayDate", d.date);
    p.append("dayFrom", d.from);
    p.append("dayTo", d.to);
    p.append("dayVia", d.via.join("|"));
    p.append("dayBufferKm", String(d.bufferKm ?? 0));
    p.append("dayNotes", d.notes ?? "");
  }

  // Carried so saving replaces this quote instead of creating a second one.
  p.set("edit", reference);

  return `/agent/quote/vehicle?${p.toString()}`;
}
