"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { settings as settingsTable } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { clearContentFlagsCache } from "@/lib/settings";

// Settings validation schema
const settingsSchema = z.object({
  // Content Management
  maxTagsPerPost: z.number().min(1).max(100),
  enableCaptcha: z.boolean(),
  requireApproval: z.boolean(),

  // Security & Rate Limiting
  maxPostsPerDay: z.number().min(1).max(1000),
  enableAuditLogging: z.boolean(),

  // Add postsPageSize for infinite scroll/page size
  postsPageSize: z.number().min(6).max(100),

  // Add featuredPostsLimit for homepage featured posts
  featuredPostsLimit: z.number().min(1).max(50),

  // User submission controls
  allowUserPosts: z.boolean(),
});

export type SettingsFormData = z.infer<typeof settingsSchema>;

/**
 * Get current settings or create default settings if none exist
 */
export async function getSettingsAction() {
  try {
    const user = await getCurrentUser();

    if (!user || user.userData?.role !== "ADMIN") {
      return {
        success: false,
        error: "Unauthorized: Admin access required",
      };
    }

    const [first] = await db
      .select()
      .from(settingsTable)
      .orderBy(desc(settingsTable.updatedAt))
      .limit(1);

    let settings = first ?? null;
    if (!settings) {
      const [created] = await db
        .insert(settingsTable)
        .values({ updatedBy: user.userData.id })
        .returning();
      settings = created ?? null;
    }

    return {
      success: true,
      data: settings,
    };
  } catch (error) {
    console.error("Error fetching settings:", error);
    return {
      success: false,
      error: "Failed to fetch settings",
    };
  }
}

/**
 * Update settings
 */
export async function updateSettingsAction(data: SettingsFormData) {
  try {
    const user = await getCurrentUser();

    if (!user || user.userData?.role !== "ADMIN") {
      return {
        success: false,
        error: "Unauthorized: Admin access required",
      };
    }

    // Validate input data
    const validationResult = settingsSchema.safeParse(data);
    if (!validationResult.success) {
      return {
        success: false,
        error: "Invalid input data",
        details: validationResult.error.errors,
      };
    }

    const validatedData = validationResult.data;

    const [existing] = await db
      .select()
      .from(settingsTable)
      .orderBy(desc(settingsTable.updatedAt))
      .limit(1);

    const dbPayload = {
      ...validatedData,
      updatedBy: user.userData.id,
    };

    let settings;
    if (existing) {
      const [updated] = await db
        .update(settingsTable)
        .set({ ...dbPayload, updatedAt: new Date() })
        .where(eq(settingsTable.id, existing.id))
        .returning();
      settings = updated!;
    } else {
      const [created] = await db
        .insert(settingsTable)
        .values(dbPayload)
        .returning();
      settings = created!;
    }

    // Clear all caches so next request picks up the new values
    await clearContentFlagsCache();

    // Revalidate relevant pages
    revalidatePath("/settings");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: settings,
      message: "Settings updated successfully",
    };
  } catch (error) {
    console.error("Error updating settings:", error);
    return {
      success: false,
      error: "Failed to update settings",
    };
  }
}

/**
 * Reset settings to defaults
 */
export async function resetSettingsToDefaultAction() {
  try {
    const user = await getCurrentUser();

    if (!user || user.userData?.role !== "ADMIN") {
      return {
        success: false,
        error: "Unauthorized: Admin access required",
      };
    }

    const [existingSettings] = await db
      .select()
      .from(settingsTable)
      .orderBy(desc(settingsTable.updatedAt))
      .limit(1);

    const defaultData = {
      maxTagsPerPost: 20,
      enableCaptcha: false,
      requireApproval: true,
      maxPostsPerDay: 10,
      enableAuditLogging: true,
      postsPageSize: 12,
      featuredPostsLimit: 12,
      allowUserPosts: true,
      updatedBy: user.userData.id,
    };

    let settings;
    if (existingSettings) {
      const [updated] = await db
        .update(settingsTable)
        .set({ ...defaultData, updatedAt: new Date() })
        .where(eq(settingsTable.id, existingSettings.id))
        .returning();
      settings = updated!;
    } else {
      const [created] = await db
        .insert(settingsTable)
        .values(defaultData)
        .returning();
      settings = created!;
    }

    await clearContentFlagsCache();
    revalidatePath("/settings");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: settings,
      message: "Settings reset to defaults successfully",
    };
  } catch (error) {
    console.error("Error resetting settings:", error);
    return {
      success: false,
      error: "Failed to reset settings",
    };
  }
}
