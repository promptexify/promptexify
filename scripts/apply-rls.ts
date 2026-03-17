/**
 * Applies RLS helper functions to the database.
 * Safe to run repeatedly — uses CREATE OR REPLACE (idempotent).
 *
 * Usage: tsx scripts/apply-rls.ts
 *
 * Environment: DATABASE_URL must be set.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("ERROR: DATABASE_URL must be set");
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1 });

  try {
    const rlsSql = readFileSync(join(__dirname, "rls-functions.sql"), "utf-8");
    await sql.unsafe(rlsSql);
    console.log("RLS helper functions applied successfully.");
  } catch (error) {
    console.error("Failed to apply RLS helper functions:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
