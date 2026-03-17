import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAdmin } from "@/lib/auth";
import { CSRFProtection } from "@/lib/security/csp";
import { SecurityMonitor, SecurityEventType } from "@/lib/security/monitor";
import { z } from "zod";

// Initialize S3 client from lib/s3.ts conventions
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;
const CDN_URL =
  process.env.AWS_CLOUDFRONT_URL || `https://${BUCKET_NAME}.s3.amazonaws.com`;

// Simple utility to sanitize filename
function sanitizeFilename(filename: string): string {
  // Remove path-related characters and limit length
  return filename.replace(/[^a-zA-Z0-9_.-]/g, "").substring(0, 100);
}

/**
 * POST - Generate a presigned URL for secure file upload
 *
 * This endpoint provides a temporary URL for clients to upload large files
 * directly to S3, bypassing our server to improve performance and scalability.
 */
export async function POST(request: NextRequest) {
  let user = null;
  try {
    user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const csrfToken = CSRFProtection.getTokenFromHeaders(request);
    const isValidCSRF = await CSRFProtection.validateToken(csrfToken);
    if (!isValidCSRF) {
      await SecurityMonitor.logSecurityEvent(
        SecurityEventType.MALICIOUS_PAYLOAD,
        {
          userId: user.id,
          context: "invalid_csrf_token",
          endpoint: "presigned-url",
        },
        "high"
      );
      return NextResponse.json(
        { error: "Invalid CSRF token" },
        { status: 403 }
      );
    }

    const bodySchema = z.object({
      fileName: z
        .string()
        .min(1, "fileName is required")
        .max(100, "fileName too long"),
      fileType: z.string().min(1, "fileType is required"),
    });

    const parsed = bodySchema.safeParse(await request.json());
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

    const { fileName, fileType } = parsed.data;

    // Sanitize filename for security
    const sanitizedFilename = sanitizeFilename(fileName);
    const key = `data-uploads/${user.id}/${Date.now()}-${sanitizedFilename}`;

    // Define allowed file types for data import
    const allowedTypes = [
      "text/csv",
      "application/json",
      "application/vnd.ms-excel",
    ];
    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate file extension matches the declared MIME type
    const allowedExtensions: Record<string, string[]> = {
      "text/csv": [".csv"],
      "application/json": [".json"],
      "application/vnd.ms-excel": [".xls", ".csv"],
    };
    const sanitized = sanitizeFilename(fileName).toLowerCase();
    const ext = sanitized.includes(".") ? `.${sanitized.split(".").pop()}` : "";
    const validExts = allowedExtensions[fileType] ?? [];
    if (!ext || !validExts.includes(ext)) {
      return NextResponse.json(
        { error: "File extension does not match declared file type" },
        { status: 400 }
      );
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      ServerSideEncryption: "AES256",
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300, // 5 minutes
    });

    // The final URL the file will have after upload
    const fileUrl = `${CDN_URL}/${key}`;

    return NextResponse.json({
      url: presignedUrl,
      fileUrl: fileUrl,
    });
  } catch (error) {
    console.error("Presigned URL generation error:", error);
    await SecurityMonitor.logSecurityEvent(
      SecurityEventType.INTERNAL_SERVER_ERROR,
      {
        userId: user?.id,
        error: error instanceof Error ? error.message : "Unknown error",
        context: "presigned_url_generation",
      },
      "high"
    );
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
