/**
 * Seed. Run with: npm run db:seed
 *
 * Always creates/updates the single admin user (Sonet) from .env.
 *
 * Sample catalogue data is created ONLY when SEED_DEMO=1, because Sonet is
 * entering the real hotels/vehicles/itineraries by hand through the admin
 * screens — demo rows must never turn up in a real database.
 *
 *   SEED_DEMO=1 npm run db:seed
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MUST NOT IMPORT FROM src/.
 *
 * It runs via tsx inside the production container at startup, and the runner
 * image deliberately ships only the compiled app in .next — no TypeScript
 * source. Importing a helper from src/ fails at container runtime with
 * "Cannot find module '../src/lib/password'", which no build-time check
 * catches because the build stage still has src/ present.
 *
 * So money is written as explicit paise literals and dates as explicit UTC
 * dates below, rather than reaching for src/lib/money.ts and src/lib/dates.ts.
 * That is deliberate: a local copy of those helpers would be a second
 * implementation of a load-bearing convention, free to drift. Literals cannot
 * drift because there is nothing to drift from.
 * ---------------------------------------------------------------------------
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

/** Matches BCRYPT COST in src/lib/password.ts. bcrypt records the cost inside
 *  the hash, so the two staying in step is a tidiness matter, not a correctness
 *  one — a hash written here verifies fine against the app's verifyPassword. */
const BCRYPT_COST = 12;

async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 10) throw new Error("Password must be at least 10 characters");
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** YYYY-MM-DD at UTC midnight, matching how the app stores calendar dates. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Wide-open window so demo rates resolve for any travel date while building. */
const ALL_2026 = { validFrom: utc(2026, 1, 1), validTo: utc(2026, 12, 31) };

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }

  const existing = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true, mustChangePassword: true },
  });

  // ---------------------------------------------------------------------
  // First boot: create the account with the one-time password from the env
  // file, and force a change at first sign-in. ADMIN_PASSWORD is readable by
  // anyone who can read that file, so it must never be the standing password.
  // ---------------------------------------------------------------------
  if (!existing) {
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        name: "Sonet",
        mustChangePassword: true,
      },
    });
    console.log(`✔ admin user created: ${email}`);
    console.log("  → you will be asked to set a new password at first sign-in.");

    const others = await prisma.adminUser.count({ where: { NOT: { email } } });
    if (others > 0) {
      // v1 is deliberately single-admin. Changing ADMIN_EMAIL creates a second
      // account rather than renaming the first, which is worth saying out loud.
      console.warn(
        `  ! ${others} other admin account(s) already exist. ADMIN_EMAIL may have changed; ` +
          "the previous account still works and was not removed."
      );
    }
    return;
  }

  // ---------------------------------------------------------------------
  // Explicit, opt-in recovery. Without this there is no way back in if the
  // admin password is lost — there is no email provider and so no self-service
  // reset. It is a separate env var precisely so it cannot happen by accident
  // on an ordinary redeploy.
  // ---------------------------------------------------------------------
  if (process.env.ADMIN_PASSWORD_RESET === "1") {
    await prisma.adminUser.update({
      where: { email },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true },
    });
    console.log(`✔ admin password RESET from ADMIN_PASSWORD: ${email}`);
    console.log("  → change it at next sign-in, then unset ADMIN_PASSWORD_RESET.");
    return;
  }

  // ---------------------------------------------------------------------
  // Every other boot: make sure the account is present and its non-credential
  // fields are right, and touch NOTHING else.
  //
  // This ran as an upsert that rewrote passwordHash and mustChangePassword on
  // every start, so each redeploy silently reverted an already-changed admin
  // password back to the one in .env.production. Credentials belong to the
  // account once it exists, not to the env file.
  // ---------------------------------------------------------------------
  await prisma.adminUser.update({ where: { email }, data: { name: "Sonet" } });
  console.log(`✔ admin user present: ${email} (password left unchanged)`);
  if (existing.mustChangePassword) {
    console.log("  → still on its setup password; you will be asked to change it at sign-in.");
  }
}

/**
 * The eight markup rules, at the confirmed defaults.
 *
 * Created only when missing and NEVER overwritten, so a value Sonet edits at
 * /admin/settings survives every redeploy — the same reasoning as the admin
 * password, and the same bug if it were an upsert.
 *
 * Values are inline rather than imported from src/lib/markup.ts because this
 * file must not import from src/ — see the banner at the top. They are checked
 * against that module by a unit check rather than shared at runtime.
 */
async function seedMarkupRules() {
  const DEFAULTS: [string, string, "FLAT" | "PERCENT", number][] = [
    ["hotel", "KERALA", "FLAT", 100_00], // cost + ₹100
    ["hotel", "OUTSIDE_KERALA", "PERCENT", 500], // cost + 5%
    ["vehicle", "KERALA", "PERCENT", 1000], // cost + 10%
    ["vehicle", "OUTSIDE_KERALA", "PERCENT", 1500], // cost + 15%
    ["houseboat", "KERALA", "PERCENT", 500], // cost + 5%
    ["houseboat", "OUTSIDE_KERALA", "PERCENT", 1200], // cost + 12%
    ["itinerary", "KERALA", "PERCENT", 1500], // cost + 15%
    ["itinerary", "OUTSIDE_KERALA", "PERCENT", 2700], // cost + 27%
  ];

  let created = 0;
  for (const [productType, tier, kind, value] of DEFAULTS) {
    const existing = await prisma.markupRule.findUnique({
      where: { productType_tier: { productType, tier } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.markupRule.create({ data: { productType, tier, kind, value } });
    created++;
  }

  console.log(
    created > 0
      ? `✔ markup rules: created ${created} of 8 at their defaults`
      : "✔ markup rules: all 8 present, left untouched"
  );
}

async function seedDemoCatalogue() {
  console.log("• SEED_DEMO=1 — creating sample catalogue rows");

  const hotel = await prisma.hotel.create({
    data: {
      name: "Demo Hill Resort",
      location: "Munnar",
      starCategory: 4,
      notes: "SAMPLE DATA — delete before go-live",
      rates: {
        create: [
          {
            roomType: "Deluxe",
            mealPlan: "CP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costPerNightMinor: 450_000, // ₹4,500 cost
            extraBedCostMinor: 120_000, // ₹1,200 cost
          },
          {
            roomType: "Suite",
            mealPlan: "MAP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costPerNightMinor: 820_000, // ₹8,200 cost
          },
        ],
      },
    },
    include: { rates: true },
  });

  const houseboat = await prisma.houseboat.create({
    data: {
      name: "Demo Backwater Cruiser",
      operator: "Sample Operator",
      category: "Premium",
      bedrooms: 2,
      location: "Alleppey",
      amenities: "AC bedrooms 9pm–6am, upper deck, sundeck",
      notes: "SAMPLE DATA — delete before go-live",
      rates: {
        create: [
          // Whole-boat overnight — the classic Kerala sale.
          {
            cruisePackage: "OVERNIGHT_22HR",
            pricingMode: "WHOLE_BOAT",
            mealPlan: "AP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costMinor: 1450_000, // ₹14,500 cost
            includedPax: 4,
            extraPaxCostMinor: 250_000, // ₹2,500 cost
            maxPax: 6,
          },
          // Same boat, same duration, sold per head as well. Two rows, so the
          // agent sees two priced options rather than a mode toggle.
          {
            cruisePackage: "OVERNIGHT_22HR",
            pricingMode: "PER_PERSON",
            mealPlan: "AP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costMinor: 380_000, // ₹3,800 cost
            minPax: 4,
            maxPax: 6,
          },
          {
            cruisePackage: "DAY_CRUISE",
            pricingMode: "WHOLE_BOAT",
            mealPlan: "MAP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costMinor: 700_000, // ₹7,000 cost
            includedPax: 4,
            extraPaxCostMinor: 90_000, // ₹900 cost
            maxPax: 8,
          },
        ],
      },
    },
    include: { rates: true },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      type: "Innova Crysta",
      capacity: 6,
      notes: "SAMPLE DATA — delete before go-live",
      rates: {
        create: [
          {
            rateType: "PER_DAY",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costMinor: 380_000, // ₹3,800 cost
            includedKmPerDay: 250,
            extraKmCostMinor: 1_800, // ₹18 cost
            driverAllowanceCostMinor: 50_000, // ₹500 cost
          },
          {
            rateType: "TRANSFER",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costMinor: 320_000, // ₹3,200 cost
          },
        ],
      },
    },
    include: { rates: true },
  });

  const itinerary = await prisma.itinerary.create({
    data: {
      name: "5N/6D Munnar – Thekkady – Alleppey",
      durationNights: 5,
      routeSummary:
        "Day 1 Cochin → Munnar · Day 2 Munnar sightseeing · Day 3 Munnar → Thekkady · " +
        "Day 4 Thekkady → Alleppey · Day 5 Houseboat · Day 6 Alleppey → Cochin drop",
      inclusions: "Accommodation, daily breakfast, private vehicle, houseboat night",
      exclusions: "Airfare, entry tickets, personal expenses",
      rates: {
        create: [
          {
            pricingMode: "PER_PERSON_TWIN_SHARING",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costMinor: 2450_000, // ₹24,500 cost
            singleSupplementCostMinor: 750_000, // ₹7,500 cost
          },
          // Same package sold as a flat family rate.
          {
            pricingMode: "PER_PACKAGE",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            costMinor: 9600_000, // ₹96,000 cost
            maxPax: 4,
          },
        ],
      },
    },
    include: { rates: true },
  });

  // A demo agent, already approved, with one override per product type so the
  // fallback-vs-override logic has something to exercise in Phase 4.
  const agent = await prisma.agent.create({
    data: {
      agencyName: "Demo Travels Pvt Ltd",
      contactName: "Demo Agent",
      phone: "+91 90000 00000",
      email: "demo.agent@example.com",
      address: "2nd Floor, Marine Drive, Ernakulam, Kochi 682031, Kerala",
      altPhone: "+91 90000 00010",
      derivedTier: "KERALA",
      status: "approved",
      approvedAt: new Date(),
      passwordHash: await hashPassword("DemoAgent!123"),
      adminNotes: "SAMPLE DATA — delete before go-live",
    },
  });

  await prisma.agentRateCard.createMany({
    data: [
      {
        agentId: agent.id,
        productType: "hotel",
        referenceId: hotel.rates[0].id,
        overridePriceMinor: 410_000, // ₹4,100
        notes: "Demo override on the Deluxe/CP rate",
      },
      {
        // An ancillary override, so the per-charge path is exercisable: this
        // agency gets a special extra-bed rate WITHOUT it touching the room rate.
        agentId: agent.id,
        productType: "hotel",
        referenceId: hotel.rates[0].id,
        charge: "EXTRA_BED",
        overridePriceMinor: 900_00, // ₹900
        notes: "Demo override on the extra bed charge only",
      },
      {
        agentId: agent.id,
        productType: "houseboat",
        referenceId: houseboat.rates[0].id,
        overridePriceMinor: 1_350_000, // ₹13,500
      },
      {
        agentId: agent.id,
        productType: "vehicle",
        referenceId: vehicle.rates[0].id,
        overridePriceMinor: 350_000, // ₹3,500
      },
      {
        agentId: agent.id,
        productType: "itinerary",
        referenceId: itinerary.rates[0].id,
        overridePriceMinor: 2_290_000, // ₹22,900
      },
    ],
  });

  // One pending signup so the Phase 3 approval queue is not empty.
  await prisma.agent.create({
    data: {
      agencyName: "Demo Pending Tours",
      contactName: "Pending Person",
      phone: "+91 90000 00001",
      email: "pending.agent@example.com",
      address: "221 Linking Road, Bandra West, Mumbai 400050",
      derivedTier: "OUTSIDE_KERALA",
      status: "pending",
      passwordHash: await hashPassword("PendingAgent!123"),
      adminNotes: "SAMPLE DATA — delete before go-live",
    },
  });

  console.log("✔ demo catalogue, 1 approved agent (with overrides), 1 pending signup");
}

async function main() {
  await seedAdmin();

  await seedMarkupRules();

  if (process.env.SEED_DEMO === "1") {
    const existing = await prisma.hotel.count();
    if (existing > 0) {
      console.log("• catalogue already has rows — skipping demo seed");
    } else {
      await seedDemoCatalogue();
    }
  } else {
    console.log("• SEED_DEMO not set — catalogue left empty (run with SEED_DEMO=1 for samples)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
