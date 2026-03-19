import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { posts, stars } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get current user for bookmark/favorite status
    const currentUser = await getCurrentUser();
    const userId = currentUser?.userData?.id;

    if (!userId) {
      return NextResponse.json(
        { isStarred: false },
        { status: 200, headers: SECURITY_HEADERS }
      );
    }

    const [post] = await db
      .select({ id: posts.id, isPublished: posts.isPublished })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (!post || !post.isPublished) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404, headers: SECURITY_HEADERS }
      );
    }

    const [star] = await db
      .select()
      .from(stars)
      .where(and(eq(stars.userId, userId), eq(stars.postId, id)))
      .limit(1);

    return NextResponse.json(
      { isStarred: !!star },
      {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          // Short cache for fresh data
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching post status:", error);
    return NextResponse.json(
      { error: "Failed to fetch post status" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

// Disable other HTTP methods for security
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: SECURITY_HEADERS }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: SECURITY_HEADERS }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: SECURITY_HEADERS }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: SECURITY_HEADERS }
  );
}
