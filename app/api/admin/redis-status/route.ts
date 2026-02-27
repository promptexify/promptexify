import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CacheMetrics, cacheStore } from "@/lib/cache";

// Explicit runtime configuration to ensure Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Redis Status and Cache Performance API
 * GET /api/admin/redis-status
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.userData?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // During the build process, NODE_ENV is 'production', but a Redis URL may not be available.
  // We return a mocked response to allow the build to succeed. At runtime we will attempt to
  // connect using either the provided REDIS_URL or a local instance in development.
  const redisUrl =
    process.env.REDIS_URL ||
    (process.env.NODE_ENV === "development"
      ? "redis://localhost:6379"
      : undefined);

  if (process.env.NODE_ENV === "production" && !redisUrl) {
    return NextResponse.json({
      message:
        "Redis status check is disabled during build. This endpoint is available in a running environment.",
      timestamp: new Date().toISOString(),
      redis: { connected: false, error: "Build-time mock", info: null },
      cache: { metrics: null, test: null, recommendation: null },
      environment: {
        nodeEnv: "production (build-time)",
        redisConfigured: false,
      },
    });
  }
  try {
    // Get cache metrics
    const cacheStats = CacheMetrics.getStats();

    // Test Redis connectivity
    let redisStatus: {
      connected: boolean;
      error: string | null;
      info: {
        ping: string;
        memory: Record<string, string>;
        url: string;
      } | null;
    } = { connected: false, error: null, info: null };

    try {
      // Dynamic import to handle optional ioredis dependency
      if (redisUrl) {
        const { Redis } = await import("ioredis");
        const redis = new Redis(redisUrl, {
          connectTimeout: 5000,
          commandTimeout: 3000,
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });

        // Test connection with a simple ping
        await redis.connect();
        const pong = await redis.ping();

        // Get basic Redis info
        const info = await redis.info("memory");
        const memoryLines = info
          .split("\r\n")
          .filter(
            (line) =>
              line.includes("used_memory_human") ||
              line.includes("used_memory_peak_human") ||
              line.includes("total_system_memory_human")
          );

        redisStatus = {
          connected: pong === "PONG",
          error: null,
          info: {
            ping: pong,
            memory: memoryLines.reduce(
              (acc, line) => {
                const [key, value] = line.split(":");
                if (key && value) acc[key] = value;
                return acc;
              },
              {} as Record<string, string>
            ),
            url:
              (redisUrl && redisUrl.replace(/:([^@]+)@/, ":****@")) ||
              "Not configured",
          },
        };

        await redis.quit();
      } else {
        redisStatus = {
          connected: false,
          error: "Redis URL not configured - using memory cache",
          info: null,
        };
      }
    } catch (error) {
      redisStatus = {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown Redis error",
        info: null,
      };
    }

    // Test cache operations
    const cacheTest = await testCacheOperations();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      redis: redisStatus,
      cache: {
        metrics: cacheStats,
        test: cacheTest,
        recommendation: getCacheRecommendation(cacheStats),
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        redisConfigured: !!redisUrl,
        fallback: !redisUrl ? "Memory cache" : "Redis cache",
      },
    });
  } catch (error) {
    console.error("Redis status check failed:", error);

    return NextResponse.json(
      {
        error: "Failed to check Redis status",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Test basic cache operations
 */
async function testCacheOperations() {
  try {
    const testKey = `test:${Date.now()}`;
    const testValue = "cache-test-value";

    // Test set operation
    const setStart = Date.now();
    await cacheStore.set(testKey, testValue, 60);
    const setTime = Date.now() - setStart;

    // Test get operation
    const getStart = Date.now();
    const retrievedValue = await cacheStore.get(testKey);
    const getTime = Date.now() - getStart;

    // Test delete operation
    const delStart = Date.now();
    await cacheStore.del(testKey);
    const delTime = Date.now() - delStart;

    // Verify deletion
    const deletedValue = await cacheStore.get(testKey);

    return {
      success: true,
      operations: {
        set: { success: true, time: `${setTime}ms` },
        get: {
          success: retrievedValue === testValue,
          time: `${getTime}ms`,
          valueMatch: retrievedValue === testValue,
        },
        delete: {
          success: deletedValue === null,
          time: `${delTime}ms`,
          verified: deletedValue === null,
        },
      },
      totalTime: `${setTime + getTime + delTime}ms`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Cache test failed",
      operations: null,
    };
  }
}

/**
 * Get cache performance recommendations
 */
function getCacheRecommendation(
  stats: ReturnType<typeof CacheMetrics.getStats>
) {
  const recommendations = [];

  if (stats.hitRate < 70) {
    recommendations.push(
      "Low hit rate - consider increasing cache TTL or improving cache warming"
    );
  }

  if (stats.hitRate > 95) {
    recommendations.push("Excellent hit rate - cache is performing optimally");
  }

  if (stats.errors > stats.hits * 0.05) {
    recommendations.push(
      "High error rate - check Redis connectivity and error logs"
    );
  }

  if (stats.total === 0) {
    recommendations.push(
      "No cache activity detected - verify cache is being used"
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Cache performance is good");
  }

  return recommendations;
}
