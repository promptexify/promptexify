/**
 * Idempotent migration seeder for Drizzle.
 *
 * Ensures the `drizzle.__drizzle_migrations` tracking table exists and that
 * all migrations listed in the journal are marked as applied.  This allows
 * `drizzle-kit migrate` to skip already-applied migrations and only execute
 * truly new ones.
 *
 * Safe to run on every build — it never re-executes migration SQL.
 *
 * Usage:  tsx scripts/seed-migrations.ts
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = join(__dirname, "..", "drizzle");
const JOURNAL_PATH = join(MIGRATIONS_DIR, "meta", "_journal.json");

function getDatabaseUrl(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DIRECT_URL or DATABASE_URL must be set");
    process.exit(1);
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    return parsed.toString();
  }
  return url;
}

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

async function main() {
  const sql = postgres(getDatabaseUrl(), { max: 1 });

  try {
    console.log("[seed-migrations] Ensuring drizzle schema and migrations table exist...");
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `);

    const journal: { entries: JournalEntry[] } = JSON.parse(
      readFileSync(JOURNAL_PATH, "utf-8")
    );

    const existing = await sql.unsafe<{ created_at: string }[]>(
      `SELECT created_at FROM drizzle."__drizzle_migrations" ORDER BY created_at DESC`
    );
    const appliedTimestamps = new Set(existing.map((r) => String(r.created_at)));

    let seeded = 0;
    for (const entry of journal.entries) {
      if (appliedTimestamps.has(String(entry.when))) {
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, `${entry.tag}.sql`);
      const content = readFileSync(filePath, "utf-8");
      const hash = createHash("sha256").update(content).digest("hex");

      await sql.unsafe(
        `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [hash, entry.when]
      );
      seeded++;
      console.log(`[seed-migrations] Marked as applied: ${entry.tag}`);
    }

    if (seeded === 0) {
      console.log("[seed-migrations] All migrations already tracked — nothing to seed.");
    } else {
      console.log(`[seed-migrations] Seeded ${seeded} migration(s).`);
    }
  } catch (error) {
    console.error("[seed-migrations] Failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
