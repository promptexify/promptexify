/**
 * Security Audit Trail System
 * Tracks sensitive operations and security events
 */

import { db } from "@/lib/db";
import { logs, type LogSeverity } from "@/lib/db/schema";
import { desc, sql, gte, inArray } from "drizzle-orm";

export interface AuditEvent {
  action: string;
  userId?: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean>;
  severity: LogSeverity;
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

// Map internal severity levels to logging levels
type LocalSeverityLevel =
  | "error"
  | "warn"
  | "log"
  | "info"
  | "debug";

const severityLevelMap: Record<AuditEvent["severity"], LocalSeverityLevel> = {
  LOW: "info",
  MEDIUM: "warn",
  HIGH: "error",
  CRITICAL: "error",
};

/**
 * Log security events to database and external monitoring
 */
export async function logSecurityEvent(event: SecurityEvent) {
  try {
    // Store in database
    await storeAuditEvent(event);

    // Log to console with structured format
    const logLevel = severityLevelMap[event.severity];
    console[logLevel](`[SECURITY] ${event.action}`, {
      userId: event.userId,
      entityType: event.entityType,
      ipAddress: event.ipAddress,
      threatType: event.threatType,
      blocked: event.blocked,
      metadata: event.metadata,
    });

    // Send to external monitoring
    await sendToSecurityMonitoring(event);
  } catch (error) {
    console.error("Failed to log security event:", error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

/**
 * Log general audit events to database
 */
export async function logAuditEvent(event: AuditEvent) {
  try {
    // Store in database
    await storeAuditEvent(event);

    // Log to console with structured format
    const logLevel = severityLevelMap[event.severity];
    console[logLevel](`[AUDIT] ${event.action}`, {
      userId: event.userId,
      entityType: event.entityType,
      ipAddress: event.ipAddress,
      metadata: event.metadata,
    });
  } catch (error) {
    console.error("Failed to log audit event:", error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

/**
 * Store audit event in database
 */
async function storeAuditEvent(event: AuditEvent | SecurityEvent) {
  try {
    await db.insert(logs).values({
      action: event.action,
      userId: event.userId,
      entityType: event.entityType,
      entityId: event.entityId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata ?? undefined,
      severity: event.severity,
    });
  } catch (error) {
    console.error("Failed to store audit event in database:", error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

/**
 * Send security events to external monitoring
 */
async function sendToSecurityMonitoring(event: SecurityEvent) {
  // TODO: Integrate with security monitoring service (e.g., DataDog, New Relic)
  if (process.env.NODE_ENV === "development") {
    console.log(
      "[SECURITY-MONITOR] Would send to monitoring service:",
      event.action
    );
  }
}

/**
 * Helper functions for common security events
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

  protectedAreaAccess: (userId: string, ipAddress?: string, area?: string) => {
    // Ignore in development for localhost IPs
    const isLocal =
      !ipAddress ||
      ipAddress === "127.0.0.1" ||
      ipAddress === "::1" ||
      ipAddress === "0:0:0:0:0:0:0:1";
    if (process.env.NODE_ENV !== "production" && isLocal) return;
    return logAuditEvent({
      action: "Protected Area Access",
      userId,
      entityType: "protected_route",
      ipAddress,
      severity: "LOW",
      metadata: { area: area || "unknown" },
    });
  },
};

/**
 * Helper function to get client IP from request
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0] || realIp || "unknown";
}

/**
 * Helper function to sanitize user agent
 */
export function sanitizeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  return userAgent.substring(0, 200); // Limit length
}

/**
 * Get recent security events for monitoring dashboard
 */
export async function getRecentSecurityEvents(limit = 50) {
  try {
    return await db
      .select()
      .from(logs)
      .where(inArray(logs.severity, ["HIGH", "CRITICAL"]))
      .orderBy(desc(logs.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("Failed to fetch recent security events:", error);
    return [];
  }
}

/**
 * Get security statistics for dashboard
 */
export async function getSecurityStats(hours = 24) {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await db
      .select({ severity: logs.severity, count: sql<number>`count(*)::int` })
      .from(logs)
      .where(gte(logs.createdAt, since))
      .groupBy(logs.severity);
    return rows.reduce(
      (acc, row) => {
        acc[row.severity.toLowerCase()] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );
  } catch (error) {
    console.error("Failed to fetch security stats:", error);
    return {};
  }
}
