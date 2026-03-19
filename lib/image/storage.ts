import fs from "fs/promises";
import path from "path";
import { getStorageConfigAction } from "@/actions/settings";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ServerSideEncryption,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import type { StorageType } from "@/lib/db/schema";
import {
  generateImageFilename,
  generateVideoFilename,
  convertToWebp,
  validateImageFile,
  validateVideoFile,
  extractImageFilename,
} from "./s3";

// Re-export existing S3 utilities for backward compatibility
export {
  generateImageFilename,
  generateVideoFilename,
  convertToWebp,
  validateImageFile,
  validateVideoFile,
  extractImageFilename,
};

// Storage configuration interface
export interface StorageConfig {
  storageType: "S3" | "LOCAL" | "DOSPACE";
  s3BucketName?: string | null;
  s3Region?: string | null;
  s3AccessKeyId?: string | null;
  s3SecretKey?: string | null;
  s3CloudfrontUrl?: string | null;
  doSpaceName?: string | null;
  doRegion?: string | null;
  doAccessKeyId?: string | null;
  doSecretKey?: string | null;
  doCdnUrl?: string | null;
  localBasePath?: string | null;
  localBaseUrl?: string | null;
  maxImageSize: number;
  maxVideoSize: number;
  enableCompression: boolean;
  compressionQuality: number;
}

// NEW: Result type for uploads
export interface UploadResult {
  url: string;
  filename: string;
  relativePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  duration?: number;
  blurDataUrl?: string; // Base64 blur placeholder for images
  previewPath?: string; // Path to preview image
  previewVideoPath?: string; // Path to preview video
}

// Cache for storage config to avoid repeated database calls
let cachedStorageConfig: StorageConfig | null = null;
let configCacheExpiry: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get storage configuration with caching
 */
export async function getStorageConfig(): Promise<StorageConfig> {
  const now = Date.now();

  // Return cached config if still valid
  if (cachedStorageConfig && now < configCacheExpiry) {
    return cachedStorageConfig;
  }

  try {
    const result = await getStorageConfigAction();
    if (result.success && result.data) {
      const d = result.data;
      cachedStorageConfig = {
        ...d,
        storageType: d.storageType ?? "S3",
        maxImageSize: d.maxImageSize ?? 5 * 1024 * 1024,
        maxVideoSize: d.maxVideoSize ?? 100 * 1024 * 1024,
        enableCompression: d.enableCompression ?? false,
        compressionQuality: d.compressionQuality ?? 0.8,
      };
      configCacheExpiry = now + CACHE_DURATION;
      return cachedStorageConfig;
    }
  } catch (error) {
    console.error("Failed to fetch storage config:", error);
  }

  // No DB settings found — fall back to local filesystem so uploads still
  // work in a fresh dev environment without any configuration.
  const fallbackConfig: StorageConfig = {
    storageType: "LOCAL",
    localBasePath: "/uploads",
    localBaseUrl: "/uploads",
    maxImageSize: 2097152, // 2MB
    maxVideoSize: 10485760, // 10MB
    enableCompression: true,
    compressionQuality: 80,
  };

  cachedStorageConfig = fallbackConfig;
  configCacheExpiry = now + CACHE_DURATION;
  return fallbackConfig;
}

/**
 * Validate storage configuration for consistency
 * @param config - Storage configuration to validate
 * @returns Validation result with any issues found
 */
export function validateStorageConfig(config: StorageConfig): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  switch (config.storageType) {
    case "S3":
      if (!config.s3BucketName) {
        issues.push("S3 bucket name is required");
      }
      if (!config.s3AccessKeyId || !config.s3SecretKey) {
        issues.push("S3 access credentials are required");
      }
      if (!config.s3CloudfrontUrl) {
        issues.push("S3 CloudFront URL is recommended for secure access");
      }
      break;

    case "DOSPACE":
      if (!config.doSpaceName) {
        issues.push("DigitalOcean Space name is required");
      }
      if (!config.doRegion) {
        issues.push("DigitalOcean region is required");
      }
      if (!config.doAccessKeyId || !config.doSecretKey) {
        issues.push("DigitalOcean access credentials are required");
      }
      break;

    case "LOCAL":
      if (!config.localBasePath) {
        issues.push("Local base path is required");
      }
      if (!config.localBaseUrl) {
        issues.push("Local base URL is required");
      }
      break;

    default:
      issues.push(`Unknown storage type: ${config.storageType}`);
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Clear storage config cache (useful when settings are updated)
 */
export function clearStorageConfigCache(): void {
  cachedStorageConfig = null;
  configCacheExpiry = 0;
}

/**
 * NEW: Get public URL from a relative path
 * This function constructs the full public URL for a media file
 * based on the current storage configuration.
 * @param relativePath - The relative path of the file (e.g., "images/file.jpg")
 * @returns The full public URL
 */
export async function getPublicUrl(
  relativePath: string | null | undefined
): Promise<string> {
  if (!relativePath) {
    return "";
  }

  // If the path is already a full URL, return it directly
  if (relativePath.startsWith("http")) {
    return relativePath;
  }

  const config = await getStorageConfig();

  switch (config.storageType) {
    case "S3":
      if (config.s3CloudfrontUrl) {
        return `${config.s3CloudfrontUrl.replace(/\/$/, "")}/${relativePath.replace(
          /^\//,
          ""
        )}`;
      }
      // Fallback to direct S3 URL if CloudFront is not configured
      return `https://${config.s3BucketName}.s3.${config.s3Region || "us-east-1"}.amazonaws.com/${relativePath}`;

    case "DOSPACE":
      if (config.doCdnUrl) {
        return `${config.doCdnUrl.replace(/\/$/, "")}/${relativePath.replace(
          /^\//,
          ""
        )}`;
      }
      // Fallback to direct DO Spaces URL
      return `https://${config.doSpaceName}.${config.doRegion}.digitaloceanspaces.com/${relativePath}`;

    case "LOCAL":
      return `${(config.localBaseUrl || "/uploads").replace(
        /\/$/,
        ""
      )}/${relativePath.replace(/^\//, "")}`;

    default:
      return "";
  }
}

// Local storage functions
/**
 * Ensure upload directory exists
 */
async function ensureUploadDirectory(basePath: string): Promise<void> {
  const fullPath = path.join(
    process.cwd(),
    "public",
    basePath.replace(/^\//, "")
  );

  try {
    await fs.access(fullPath);
  } catch {
    // Directory doesn't exist, create it
    await fs.mkdir(fullPath, { recursive: true });
  }
}

/**
 * Upload image to local storage
 */
export async function uploadImageToLocal(
  imageBuffer: Buffer,
  filename: string,
  basePath: string = "/uploads"
): Promise<string> {
  try {
    // Ensure directory exists
    await ensureUploadDirectory(basePath);

    // Full file path
    const filePath = path.join(
      process.cwd(),
      "public",
      basePath.replace(/^\//, ""),
      "images",
      filename
    );

    // Ensure images subdirectory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, imageBuffer);

    // Return relative path instead of full URL for storage independence
    return `images/${filename}`;
  } catch (error) {
    console.error("Error uploading image to local storage:", error);
    throw new Error("Failed to upload image to local storage");
  }
}

/**
 * Upload video to local storage
 */
export async function uploadVideoToLocal(
  videoBuffer: Buffer,
  filename: string,
  basePath: string = "/uploads"
): Promise<string> {
  try {
    // Ensure directory exists
    await ensureUploadDirectory(basePath);

    // Full file path
    const filePath = path.join(
      process.cwd(),
      "public",
      basePath.replace(/^\//, ""),
      "videos",
      filename
    );

    // Ensure videos subdirectory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, videoBuffer);

    // Return relative path instead of full URL for storage independence
    return `videos/${filename}`;
  } catch (error) {
    console.error("Error uploading video to local storage:", error);
    throw new Error("Failed to upload video to local storage");
  }
}

/**
 * Delete image from local storage
 */
export async function deleteImageFromLocal(imageUrl: string): Promise<boolean> {
  try {
    // Extract filename from URL
    const urlParts = imageUrl.split("/");
    const filename = urlParts[urlParts.length - 1];

    if (!filename || !filename.includes(".")) {
      console.warn("Invalid image URL for local deletion:", imageUrl);
      return false;
    }

    // Construct file path
    const filePath = path.join(
      process.cwd(),
      "public",
      imageUrl.replace(/^\//, "")
    );

    // Check if file exists before attempting deletion
    try {
      await fs.access(filePath);
    } catch {
      console.log(`File not found, skipping deletion: ${filePath}`);
      return true; // Consider this a success since the file is already gone
    }

    // Delete file
    await fs.unlink(filePath);
    console.log("Successfully deleted local image:", filename);
    return true;
  } catch (error) {
    console.error("Error deleting image from local storage:", error);
    return false;
  }
}

/**
 * Delete video from local storage
 */
export async function deleteVideoFromLocal(videoUrl: string): Promise<boolean> {
  try {
    // Extract filename from URL
    const urlParts = videoUrl.split("/");
    const filename = urlParts[urlParts.length - 1];

    if (!filename || !filename.includes(".")) {
      console.warn("Invalid video URL for local deletion:", videoUrl);
      return false;
    }

    // Construct file path
    const filePath = path.join(
      process.cwd(),
      "public",
      videoUrl.replace(/^\//, "")
    );

    // Check if file exists before attempting deletion
    try {
      await fs.access(filePath);
    } catch {
      console.log(`File not found, skipping deletion: ${filePath}`);
      return true; // Consider this a success since the file is already gone
    }

    // Delete file
    await fs.unlink(filePath);
    console.log("Successfully deleted local video:", filename);
    return true;
  } catch (error) {
    console.error("Error deleting video from local storage:", error);
    return false;
  }
}

// Add preview upload functions for different storage types
export async function uploadPreviewToS3WithConfig(
  previewBuffer: Buffer,
  previewFilename: string,
  config: StorageConfig
): Promise<string> {
  const s3Client = await createS3Client(config);
  if (!s3Client) {
    throw new Error("Failed to create S3 client");
  }

  const key = `preview/${previewFilename}`;

  const uploadParams = {
    Bucket: config.s3BucketName!,
    Key: key,
    Body: previewBuffer,
    ContentType: "image/webp",
    ACL: "private" as const,
    ServerSideEncryption: ServerSideEncryption.AES256,
    CacheControl: "public, max-age=31536000", // Cache for 1 year
    ContentDisposition: "inline",
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));

    // CloudFront is now optional, fallback to S3 URL if not set
    const baseUrl =
      config.s3CloudfrontUrl ||
      `https://${config.s3BucketName}.s3.${config.s3Region || "us-east-1"}.amazonaws.com`;
    return `${baseUrl}/${key}`;
  } catch (error) {
    console.error("Error uploading preview to S3:", error);
    throw new Error("Failed to upload preview to S3");
  }
}

export async function uploadPreviewToDOSpacesWithConfig(
  previewBuffer: Buffer,
  previewFilename: string,
  config: StorageConfig
): Promise<string> {
  const doClient = await createDOSpacesClient(config);
  if (!doClient) {
    throw new Error("Failed to create DigitalOcean Spaces client");
  }

  const key = `preview/${previewFilename}`;

  const uploadParams = {
    Bucket: config.doSpaceName!,
    Key: key,
    Body: previewBuffer,
    ContentType: "image/avif",
    ACL: ObjectCannedACL.public_read,
    CacheControl: "public, max-age=31536000",
    ContentDisposition: "inline",
  };

  try {
    await doClient.send(new PutObjectCommand(uploadParams));

    if (!config.doCdnUrl) {
      return `https://${config.doSpaceName}.${config.doRegion}.digitaloceanspaces.com/${key}`;
    }

    return `${config.doCdnUrl}/${key}`;
  } catch (error) {
    console.error("Error uploading preview to DigitalOcean Spaces:", error);
    throw new Error("Failed to upload preview to DigitalOcean Spaces");
  }
}

export async function uploadPreviewToLocal(
  previewBuffer: Buffer,
  previewFilename: string,
  basePath: string = "/uploads"
): Promise<string> {
  try {
    // Ensure base directory exists first
    await ensureUploadDirectory(basePath);

    // Full file path - follow same pattern as other local upload functions
    const filePath = path.join(
      process.cwd(),
      "public",
      basePath.replace(/^\//, ""),
      "preview",
      previewFilename
    );

    // Ensure preview subdirectory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, previewBuffer);

    // Return relative path for consistency
    return `preview/${previewFilename}`;
  } catch (error) {
    console.error("Error uploading preview to local storage:", error);
    throw new Error("Failed to upload preview to local storage");
  }
}

/**
 * Upload preview video to S3 with configuration
 */
export async function uploadPreviewVideoToS3WithConfig(
  previewVideoBuffer: Buffer,
  previewVideoFilename: string,
  config: StorageConfig
): Promise<string> {
  const s3Client = await createS3Client(config);
  if (!s3Client) {
    throw new Error("Failed to create S3 client");
  }

  const key = `preview/${previewVideoFilename}`;

  const uploadParams = {
    Bucket: config.s3BucketName!,
    Key: key,
    Body: previewVideoBuffer,
    ContentType: "video/mp4",
    ACL: "private" as const,
    ServerSideEncryption: ServerSideEncryption.AES256,
    CacheControl: "public, max-age=31536000", // Cache for 1 year
    ContentDisposition: "inline",
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));

    // CloudFront is now optional, fallback to S3 URL if not set
    const baseUrl =
      config.s3CloudfrontUrl ||
      `https://${config.s3BucketName}.s3.${config.s3Region || "us-east-1"}.amazonaws.com`;
    return `${baseUrl}/${key}`;
  } catch (error) {
    console.error("Error uploading preview video to S3:", error);
    throw new Error("Failed to upload preview video to S3");
  }
}

/**
 * Upload preview video to DigitalOcean Spaces with configuration
 */
export async function uploadPreviewVideoToDOSpacesWithConfig(
  previewVideoBuffer: Buffer,
  previewVideoFilename: string,
  config: StorageConfig
): Promise<string> {
  const doClient = await createDOSpacesClient(config);
  if (!doClient) {
    throw new Error("Failed to create DigitalOcean Spaces client");
  }

  const key = `preview/${previewVideoFilename}`;

  const uploadParams = {
    Bucket: config.doSpaceName!,
    Key: key,
    Body: previewVideoBuffer,
    ContentType: "video/mp4",
    ACL: ObjectCannedACL.public_read,
    CacheControl: "public, max-age=31536000",
    ContentDisposition: "inline",
  };

  try {
    await doClient.send(new PutObjectCommand(uploadParams));

    if (!config.doCdnUrl) {
      return `https://${config.doSpaceName}.${config.doRegion}.digitaloceanspaces.com/${key}`;
    }

    return `${config.doCdnUrl}/${key}`;
  } catch (error) {
    console.error("Error uploading preview video to DigitalOcean Spaces:", error);
    throw new Error("Failed to upload preview video to DigitalOcean Spaces");
  }
}

/**
 * Upload preview video to local storage
 */
export async function uploadPreviewVideoToLocal(
  previewVideoBuffer: Buffer,
  previewVideoFilename: string,
  basePath: string = "/uploads"
): Promise<string> {
  try {
    // Ensure base directory exists first
    await ensureUploadDirectory(basePath);

    // Full file path - follow same pattern as other local upload functions
    const filePath = path.join(
      process.cwd(),
      "public",
      basePath.replace(/^\//, ""),
      "preview",
      previewVideoFilename
    );

    // Ensure preview subdirectory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, previewVideoBuffer);

    // Return relative path for consistency
    return `preview/${previewVideoFilename}`;
  } catch (error) {
    console.error("Error uploading preview video to local storage:", error);
    throw new Error("Failed to upload preview video to local storage");
  }
}

/**
 * Upload preview video using configured storage method
 */
export async function uploadPreviewVideoToStorage(
  previewVideoBuffer: Buffer,
  previewVideoFilename: string,
  storageType: StorageType,
  config: StorageConfig
): Promise<string> {
  switch (storageType) {
    case "S3":
      return await uploadPreviewVideoToS3WithConfig(
        previewVideoBuffer,
        previewVideoFilename,
        config
      );
    case "DOSPACE":
      return await uploadPreviewVideoToDOSpacesWithConfig(
        previewVideoBuffer,
        previewVideoFilename,
        config
      );
    case "LOCAL":
      return await uploadPreviewVideoToLocal(
        previewVideoBuffer,
        previewVideoFilename,
        config.localBasePath || "/uploads"
      );
    default:
      throw new Error(`Unsupported storage type: ${storageType}`);
  }
}

// S3 storage functions (using existing logic)
async function createS3Client(config: StorageConfig): Promise<S3Client | null> {
  if (!config.s3AccessKeyId || !config.s3SecretKey || !config.s3BucketName) {
    console.error("S3 configuration incomplete");
    return null;
  }

  return new S3Client({
    region: config.s3Region || "us-east-1",
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretKey,
    },
  });
}

// DigitalOcean Spaces functions (S3-compatible)
async function createDOSpacesClient(
  config: StorageConfig
): Promise<S3Client | null> {
  if (
    !config.doAccessKeyId ||
    !config.doSecretKey ||
    !config.doSpaceName ||
    !config.doRegion
  ) {
    console.error("DigitalOcean Spaces configuration incomplete");
    return null;
  }

  return new S3Client({
    endpoint: `https://${config.doRegion}.digitaloceanspaces.com`,
    region: config.doRegion,
    credentials: {
      accessKeyId: config.doAccessKeyId,
      secretAccessKey: config.doSecretKey,
    },
    forcePathStyle: false, // Use virtual hosted-style requests
  });
}

/**
 * Upload image to S3 using configuration
 */
export async function uploadImageToS3WithConfig(
  imageBuffer: Buffer,
  filename: string,
  config: StorageConfig
): Promise<string> {
  const s3Client = await createS3Client(config);
  if (!s3Client) {
    throw new Error("Failed to create S3 client");
  }

  const key = `images/${filename}`;
  const uploadParams = {
    Bucket: config.s3BucketName!,
    Key: key,
    Body: imageBuffer,
    ContentType: "image/webp",
    ServerSideEncryption: ServerSideEncryption.AES256,
    CacheControl: "public, max-age=31536000",
    ContentDisposition: "inline",
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));

    // Return CDN URL if available, otherwise S3 URL
    const baseUrl =
      config.s3CloudfrontUrl ||
      `https://${config.s3BucketName}.s3.amazonaws.com`;
    return `${baseUrl}/${key}`;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw new Error("Failed to upload image to S3");
  }
}

/**
 * Upload video to S3 using configuration
 */
export async function uploadVideoToS3WithConfig(
  videoBuffer: Buffer,
  filename: string,
  config: StorageConfig
): Promise<string> {
  const s3Client = await createS3Client(config);
  if (!s3Client) {
    throw new Error("Failed to create S3 client");
  }

  const key = `videos/${filename}`;
  const uploadParams = {
    Bucket: config.s3BucketName!,
    Key: key,
    Body: videoBuffer,
    ContentType: "video/mp4",
    ServerSideEncryption: ServerSideEncryption.AES256,
    CacheControl: "public, max-age=31536000",
    ContentDisposition: "inline",
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));

    // Return CDN URL if available, otherwise S3 URL
    const baseUrl =
      config.s3CloudfrontUrl ||
      `https://${config.s3BucketName}.s3.amazonaws.com`;
    return `${baseUrl}/${key}`;
  } catch (error) {
    console.error("Error uploading video to S3:", error);
    throw new Error("Failed to upload video to S3");
  }
}

/**
 * Delete image from S3 using configuration
 */
export async function deleteImageFromS3WithConfig(
  imageUrl: string,
  config: StorageConfig
): Promise<boolean> {
  const s3Client = await createS3Client(config);
  if (!s3Client) {
    return false;
  }

  try {
    const url = new URL(imageUrl);
    const key = url.pathname.startsWith("/")
      ? url.pathname.slice(1)
      : url.pathname;

    // Allow deletion of images from both images/ and preview/ directories
    if (!key.startsWith("images/") && !key.startsWith("preview/")) {
      console.warn("Attempted to delete file from unauthorized directory:", key);
      return false;
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: config.s3BucketName!,
        Key: key,
      })
    );

    console.log("Successfully deleted S3 file:", key);
    return true;
  } catch (error) {
    console.error("Error deleting file from S3:", error);
    return false;
  }
}

/**
 * Delete video from S3 using configuration
 */
export async function deleteVideoFromS3WithConfig(
  videoUrl: string,
  config: StorageConfig
): Promise<boolean> {
  const s3Client = await createS3Client(config);
  if (!s3Client) {
    return false;
  }

  try {
    const url = new URL(videoUrl);
    const key = url.pathname.startsWith("/")
      ? url.pathname.slice(1)
      : url.pathname;

    // Allow deletion of videos from both videos/ and preview/ directories (for thumbnails)
    if (!key.startsWith("videos/") && !key.startsWith("preview/")) {
      console.warn("Attempted to delete file from unauthorized directory:", key);
      return false;
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: config.s3BucketName!,
        Key: key,
      })
    );

    console.log("Successfully deleted S3 file:", key);
    return true;
  } catch (error) {
    console.error("Error deleting file from S3:", error);
    return false;
  }
}

/**
 * Upload image to DigitalOcean Spaces using configuration
 */
export async function uploadImageToDOSpacesWithConfig(
  imageBuffer: Buffer,
  filename: string,
  config: StorageConfig
): Promise<string> {
  const doClient = await createDOSpacesClient(config);
  if (!doClient) {
    throw new Error("Failed to create DigitalOcean Spaces client");
  }

  const key = `images/${filename}`;
  const uploadParams = {
    Bucket: config.doSpaceName!,
    Key: key,
    Body: imageBuffer,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000",
    ContentDisposition: "inline",
    ACL: ObjectCannedACL.public_read, // DigitalOcean Spaces requires explicit ACL
  };

  try {
    await doClient.send(new PutObjectCommand(uploadParams));

    // Return CDN URL if available, otherwise Spaces URL
    const baseUrl =
      config.doCdnUrl ||
      `https://${config.doSpaceName}.${config.doRegion}.digitaloceanspaces.com`;
    return `${baseUrl}/${key}`;
  } catch (error) {
    console.error("Error uploading to DigitalOcean Spaces:", error);
    throw new Error("Failed to upload image to DigitalOcean Spaces");
  }
}

/**
 * Upload video to DigitalOcean Spaces using configuration
 */
export async function uploadVideoToDOSpacesWithConfig(
  videoBuffer: Buffer,
  filename: string,
  config: StorageConfig
): Promise<string> {
  const doClient = await createDOSpacesClient(config);
  if (!doClient) {
    throw new Error("Failed to create DigitalOcean Spaces client");
  }

  const key = `videos/${filename}`;
  const uploadParams = {
    Bucket: config.doSpaceName!,
    Key: key,
    Body: videoBuffer,
    ContentType: "video/mp4",
    CacheControl: "public, max-age=31536000",
    ContentDisposition: "inline",
    ACL: ObjectCannedACL.public_read, // DigitalOcean Spaces requires explicit ACL
  };

  try {
    await doClient.send(new PutObjectCommand(uploadParams));

    // Return CDN URL if available, otherwise Spaces URL
    const baseUrl =
      config.doCdnUrl ||
      `https://${config.doSpaceName}.${config.doRegion}.digitaloceanspaces.com`;
    return `${baseUrl}/${key}`;
  } catch (error) {
    console.error("Error uploading video to DigitalOcean Spaces:", error);
    throw new Error("Failed to upload video to DigitalOcean Spaces");
  }
}

/**
 * Delete image from DigitalOcean Spaces using configuration
 */
export async function deleteImageFromDOSpacesWithConfig(
  imageUrl: string,
  config: StorageConfig
): Promise<boolean> {
  const doClient = await createDOSpacesClient(config);
  if (!doClient) {
    return false;
  }

  try {
    const url = new URL(imageUrl);
    const key = url.pathname.startsWith("/")
      ? url.pathname.slice(1)
      : url.pathname;

    // Allow deletion of images from both images/ and preview/ directories
    if (!key.startsWith("images/") && !key.startsWith("preview/")) {
      console.warn("Attempted to delete file from unauthorized directory:", key);
      return false;
    }

    await doClient.send(
      new DeleteObjectCommand({
        Bucket: config.doSpaceName!,
        Key: key,
      })
    );

    console.log("Successfully deleted DigitalOcean Spaces file:", key);
    return true;
  } catch (error) {
    console.error("Error deleting file from DigitalOcean Spaces:", error);
    return false;
  }
}

/**
 * Delete video from DigitalOcean Spaces using configuration
 */
export async function deleteVideoFromDOSpacesWithConfig(
  videoUrl: string,
  config: StorageConfig
): Promise<boolean> {
  const doClient = await createDOSpacesClient(config);
  if (!doClient) {
    return false;
  }

  try {
    const url = new URL(videoUrl);
    const key = url.pathname.startsWith("/")
      ? url.pathname.slice(1)
      : url.pathname;

    // Allow deletion of videos from both videos/ and preview/ directories (for thumbnails)
    if (!key.startsWith("videos/") && !key.startsWith("preview/")) {
      console.warn("Attempted to delete file from unauthorized directory:", key);
      return false;
    }

    await doClient.send(
      new DeleteObjectCommand({
        Bucket: config.doSpaceName!,
        Key: key,
      })
    );

    console.log("Successfully deleted DigitalOcean Spaces file:", key);
    return true;
  } catch (error) {
    console.error("Error deleting file from DigitalOcean Spaces:", error);
    return false;
  }
}

// Unified storage interface
/**
 * Upload image using configured storage method
 * UPDATED: Returns relative path instead of full URL for storage independence
 */
export async function uploadImage(
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  const config = await getStorageConfig();

  // Upload to the configured storage provider
  if (config.storageType === "LOCAL") {
    await uploadImageToLocal(
      imageBuffer,
      filename,
      config.localBasePath || "/uploads"
    );
  } else if (config.storageType === "DOSPACE") {
    await uploadImageToDOSpacesWithConfig(imageBuffer, filename, config);
  } else {
    await uploadImageToS3WithConfig(imageBuffer, filename, config);
  }

  // Return relative path instead of full URL for storage independence
  return `images/${filename}`;
}

/**
 * Upload video using configured storage method
 * UPDATED: Returns relative path instead of full URL for storage independence
 */
export async function uploadVideo(
  videoBuffer: Buffer,
  filename: string
): Promise<string> {
  const config = await getStorageConfig();

  // Upload to the configured storage provider
  if (config.storageType === "LOCAL") {
    await uploadVideoToLocal(
      videoBuffer,
      filename,
      config.localBasePath || "/uploads"
    );
  } else if (config.storageType === "DOSPACE") {
    await uploadVideoToDOSpacesWithConfig(videoBuffer, filename, config);
  } else {
    await uploadVideoToS3WithConfig(videoBuffer, filename, config);
  }

  // Return relative path instead of full URL for storage independence
  return `videos/${filename}`;
}

/**
 * Delete image using configured storage method
 * Also deletes associated preview file if it exists
 */
export async function deleteImage(imageUrl: string): Promise<boolean> {
  const config = await getStorageConfig();

  // First, try to delete the main image file
  let mainFileDeleted = false;
  if (config.storageType === "LOCAL") {
    mainFileDeleted = await deleteImageFromLocal(imageUrl);
  } else if (config.storageType === "DOSPACE") {
    mainFileDeleted = await deleteImageFromDOSpacesWithConfig(imageUrl, config);
  } else {
    mainFileDeleted = await deleteImageFromS3WithConfig(imageUrl, config);
  }

  // If main file deletion succeeded, also try to delete the associated preview file
  if (mainFileDeleted) {
    try {
      // Extract filename from the main image URL to generate preview filename
      const urlParts = imageUrl.split("/");
      const mainFilename = urlParts[urlParts.length - 1];
      
      // Only attempt preview deletion for main image files (not already preview files)
      if (mainFilename && !mainFilename.startsWith("preview-")) {
        // Generate preview filename using the same logic as upload
        const { generatePreviewFilename } = await import("./preview");
        const previewFilename = generatePreviewFilename(mainFilename);
        
        // Construct preview URL based on storage type
        let previewUrl: string;
        if (config.storageType === "LOCAL") {
          // For local storage, replace the path segment
          previewUrl = imageUrl.replace(/\/images\/[^/]+$/, `/preview/${previewFilename}`);
        } else {
          // For cloud storage, replace the key in the URL
          previewUrl = imageUrl.replace(/\/images\/[^/]+$/, `/preview/${previewFilename}`);
        }
        
        // Attempt to delete preview file (don't fail if it doesn't exist)
        if (config.storageType === "LOCAL") {
          const previewDeleted = await deleteImageFromLocal(previewUrl);
          if (!previewDeleted) {
            console.log("Preview file not found or already deleted:", previewUrl);
          }
        } else if (config.storageType === "DOSPACE") {
          const previewDeleted = await deleteImageFromDOSpacesWithConfig(previewUrl, config);
          if (!previewDeleted) {
            console.log("Preview file not found or already deleted:", previewUrl);
          }
        } else {
          const previewDeleted = await deleteImageFromS3WithConfig(previewUrl, config);
          if (!previewDeleted) {
            console.log("Preview file not found or already deleted:", previewUrl);
          }
        }
        
        console.log("Attempted to delete associated preview file:", previewUrl);
      }
    } catch (error) {
      console.warn("Failed to delete associated preview file:", error);
      // Don't fail the main operation if preview deletion fails
    }
  }

  return mainFileDeleted;
}

/**
 * Delete video using configured storage method
 * Also deletes associated preview file (thumbnail) and preview video if they exist
 */
export async function deleteVideo(videoUrl: string): Promise<boolean> {
  const config = await getStorageConfig();

  console.log(`Starting video deletion process for: ${videoUrl}`);

  // First, try to delete the main video file
  let mainFileDeleted = false;
  try {
    if (config.storageType === "LOCAL") {
      mainFileDeleted = await deleteVideoFromLocal(videoUrl);
    } else if (config.storageType === "DOSPACE") {
      mainFileDeleted = await deleteVideoFromDOSpacesWithConfig(videoUrl, config);
    } else {
      mainFileDeleted = await deleteVideoFromS3WithConfig(videoUrl, config);
    }
  } catch (error) {
    console.error(`Failed to delete main video file: ${videoUrl}`, error);
    return false;
  }

  if (!mainFileDeleted) {
    console.warn(`Main video file deletion failed for: ${videoUrl}`);
    return false;
  }

  console.log(`Successfully deleted main video file: ${videoUrl}`);

  // If main file deletion succeeded, also try to delete the associated preview files
  let previewImageDeleted = false;
  let previewVideoDeleted = false;
  
  try {
    // Extract filename from the main video URL to generate preview filenames
    const urlParts = videoUrl.split("/");
    const mainFilename = urlParts[urlParts.length - 1];
    
    // Only attempt preview deletion for main video files (not already preview files)
    if (mainFilename && !mainFilename.startsWith("preview-")) {
      // Generate preview filenames using the same logic as upload
      const { generatePreviewFilename } = await import("./preview");
      const previewFilename = generatePreviewFilename(mainFilename);
      const previewVideoFilename = previewFilename.replace('.webp', '.mp4');
      
      // Construct preview URLs based on storage type
      let previewImageUrl: string;
      let previewVideoUrl: string;
      if (config.storageType === "LOCAL") {
        // For local storage, replace the path segment
        previewImageUrl = videoUrl.replace(/\/videos\/[^/]+$/, `/preview/${previewFilename}`);
        previewVideoUrl = videoUrl.replace(/\/videos\/[^/]+$/, `/preview/${previewVideoFilename}`);
      } else {
        // For cloud storage, replace the key in the URL
        previewImageUrl = videoUrl.replace(/\/videos\/[^/]+$/, `/preview/${previewFilename}`);
        previewVideoUrl = videoUrl.replace(/\/videos\/[^/]+$/, `/preview/${previewVideoFilename}`);
      }
      
      console.log(`Attempting to delete preview files for: ${mainFilename}`);
      console.log(`Preview image URL: ${previewImageUrl}`);
      console.log(`Preview video URL: ${previewVideoUrl}`);
      
      // Attempt to delete preview image (thumbnail) - use image deletion functions
      try {
        if (config.storageType === "LOCAL") {
          previewImageDeleted = await deleteImageFromLocal(previewImageUrl);
        } else if (config.storageType === "DOSPACE") {
          previewImageDeleted = await deleteImageFromDOSpacesWithConfig(previewImageUrl, config);
        } else {
          previewImageDeleted = await deleteImageFromS3WithConfig(previewImageUrl, config);
        }
        
        if (previewImageDeleted) {
          console.log(`Successfully deleted preview image: ${previewImageUrl}`);
        } else {
          console.log(`Preview image not found or already deleted: ${previewImageUrl}`);
        }
      } catch (error) {
        console.warn(`Failed to delete preview image: ${previewImageUrl}`, error);
      }
      
      // Attempt to delete preview video - use video deletion functions
      try {
        if (config.storageType === "LOCAL") {
          previewVideoDeleted = await deleteVideoFromLocal(previewVideoUrl);
        } else if (config.storageType === "DOSPACE") {
          previewVideoDeleted = await deleteVideoFromDOSpacesWithConfig(previewVideoUrl, config);
        } else {
          previewVideoDeleted = await deleteVideoFromS3WithConfig(previewVideoUrl, config);
        }
        
        if (previewVideoDeleted) {
          console.log(`Successfully deleted preview video: ${previewVideoUrl}`);
        } else {
          console.log(`Preview video not found or already deleted: ${previewVideoUrl}`);
        }
      } catch (error) {
        console.warn(`Failed to delete preview video: ${previewVideoUrl}`, error);
      }
      
      console.log("Preview file deletion summary:", {
        mainFile: true,
        previewImage: previewImageDeleted,
        previewVideo: previewVideoDeleted,
        totalFiles: 1 + (previewImageDeleted ? 1 : 0) + (previewVideoDeleted ? 1 : 0)
      });
    } else {
      console.log(`Skipping preview deletion for preview file: ${mainFilename}`);
    }
  } catch (error) {
    console.warn("Failed to delete associated preview files:", error);
    // Don't fail the main operation if preview deletion fails
  }

  return mainFileDeleted;
}

/**
 * Complete image processing and upload pipeline
 */
export async function processAndUploadImageWithConfig(
  file: File,
  userId?: string
): Promise<UploadResult> {
  // Get storage configuration
  const config = await getStorageConfig();
  const { storageType } = config;

  // Import functions dynamically to avoid circular dependencies
  const { generateImageFilename } = await import("./s3");
  const { generateOptimizedBlurPlaceholder } = await import("./blur");
  const { generateImagePreview, generatePreviewFilename } = await import("./preview");

  // Generate filename
  const filename = generateImageFilename(file.name, userId);
  const relativePath = `images/${filename}`;

  // Process the image - KEEP ORIGINAL FORMAT
  const sharp = (await import("sharp")).default;
  const buffer: Buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
  const imageBuffer: Buffer = buffer;  // Keep original format
  const finalMimeType = file.type;  // Keep original MIME type

  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  // Generate blur placeholder from original buffer (before compression)
  let blurDataUrl: string | undefined;
  try {
    blurDataUrl = await generateOptimizedBlurPlaceholder(buffer, file.type, {
      enableCompression: config.enableCompression,
      quality: config.compressionQuality,
    });
  } catch (error) {
    console.error("Failed to generate blur placeholder:", error);
  }

  // Generate preview image with compression settings
  let previewPath: string | undefined;
  try {
    const previewBuffer = await generateImagePreview(buffer, {
      maxWidth: 1280,
      maxHeight: 720,
      quality: config.compressionQuality,  // Use dashboard setting
      format: "webp",  // Always WebP for previews
      enableCompression: config.enableCompression,  // Respect compression toggle
    });

    const previewFilename = generatePreviewFilename(filename);
    previewPath = `preview/${previewFilename}`;

    // Upload preview based on storage type
    switch (storageType) {
      case "S3":
        await uploadPreviewToS3WithConfig(
          previewBuffer,
          previewFilename,
          config
        );
        break;
      case "DOSPACE":
        await uploadPreviewToDOSpacesWithConfig(
          previewBuffer,
          previewFilename,
          config
        );
        break;
      case "LOCAL": {
        const uploadedPreviewPath = await uploadPreviewToLocal(
          previewBuffer,
          previewFilename,
          config.localBasePath || "/uploads"
        );
        previewPath = uploadedPreviewPath;
        break;
      }
    }
  } catch (error) {
    console.error("Failed to generate and upload preview:", error);
    // Continue without preview - it's not critical
  }

  // Upload original image (original format, no WebP conversion)
  let uploadedPath: string;

  // Upload original image based on storage type
  switch (storageType) {
    case "S3": {
      uploadedPath = await uploadImageToS3WithConfig(
        imageBuffer,
        filename,
        config
      );
      break;
    }
    case "DOSPACE": {
      uploadedPath = await uploadImageToDOSpacesWithConfig(
        imageBuffer,
        filename,
        config
      );
      break;
    }
    case "LOCAL": {
      uploadedPath = await uploadImageToLocal(
        imageBuffer,
        filename,
        config.localBasePath || "/uploads"
      );
      break;
    }
    default:
      throw new Error(`Unsupported storage type: ${storageType}`);
  }

  // For local storage, uploadedPath is already a relative path
  // For S3/DOSPACE, uploadedPath is a full URL
  const publicUrl = storageType === "LOCAL" 
    ? await getPublicUrl(uploadedPath)
    : uploadedPath;

  return {
    url: publicUrl,
    filename,
    relativePath: storageType === "LOCAL" ? uploadedPath : relativePath,
    originalName: file.name,
    mimeType: finalMimeType,  // Original MIME type
    fileSize: imageBuffer.length,
    width,
    height,
    blurDataUrl,
    previewPath,  // WebP preview path
  };
}

/**
 * Complete video processing and upload pipeline
 */
export async function processAndUploadVideoWithConfig(
  file: File,
  userId?: string
): Promise<UploadResult> {
  // Get storage configuration
  const config = await getStorageConfig();
  const { storageType } = config;

  // Import functions dynamically to avoid circular dependencies
  const { generateVideoFilename } = await import("./s3");
  const { generateVideoThumbnail, generateVideoPreview, generatePreviewFilename } = await import("./preview");
  const { extractVideoMetadata } = await import("./preview");

  // Generate filename
  const filename = generateVideoFilename(file.name, userId);
  const relativePath = `videos/${filename}`;

  // Process the video
  const videoBuffer: Buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
  
  // Extract video metadata
  const videoMetadata = await extractVideoMetadata(videoBuffer);

  // Generate thumbnail and preview with compression settings
  let previewPath: string | undefined;
  let previewVideoPath: string | undefined;
  let blurDataUrl: string | undefined;
  
  try {
    // Generate thumbnail image with smart dimensions for portrait videos
    const thumbnailBuffer = await generateVideoThumbnail(videoBuffer, {
      time: "00:00:01",
      maxWidth: 1280,
      maxHeight: 720,
      quality: config.compressionQuality,  // Use dashboard setting
      enableCompression: config.enableCompression,  // Respect compression toggle
    });

    // Generate compressed video preview with full duration and audio
    const previewVideoBuffer = await generateVideoPreview(videoBuffer, {
      maxWidth: 640, // Reduced from 1280
      maxHeight: 360, // Reduced from 720
      bitrate: "300k", // Reduced from 500k
      fps: 15, // Reduced from 24
      quality: 80,
      // duration: undefined, // Use original video length (no limit)
      format: "mp4",
    });

    const previewFilename = generatePreviewFilename(filename);
    previewPath = `preview/${previewFilename}`;
    previewVideoPath = `preview/${previewFilename.replace('.webp', '.mp4')}`;

    // Upload thumbnail based on storage type
    switch (storageType) {
      case "S3": {
        await uploadPreviewToS3WithConfig(
          thumbnailBuffer,
          previewFilename,
          config
        );
        break;
      }
      case "DOSPACE": {
        await uploadPreviewToDOSpacesWithConfig(
          thumbnailBuffer,
          previewFilename,
          config
        );
        break;
      }
      case "LOCAL": {
        const uploadedPreviewPath = await uploadPreviewToLocal(
          thumbnailBuffer,
          previewFilename,
          config.localBasePath || "/uploads"
        );
        previewPath = uploadedPreviewPath;
        break;
      }
    }

    // Upload compressed video preview
    await uploadPreviewVideoToStorage(
      previewVideoBuffer,
      previewFilename.replace('.webp', '.mp4'),
      storageType,
      config
    );

    // Generate blur placeholder from thumbnail
    try {
      const { generateOptimizedBlurPlaceholder } = await import("./blur");
      blurDataUrl = await generateOptimizedBlurPlaceholder(thumbnailBuffer, "image/webp", {
        enableCompression: config.enableCompression,
        quality: config.compressionQuality,
      });
    } catch (error) {
      console.error("Failed to generate blur placeholder for video thumbnail:", error);
    }
  } catch (error) {
    console.error("Failed to generate and upload video previews:", error);
    // Continue without previews - they're not critical
  }

  let uploadedPath: string;

  // Upload original video based on storage type
  switch (storageType) {
    case "S3": {
      uploadedPath = await uploadVideoToS3WithConfig(
        videoBuffer,
        filename,
        config
      );
      break;
    }
    case "DOSPACE": {
      uploadedPath = await uploadVideoToDOSpacesWithConfig(
        videoBuffer,
        filename,
        config
      );
      break;
    }
    case "LOCAL": {
      uploadedPath = await uploadVideoToLocal(
        videoBuffer,
        filename,
        config.localBasePath || "/uploads"
      );
      break;
    }
    default:
      throw new Error(`Unsupported storage type: ${storageType}`);
  }

  // For local storage, uploadedPath is already a relative path
  // For S3/DOSPACE, uploadedPath is a full URL
  const publicUrl = storageType === "LOCAL" 
    ? await getPublicUrl(uploadedPath)
    : uploadedPath;

  return {
    url: publicUrl,
    filename,
    relativePath: storageType === "LOCAL" ? uploadedPath : relativePath,
    originalName: file.name,
    mimeType: file.type,  // Original video MIME type
    fileSize: file.size,
    width: videoMetadata.width,
    height: videoMetadata.height,
    duration: videoMetadata.duration,
    previewPath,  // WebP thumbnail path
    previewVideoPath,  // Compressed video preview path
    blurDataUrl,
  };
}

/**
 * Test storage configuration and URL generation for all storage types
 * This function helps verify that the storage system works correctly
 * @returns Test results for each storage type
 */
export async function testStorageConfiguration(): Promise<{
  [key: string]: {
    isValid: boolean;
    testUrl: string;
    issues: string[];
  };
}> {
  const testPath = "images/test-image.webp";
  const results: { [key: string]: {
    isValid: boolean;
    testUrl: string;
    issues: string[];
    storageType?: StorageConfig["storageType"];
  } } = {};

  // Test current configuration
  const currentConfig = await getStorageConfig();
  const validation = validateStorageConfig(currentConfig);
  
  results.current = {
    isValid: validation.isValid,
    testUrl: await getPublicUrl(testPath),
    issues: validation.issues,
    storageType: currentConfig.storageType,
  };

  // Test S3 configuration
  const s3Config: StorageConfig = {
    ...currentConfig,
    storageType: "S3",
    s3BucketName: "test-bucket",
    s3Region: "us-east-1",
    s3CloudfrontUrl: "https://cdn.example.com",
  };
  
  results.s3 = {
    isValid: validateStorageConfig(s3Config).isValid,
    testUrl: constructFullUrl(testPath, s3Config),
    issues: validateStorageConfig(s3Config).issues,
  };

  // Test DigitalOcean Spaces configuration
  const doConfig: StorageConfig = {
    ...currentConfig,
    storageType: "DOSPACE",
    doSpaceName: "test-space",
    doRegion: "nyc3",
    doCdnUrl: "https://cdn.digitalocean.com",
  };
  
  results.dospace = {
    isValid: validateStorageConfig(doConfig).isValid,
    testUrl: constructFullUrl(testPath, doConfig),
    issues: validateStorageConfig(doConfig).issues,
  };

  // Test Local configuration
  const localConfig: StorageConfig = {
    ...currentConfig,
    storageType: "LOCAL",
    localBasePath: "/uploads",
    localBaseUrl: "/uploads",
  };
  
  results.local = {
    isValid: validateStorageConfig(localConfig).isValid,
    testUrl: constructFullUrl(testPath, localConfig),
    issues: validateStorageConfig(localConfig).issues,
  };

  return results;
}

// Helper function for URL construction (used by test function)
function constructFullUrl(relativePath: string, config: StorageConfig): string {
  const cleanPath = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
  
  switch (config.storageType) {
    case "S3":
      if (config.s3CloudfrontUrl) {
        return `${config.s3CloudfrontUrl.replace(/\/$/, "")}/${cleanPath}`;
      }
      return `https://${config.s3BucketName}.s3.${config.s3Region || "us-east-1"}.amazonaws.com/${cleanPath}`;
      
    case "DOSPACE":
      if (config.doCdnUrl) {
        return `${config.doCdnUrl.replace(/\/$/, "")}/${cleanPath}`;
      }
      return `https://${config.doSpaceName}.${config.doRegion}.digitaloceanspaces.com/${cleanPath}`;
      
    case "LOCAL":
      return `${(config.localBaseUrl || "/uploads").replace(/\/$/, "")}/${cleanPath}`;
      
    default:
      return `/${cleanPath}`;
  }
}

/**
 * Delete multiple media files associated with a post
 * @param mediaRecords - Array of media records with relativePath and mimeType
 * @returns Promise with deletion results
 */
export async function deletePostMedia(
  mediaRecords: Array<{
    relativePath: string;
    mimeType: string;
  }>
): Promise<{
  successCount: number;
  failureCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const media of mediaRecords) {
    try {
      const fullUrl = await getPublicUrl(media.relativePath);
      let deleteResult = false;

      if (media.mimeType.startsWith("image/")) {
        deleteResult = await deleteImage(fullUrl);
      } else if (media.mimeType.startsWith("video/")) {
        deleteResult = await deleteVideo(fullUrl);
      } else {
        errors.push(`Unsupported media type: ${media.mimeType} for ${media.relativePath}`);
        failureCount++;
        continue;
      }

      if (deleteResult) {
        successCount++;
      } else {
        failureCount++;
        errors.push(`Failed to delete ${media.relativePath}`);
      }
    } catch (error) {
      failureCount++;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Error deleting ${media.relativePath}: ${errorMessage}`);
    }
  }

  return { successCount, failureCount, errors };
}

/**
 * Clean up orphaned media files that are not associated with any post
 * This function should be run periodically as a maintenance task
 * @param dryRun - If true, only returns what would be deleted without actually deleting
 * @returns Promise with cleanup results
 */
export async function cleanupOrphanedMedia(dryRun: boolean = true): Promise<{
  orphanedCount: number;
  deletedCount: number;
  errors: string[];
  orphanedFiles: Array<{
    id: string;
    relativePath: string;
    mimeType: string;
    uploadedBy: string;
    createdAt: Date;
  }>;
}> {
  const { db } = await import("@/lib/db");
  const { media } = await import("@/lib/db/schema");
  const { and, eq, lt, isNull } = await import("drizzle-orm");
  const errors: string[] = [];
  let deletedCount = 0;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const orphanedMedia = await db
    .select({
      id: media.id,
      relativePath: media.relativePath,
      mimeType: media.mimeType,
      uploadedBy: media.uploadedBy,
      createdAt: media.createdAt,
    })
    .from(media)
    .where(and(isNull(media.postId), lt(media.createdAt, cutoff)));

  if (dryRun) {
    return {
      orphanedCount: orphanedMedia.length,
      deletedCount: 0,
      errors: [],
      orphanedFiles: orphanedMedia,
    };
  }

  for (const mediaRow of orphanedMedia) {
    try {
      const fullUrl = await getPublicUrl(mediaRow.relativePath);
      let deleteResult = false;

      if (mediaRow.mimeType.startsWith("image/")) {
        deleteResult = await deleteImage(fullUrl);
      } else if (mediaRow.mimeType.startsWith("video/")) {
        deleteResult = await deleteVideo(fullUrl);
      }

      if (deleteResult) {
        await db.delete(media).where(eq(media.id, mediaRow.id));
        deletedCount++;
      } else {
        errors.push(`Failed to delete file: ${mediaRow.relativePath}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Error processing ${mediaRow.relativePath}: ${errorMessage}`);
    }
  }

  return {
    orphanedCount: orphanedMedia.length,
    deletedCount,
    errors,
    orphanedFiles: orphanedMedia,
  };
}

/**
 * Clean up orphaned preview files that exist in storage but don't have corresponding database records
 * This function scans the preview directory and removes files that aren't referenced in the database
 * @param dryRun - If true, only returns what would be deleted without actually deleting
 * @returns Promise with cleanup results
 */
export async function cleanupOrphanedPreviewFiles(dryRun: boolean = true): Promise<{
  orphanedCount: number;
  deletedCount: number;
  errors: string[];
  orphanedFiles: string[];
}> {
  const { db } = await import("@/lib/db");
  const { media } = await import("@/lib/db/schema");
  const { or, like } = await import("drizzle-orm");
  const config = await getStorageConfig();
  const errors: string[] = [];
  let deletedCount = 0;
  const orphanedFiles: string[] = [];

  try {
    const dbPreviewFiles = await db
      .select({ relativePath: media.relativePath, filename: media.filename })
      .from(media)
      .where(
        or(
          like(media.relativePath, "preview/%"),
          like(media.filename, "preview-%")
        )
      );

    // Create a set of known preview files for quick lookup
    const knownPreviewFiles = new Set([
      ...dbPreviewFiles.map(f => f.relativePath),
      ...dbPreviewFiles.map(f => f.filename)
    ]);

    // For local storage, we can scan the actual directory
    if (config.storageType === "LOCAL") {
      const fs = await import("fs/promises");
      const path = await import("path");
      
      try {
        const previewDir = path.join(
          process.cwd(),
          "public",
          (config.localBasePath || "/uploads").replace(/^\//, ""),
          "preview"
        );

        // Check if preview directory exists
        try {
          await fs.access(previewDir);
        } catch {
          // Directory doesn't exist, nothing to clean
          return {
            orphanedCount: 0,
            deletedCount: 0,
            errors: [],
            orphanedFiles: [],
          };
        }

        const files = await fs.readdir(previewDir);
        
        for (const file of files) {
          const filePath = path.join(previewDir, file);
          const relativePath = `preview/${file}`;
          
          // Check if this file is known in the database
          if (!knownPreviewFiles.has(relativePath) && !knownPreviewFiles.has(file)) {
            orphanedFiles.push(relativePath);
            
            if (!dryRun) {
              try {
                await fs.unlink(filePath);
                deletedCount++;
                console.log(`Deleted orphaned preview file: ${relativePath}`);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                errors.push(`Failed to delete ${relativePath}: ${errorMessage}`);
              }
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Error scanning preview directory: ${errorMessage}`);
      }
    } else {
      // For cloud storage, we can't easily scan directories
      // This would require listing objects from S3/DO Spaces
      // For now, we'll just log that this feature is not available for cloud storage
      console.log("Orphaned preview file cleanup is only available for local storage");
    }

    return {
      orphanedCount: orphanedFiles.length,
      deletedCount,
      errors,
      orphanedFiles,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Error in orphaned preview cleanup: ${errorMessage}`);
    
    return {
      orphanedCount: 0,
      deletedCount: 0,
      errors,
      orphanedFiles: [],
    };
  }
}
