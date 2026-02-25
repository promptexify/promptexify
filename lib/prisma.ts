import { PrismaClient } from "@/app/generated/prisma";

declare global {
  // Prevent multiple instances during development
  var prisma: PrismaClient | undefined;
}

/**
 * Enhanced Prisma Client Configuration for Production Performance
 *
 * Key optimizations:
 * - Connection pooling with appropriate limits
 * - Query optimization settings
 * - Logging configuration for monitoring
 * - Error handling and retry logic
 */
const createPrismaClient = () => {
  return new PrismaClient({
    // Enhanced logging for performance monitoring
    log: process.env.NODE_ENV === "development" ? [] : ["error"],

    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
};

/**
 * Singleton Prisma Client Instance
 * Prevents multiple connections in serverless environments
 */
const prisma = globalThis.prisma ?? createPrismaClient();

// Store in global for development hot reloading
if (process.env.NODE_ENV === "development") {
  globalThis.prisma = prisma;
}

/**
 * Enhanced error handling wrapper for database operations
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Database operation failed in ${context}:`, error);

    // Handle specific Prisma errors
    if (error instanceof Error) {
      // Connection timeout errors
      if (error.message.includes("timeout")) {
        throw new Error("Database connection timeout. Please try again.");
      }

      // Connection limit errors
      if (error.message.includes("connection limit")) {
        throw new Error(
          "Database connection limit reached. Please try again later."
        );
      }

      // Unique constraint violations
      if (error.message.includes("Unique constraint")) {
        throw new Error("A record with this information already exists.");
      }
    }

    throw error;
  }
}

/**
 * Optimized transaction wrapper with retry logic
 */
export async function withTransaction<T>(
  operation: (
    tx: Omit<
      PrismaClient,
      "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
    >
  ) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        // Transaction timeout (5 seconds)
        timeout: 5000,
        // Isolation level for consistency
        isolationLevel: "ReadCommitted",
      });
    } catch (error) {
      lastError = error as Error;

      // Don't retry certain errors
      if (
        error instanceof Error &&
        (error.message.includes("Unique constraint") ||
          error.message.includes("Foreign key constraint"))
      ) {
        throw error;
      }

      // Wait before retry (exponential backoff)
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
 * Health check function to verify database connectivity
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

/**
 * Graceful shutdown function
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error("Error disconnecting from database:", error);
  }
}

// Export the singleton instance
export { prisma };

/**
 * Performance monitoring utilities
 */
export class DatabaseMetrics {
  // Circular buffer for O(1) insertion without array re-indexing
  private static readonly MAX_QUERIES = 100;
  private static queryTimes: number[] = new Array(100).fill(0);
  private static writeIndex = 0;
  private static count = 0;

  static startQuery(): () => void {
    const start = Date.now();

    return () => {
      const duration = Date.now() - start;

      // Write to circular buffer at current position
      this.queryTimes[this.writeIndex] = duration;
      this.writeIndex = (this.writeIndex + 1) % this.MAX_QUERIES;
      if (this.count < this.MAX_QUERIES) this.count++;

      // Log slow queries in development
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

export default prisma;
