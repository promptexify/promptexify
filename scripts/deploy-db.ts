/**
 * Database deployment script.
 *
 * 1. Applies RLS helper functions (idempotent CREATE OR REPLACE)
 * 2. Runs Drizzle migrations via the programmatic migrator API
 *
 * Uses DATABASE_URL — Drizzle's programmatic migrator handles poolers
 * correctly when prepare: false is set.
 *
 * Usage:
 *   tsx scripts/deploy-db.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL must be set");
    process.exit(1);
  }
  return url;
}

async function main() {
  const connectionString = getConnectionString();

  // Use max: 1 — migrations must run sequentially on a single connection
  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
  });
  const db = drizzle(client);

  console.log("=== Database Deployment ===\n");

  // Step 1: Apply RLS helper functions
  console.log("[1/2] Applying RLS helper functions...");
  try {
    const rlsSql = readFileSync(join(__dirname, "rls-functions.sql"), "utf-8");
    await client.unsafe(rlsSql);
    console.log("  ✓ Done\n");
  } catch (error) {
    console.error("  ✗ Failed to apply RLS helper functions:", error);
    await client.end();
    process.exit(1);
  }

  // Step 2: Run migrations (drizzle-orm tracks applied migrations automatically)
  console.log("[2/2] Running migrations...");
  try {
    await migrate(db, { migrationsFolder: join(__dirname, "..", "drizzle") });
    console.log("  ✓ Done\n");
  } catch (error) {
    console.error("  ✗ Migrations failed:", error);
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log("=== Deployment complete ===");
}

main();
