import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteImage, getStorageConfig } from "@/lib/image/storage";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { CSRFProtection } from "@/lib/security/csp";

/**
 * Enhanced filename extraction that handles different URL formats and storage types
 * @param imageUrl - Full URL of the image
 * @returns string - filename or empty string if invalid
 */
function extractImageFilename(imageUrl: string): string {
  try {
    if (!imageUrl) return "";

    // Handle relative paths (local storage)
    if (!imageUrl.startsWith("http")) {
      const parts = imageUrl.split("/");
      const filename = parts[parts.length - 1];
          // Accept various image formats, prioritizing webp but supporting others  
    if (filename && /\.(webp|avif|jpg|jpeg|png)$/i.test(filename)) {
        return filename;
      }
      return "";
    }

    const url = new URL(imageUrl);
    const pathname = url.pathname;
    const filename = pathname.split("/").pop() || "";

    // Accept images from images/ directory with various formats
    // Also handle preview/ directory for preview images
    if (
      (pathname.includes("/images/") || pathname.includes("/preview/")) &&
      filename &&
              /\.(webp|avif|jpg|jpeg|png)$/i.test(filename)
    ) {
      return filename;
    }

    return "";
  } catch (error) {
    console.error("Error extracting filename from URL:", error);
    return "";
  }
}

/**
 * DELETE /api/upload/image/delete
 * Deletes an image from storage and removes the corresponding Media record
 */
export async function DELETE(request: NextRequest) {
  try {
    // Authentication check - only authenticated users can delete
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const csrfToken = CSRFProtection.getTokenFromHeaders(request);
    const isValidCSRF = await CSRFProtection.validateToken(csrfToken);
    if (!isValidCSRF) {
      return NextResponse.json(
        { error: "Invalid CSRF token" },
        { status: 403 }
      );
    }

    // Role check - allow both ADMIN and USER (users can delete their own images)
    if (user.userData?.role !== "ADMIN" && user.userData?.role !== "USER") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Parse & validate request body w/ Zod
    const bodySchema = z.object({
      imageUrl: z.string().min(1, "Image URL is required"),
      previewPath: z.string().optional(), // Optional preview image path
    });

    let requestBody;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse(requestBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const { imageUrl, previewPath } = parsed.data;

    // Get storage configuration to understand URL format
    const storageConfig = await getStorageConfig();
    
    // Validate that this looks like a valid image URL
    const filename = extractImageFilename(imageUrl);
    if (!filename) {
      console.error("Failed to extract filename from URL:", imageUrl);
      return NextResponse.json(
        { 
          error: "Invalid image URL format", 
          details: `Could not extract filename from: ${imageUrl}` 
        },
        { status: 400 }
      );
    }

    // Verify ownership via database — this is the authoritative check.
    // The filename-prefix heuristic is removed; only the DB ownership record is trusted.
    let mediaRecord = null;
    if (user.userData?.role === "USER") {
      mediaRecord = await prisma.media.findFirst({
        where: {
          filename: filename,
          uploadedBy: user.userData.id,
        },
      });
      if (!mediaRecord) {
        return NextResponse.json(
          { error: "Image not found or permission denied" },
          { status: 403 }
        );
      }
    } else {
      // Admins can delete any file; look up record only for DB cleanup
      mediaRecord = await prisma.media.findFirst({
        where: { filename: filename },
      });
    }

    // Convert relative URL to full URL if needed for deletion
    let urlToDelete = imageUrl;
    if (!imageUrl.startsWith("http")) {
      // For relative URLs, construct the full URL based on storage type
      switch (storageConfig.storageType) {
        case "LOCAL":
          // For local storage, keep the relative path as is
          urlToDelete = imageUrl;
          break;
        case "S3":
          if (storageConfig.s3CloudfrontUrl) {
            urlToDelete = `${storageConfig.s3CloudfrontUrl.replace(/\/$/, "")}/${imageUrl.replace(/^\//, "")}`;
          } else {
            urlToDelete = `https://${storageConfig.s3BucketName}.s3.${storageConfig.s3Region || "us-east-1"}.amazonaws.com/${imageUrl.replace(/^\//, "")}`;
          }
          break;
        case "DOSPACE":
          if (storageConfig.doCdnUrl) {
            urlToDelete = `${storageConfig.doCdnUrl.replace(/\/$/, "")}/${imageUrl.replace(/^\//, "")}`;
          } else {
            urlToDelete = `https://${storageConfig.doSpaceName}.${storageConfig.doRegion}.digitaloceanspaces.com/${imageUrl.replace(/^\//, "")}`;
          }
          break;
      }
    }

    console.log(`Attempting to delete image: ${urlToDelete} (filename: ${filename})`);

    // Delete from configured storage
    const deleted = await deleteImage(urlToDelete);

    // Also delete preview file if it was provided
    let previewDeleted = false;
    if (previewPath) {
      try {
        const { deleteImage: deleteImageFile, getPublicUrl } = await import("@/lib/image/storage");
        const previewImageUrl = await getPublicUrl(previewPath);
        previewDeleted = await deleteImageFile(previewImageUrl);
        console.log(`Preview image deletion ${previewDeleted ? 'succeeded' : 'failed'}: ${previewPath}`);
      } catch (error) {
        console.error(`Failed to delete preview image ${previewPath}:`, error);
      }
    }

    if (deleted) {
      // File deletion succeeded, now clean up the database record
      let databaseCleanupResult = { success: false, recordFound: false };
      
      if (mediaRecord) {
        try {
          await prisma.media.delete({
            where: { id: mediaRecord.id },
          });
          
          databaseCleanupResult = { success: true, recordFound: true };
          console.log(`Successfully deleted Media record for filename: ${filename}`);
        } catch (dbError) {
          console.error("Failed to delete Media record:", dbError);
          // Log the error but don't fail the request since file deletion succeeded
          databaseCleanupResult = { success: false, recordFound: true };
        }
      } else {
        console.log(`No Media record found for filename: ${filename} (file may have been uploaded before database tracking)`);
        databaseCleanupResult = { success: true, recordFound: false };
      }

      return NextResponse.json({
        success: true,
        message: "Image deleted successfully",
        database: databaseCleanupResult,
        previewFiles: {
          image: previewDeleted,
        },
      });
    } else {
      return NextResponse.json(
        { error: "Failed to delete image from storage" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in image delete API:", error);

    // Don't expose internal error details to client
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: "Failed to delete image",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
