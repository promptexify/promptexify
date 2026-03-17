import { NextResponse } from "next/server";
import { getStorageConfigAction } from "@/actions/settings";
import { testStorageConfiguration } from "@/lib/image/storage";
import { getCurrentUser } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";
import { NextRequest } from "next/server";

/**
 * GET /api/settings/storage-config
 * Returns storage configuration for client components.
 */
export async function GET() {
  try {
    const result = await getStorageConfigAction();

    if (result.success && result.data) {
      return NextResponse.json({
        success: true,
        config: {
          storageType: result.data.storageType,
          maxImageSize: result.data.maxImageSize,
          maxVideoSize: result.data.maxVideoSize,
          enableCompression: result.data.enableCompression,
          compressionQuality: result.data.compressionQuality,
        },
      });
    }

    // No settings found — fail closed rather than silently defaulting to S3
    return NextResponse.json(
      { success: false, error: "Storage configuration not found" },
      { status: 404, headers: SECURITY_HEADERS }
    );
  } catch (error) {
    console.error("Error fetching storage config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch storage configuration" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

/**
 * POST /api/settings/storage-config/test
 * Test storage configuration across all storage types.
 * Requires admin authentication.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.userData || user.userData.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "test") {
      const testResults = await testStorageConfiguration();
      return NextResponse.json({
        success: true,
        testResults,
      }, { headers: SECURITY_HEADERS });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400, headers: SECURITY_HEADERS }
    );
  } catch (error) {
    console.error("Error testing storage config:", error);
    return NextResponse.json({
      success: false,
      error: "Failed to test storage configuration",
    }, { status: 500, headers: SECURITY_HEADERS });
  }
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
