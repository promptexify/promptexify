"use server";

import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SecurityMonitor, SecurityEventType } from "@/lib/security/monitor";
import { db } from "@/lib/db";
import { logs } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// Define types for automation actions
interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

// Helper function to require admin access with security logging
async function requireAdminAccess(action: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.userData) {
    await SecurityMonitor.logSecurityEvent(
      SecurityEventType.UNAUTHORIZED_ACCESS,
      { action, reason: "no_user_data" },
      "medium"
    );
    redirect("/signin");
  }

  if (currentUser.userData.role !== "ADMIN") {
    await SecurityMonitor.logSecurityEvent(
      SecurityEventType.UNAUTHORIZED_ACCESS,
      {
        action,
        userId: currentUser.userData.id,
        role: currentUser.userData.role,
      },
      "high"
    );
    throw new Error("Admin access required");
  }

  return currentUser.userData;
}

// Get all generation logs with pagination and filtering
export async function getGenerationLogsAction(): Promise<ActionResult> {
  try {
    await requireAdminAccess("get_generation_logs");

    const logRows = await db
      .select()
      .from(logs)
      .where(and(eq(logs.action, "automation"), eq(logs.entityType, "content_generation")))
      .orderBy(desc(logs.createdAt))
      .limit(50);

    const result = logRows.map((log) => {
      // Safely extract metadata with proper type checking
      const metadata =
        log.metadata &&
        typeof log.metadata === "object" &&
        !Array.isArray(log.metadata)
          ? (log.metadata as Record<string, unknown>)
          : {};

      return {
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        status:
          typeof metadata.status === "string" ? metadata.status : "unknown",
        message:
          typeof metadata.message === "string"
            ? metadata.message
            : "No message",
        filesProcessed:
          typeof metadata.filesProcessed === "number"
            ? metadata.filesProcessed
            : undefined,
        postsCreated:
          typeof metadata.postsCreated === "number"
            ? metadata.postsCreated
            : undefined,
        statusMessages: Array.isArray(metadata.statusMessages)
          ? metadata.statusMessages
          : undefined,
        error: typeof metadata.error === "string" ? metadata.error : undefined,
        duration:
          typeof metadata.duration === "number" ? metadata.duration : undefined,
        userId: log.userId,
        severity: log.severity,
      };
    });

    return {
      success: true,
      data: { logs: result },
    };
  } catch (error) {
    console.error("Error getting generation logs:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get generation logs",
    };
  }
}

// Clear generation logs with security logging
export async function clearGenerationLogsAction(): Promise<ActionResult> {
  try {
    const user = await requireAdminAccess("clear_generation_logs");

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(logs)
      .where(and(eq(logs.action, "automation"), eq(logs.entityType, "content_generation")));
    const deletedCount = countRow?.count ?? 0;
    await db
      .delete(logs)
      .where(and(eq(logs.action, "automation"), eq(logs.entityType, "content_generation")));
    await SecurityMonitor.logSecurityEvent(
      SecurityEventType.SUSPICIOUS_REQUEST,
      {
        action: "logs_cleared",
        userId: user.id,
        deletedCount,
      },
      "medium"
    );

    revalidatePath("/automation");

    return {
      success: true,
      message: `Successfully cleared ${deletedCount} generation logs`,
    };
  } catch (error) {
    console.error("Error clearing generation logs:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to clear generation logs",
    };
  }
}
