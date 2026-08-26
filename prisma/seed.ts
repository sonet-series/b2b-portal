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

  const passwordHash = await hashPassword(password);

  // mustChangePassword is set on BOTH create and update. ADMIN_PASSWORD lives
  // in an env file on the server, so it is known to anyone who can read that
  // file — it must be a one-time credential, never the standing one.
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash, mustChangePassword: true },
    create: { email, passwordHash, name: "Sonet", mustChangePassword: true },
  });
  console.log(`✔ admin user ready: ${admin.email}`);
  console.log("  → you will be asked to set a new password at first sign-in.");
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
            ratePerNightMinor: 450_000, // ₹4,500
            extraBedRateMinor: 120_000, // ₹1,200
          },
          {
            roomType: "Suite",
            mealPlan: "MAP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            ratePerNightMinor: 820_000, // ₹8,200
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
            rateMinor: 1_450_000, // ₹14,500
            includedPax: 4,
            extraPaxRateMinor: 250_000, // ₹2,500
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
            rateMinor: 380_000, // ₹3,800
            minPax: 4,
            maxPax: 6,
          },
          {
            cruisePackage: "DAY_CRUISE",
            pricingMode: "WHOLE_BOAT",
            mealPlan: "MAP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            rateMinor: 700_000, // ₹7,000
            includedPax: 4,
            extraPaxRateMinor: 90_000, // ₹900
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
            rateMinor: 380_000, // ₹3,800
            includedKmPerDay: 250,
            extraKmRateMinor: 1_800, // ₹18
            driverAllowanceMinor: 50_000, // ₹500
          },
          {
            rateType: "TRANSFER",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            rateMinor: 320_000, // ₹3,200
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
            priceMinor: 2_450_000, // ₹24,500
            singleSupplementMinor: 750_000, // ₹7,500
          },
          // Same package sold as a flat family rate.
          {
            pricingMode: "PER_PACKAGE",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            priceMinor: 9_600_000, // ₹96,000
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
      address: "14 MG Road, Thrissur 680001, Kerala",
      status: "pending",
      passwordHash: await hashPassword("PendingAgent!123"),
      adminNotes: "SAMPLE DATA — delete before go-live",
    },
  });

  console.log("✔ demo catalogue, 1 approved agent (with overrides), 1 pending signup");
}

async function main() {
  await seedAdmin();

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
