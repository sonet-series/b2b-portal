import { z } from "zod";
import { toMinor } from "./money";
import { parseDateOnly } from "./dates";
import {
  AGENT_TIER,
  PRODUCT_TYPE,
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
    ratePerNightKeralaMinor: money("Kerala rate per night"),
    ratePerNightOutsideKeralaMinor: money("Outside-Kerala rate per night"),
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
    rateKeralaMinor: money("Kerala rate"),
    rateOutsideKeralaMinor: money("Outside-Kerala rate"),
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
    rateKeralaMinor: money("Kerala rate"),
    rateOutsideKeralaMinor: money("Outside-Kerala rate"),
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
    priceKeralaMinor: money("Kerala price"),
    priceOutsideKeralaMinor: money("Outside-Kerala price"),
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
  /**
   * What the user typed, echoed back so a rejected form can be re-rendered
   * with their input intact. Browsers always clear file inputs on re-render
   * for security, so those must be re-picked regardless — but making someone
   * retype nine text fields because one of them was wrong is its own defect.
   *
   * Passwords are deliberately never included.
   */
  values?: Record<string, string>;
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

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/**
 * Public registration. This is the only schema on an unauthenticated route, so
 * it is the strictest — everything here comes from a stranger.
 */
const phoneRule = (label: string, min: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(24, `${label} is too long`)
    .refine((v) => /^[+\d][\d\s-]*$/.test(v), `${label} can only contain digits, spaces, + and -`);

/** Optional phone / email: blank is fine, but anything entered must be valid. */
const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v))
  .superRefine((v, ctx) => {
    if (v !== null && !/^[+\d][\d\s-]{5,23}$/.test(v)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, or leave this blank" });
    }
  });

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v))
  .superRefine((v, ctx) => {
    if (v !== null && !z.string().email().safeParse(v).success) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address, or leave this blank" });
    }
  });

export const agentRegistrationSchema = z
  .object({
    agencyName: text("Agency name", 160),
    contactName: text("Contact name", 120),
    address: z
      .string()
      .trim()
      .min(10, "Enter the agency's full address")
      .max(600, "Address is too long"),
    phone: phoneRule("Phone number", 7),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
    altPhone: optionalPhone,
    altEmail: optionalEmail,
    password: z
      .string()
      .min(10, "Password must be at least 10 characters")
      .max(200, "Password is too long"),
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
    if (v.altEmail && v.altEmail === v.email) {
      ctx.addIssue({
        code: "custom",
        path: ["altEmail"],
        message: "The alternative email must differ from the primary one",
      });
    }
    if (v.altPhone && v.altPhone.replace(/\D/g, "") === v.phone.replace(/\D/g, "")) {
      ctx.addIssue({
        code: "custom",
        path: ["altPhone"],
        message: "The alternative number must differ from the primary one",
      });
    }
  });

/** Agent changing their own password, including the forced first-login change. */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: z
      .string()
      .min(10, "New password must be at least 10 characters")
      .max(200, "Password is too long"),
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match" });
    }
    if (v.password === v.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "New password must be different from the current one",
      });
    }
  });

/** Sonet approving a signup. Rejection reuses the notes field only. */
export const agentApprovalSchema = z.object({
  /** "none" leaves the agent on default rates; otherwise clone this agent's overrides. */
  copyRateCardFromAgentId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" || v === "none" ? null : v)),
  adminNotes: optionalText(2000),
});

/** Sonet's manual tier choice. "auto" clears the override back to the guess. */
export const agentTierSchema = z.object({
  tierOverride: z
    .string()
    .trim()
    .refine((v) => v === "auto" || (AGENT_TIER as readonly string[]).includes(v), "Choose a tier")
    .transform((v) => (v === "auto" ? null : v)),
});

export const agentRejectionSchema = z.object({
  adminNotes: optionalText(2000),
});

/** A single per-agent price override. */
export const rateCardEntrySchema = z.object({
  productType: z.enum(PRODUCT_TYPE, { error: "Choose a product type" }),
  referenceId: text("Rate", 60),
  overridePriceMinor: money("Override price"),
  notes: optionalText(500),
});

// ---------------------------------------------------------------------------
// Quote inputs
//
// These parse URL search params, not just form posts — the quote screens keep
// their inputs in the query string so a result is refreshable and shareable.
// ---------------------------------------------------------------------------

const paxField = (label: string, max = 60) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(1, `${label} must be at least 1`)
    .max(max, `${label} looks too large`);

export const hotelQuoteSchema = z
  .object({
    hotelId: z.string().min(1, "Choose a hotel"),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a check-in date"),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a check-out date"),
    rooms: paxField("Rooms", 40),
    extraBeds: z.coerce.number().int().min(0).max(40).catch(0),
  })
  .superRefine((v, ctx) => {
    if (v.checkOut <= v.checkIn) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in" });
    }
  });

export const houseboatQuoteSchema = z.object({
  houseboatId: z.string().min(1, "Choose a houseboat"),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a cruise date"),
  pax: paxField("Passengers"),
});

export const vehicleQuoteSchema = z
  .object({
    vehicleId: z.string().min(1, "Choose a vehicle"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
    km: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === undefined || v === "" ? null : Number(v)))
      .superRefine((v, ctx) => {
        if (v !== null && (!Number.isFinite(v) || v < 0 || v > 100000)) {
          ctx.addIssue({ code: "custom", message: "Distance must be a number of kilometres" });
        }
      }),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must not be before the start date" });
    }
  });

export const itineraryQuoteSchema = z.object({
  itineraryId: z.string().min(1, "Choose a package"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a departure date"),
  pax: paxField("Travellers"),
});
