import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPostById } from "@/lib/content";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";
import { db } from "@/lib/db";
import { stars } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

async function handlePostRequest(request: NextRequest, { params }: RouteParams, isHeadRequest = false) {
  try {
    const { id } = await params;

    // For HEAD requests, use more permissive checks
    if (isHeadRequest) {
      // Basic validation - just check if post exists and is published
      const post = await getPostById(id);
      
      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
      
      // For HEAD requests, only check if post is published
      // This allows HEAD requests for all published content regardless of auth state
      if (!post.isPublished) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      // Return successful HEAD response for published posts
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', // 5min cache, 10min stale
          'Content-Type': 'application/json',
        }
      });
    }

    // For GET requests, fetch user and post in parallel for performance
    const [currentUser, post] = await Promise.all([
      getCurrentUser().catch(() => null),
      getPostById(id),
    ]);

    const user = currentUser || undefined;

    if (!post) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404, headers: SECURITY_HEADERS }
      );
    }

    if (!post.isPublished) {
      const canViewUnpublished = user && (post.authorId === user.userData?.id || user.userData?.role === "ADMIN");
      if (!canViewUnpublished) {
        return NextResponse.json(
          { error: "Post not found" },
          { status: 404, headers: SECURITY_HEADERS }
        );
      }
    }

    // Merge star status into response if user is authenticated
    // This eliminates the need for a separate /status API call
    let interactionStatus = { isStarred: false };
    const userId = user?.userData?.id;

    if (userId) {
      const [star] = await db
        .select({ id: stars.id })
        .from(stars)
        .where(and(eq(stars.userId, userId), eq(stars.postId, id)))
        .limit(1);
      interactionStatus = { isStarred: !!star };
    }

    return NextResponse.json({
      ...post,
      ...interactionStatus,
    }, { headers: SECURITY_HEADERS });
  } catch (error) {
    console.error("Post API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch post" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

export async function GET(request: NextRequest, context: RouteParams) {
  return handlePostRequest(request, context, false);
}

export async function HEAD(request: NextRequest, context: RouteParams) {
  return handlePostRequest(request, context, true);
}
