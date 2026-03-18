"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { settings as settingsTable, type StorageType } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { sanitizeInput } from "@/lib/security/sanitize";
import { clearStorageConfigCache } from "@/lib/image/storage";
import { clearUrlCache } from "@/lib/image/path";
import { clearContentFlagsCache } from "@/lib/settings";

// Settings validation schema
const settingsSchema = z.object({
  // Storage Configuration
  storageType: z.enum(["S3", "LOCAL", "DOSPACE"]),

  // S3 Configuration
  s3BucketName: z.string().optional(),
  s3Region: z.string().optional(),
  s3AccessKeyId: z.string().optional(),
  s3SecretKey: z.string().optional(),
  s3CloudfrontUrl: z.string().url().optional().or(z.literal("")),

  // DigitalOcean Spaces Configuration
  doSpaceName: z.string().optional(),
  doRegion: z.string().optional(),
  doAccessKeyId: z.string().optional(),
  doSecretKey: z.string().optional(),
  doCdnUrl: z.string().url().optional().or(z.literal("")),

  // Local Storage Configuration
  localBasePath: z.string().optional(),
  localBaseUrl: z.string().optional(),

  // Upload Limits
  maxImageSize: z
    .number()
    .min(1024)
    .max(50 * 1024 * 1024), // 1KB to 50MB
  maxVideoSize: z
    .number()
    .min(1024)
    .max(500 * 1024 * 1024), // 1KB to 500MB
  enableCompression: z.boolean(),
  compressionQuality: z.number().min(1).max(100),

  // Content Management
  maxTagsPerPost: z.number().min(1).max(100),
  enableCaptcha: z.boolean(),
  requireApproval: z.boolean(),

  // Security & Rate Limiting
  maxPostsPerDay: z.number().min(1).max(1000),
  maxUploadsPerHour: z.number().min(1).max(1000),
  enableAuditLogging: z.boolean(),

  // Add postsPageSize for infinite scroll/page size
  postsPageSize: z.number().min(6).max(100),

  // Add featuredPostsLimit for homepage featured posts
  featuredPostsLimit: z.number().min(1).max(50),

  // User submission controls
  allowUserPosts: z.boolean(),
  allowUserUploads: z.boolean(),
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

    // Sanitize string inputs
    const sanitizedData = {
      ...validatedData,
      // S3 Configuration
      s3BucketName: validatedData.s3BucketName
        ? sanitizeInput(validatedData.s3BucketName)
        : undefined,
      s3Region: validatedData.s3Region
        ? sanitizeInput(validatedData.s3Region)
        : undefined,
      s3AccessKeyId: validatedData.s3AccessKeyId
        ? sanitizeInput(validatedData.s3AccessKeyId)
        : undefined,
      s3SecretKey: validatedData.s3SecretKey
        ? sanitizeInput(validatedData.s3SecretKey)
        : undefined,
      s3CloudfrontUrl: validatedData.s3CloudfrontUrl
        ? sanitizeInput(validatedData.s3CloudfrontUrl)
        : undefined,
      // DigitalOcean Spaces Configuration
      doSpaceName: validatedData.doSpaceName
        ? sanitizeInput(validatedData.doSpaceName)
        : undefined,
      doRegion: validatedData.doRegion
        ? sanitizeInput(validatedData.doRegion)
        : undefined,
      doAccessKeyId: validatedData.doAccessKeyId
        ? sanitizeInput(validatedData.doAccessKeyId)
        : undefined,
      doSecretKey: validatedData.doSecretKey
        ? sanitizeInput(validatedData.doSecretKey)
        : undefined,
      doCdnUrl: validatedData.doCdnUrl
        ? sanitizeInput(validatedData.doCdnUrl)
        : undefined,
      // Local Storage Configuration
      localBasePath: validatedData.localBasePath
        ? sanitizeInput(validatedData.localBasePath)
        : undefined,
      localBaseUrl: validatedData.localBaseUrl
        ? sanitizeInput(validatedData.localBaseUrl)
        : undefined,
    };

    // Additional validation for S3 configuration
    if (sanitizedData.storageType === "S3") {
      if (
        !sanitizedData.s3BucketName ||
        !sanitizedData.s3Region ||
        !sanitizedData.s3AccessKeyId ||
        !sanitizedData.s3SecretKey
      ) {
        return {
          success: false,
          error:
            "S3 configuration requires bucket name, region, access key ID, and secret key",
        };
      }
    }

    // Additional validation for DigitalOcean Spaces configuration
    if (sanitizedData.storageType === "DOSPACE") {
      if (
        !sanitizedData.doSpaceName ||
        !sanitizedData.doRegion ||
        !sanitizedData.doAccessKeyId ||
        !sanitizedData.doSecretKey
      ) {
        return {
          success: false,
          error:
            "DigitalOcean Spaces configuration requires space name, region, access key ID, and secret key",
        };
      }
    }

    // Additional validation for local storage
    if (sanitizedData.storageType === "LOCAL") {
      if (!sanitizedData.localBasePath || !sanitizedData.localBaseUrl) {
        return {
          success: false,
          error: "Local storage configuration requires base path and base URL",
        };
      }
    }

    const [existing] = await db
      .select()
      .from(settingsTable)
      .orderBy(desc(settingsTable.updatedAt))
      .limit(1);

    let settings;
    if (existing) {
      const [updated] = await db
        .update(settingsTable)
        .set({
          ...sanitizedData,
          storageType: sanitizedData.storageType as StorageType,
          updatedBy: user.userData.id,
          updatedAt: new Date(),
        })
        .where(eq(settingsTable.id, existing.id))
        .returning();
      settings = updated!;
    } else {
      const [created] = await db
        .insert(settingsTable)
        .values({
          ...sanitizedData,
          storageType: sanitizedData.storageType as StorageType,
          updatedBy: user.userData.id,
        })
        .returning();
      settings = created!;
    }

    // Clear all caches so next request picks up the new values
    clearStorageConfigCache();
    clearUrlCache();
    clearContentFlagsCache();

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
 * Get storage configuration for use in upload services
 */
export async function getStorageConfigAction() {
  try {
    const [settings] = await db
      .select({
        storageType: settingsTable.storageType,
        s3BucketName: settingsTable.s3BucketName,
        s3Region: settingsTable.s3Region,
        s3AccessKeyId: settingsTable.s3AccessKeyId,
        s3SecretKey: settingsTable.s3SecretKey,
        s3CloudfrontUrl: settingsTable.s3CloudfrontUrl,
        doSpaceName: settingsTable.doSpaceName,
        doRegion: settingsTable.doRegion,
        doAccessKeyId: settingsTable.doAccessKeyId,
        doSecretKey: settingsTable.doSecretKey,
        doCdnUrl: settingsTable.doCdnUrl,
        localBasePath: settingsTable.localBasePath,
        localBaseUrl: settingsTable.localBaseUrl,
        maxImageSize: settingsTable.maxImageSize,
        maxVideoSize: settingsTable.maxVideoSize,
        enableCompression: settingsTable.enableCompression,
        compressionQuality: settingsTable.compressionQuality,
      })
      .from(settingsTable)
      .orderBy(desc(settingsTable.updatedAt))
      .limit(1);

    // Return default S3 configuration if no settings exist
    if (!settings) {
      return {
        success: true,
        data: {
          storageType: "S3" as StorageType,
          s3BucketName: process.env.AWS_S3_BUCKET_NAME || null,
          s3Region: process.env.AWS_REGION || "us-east-1",
          s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
          s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY || null,
          s3CloudfrontUrl: process.env.AWS_CLOUDFRONT_URL || null,
          doSpaceName: process.env.DO_SPACE_NAME || null,
          doRegion: process.env.DO_REGION || null,
          doAccessKeyId: process.env.DO_ACCESS_KEY_ID || null,
          doSecretKey: process.env.DO_SECRET_KEY || null,
          doCdnUrl: process.env.DO_CDN_URL || null,
          localBasePath: "/uploads",
          localBaseUrl: "/uploads",
          maxImageSize: 2097152, // 2MB
          maxVideoSize: 10485760, // 10MB
          enableCompression: true,
          compressionQuality: 80,
        },
      };
    }

    return {
      success: true,
      data: settings,
    };
  } catch (error) {
    console.error("Error fetching storage config:", error);
    return {
      success: false,
      error: "Failed to fetch storage configuration",
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
      storageType: "S3" as StorageType,
      s3BucketName: null,
      s3Region: null,
      s3AccessKeyId: null,
      s3SecretKey: null,
      s3CloudfrontUrl: null,
      doSpaceName: null,
      doRegion: null,
      doAccessKeyId: null,
      doSecretKey: null,
      doCdnUrl: null,
      localBasePath: "/uploads",
      localBaseUrl: "/uploads",
      maxImageSize: 2097152, // 2MB
      maxVideoSize: 10485760, // 10MB
      enableCompression: true,
      compressionQuality: 80,
      maxTagsPerPost: 20,
      enableCaptcha: false,
      requireApproval: true,
      maxPostsPerDay: 10,
      maxUploadsPerHour: 20,
      enableAuditLogging: true,
      postsPageSize: 12,
      featuredPostsLimit: 12,
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

    clearStorageConfigCache();
    clearUrlCache();
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

/**
 * Clear all media-related caches manually
 * Useful for immediate cache clearing after storage changes
 */
export async function clearMediaCachesAction() {
  try {
    const user = await getCurrentUser();

    if (!user || user.userData?.role !== "ADMIN") {
      return {
        success: false,
        error: "Unauthorized: Admin access required",
      };
    }

    // Clear all storage-related caches
    clearStorageConfigCache();
    clearUrlCache();

    return {
      success: true,
      message: "All media caches cleared successfully",
    };
  } catch (error) {
    console.error("Error clearing media caches:", error);
    return {
      success: false,
      error: "Failed to clear media caches",
    };
  }
}
