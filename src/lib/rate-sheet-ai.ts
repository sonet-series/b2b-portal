import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MEAL_PLAN } from "./enums";

/**
 * Extracting hotel rates from a supplier's rate sheet.
 *
 * Hotels send whatever format they like — PDF, a scan, a spreadsheet — with no
 * consistent structure. This reads one and PROPOSES rows. Nothing it returns
 * is written anywhere: every row goes to a human review screen first, because
 * a bad extraction becomes a wrong price quoted to a real customer.
 *
 * Rate sheets quote NET/COST rates to the DMC, so what comes out is cost. The
 * markup rules turn that into the two agent-facing prices.
 */

/** The model must not invent a meal plan we cannot store. */
const ExtractedRow = z.object({
  roomType: z.string().describe("Room type exactly as the sheet names it, e.g. 'Deluxe', 'Premium Suite'"),
  mealPlan: z.enum(MEAL_PLAN).describe("EP room only, CP breakfast, MAP breakfast + one meal, AP all meals"),
  seasonLabel: z.string().describe("The season's name on the sheet, e.g. 'Peak', 'Season 2026-27'"),
  validFrom: z.string().describe("Start date as YYYY-MM-DD, or empty string if the sheet is unclear"),
  validTo: z.string().describe("End date as YYYY-MM-DD, or empty string if the sheet is unclear"),
  costPerNight: z.string().describe("COST per room per night in rupees, digits only, e.g. '4500'"),
  confidence: z.enum(["HIGH", "LOW"]).describe("LOW whenever anything about this row required guessing"),
  issues: z.string().describe("If confidence is LOW, what was ambiguous. Empty string otherwise."),
});

const Extraction = z.object({
  rows: z.array(ExtractedRow),
  notes: z.string().describe("Anything about the sheet as a whole worth flagging. Empty string if nothing."),
});

export type ExtractedRateRow = z.infer<typeof ExtractedRow>;
export type RateSheetExtraction = z.infer<typeof Extraction> & { model: string };

export const EXTRACTION_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

/** What the Claude API accepts directly. Spreadsheets are converted to text first. */
const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_TYPE = "application/pdf";

const SYSTEM = `You extract hotel room rates from rate sheets sent by hotels to a Kerala tour operator.

The rates on these sheets are NET or COST rates charged to the operator — never retail or
sell prices. Extract them exactly as printed; do not add any margin.

Rules:
- One row per distinct combination of room type, meal plan and season.
- Dates: Indian rate sheets are almost always dd/mm/yyyy. "01/04/2026" is 1 April 2026,
  not 4 January. If a sheet is genuinely ambiguous, set confidence LOW and say so in issues
  rather than guessing silently.
- A season given as a name only, with no dates, must have empty validFrom/validTo and
  confidence LOW.
- Meal plans: map the sheet's wording onto EP, CP, MAP or AP. "Room only" is EP, "with
  breakfast" is CP, "half board" is MAP, "full board" is AP. If it is not stated, use EP and
  set confidence LOW.
- costPerNight is digits only in rupees, with no separators or currency symbol.
- Set confidence LOW for ANYTHING you had to infer. A reviewer checks every row, so flagging
  a doubt is free and missing one is expensive.
- Do not invent rows. If the sheet contains no readable rates, return an empty list and
  explain why in notes.`;

export class ExtractionError extends Error {}

/**
 * The dev stub.
 *
 * Returns fixed rows so the upload → review → confirm flow can be exercised
 * without an API key. It is gated on NODE_ENV so it can NEVER run in
 * production — a stub that quietly produced fake rates on the live site would
 * be far worse than the feature simply being unavailable.
 */
function devStub(originalName: string): RateSheetExtraction {
  return {
    model: "dev-stub (no ANTHROPIC_API_KEY set)",
    notes: `DEVELOPMENT STUB — no AI extraction ran. These rows are fabricated from "${originalName}" so the review flow can be tested. Never trust them.`,
    rows: [
      { roomType: "Deluxe", mealPlan: "CP", seasonLabel: "Stub season", validFrom: "2026-04-01", validTo: "2026-09-30", costPerNight: "4200", confidence: "HIGH", issues: "" },
      { roomType: "Deluxe", mealPlan: "MAP", seasonLabel: "Stub peak", validFrom: "2026-12-20", validTo: "2027-01-05", costPerNight: "6800", confidence: "HIGH", issues: "" },
      { roomType: "Suite", mealPlan: "CP", seasonLabel: "Stub season", validFrom: "", validTo: "", costPerNight: "9100", confidence: "LOW", issues: "Stub row with deliberately missing dates, so the review screen's LOW-confidence path can be seen." },
    ],
  };
}

export function isStubMode(): boolean {
  return !process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV !== "production";
}

/**
 * Reads one rate sheet.
 *
 * `bytes` is the whole file — deliberately never truncated. If a sheet is too
 * large for one request the caller is told to split it, rather than silently
 * extracting half of it.
 */
export async function extractHotelRates(opts: {
  bytes: Uint8Array;
  mimeType: string;
  originalName: string;
  /** Plain text for spreadsheets/CSV, already converted by the caller. */
  text?: string;
}): Promise<RateSheetExtraction> {
  if (isStubMode()) return devStub(opts.originalName);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ExtractionError(
      "ANTHROPIC_API_KEY is not set on this server, so rate-sheet extraction is unavailable. Add it to .env.production and restart."
    );
  }

  const client = new Anthropic({ apiKey });

  const content: Anthropic.ContentBlockParam[] = [];
  if (opts.text !== undefined) {
    content.push({
      type: "text",
      text: `Rate sheet "${opts.originalName}", converted to text:\n\n${opts.text}`,
    });
  } else if (opts.mimeType === PDF_TYPE) {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(opts.bytes).toString("base64"),
      },
    });
  } else if (VISION_TYPES.has(opts.mimeType)) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: opts.mimeType as "image/jpeg" | "image/png" | "image/webp",
        data: Buffer.from(opts.bytes).toString("base64"),
      },
    });
  } else {
    throw new ExtractionError(`${opts.mimeType} cannot be read as a rate sheet.`);
  }

  content.push({
    type: "text",
    text: "Extract every room rate from this sheet. Remember these are cost rates, and flag anything you had to infer.",
  });

  try {
    const response = await client.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      // Reading a badly-structured sheet is exactly the kind of task that
      // benefits from thinking; the reviewer's time is worth more than tokens.
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(Extraction) },
    });

    if (response.stop_reason === "refusal") {
      throw new ExtractionError(
        "The model declined to read this file. If it is a normal rate sheet, try re-exporting it."
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new ExtractionError(
        "This sheet has more rows than one extraction can return. Split it and upload the parts separately — a partial extraction is worse than none."
      );
    }
    if (!response.parsed_output) {
      throw new ExtractionError("The model's response could not be read as rate rows.");
    }

    return { ...response.parsed_output, model: EXTRACTION_MODEL };
  } catch (e) {
    if (e instanceof ExtractionError) throw e;
    if (e instanceof Anthropic.AuthenticationError) {
      throw new ExtractionError("The Anthropic API key on this server was rejected.");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new ExtractionError("The Anthropic API is rate limited right now. Try again shortly.");
    }
    if (e instanceof Anthropic.APIError) {
      throw new ExtractionError(`Extraction failed (${e.status}). ${e.message}`);
    }
    throw new ExtractionError("Extraction failed for an unexpected reason.");
  }
}
