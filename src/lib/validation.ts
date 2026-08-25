import { z } from "zod";
import { toMinor } from "./money";
import { parseDateOnly } from "./dates";
import {
  MEAL_PLAN,
  HOUSEBOAT_CATEGORY,
  CRUISE_PACKAGE,
  HOUSEBOAT_PRICING_MODE,
  ITINERARY_PRICING_MODE,
  VEHICLE_RATE_TYPE,
} from "./enums";

/**
 * Zod schemas for every admin write path. Inputs arrive as FormData, so
 * everything starts as a string and is coerced here — this is the boundary
 * where untrusted strings become typed values.
 *
 * The mode-dependent rules (a PER_PERSON houseboat rate needs minPax, a
 * WHOLE_BOAT one needs includedPax, and so on) live in the `superRefine`
 * blocks. SQLite cannot express them and Prisma will not check them, so if
 * they are not enforced here they are not enforced anywhere.
 */

/** "4,500.50" -> 450050 paise. Rejects negatives and junk. */
const money = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => /^\d[\d,]*(\.\d{1,2})?$/.test(v), `${label} must be an amount like 4500 or 4500.50`)
    .transform(toMinor)
    .refine((v) => v > 0, `${label} must be more than zero`);

/**
 * Optional fields must tolerate an ABSENT key, not just an empty one: the
 * mode-switching rate forms unmount irrelevant inputs, so those names never
 * reach FormData at all.
 */
const optionalMoney = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v))
    .superRefine((v, ctx) => {
      if (v !== null && !/^\d[\d,]*(\.\d{1,2})?$/.test(v)) {
        ctx.addIssue({ code: "custom", message: `${label} must be an amount like 4500 or 4500.50` });
      }
    })
    .transform((v) => (v === null ? null : toMinor(v)));

const dateOnly = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), `${label} must be a date`)
    .transform(parseDateOnly);

const posInt = (label: string, min = 1) =>
  z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`);

const optionalPosInt = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .superRefine((v, ctx) => {
      if (v !== null && (!Number.isInteger(v) || v < 1)) {
        ctx.addIssue({ code: "custom", message: `${label} must be a whole number of at least 1` });
      }
    });

const text = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v));

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

/** Every rate row shares this season window. */
const seasonFields = {
  seasonLabel: text("Season label", 80),
  validFrom: dateOnly("Valid from"),
  validTo: dateOnly("Valid to"),
};

function checkSeasonOrder(
  v: { validFrom: Date; validTo: Date },
  ctx: z.RefinementCtx
) {
  if (v.validTo < v.validFrom) {
    ctx.addIssue({ code: "custom", path: ["validTo"], message: "Valid to must not be before valid from" });
  }
}

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

export const hotelSchema = z.object({
  name: text("Hotel name"),
  location: text("Location", 120),
  starCategory: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .superRefine((v, ctx) => {
      if (v !== null && (!Number.isInteger(v) || v < 1 || v > 7)) {
        ctx.addIssue({ code: "custom", message: "Star category must be 1–7" });
      }
    }),
  notes: optionalText(),
  active: checkbox,
});

export const hotelRateSchema = z
  .object({
    roomType: text("Room type", 80),
    mealPlan: z.enum(MEAL_PLAN, { error: "Choose a meal plan" }),
    ...seasonFields,
    ratePerNightMinor: money("Rate per night"),
    extraBedRateMinor: optionalMoney("Extra bed rate"),
    active: checkbox,
  })
  .superRefine(checkSeasonOrder);

// ---------------------------------------------------------------------------
// Houseboats
// ---------------------------------------------------------------------------

export const houseboatSchema = z.object({
  name: text("Houseboat name"),
  operator: optionalText(120),
  category: z.enum(HOUSEBOAT_CATEGORY, { error: "Choose a category" }),
  bedrooms: posInt("Bedrooms"),
  location: text("Location", 120),
  amenities: optionalText(),
  notes: optionalText(),
  active: checkbox,
});

export const houseboatRateSchema = z
  .object({
    cruisePackage: z.enum(CRUISE_PACKAGE, { error: "Choose a cruise package" }),
    pricingMode: z.enum(HOUSEBOAT_PRICING_MODE, { error: "Choose a pricing mode" }),
    mealPlan: z.enum(MEAL_PLAN, { error: "Choose a meal plan" }),
    ...seasonFields,
    rateMinor: money("Rate"),
    includedPax: optionalPosInt("Included pax"),
    extraPaxRateMinor: optionalMoney("Extra pax rate"),
    minPax: optionalPosInt("Minimum pax"),
    maxPax: posInt("Maximum pax"),
    active: checkbox,
  })
  .superRefine((v, ctx) => {
    checkSeasonOrder(v, ctx);

    if (v.pricingMode === "WHOLE_BOAT") {
      if (v.includedPax === null) {
        ctx.addIssue({
          code: "custom",
          path: ["includedPax"],
          message: "Whole-boat pricing needs the pax count the rate covers",
        });
      } else if (v.includedPax > v.maxPax) {
        ctx.addIssue({
          code: "custom",
          path: ["includedPax"],
          message: "Included pax cannot exceed the boat's maximum",
        });
      }
      if (v.minPax !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["minPax"],
          message: "Minimum pax applies to per-person pricing only",
        });
      }
    }

    if (v.pricingMode === "PER_PERSON") {
      if (v.minPax !== null && v.minPax > v.maxPax) {
        ctx.addIssue({
          code: "custom",
          path: ["minPax"],
          message: "Minimum pax cannot exceed the boat's maximum",
        });
      }
      if (v.includedPax !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["includedPax"],
          message: "Included pax applies to whole-boat pricing only",
        });
      }
      if (v.extraPaxRateMinor !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["extraPaxRateMinor"],
          message: "Extra pax rate applies to whole-boat pricing only",
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export const vehicleSchema = z.object({
  type: text("Vehicle type", 120),
  capacity: posInt("Capacity"),
  notes: optionalText(),
  active: checkbox,
});

export const vehicleRateSchema = z
  .object({
    rateType: z.enum(VEHICLE_RATE_TYPE, { error: "Choose a rate type" }),
    ...seasonFields,
    rateMinor: money("Rate"),
    includedKmPerDay: optionalPosInt("Included km per day"),
    extraKmRateMinor: optionalMoney("Extra km rate"),
    driverAllowanceMinor: optionalMoney("Driver allowance"),
    active: checkbox,
  })
  .superRefine((v, ctx) => {
    checkSeasonOrder(v, ctx);

    // The per-day extras only mean anything on a per-day rate. Allowing them
    // elsewhere would put numbers in the DB that the quote engine ignores.
    if (v.rateType !== "PER_DAY") {
      for (const field of ["includedKmPerDay", "extraKmRateMinor", "driverAllowanceMinor"] as const) {
        if (v[field] !== null) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "This field applies to per-day rates only",
          });
        }
      }
    }
  });

// ---------------------------------------------------------------------------
// Itineraries
// ---------------------------------------------------------------------------

export const itinerarySchema = z.object({
  name: text("Package name"),
  durationNights: posInt("Duration in nights", 0),
  routeSummary: optionalText(5000),
  inclusions: optionalText(5000),
  exclusions: optionalText(5000),
  active: checkbox,
});

export const itineraryRateSchema = z
  .object({
    pricingMode: z.enum(ITINERARY_PRICING_MODE, { error: "Choose a pricing mode" }),
    ...seasonFields,
    priceMinor: money("Price"),
    singleSupplementMinor: optionalMoney("Single supplement"),
    maxPax: optionalPosInt("Maximum pax"),
    active: checkbox,
  })
  .superRefine((v, ctx) => {
    checkSeasonOrder(v, ctx);

    if (v.pricingMode === "PER_PACKAGE" && v.singleSupplementMinor !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["singleSupplementMinor"],
        message: "Single supplement applies to per-person pricing only",
      });
    }
  });

// ---------------------------------------------------------------------------
// Shared form-action plumbing
// ---------------------------------------------------------------------------

export type FormState = {
  ok: boolean;
  message?: string;
  /** Field name -> first error message. */
  errors?: Record<string, string>;
};

export const EMPTY_FORM_STATE: FormState = { ok: false };

/** Flattens a ZodError into the field->message shape the forms render. */
export function toFormState(error: z.ZodError): FormState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    errors[key] ??= issue.message;
  }
  return { ok: false, message: "Please fix the highlighted fields.", errors };
}

/** FormData -> plain object for zod. Absent checkboxes stay absent. */
export function formObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}
