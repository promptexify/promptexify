import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";

/**
 * Cache configuration for different data types
 */
export const CACHE_TAGS = {
  POSTS: "posts",
  POST_BY_SLUG: "post-by-slug",
  POST_BY_ID: "post-by-id",
  CATEGORIES: "categories",
  TAGS: "tags",
  USER_POSTS: "user-posts",
  RELATED_POSTS: "related-posts",
  SEARCH_RESULTS: "search-results",
  USER_BOOKMARKS: "user-bookmarks",
  USER_FAVORITES: "user-favorites",
  POPULAR_POSTS: "popular-posts",
  ANALYTICS: "analytics",
} as const;

export const CACHE_DURATIONS = {
  POSTS_LIST: 600, // 10 minutes for posts list
  POST_DETAIL: 600, // 10 minutes for individual posts
  STATIC_DATA: 3600, // 1 hour for categories/tags
  USER_DATA: 60, // 1 minute for user-specific data
  SEARCH: 180, // 3 minutes for search results
  POPULAR_CONTENT: 1800, // 30 minutes for popular content
  ANALYTICS: 1800, // 30 minutes for analytics
} as const;

/**
 * Enhanced cache storage interface for Redis integration
 */
interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(pattern?: string): Promise<void>;
}

/**
 * In-memory cache implementation (fallback)
 */
class MemoryCache implements CacheStore {
  private cache = new Map<string, { value: string; expires: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry || entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttl = 300): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(pattern?: string): Promise<void> {
    if (pattern) {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}

/**
 * Redis cache implementation for production
 */
class RedisCache implements CacheStore {
  private redis: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  private _initPromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

  private getRedis(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (this.redis) return Promise.resolve(this.redis);

    if (!this._initPromise) {
      this._initPromise = this._initialize();
    }
    return this._initPromise;
  }

  private async _initialize(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Skip Redis initialization in Edge Runtime
    if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "edge") {
      console.log(
        "🔄 Cache: Skipping Redis in Edge Runtime, using memory cache"
      );
      return null;
    }

    if (typeof window === "undefined") {
      try {
        // Dynamic import to prevent bundling in Edge Runtime
        const { Redis } = await import("ioredis");
        const redisConfig = this.getRedisConfig();

        if (redisConfig) {
          this.redis = new Redis(redisConfig);
          console.log("✅ Redis client configured.");

          this.redis.on("error", (err: Error) => {
            console.error("Redis Client Error", err);
          });

          this.redis.on("connect", () => {
            console.log("Redis client connected successfully.");

            // Graceful shutdown to avoid memory leaks
            const close = () => {
              this.redis?.quit().catch(() => {});
            };
            process.on("beforeExit", close);
            process.on("SIGINT", close);
            process.on("SIGTERM", close);
          });
        } else {
          console.warn(
            "Redis configuration not found. Falling back to memory cache."
          );
        }
      } catch (error) {
        console.warn(
          "Redis not available, falling back to memory cache",
          error
        );
        this.redis = null;
      }
    }
    return this.redis;
  }

  /**
   * Get Redis configuration with proper authentication handling
   */
  private getRedisConfig() {
    // For local development, default to a standard local Redis instance
    // if REDIS_URL is not explicitly provided.
    const redisUrl =
      process.env.REDIS_URL ||
      (process.env.NODE_ENV === "development"
        ? "redis://localhost:6379"
        : undefined);

    console.log(
      `[Cache] Attempting to configure Redis. Final URL used: ${
        redisUrl ? new URL(redisUrl).host : "N/A"
      }`
    );

    if (redisUrl) {
      // console.log("🔄 Cache: Using Redis for caching");
      return {
        url: redisUrl,
        // Recommended options for robustness
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
        lazyConnect: true, // Important: delays connection until first command
        connectTimeout: 2000,
        enableReadyCheck: false, // Avoids waiting for full readiness
      };
    }

    // If no Redis URL is available (e.g., during build or in a test environment),
    // return null to signal a fallback to memory cache.
    //  console.log("🔄 Cache: Using in-memory cache (development)");
    return null;
  }

  async get(key: string): Promise<string | null> {
    const redis = await this.getRedis();
    if (!redis) return null;

    try {
      const result = await redis.get(key);
      if (process.env.NODE_ENV === "development") {
        console.log(`🔄 Redis GET: ${key} ${result ? "✅ HIT" : "❌ MISS"}`);
      }
      return result;
    } catch (error) {
      console.warn("Redis get error:", error);
      return null;
    }
  }

  async set(key: string, value: string, ttl = 300): Promise<void> {
    const redis = await this.getRedis();
    if (!redis) return;

    try {
      await redis.setex(key, ttl, value);
      if (process.env.NODE_ENV === "development") {
        console.log(`🔄 Redis SET: ${key} (TTL: ${ttl}s)`);
      }
    } catch (error) {
      console.warn("Redis set error:", error);
    }
  }

  async del(key: string): Promise<void> {
    const redis = await this.getRedis();
    if (!redis) return;

    try {
      await redis.del(key);
    } catch (error) {
      console.warn("Redis del error:", error);
    }
  }

  async clear(pattern = "*"): Promise<void> {
    const redis = await this.getRedis();
    if (!redis) return;

    return new Promise((resolve, reject) => {
      const stream = redis.scanStream({
        match: pattern,
        count: 100,
      });
      const keys: string[] = [];

      stream.on("data", (resultKeys: string[]) => {
        keys.push(...resultKeys);
      });

      stream.on("error", (err: Error) => {
        console.warn("Redis scan stream error:", err);
        reject(err);
      });

      stream.on("end", async () => {
        try {
          if (keys.length > 0) {
            await redis.del(keys);
          }
          resolve();
        } catch (err) {
          console.warn("Redis delete error during clear:", err);
          reject(err);
        }
      });
    });
  }
}

// Decide whether to use Redis or in-memory cache.
// We will use Redis when:
//   1. A REDIS_URL is explicitly provided (e.g., production or staging), OR
//   2. We are running in development mode – in that case we implicitly fall
//      back to a local Redis instance running on the default port.
// Otherwise we fall back to the in-memory cache implementation.
const cacheStore: CacheStore =
  process.env.REDIS_URL || process.env.NODE_ENV === "development"
    ? new RedisCache()
    : new MemoryCache();
export { cacheStore };

/**
 * Enhanced cache function with Redis support and result transformation
 */
export function createCachedFunction<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  keyPrefix: string,
  revalidate: number,
  tags: string[] = [],
  transform?: (result: R) => R
) {
  return async (...args: T): Promise<R> => {
    const allTags = [...tags, keyPrefix];

    const cachedFn = unstable_cache(
      async () => {
        const result = await fn(...args);
        return transform ? transform(result) : result;
      },
      [keyPrefix, ...args.map((a) => JSON.stringify(a))],
      {
        revalidate,
        tags: allTags,
      }
    );

    return cachedFn();
  };
}

/**
 * Enhanced pagination key generation with sorting and filtering
 */
export function generatePaginationKey(
  baseKey: string,
  page: number,
  limit: number,
  additionalParams?: Record<string, string | number | boolean>
): string {
  const params = additionalParams
    ? Object.entries(additionalParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join("-")
    : "";

  return `${baseKey}-page:${page}-limit:${limit}${params ? `-${params}` : ""}`;
}

/**
 * Enhanced search key generation with better normalization
 */
export function generateSearchKey(
  query: string,
  filters: Record<string, string | number | boolean> = {}
): string {
  // Normalize query for better cache hits
  const normalizedQuery = query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

  const filterString = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("-");

  return `search-${normalizedQuery}${filterString ? `-${filterString}` : ""}`;
}

/**
 * Cache warming function for critical data
 */
export async function warmCache() {
  if (process.env.NODE_ENV === "development") {
    return; // Skip in development
  }

  try {
    console.log("Starting cache warming...");

    // Import functions dynamically to avoid circular dependencies
    const { getCachedCategories, getCachedTags } = await import("@/lib/query");
    const { getAllPosts } = await import("@/lib/content");

    // Warm critical caches
    await Promise.allSettled([
      getCachedCategories(),
      getCachedTags(),
      getAllPosts(false), // Published posts only
    ]);

    console.log("Cache warming completed");
  } catch (error) {
    console.warn("Cache warming failed:", error);
  }
}

/**
 * Enhanced cache invalidation with pattern support
 */
export async function revalidateCache(tags: string | string[]) {
  const tagArray = Array.isArray(tags) ? tags : [tags];

  // Next.js cache invalidation
  tagArray.forEach((tag) => {
    revalidateTag(tag);
  });
}

/**
 * Clear all caches (admin function)
 */
export async function clearAllCaches() {
  try {
    await cacheStore.clear();
    // Revalidate all Next.js cache tags
    Object.values(CACHE_TAGS).forEach((tag) => revalidateTag(tag));
  } catch (error) {
    console.warn("Cache clearing error:", error);
  }
}

/**
 * Cache performance monitoring
 */
export class CacheMetrics {
  private static hits = 0;
  private static misses = 0;
  private static errors = 0;

  static recordHit() {
    this.hits++;
  }

  static recordMiss() {
    this.misses++;
  }

  static recordError() {
    this.errors++;
  }

  static getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      total,
    };
  }

  static reset() {
    this.hits = 0;
    this.misses = 0;
    this.errors = 0;
  }
}

/**
 * Memoization wrapper for request-scoped caching
 */
export function memoize<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  getKey?: (...args: T) => string,
  maxSize: number = 1000
): (...args: T) => Promise<R> {
  const cache = new Map<string, Promise<R>>();

  return (...args: T): Promise<R> => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      CacheMetrics.recordHit();
      return cache.get(key)!;
    }

    CacheMetrics.recordMiss();

    // Evict oldest entries when cache exceeds max size (LRU-style)
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }

    const promise = fn(...args).catch((error) => {
      CacheMetrics.recordError();
      cache.delete(key); // Remove failed promise from cache
      throw error;
    });

    cache.set(key, promise);
    return promise;
  };
}
