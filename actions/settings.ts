"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { settings as settingsTable, type StorageType } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
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
      data: {
        ...settings,
        // Never return vault IDs or plaintext credentials to the client.
        // Expose boolean flags so the form can show a "saved" placeholder.
        s3AccessKeyIdVaultId: undefined,
        s3SecretKeyVaultId: undefined,
        doAccessKeyIdVaultId: undefined,
        doSecretKeyVaultId: undefined,
        hasS3Credentials:
          settings.s3AccessKeyIdVaultId != null &&
          settings.s3SecretKeyVaultId != null,
        hasDoCredentials:
          settings.doAccessKeyIdVaultId != null &&
          settings.doSecretKeyVaultId != null,
      },
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
 * Upsert a secret in Supabase Vault, returning the vault UUID.
 * If vaultId is provided and the secret already exists, updates it in place.
 * Otherwise creates a new secret.
 */
async function upsertVaultSecret(
  value: string,
  name: string,
  existingVaultId: string | null | undefined
): Promise<string> {
  if (existingVaultId) {
    await db.execute(
      sql`SELECT vault.update_secret(${existingVaultId}::uuid, ${value})`
    );
    return existingVaultId;
  }
  const result = await db.execute(
    sql`SELECT vault.create_secret(${value}, ${name}) AS id`
  );
  return (result[0] as { id: string }).id;
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

    // Fetch existing row first so we can check whether vault secrets are
    // already stored (in which case empty credential fields are acceptable).
    const [existing] = await db
      .select()
      .from(settingsTable)
      .orderBy(desc(settingsTable.updatedAt))
      .limit(1);

    // Additional validation for S3 configuration
    if (sanitizedData.storageType === "S3") {
      const hasExistingS3Creds =
        existing?.s3AccessKeyIdVaultId != null &&
        existing?.s3SecretKeyVaultId != null;
      if (
        !sanitizedData.s3BucketName ||
        !sanitizedData.s3Region ||
        (!sanitizedData.s3AccessKeyId && !hasExistingS3Creds) ||
        (!sanitizedData.s3SecretKey && !hasExistingS3Creds)
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
      const hasExistingDoCreds =
        existing?.doAccessKeyIdVaultId != null &&
        existing?.doSecretKeyVaultId != null;
      if (
        !sanitizedData.doSpaceName ||
        !sanitizedData.doRegion ||
        (!sanitizedData.doAccessKeyId && !hasExistingDoCreds) ||
        (!sanitizedData.doSecretKey && !hasExistingDoCreds)
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

    // Upsert credentials into Supabase Vault; only touch vault when a new
    // value is actually provided (empty string = "leave existing unchanged").
    const s3AccessKeyIdVaultId =
      sanitizedData.s3AccessKeyId
        ? await upsertVaultSecret(
            sanitizedData.s3AccessKeyId,
            "s3AccessKeyId",
            existing?.s3AccessKeyIdVaultId
          )
        : existing?.s3AccessKeyIdVaultId ?? null;

    const s3SecretKeyVaultId =
      sanitizedData.s3SecretKey
        ? await upsertVaultSecret(
            sanitizedData.s3SecretKey,
            "s3SecretKey",
            existing?.s3SecretKeyVaultId
          )
        : existing?.s3SecretKeyVaultId ?? null;

    const doAccessKeyIdVaultId =
      sanitizedData.doAccessKeyId
        ? await upsertVaultSecret(
            sanitizedData.doAccessKeyId,
            "doAccessKeyId",
            existing?.doAccessKeyIdVaultId
          )
        : existing?.doAccessKeyIdVaultId ?? null;

    const doSecretKeyVaultId =
      sanitizedData.doSecretKey
        ? await upsertVaultSecret(
            sanitizedData.doSecretKey,
            "doSecretKey",
            existing?.doSecretKeyVaultId
          )
        : existing?.doSecretKeyVaultId ?? null;

    // Strip plaintext credentials from the DB payload; store only vault IDs.
    const {
      s3AccessKeyId: _s3Key,
      s3SecretKey: _s3Secret,
      doAccessKeyId: _doKey,
      doSecretKey: _doSecret,
      ...nonSecretData
    } = sanitizedData;

    const dbPayload = {
      ...nonSecretData,
      storageType: sanitizedData.storageType as StorageType,
      s3AccessKeyIdVaultId,
      s3SecretKeyVaultId,
      doAccessKeyIdVaultId,
      doSecretKeyVaultId,
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
    // JOIN vault.decrypted_secrets to retrieve the actual credential values
    // without ever storing them in plaintext in the settings table.
    const result = await db.execute(sql`
      SELECT
        s."storageType",
        s."s3BucketName",
        s."s3Region",
        s."s3CloudfrontUrl",
        s."doSpaceName",
        s."doRegion",
        s."doCdnUrl",
        s."localBasePath",
        s."localBaseUrl",
        s."maxImageSize",
        s."maxVideoSize",
        s."enableCompression",
        s."compressionQuality",
        v1.decrypted_secret AS "s3AccessKeyId",
        v2.decrypted_secret AS "s3SecretKey",
        v3.decrypted_secret AS "doAccessKeyId",
        v4.decrypted_secret AS "doSecretKey"
      FROM settings s
      LEFT JOIN vault.decrypted_secrets v1 ON v1.id = s."s3AccessKeyIdVaultId"
      LEFT JOIN vault.decrypted_secrets v2 ON v2.id = s."s3SecretKeyVaultId"
      LEFT JOIN vault.decrypted_secrets v3 ON v3.id = s."doAccessKeyIdVaultId"
      LEFT JOIN vault.decrypted_secrets v4 ON v4.id = s."doSecretKeyVaultId"
      ORDER BY s."updatedAt" DESC
      LIMIT 1
    `);

    const settings = result[0] as Record<string, unknown> | undefined;

    // No settings row yet — default to local filesystem storage.
    if (!settings) {
      return {
        success: true,
        data: {
          storageType: "LOCAL" as StorageType,
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
          maxImageSize: 2097152,
          maxVideoSize: 10485760,
          enableCompression: true,
          compressionQuality: 80,
        },
      };
    }

    return {
      success: true,
      data: settings as {
        storageType: StorageType;
        s3BucketName: string | null;
        s3Region: string | null;
        s3AccessKeyId: string | null;
        s3SecretKey: string | null;
        s3CloudfrontUrl: string | null;
        doSpaceName: string | null;
        doRegion: string | null;
        doAccessKeyId: string | null;
        doSecretKey: string | null;
        doCdnUrl: string | null;
        localBasePath: string;
        localBaseUrl: string;
        maxImageSize: number;
        maxVideoSize: number;
        enableCompression: boolean;
        compressionQuality: number;
      },
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
      s3AccessKeyIdVaultId: null,
      s3SecretKeyVaultId: null,
      s3CloudfrontUrl: null,
      doSpaceName: null,
      doRegion: null,
      doAccessKeyIdVaultId: null,
      doSecretKeyVaultId: null,
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
