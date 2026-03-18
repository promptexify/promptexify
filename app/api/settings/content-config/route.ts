import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

/**
 * GET /api/settings/content-config
 * Returns frontend-safe content configuration values.
 * Requires authentication.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    const [row] = await db
      .select({
        maxTagsPerPost: settings.maxTagsPerPost,
        allowUserPosts: settings.allowUserPosts,
        allowUserUploads: settings.allowUserUploads,
      })
      .from(settings)
      .orderBy(desc(settings.updatedAt))
      .limit(1);

    return NextResponse.json({
      success: true,
      maxTagsPerPost: row?.maxTagsPerPost ?? 20,
      allowUserPosts: row?.allowUserPosts ?? true,
      allowUserUploads: row?.allowUserUploads ?? true,
    }, { headers: SECURITY_HEADERS });
  } catch (error) {
    console.error("Error fetching content config:", error);
    return NextResponse.json(
      { success: true, maxTagsPerPost: 20, allowUserPosts: true, allowUserUploads: true },
      { headers: SECURITY_HEADERS }
    );
  }
}
