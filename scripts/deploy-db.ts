/**
 * Database deployment script.
 *
 * 1. Applies RLS helper functions (idempotent CREATE OR REPLACE)
 * 2. Runs Drizzle migrations (drizzle-kit migrate)
 *
 * Usage:
 *   npx tsx scripts/deploy-db.ts
 *
 * Environment:
 *   DIRECT_URL or DATABASE_URL must be set (service-role / superuser connection).
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";
import { execSync } from "child_process";

async function main() {
  const connectionString =
    process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("ERROR: DIRECT_URL or DATABASE_URL must be set");
    process.exit(1);
  }

  console.log("=== Database Deployment ===\n");

  // Step 1: Apply RLS helper functions
  console.log("[1/2] Applying RLS helper functions...");
  const sql = postgres(connectionString, { max: 1 });

  try {
    const rlsSql = readFileSync(
      join(__dirname, "rls-functions.sql"),
      "utf-8"
    );
    await sql.unsafe(rlsSql);
    console.log("  ✓ RLS helper functions applied successfully\n");
  } catch (error) {
    console.error("  ✗ Failed to apply RLS helper functions:", error);
    await sql.end();
    process.exit(1);
  }

  await sql.end();

  // Step 2: Run Drizzle migrations
  console.log("[2/2] Running Drizzle migrations...");
  try {
    execSync("npx drizzle-kit migrate", { stdio: "inherit" });
    console.log("\n  ✓ Drizzle migrations completed successfully\n");
  } catch (error) {
    console.error("  ✗ Drizzle migrations failed:", error);
    process.exit(1);
  }

  console.log("=== Deployment complete ===");
}

main();
