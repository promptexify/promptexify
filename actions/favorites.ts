"use server";

import { type FavoriteData, favoriteSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";

// Favorite actions
export async function toggleFavoriteAction(data: FavoriteData) {
  try {
    // Validate the input
    const validatedData = favoriteSchema.parse(data);

    // Get the current user
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      // Return authentication error instead of redirecting to prevent modal navigation issues
      return {
        success: false,
        error: "Authentication required. Please sign in.",
      };
    }
    const user = currentUser.userData;

    // Check if favorite already exists
    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId: validatedData.postId,
        },
      },
    });

    if (existingFavorite) {
      // Remove favorite
      await prisma.favorite.delete({
        where: {
          userId_postId: {
            userId: user.id,
            postId: validatedData.postId,
          },
        },
      });

      // Targeted cache invalidation — only favorite-relevant caches
      await revalidateCache([
        CACHE_TAGS.USER_FAVORITES,
        CACHE_TAGS.POST_BY_ID,
        CACHE_TAGS.POPULAR_POSTS,
      ]);
      return { success: true, favorited: false };
    } else {
      // Add favorite
      await prisma.favorite.create({
        data: {
          userId: user.id,
          postId: validatedData.postId,
        },
      });

      // Targeted cache invalidation — only favorite-relevant caches
      await revalidateCache([
        CACHE_TAGS.USER_FAVORITES,
        CACHE_TAGS.POST_BY_ID,
        CACHE_TAGS.POPULAR_POSTS,
      ]);
      return { success: true, favorited: true };
    }
  } catch (error) {
    // Check if this is a Next.js redirect (authentication redirect)
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (
        typeof errorDigest === "string" &&
        errorDigest.includes("NEXT_REDIRECT")
      ) {
        // This is an authentication redirect - re-throw it
        throw error;
      }
    }

    console.error("Error toggling favorite:", error);
    return { success: false, error: "Failed to toggle favorite" };
  }
}

export async function getUserFavoritesAction() {
  try {
    // Get the current user
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      // Return authentication error instead of redirecting
      return {
        success: false,
        error: "Authentication required. Please sign in.",
      };
    }
    const user = currentUser.userData;

    // Get user's favorites with post details
    const favorites = await prisma.favorite.findMany({
      where: {
        userId: user.id,
      },
      include: {
        post: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
            category: {
              include: {
                parent: true,
              },
            },
            tags: true,
            _count: {
              select: {
                bookmarks: true,
                favorites: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, favorites };
  } catch (error) {
    // Check if this is a Next.js redirect (authentication redirect)
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (
        typeof errorDigest === "string" &&
        errorDigest.includes("NEXT_REDIRECT")
      ) {
        // This is an authentication redirect - re-throw it
        throw error;
      }
    }

    console.error("Error fetching user favorites:", error);
    return { success: false, error: "Failed to fetch favorites" };
  }
}

export async function checkFavoriteStatusAction(postId: string) {
  try {
    // Get the current user
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      // Return authentication error instead of redirecting
      return {
        success: false,
        error: "Authentication required. Please sign in.",
      };
    }
    const user = currentUser.userData;

    // Check if post is favorited
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId: postId,
        },
      },
    });

    return { success: true, favorited: !!favorite };
  } catch (error) {
    // Check if this is a Next.js redirect (authentication redirect)
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (
        typeof errorDigest === "string" &&
        errorDigest.includes("NEXT_REDIRECT")
      ) {
        // This is an authentication redirect - re-throw it
        throw error;
      }
    }

    console.error("Error checking favorite status:", error);
    return { success: false, error: "Failed to check favorite status" };
  }
}
