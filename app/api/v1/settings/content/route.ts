import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getMaxTagsPerPost, getAllowUserPosts } from "@/lib/settings";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

/**
 * GET /api/v1/settings/content
 * Returns frontend-safe content configuration values.
 * Requires authentication (validated via x-user-id header set by middleware).
 */
export async function GET() {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    const [maxTagsPerPost, allowUserPosts] = await Promise.all([
      getMaxTagsPerPost(),
      getAllowUserPosts(),
    ]);

    return NextResponse.json(
      { success: true, maxTagsPerPost, allowUserPosts },
      {
        headers: {
          ...SECURITY_HEADERS,
          // Per-user auth check but settings are shared — safe to cache briefly.
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching content config:", error);
    return NextResponse.json(
      { success: true, maxTagsPerPost: 20, allowUserPosts: true },
      { headers: SECURITY_HEADERS }
    );
  }
}
