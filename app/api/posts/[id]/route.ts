import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPostById } from "@/lib/content";
import { getPublicUrl } from "@/lib/image/storage";
import { prisma } from "@/lib/prisma";

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
    const url = new URL(request.url);
    const isDashboardRequest = url.pathname.startsWith('/dashboard');

    const [currentUser, post] = await Promise.all([
      getCurrentUser().catch(() => null),
      getPostById(id),
    ]);

    const user = currentUser || undefined;

    // Dashboard-specific auth checks
    if (isDashboardRequest) {
      if (!user) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      // Role-based access control for dashboard requests
      if (user.userData?.role !== "ADMIN" && user.userData?.role !== "USER") {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
    }

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if post is published - unpublished posts can only be viewed by author and admin
    if (!post.isPublished) {
      // Only check unpublished access if user is present (dashboard route)
      const canViewUnpublished = user && (post.authorId === user.userData?.id || user.userData?.role === "ADMIN");
      if (!canViewUnpublished) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
    }

    // Check premium access control for published posts
    if (post.isPremium && post.isPublished) {
      // Only check premium access if user is present (dashboard route)
      if (user) {
        const userType = user.userData?.type || null;
        const isUserFree = userType === "FREE" || userType === null;
        const isAdmin = user.userData?.role === "ADMIN";
        const isAuthor = post.authorId === user.userData?.id;
        // Allow access for: premium users, admins, or the post author
        if (isUserFree && !isAdmin && !isAuthor) {
          return NextResponse.json(
            { error: "Premium subscription required to access this content" },
            { status: 403 }
          );
        }
      }
    }

    // Merge bookmark/favorite status into response if user is authenticated
    // This eliminates the need for a separate /status API call
    let interactionStatus = { isBookmarked: false, isFavorited: false };
    const userId = user?.userData?.id;

    if (userId) {
      const [bookmark, favorite] = await Promise.all([
        prisma.bookmark.findUnique({
          where: { userId_postId: { userId, postId: id } },
          select: { id: true },
        }),
        prisma.favorite.findUnique({
          where: { userId_postId: { userId, postId: id } },
          select: { id: true },
        }),
      ]);
      interactionStatus = {
        isBookmarked: !!bookmark,
        isFavorited: !!favorite,
      };
    }

    return NextResponse.json({
      ...post,
      ...interactionStatus,
      uploadPath: post.uploadPath && post.uploadFileType === "IMAGE"
        ? await getPublicUrl(post.uploadPath)
        : null,
      uploadVideo: post.uploadPath && post.uploadFileType === "VIDEO"
        ? await getPublicUrl(post.uploadPath)
        : null,
    });
  } catch (error) {
    console.error("Post API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch post" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteParams) {
  return handlePostRequest(request, context, false);
}

export async function HEAD(request: NextRequest, context: RouteParams) {
  return handlePostRequest(request, context, true);
}
