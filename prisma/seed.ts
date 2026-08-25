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
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hashPassword } from "../src/lib/password";
import { toMinor } from "../src/lib/money";
import { parseDateOnly } from "../src/lib/dates";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

/** Wide-open window so demo rates resolve for any travel date while building. */
const ALL_2026 = { validFrom: parseDateOnly("2026-01-01"), validTo: parseDateOnly("2026-12-31") };

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: "Sonet" },
  });
  console.log(`✔ admin user ready: ${admin.email}`);
  console.log("  → change this password in-app once the admin screens exist.");
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
            ratePerNightMinor: toMinor(4500),
            extraBedRateMinor: toMinor(1200),
          },
          {
            roomType: "Suite",
            mealPlan: "MAP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            ratePerNightMinor: toMinor(8200),
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
            rateMinor: toMinor(14500),
            includedPax: 4,
            extraPaxRateMinor: toMinor(2500),
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
            rateMinor: toMinor(3800),
            minPax: 4,
            maxPax: 6,
          },
          {
            cruisePackage: "DAY_CRUISE",
            pricingMode: "WHOLE_BOAT",
            mealPlan: "MAP",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            rateMinor: toMinor(7000),
            includedPax: 4,
            extraPaxRateMinor: toMinor(900),
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
            rateMinor: toMinor(3800),
            includedKmPerDay: 250,
            extraKmRateMinor: toMinor(18),
            driverAllowanceMinor: toMinor(500),
          },
          {
            rateType: "TRANSFER",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            rateMinor: toMinor(3200),
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
            priceMinor: toMinor(24500),
            singleSupplementMinor: toMinor(7500),
          },
          // Same package sold as a flat family rate.
          {
            pricingMode: "PER_PACKAGE",
            seasonLabel: "Standard 2026",
            ...ALL_2026,
            priceMinor: toMinor(96000),
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
      gstOrLicenseNumber: "32DEMO0000A1Z5",
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
        overridePriceMinor: toMinor(4100),
        notes: "Demo override on the Deluxe/CP rate",
      },
      {
        agentId: agent.id,
        productType: "houseboat",
        referenceId: houseboat.rates[0].id,
        overridePriceMinor: toMinor(13500),
      },
      {
        agentId: agent.id,
        productType: "vehicle",
        referenceId: vehicle.rates[0].id,
        overridePriceMinor: toMinor(3500),
      },
      {
        agentId: agent.id,
        productType: "itinerary",
        referenceId: itinerary.rates[0].id,
        overridePriceMinor: toMinor(22900),
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
      gstOrLicenseNumber: "32DEMO0001B2Z6",
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
