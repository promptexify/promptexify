import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { AutomationService } from "@/lib/automation/service";
import { validateJsonInput } from "@/lib/automation/validation";
import { SecurityMonitor, SecurityEventType } from "@/lib/security/monitor";
import { ContentFile } from "@/lib/automation/types";
import { CSRFProtection } from "@/lib/security/csp";

// Explicit runtime configuration to ensure Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST - Execute JSON content directly
 *
 * This endpoint allows direct execution of JSON content without file storage.
 * It accepts either a single ContentFile object or an array of ContentFile objects.
 */
export async function POST(request: NextRequest) {
  let user = null;

  try {
    // Require admin access
    user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    // Validate CSRF token with improved error handling
    const csrfToken = CSRFProtection.getTokenFromHeaders(request);
    const isValidCSRF = await CSRFProtection.validateToken(csrfToken);
    if (!isValidCSRF) {
      // Log security event with more context
      await SecurityMonitor.logSecurityEvent(
        SecurityEventType.MALICIOUS_PAYLOAD,
        {
          userId: user.id,
          context: "invalid_csrf_token",
          endpoint: "execute-json",
          hasToken: !!csrfToken,
          tokenLength: csrfToken?.length || 0,
        },
        "high"
      );

      return NextResponse.json(
        {
          error: "Invalid CSRF token",
          code: "CSRF_TOKEN_INVALID",
          message:
            "Your security token has expired or is invalid. Please refresh the page and try again.",
          requiresRefresh: true,
        },
        { status: 403 }
      );
    }

    // Get content type and validate
    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Content-Type must be application/json" },
        { status: 400 }
      );
    }

    // Parse request body
    let jsonData: unknown;
    try {
      jsonData = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON format" },
        { status: 400 }
      );
    }

    // Validate JSON input
    const validationResult = await validateJsonInput(jsonData, {
      maxSize: 10 * 1024 * 1024, // 10MB limit
      allowArray: true,
    });

    if (!validationResult.success) {
      // Log security event for validation failures
      await SecurityMonitor.logSecurityEvent(
        SecurityEventType.MALICIOUS_PAYLOAD,
        {
          userId: user.id,
          errors: validationResult.errors,
          context: "json_execution_validation",
        },
        "medium"
      );

      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.errors,
        },
        { status: 400 }
      );
    }

    // Execute content generation
    const result = await AutomationService.executeFromJsonInput(
      validationResult.data as ContentFile | ContentFile[],
      user.id,
      "json-input"
    );

    // Log successful execution
    await SecurityMonitor.logSecurityEvent(
      SecurityEventType.SUSPICIOUS_REQUEST,
      {
        userId: user.id,
        action: "json_content_execution",
        filesProcessed: result.filesProcessed,
        postsCreated: result.postsCreated,
        duration: result.duration,
      },
      "low"
    );

    return NextResponse.json({
      success: true,
      message: "JSON content executed successfully",
      duration: result.duration,
      filesProcessed: result.filesProcessed,
      postsCreated: result.postsCreated,
      statusMessages: result.statusMessages,
      output: result.output,
    });
  } catch (error: unknown) {
    console.error("JSON execution error:", error);

    // Log security event for execution failures
    await SecurityMonitor.logSecurityEvent(
      SecurityEventType.MALICIOUS_PAYLOAD,
      {
        userId: user?.id,
        error: error instanceof Error ? error.message : "Unknown error",
        context: "json_execution_error",
      },
      "high"
    );

    return NextResponse.json(
      {
        success: false,
        error: "JSON execution failed",
        ...(process.env.VERBOSE_ERRORS === "true" && {
          details: error instanceof Error ? error.message : "Unknown error",
        }),
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Get JSON execution documentation
 *
 * Returns documentation about the expected JSON format and usage.
 */
export async function GET() {
  try {
    // Require admin access
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    // Return documentation directly
    const documentation = getJsonDocumentationObject();
    return NextResponse.json(documentation);
  } catch (error) {
    console.error("Documentation error:", error);
    return NextResponse.json(
      { error: "Failed to get documentation" },
      { status: 500 }
    );
  }
}

/**
 * Get JSON documentation object - separated to avoid large string serialization
 */
function getJsonDocumentationObject() {
  return {
    title: "JSON Content Execution API",
    description:
      "Execute content generation directly from JSON input without file storage",
    method: "POST",
    endpoint: "/api/admin/automation/execute-json",
    contentType: "application/json",
    authentication: "Admin role required",
    limits: {
      maxSize: "10MB",
      maxPostsPerFile: 50,
      maxContentLength: 10000,
    },
    format: {
      single: {
        category: "string (slug format)",
        tags: [{ name: "string", slug: "string" }],
        posts: [
          {
            title: "string",
            slug: "string",
            description: "string",
            content: "string",
            isPremium: "boolean",
            isPublished: "boolean",
            status: "APPROVED | PENDING_APPROVAL | REJECTED",
            isFeatured: "boolean",
            uploadPath: "string (optional, /images/ or /videos/ path)",
            uploadFileType: "IMAGE | VIDEO (optional)",
            previewPath: "string (optional, /preview/ path)",
          },
        ],
      },
      array: "Array of the above format",
    },
    response: {
      success: "boolean",
      message: "string",
      duration: "number (seconds)",
      filesProcessed: "number",
      postsCreated: "number",
      statusMessages: "string[]",
      output: "string",
    },
    examples: {
      single: {
        category: "ai-prompts",
        tags: [
          { name: "AI", slug: "ai" },
          { name: "Prompts", slug: "prompts" },
        ],
        posts: [
          {
            title: "Creative Writing Prompt",
            slug: "creative-writing-prompt",
            description: "A prompt for creative writing",
            content: "Write a story about...",
            isPremium: false,
            isPublished: false,
            status: "PENDING_APPROVAL",
            isFeatured: false,
            uploadPath: "/images/test_photo_11.webp",
            uploadFileType: "IMAGE | VIDEO",
            previewPath: "/preview/test_photo_11.webp",
          },
        ],
      },
    },
  };
}
