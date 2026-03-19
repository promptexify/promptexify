/**
 * Middleware Security & Rate Limiting Module
 *
 * This module provides security and rate limiting functionality used by the
 * Next.js middleware (Node.js proxy mode). It is a lightweight alternative to
 * the full-featured modules that require database or Redis access.
 *
 *  PURPOSE:
 * - Provide in-process rate limiting (in-memory, no Redis dependency)
 * - Enable security event logging without database dependencies
 * - Support middleware functionality without heavy server-side imports
 *
 *  WHAT'S INCLUDED:
 *
 * Rate Limiting Features:
 * • checkRateLimit() - Core rate limiting logic with in-memory storage
 * • rateLimits - Pre-configured rate limiters for different endpoints
 * • getRateLimitHeaders() - Generate standard rate limit response headers
 * • getClientIdentifier() - Extract client identity from requests
 * • Rate limit statistics and management functions
 *
 * Security Event Logging:
 * • logSecurityEvent() - Log security events with console output
 * • logAuditEvent() - Log audit events for compliance
 * • SecurityEvents - Pre-defined security event helpers
 * • Client IP and User-Agent sanitization utilities
 *
 *  RUNTIME NOTES:
 * • Runs in the Next.js Node.js proxy process (not Edge Runtime)
 * • In-memory state is shared across all requests within a single process
 * • For multi-instance deployments, use Redis-backed rate limiting instead
 * • Console-based logging (structured JSON for external processing)
 *
 *  FALLBACK STRATEGY:
 * This module serves as a fallback when full-featured modules can't be used:
 * • lib/limits.ts (Node.js + Redis) → lib/edge.ts (in-memory)
 * • lib/audit.ts (Database + monitoring) → lib/edge.ts (console logging)
 * • lib/monitor.ts (Complex monitoring) → lib/edge.ts (basic logging)
 *
 *  USAGE:
 * Import this module in middleware and lightweight server contexts:
 * import { rateLimits, SecurityEvents, getClientIP } from '@/lib/edge';
 */

import { type RateLimitData } from "@/lib/schemas";

// ==========================================
// TYPE DEFINITIONS
// ==========================================

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    blocked?: boolean;
  };
}

interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetTime: number;
  blocked: boolean;
}

export interface AuditEvent {
  action: string;
  userId?: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean>;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SecurityEvent extends AuditEvent {
  threatType:
    | "AUTHENTICATION"
    | "AUTHORIZATION"
    | "INPUT_VALIDATION"
    | "RATE_LIMIT"
    | "FILE_UPLOAD"
    | "DATA_ACCESS";
  blocked: boolean;
}

// ==========================================
// RATE LIMITING FUNCTIONALITY
// ==========================================

// In-memory store for rate limiting (Edge Runtime compatible)
const rateLimitStore: RateLimitStore = {};

// Cleanup interval to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of Object.entries(rateLimitStore)) {
      if (now > data.resetTime) {
        delete rateLimitStore[key];
      }
    }
  }, CLEANUP_INTERVAL);
}

// Start cleanup on module load (only in Node.js environments)
if (typeof process !== "undefined" && process.env.NEXT_RUNTIME !== "edge") {
  startCleanup();
}

/**
 * Edge Runtime compatible rate limiting function
 * Uses only in-memory storage, no Redis dependency
 */
export async function checkRateLimit(
  config: RateLimitData & { identifier: string }
): Promise<RateLimitResult> {
  const { identifier, limit, window } = config;

  // Bypass rate limiting only when explicitly opted-in via env var.
  // Never bypass based on IP address — a misconfigured proxy or NODE_ENV
  // could otherwise silently disable rate limits in production.
  if (process.env.DISABLE_RATE_LIMITS === "true") {
    return {
      allowed: true,
      count: 0,
      remaining: limit,
      resetTime: Date.now() + window,
      blocked: false,
    };
  }

  // Always use in-memory store in Edge Runtime
  const now = Date.now();
  if (!rateLimitStore[identifier]) {
    rateLimitStore[identifier] = {
      count: 0,
      resetTime: now + window,
    };
  }

  const entry = rateLimitStore[identifier];
  if (now > entry.resetTime) {
    entry.count = 0;
    entry.resetTime = now + window;
    entry.blocked = false;
  }

  if (entry.blocked && now < entry.resetTime) {
    return {
      allowed: false,
      count: entry.count,
      remaining: 0,
      resetTime: entry.resetTime,
      blocked: true,
    };
  }

  if (entry.count >= limit) {
    entry.blocked = true;
    return {
      allowed: false,
      count: entry.count,
      remaining: 0,
      resetTime: entry.resetTime,
      blocked: true,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    count: entry.count,
    remaining: Math.max(0, limit - entry.count),
    resetTime: entry.resetTime,
    blocked: false,
  };
}

/**
 * Create rate limit middleware for specific endpoints (Edge Runtime compatible)
 */
export function createRateLimit(limit: number, windowMs: number) {
  return async (identifier: string) => {
    return await checkRateLimit({
      identifier,
      limit,
      window: windowMs,
    });
  };
}

/**
 * Environment-aware rate limit configurations (Edge Runtime compatible)
 * Uses stricter limits in production, more lenient in development
 */
function createRateLimits() {
  const isProduction = process.env.NODE_ENV === "production";

  const config = isProduction
    ? {
        // Stricter rate limits in production
        auth: { limit: 5, window: 15 * 60 * 1000 }, // 5 requests per 15 minutes
        upload: { limit: 10, window: 60 * 1000 }, // 10 uploads per minute
        createPost: { limit: 3, window: 60 * 1000 }, // 3 posts per minute
        createTag: { limit: 15, window: 60 * 1000 }, // 15 tags per minute
        api: { limit: 60, window: 60 * 1000 }, // 60 requests per minute
        admin: { limit: 10, window: 60 * 1000 }, // 10 admin requests per minute
        search: { limit: 30, window: 60 * 1000 }, // 30 searches per minute
        interactions: { limit: 100, window: 60 * 1000 }, // 100 interactions per minute
        mediaResolve: { limit: 100, window: 60 * 1000 }, // 100 media URL resolves per minute
        csrf: { limit: 20, window: 60 * 1000 }, // 20 CSRF token fetches per minute
      }
    : {
        // More lenient rate limits in development
        auth: { limit: 10, window: 15 * 60 * 1000 }, // 10 requests per 15 minutes
        upload: { limit: 20, window: 60 * 1000 }, // 20 uploads per minute
        createPost: { limit: 10, window: 60 * 1000 }, // 10 posts per minute
        createTag: { limit: 50, window: 60 * 1000 }, // 50 tags per minute
        api: { limit: 200, window: 60 * 1000 }, // 200 requests per minute
        admin: { limit: 100, window: 60 * 1000 }, // 100 admin requests per minute
        search: { limit: 100, window: 60 * 1000 }, // 100 searches per minute
        interactions: { limit: 500, window: 60 * 1000 }, // 500 interactions per minute
        mediaResolve: { limit: 500, window: 60 * 1000 }, // 500 media resolves per minute
        csrf: { limit: 100, window: 60 * 1000 }, // 100 CSRF token fetches per minute (dev)
      };

  return {
    // Authentication endpoints
    auth: createRateLimit(config.auth.limit, config.auth.window),

    // File upload endpoints
    upload: createRateLimit(config.upload.limit, config.upload.window),

    // Post creation
    createPost: createRateLimit(
      config.createPost.limit,
      config.createPost.window
    ),

    // Tag creation
    createTag: createRateLimit(config.createTag.limit, config.createTag.window),

    // General API endpoints
    api: createRateLimit(config.api.limit, config.api.window),

    // Admin endpoints (stricter to reduce abuse surface)
    admin: createRateLimit(config.admin.limit, config.admin.window),

    // Search endpoints
    search: createRateLimit(config.search.limit, config.search.window),

    // Bookmark/favorite actions
    interactions: createRateLimit(
      config.interactions.limit,
      config.interactions.window
    ),

    // Media URL resolution (e.g. signed URLs)
    mediaResolve: createRateLimit(
      config.mediaResolve.limit,
      config.mediaResolve.window
    ),

    // CSRF token endpoint (dedicated bucket to prevent token exhaustion)
    csrf: createRateLimit(config.csrf.limit, config.csrf.window),
  };
}

/**
 * Rate limit configurations that adapt to environment (Edge Runtime compatible)
 */
export const rateLimits = createRateLimits();

/**
 * Get rate limit headers for HTTP responses
 */
export function getRateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.count + result.remaining),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
    "X-RateLimit-Blocked": result.blocked ? "true" : "false",
  };
}

/**
 * Get client identifier from request (Edge Runtime compatible)
 */
export function getClientIdentifier(request: Request, userId?: string): string {
  // Use user ID if available (more specific)
  if (userId) {
    return `user:${userId}`;
  }

  // Fallback to IP-based identification
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  const clientIP = request.headers.get("x-client-ip");

  const ip =
    forwardedFor?.split(",")[0]?.trim() || realIP || clientIP || "unknown";

  return `ip:${ip}`;
}

/**
 * Clear rate limit for identifier (Edge Runtime compatible)
 */
export function clearRateLimit(identifier: string) {
  delete rateLimitStore[identifier];
}

/**
 * Get current rate limit status without incrementing (Edge Runtime compatible)
 */
export function getRateLimitStatus(
  identifier: string,
  limit: number,
  window: number
) {
  const now = Date.now();
  const entry = rateLimitStore[identifier];

  if (!entry || now > entry.resetTime) {
    return {
      count: 0,
      remaining: limit,
      resetTime: now + window,
      blocked: false,
    };
  }

  return {
    count: entry.count,
    remaining: Math.max(0, limit - entry.count),
    resetTime: entry.resetTime,
    blocked: entry.blocked || false,
  };
}

/**
 * Log rate limit violations for monitoring (Edge Runtime compatible)
 */
export function logRateLimitViolation(
  identifier: string,
  endpoint: string,
  userAgent?: string
) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    identifier,
    endpoint,
    userAgent,
    type: "RATE_LIMIT_VIOLATION",
  };

  // Simple console logging (Edge Runtime compatible)
  console.warn("[RATE_LIMIT]", JSON.stringify(logData));
}

/**
 * Get rate limit statistics for monitoring (Edge Runtime compatible)
 */
export function getRateLimitStats() {
  const now = Date.now();
  const stats = {
    totalEntries: Object.keys(rateLimitStore).length,
    activeEntries: 0,
    blockedEntries: 0,
    expiredEntries: 0,
  };

  for (const entry of Object.values(rateLimitStore)) {
    if (now > entry.resetTime) {
      stats.expiredEntries++;
    } else {
      stats.activeEntries++;
      if (entry.blocked) {
        stats.blockedEntries++;
      }
    }
  }

  return stats;
}

// ==========================================
// SECURITY EVENT LOGGING FUNCTIONALITY
// ==========================================

/**
 * Log security event (Edge Runtime compatible)
 * Only uses console logging, no database or external services
 */
export async function logSecurityEvent(event: SecurityEvent) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    type: "SECURITY_EVENT",
    ...event,
  };

  // Use appropriate console level based on severity
  switch (event.severity) {
    case "CRITICAL":
    case "HIGH":
      console.error("[SECURITY]", JSON.stringify(logData));
      break;
    case "MEDIUM":
      console.warn("[SECURITY]", JSON.stringify(logData));
      break;
    case "LOW":
    default:
      console.log("[SECURITY]", JSON.stringify(logData));
      break;
  }
}

/**
 * Log audit event (Edge Runtime compatible)
 * Only uses console logging, no database or external services
 */
export async function logAuditEvent(event: AuditEvent) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    type: "AUDIT_EVENT",
    ...event,
  };

  // Use appropriate console level based on severity
  switch (event.severity) {
    case "CRITICAL":
    case "HIGH":
      console.error("[AUDIT]", JSON.stringify(logData));
      break;
    case "MEDIUM":
      console.warn("[AUDIT]", JSON.stringify(logData));
      break;
    case "LOW":
    default:
      console.log("[AUDIT]", JSON.stringify(logData));
      break;
  }
}

/**
 * Helper functions for common security events (Edge Runtime compatible)
 */
export const SecurityEvents = {
  authenticationFailure: (
    userId?: string,
    ipAddress?: string,
    reason?: string
  ) =>
    logSecurityEvent({
      action: "Authentication Failure",
      userId,
      entityType: "user",
      ipAddress,
      threatType: "AUTHENTICATION",
      blocked: true,
      severity: "MEDIUM",
      metadata: { reason: reason || "unknown" },
    }),

  authorizationFailure: (
    userId: string,
    resource: string,
    ipAddress?: string
  ) =>
    logSecurityEvent({
      action: "Authorization Failure",
      userId,
      entityType: resource,
      ipAddress,
      threatType: "AUTHORIZATION",
      blocked: true,
      severity: "HIGH",
      metadata: { attemptedResource: resource },
    }),

  rateLimitExceeded: (
    identifier: string,
    endpoint: string,
    ipAddress?: string
  ) =>
    logSecurityEvent({
      action: "Rate Limit Exceeded",
      entityType: "rate_limit",
      ipAddress,
      threatType: "RATE_LIMIT",
      blocked: true,
      severity: "MEDIUM",
      metadata: { identifier, endpoint },
    }),

  suspiciousFileUpload: (
    userId: string,
    filename: string,
    fileType: string,
    ipAddress?: string
  ) =>
    logSecurityEvent({
      action: "Suspicious File Upload Blocked",
      userId,
      entityType: "file",
      ipAddress,
      threatType: "FILE_UPLOAD",
      blocked: true,
      severity: "HIGH",
      metadata: { filename, fileType },
    }),

  inputValidationFailure: (
    userId: string | undefined,
    field: string,
    value: string,
    ipAddress?: string
  ) =>
    logSecurityEvent({
      action: "Input Validation Failure",
      userId,
      entityType: "input",
      ipAddress,
      threatType: "INPUT_VALIDATION",
      blocked: true,
      severity: "MEDIUM",
      metadata: { field, value: value.substring(0, 100) }, // Truncate for logging
    }),

  dataAccessAttempt: (
    userId: string,
    resource: string,
    authorized: boolean,
    ipAddress?: string
  ) =>
    logSecurityEvent({
      action: authorized
        ? "Authorized Data Access"
        : "Unauthorized Data Access Attempt",
      userId,
      entityType: resource,
      ipAddress,
      threatType: "DATA_ACCESS",
      blocked: !authorized,
      severity: authorized ? "LOW" : "HIGH",
      metadata: { resource },
    }),

  protectedAreaAccess: (userId: string, ipAddress?: string, area?: string) =>
    logAuditEvent({
      action: "Protected Area Access",
      userId,
      entityType: "protected_route",
      ipAddress,
      severity: "LOW",
      metadata: { area: area || "unknown" },
    }),
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Helper function to get client IP from request (Edge Runtime compatible)
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0] || realIp || "unknown";
}

/**
 * Helper function to sanitize user agent (Edge Runtime compatible)
 */
export function sanitizeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  return userAgent.substring(0, 200); // Limit length
}
