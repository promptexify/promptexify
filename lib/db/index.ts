/**
 * Drizzle ORM client and database utilities.
 * Singleton pattern for serverless; compatible with Supabase Postgres.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

declare global {
  var dbClient: ReturnType<typeof postgres> | undefined;
  var dbInstance: ReturnType<typeof createDb> | undefined;
}

/**
 * Create Drizzle client. Use connection pooler URL for serverless.
 * Supabase "Transaction" pool mode requires prepare: false.
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return postgres(connectionString, {
    prepare: false, // Required for Supabase transaction-mode pooler (pgbouncer)
    // Serverless-friendly pool: keep the footprint small so we don't exhaust
    // Supabase's connection limit when multiple function instances run in parallel.
    max: 5,
    // Release idle connections after 20 s so they don't accumulate across
    // short-lived serverless invocations.
    idle_timeout: 20,
    // Fail fast if a connection can't be acquired within 10 s rather than
    // queuing the request until Postgres's own statement_timeout fires.
    connect_timeout: 10,
    // Recycle connections every 30 min to avoid stale/broken sockets.
    max_lifetime: 1800,
    ssl: "require",
  });
}

function createDb() {
  const client = globalThis.dbClient ?? createClient();
  if (process.env.NODE_ENV === "development") {
    globalThis.dbClient = client;
  }
  return drizzle(client, { schema });
}

export const db = globalThis.dbInstance ?? createDb();
if (process.env.NODE_ENV === "development") {
  globalThis.dbInstance = db;
}

/**
 * Error handling wrapper for database operations.
 * Maps common DB errors to user-friendly messages.
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Database operation failed in ${context}:`, error);

    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        throw new Error("Database connection timeout. Please try again.");
      }
      if (error.message.includes("connection limit")) {
        throw new Error(
          "Database connection limit reached. Please try again later."
        );
      }
      if (
        error.message.includes("Unique constraint") ||
        error.message.includes("unique constraint")
      ) {
        throw new Error("A record with this information already exists.");
      }
    }

    throw error;
  }
}

/** Transaction client type (same query interface as db, without $client). */
type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Transaction wrapper with retry logic.
 * Operation receives the same db interface (transactional).
 */
export async function withTransaction<T>(
  operation: (tx: TxClient) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.transaction(operation);
    } catch (error) {
      lastError = error as Error;

      if (
        error instanceof Error &&
        (error.message.includes("Unique constraint") ||
          error.message.includes("unique constraint") ||
          error.message.includes("Foreign key") ||
          error.message.includes("foreign key"))
      ) {
        throw error;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt - 1) * 1000)
        );
      }
    }
  }

  throw lastError || new Error("Transaction failed after maximum retries");
}

/**
 * Health check: verify database connectivity.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

/**
 * Graceful shutdown: close the Postgres client.
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    const client = globalThis.dbClient;
    if (client) {
      await client.end();
      globalThis.dbClient = undefined;
      globalThis.dbInstance = undefined;
    }
  } catch (error) {
    console.error("Error disconnecting from database:", error);
  }
}

/**
 * Performance monitoring: track query times and slow query count.
 */
export class DatabaseMetrics {
  private static readonly MAX_QUERIES = 100;
  private static queryTimes: number[] = new Array(100).fill(0);
  private static writeIndex = 0;
  private static count = 0;

  static startQuery(): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.queryTimes[this.writeIndex] = duration;
      this.writeIndex = (this.writeIndex + 1) % this.MAX_QUERIES;
      if (this.count < this.MAX_QUERIES) this.count++;
      if (process.env.NODE_ENV === "development" && duration > 1000) {
        console.warn(`Slow query detected: ${duration}ms`);
      }
    };
  }

  static getAverageQueryTime(): number {
    if (this.count === 0) return 0;
    const sum = this.queryTimes
      .slice(0, this.count)
      .reduce((a, b) => a + b, 0);
    return sum / this.count;
  }

  static getSlowQueries(threshold: number = 1000): number {
    return this.queryTimes
      .slice(0, this.count)
      .filter((time) => time > threshold).length;
  }
}

export type { schema };
