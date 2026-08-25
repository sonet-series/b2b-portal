import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * The Prisma client, constructed LAZILY on first use.
 *
 * Why the proxy rather than `export const prisma = createClient()`:
 *
 * `next build` imports every route module to collect its configuration. That
 * happens in the Docker builder, where there is no database and no
 * DATABASE_URL — `.env` is deliberately excluded by .dockerignore. A client
 * built at module scope therefore threw during the build, failing it on
 * whichever authenticated page got imported first.
 *
 * `export const dynamic = "force-dynamic"` does NOT fix that. It stops a page
 * being pre-rendered, but the module is still imported to read that very
 * setting, so anything running at import time still runs.
 *
 * Deferring construction to first property access means importing this module
 * is free. The connection is only ever made when a query actually runs, which
 * is at request time on the server, where DATABASE_URL exists.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Locally: copy .env.example to .env. " +
        "In production: check .env.production on the server."
    );
  }

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Module-level cache. In production this is what keeps a single client for the
 * process; in development the global below additionally survives the module
 * re-evaluation that hot reload causes, which would otherwise open a fresh
 * SQLite handle on every edit.
 */
let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (client) return client;

  client = globalForPrisma.prisma ?? createClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;

  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const value = Reflect.get(getClient(), property);
    // Model accessors and $-methods must keep their `this`.
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getClient(), property, value);
  },
  has(_target, property) {
    return property in getClient();
  },
  ownKeys() {
    return Reflect.ownKeys(getClient());
  },
  getOwnPropertyDescriptor(_target, property) {
    const descriptor = Reflect.getOwnPropertyDescriptor(getClient(), property);
    // The proxy target is an empty object, so every reported property must be
    // configurable or the JS engine throws on the invariant check.
    return descriptor && { ...descriptor, configurable: true };
  },
});
