import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 reads the connection from here rather than from schema.prisma.
// This file is for the CLI only (migrate / studio / db push). The running app
// builds its own better-sqlite3 driver adapter in src/lib/db.ts.
import "dotenv/config";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: { url },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "npx tsx prisma/seed.ts",
  },
});
