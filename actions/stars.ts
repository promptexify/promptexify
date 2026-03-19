"use server";

import { type StarData, starSchema } from "@/lib/schemas";
import { db } from "@/lib/db";
import { stars as starsTable } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";
import { Queries } from "@/lib/query";

export async function toggleStarAction(data: StarData) {
  try {
    const validatedData = starSchema.parse(data);

    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      return {
        success: false,
        error: "Authentication required. Please sign in.",
      };
    }
    const user = currentUser.userData;

    const [existing] = await db
      .select()
      .from(starsTable)
      .where(and(eq(starsTable.userId, user.id), eq(starsTable.postId, validatedData.postId)))
      .limit(1);

    if (existing) {
      await db
        .delete(starsTable)
        .where(and(eq(starsTable.userId, user.id), eq(starsTable.postId, validatedData.postId)));

      await revalidateCache([CACHE_TAGS.USER_STARS, CACHE_TAGS.POST_BY_ID]);
      return { success: true, starred: false };
    } else {
      await db.insert(starsTable).values({
        userId: user.id,
        postId: validatedData.postId,
      });

      await revalidateCache([CACHE_TAGS.USER_STARS, CACHE_TAGS.POST_BY_ID]);
      return { success: true, starred: true };
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (typeof errorDigest === "string" && errorDigest.includes("NEXT_REDIRECT")) {
        throw error;
      }
    }
    console.error("Error toggling star:", error);
    return { success: false, error: "Failed to toggle star" };
  }
}

export async function getUserStarsAction() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      return {
        success: false,
        error: "Authentication required. Please sign in.",
      };
    }
    const user = currentUser.userData;

    const starRows = await db
      .select({ postId: starsTable.postId, id: starsTable.id, createdAt: starsTable.createdAt })
      .from(starsTable)
      .where(eq(starsTable.userId, user.id))
      .orderBy(desc(starsTable.createdAt));

    const starsWithPosts = await Promise.all(
      starRows.map(async (s) => {
        const post = await Queries.posts.getById(s.postId, user.id);
        return { id: s.id, createdAt: s.createdAt, post };
      })
    );
    return { success: true, stars: starsWithPosts };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (typeof errorDigest === "string" && errorDigest.includes("NEXT_REDIRECT")) {
        throw error;
      }
    }
    console.error("Error fetching user stars:", error);
    return { success: false, error: "Failed to fetch stars" };
  }
}

export async function checkStarStatusAction(postId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      return {
        success: false,
        error: "Authentication required. Please sign in.",
      };
    }
    const user = currentUser.userData;

    const [star] = await db
      .select()
      .from(starsTable)
      .where(and(eq(starsTable.userId, user.id), eq(starsTable.postId, postId)))
      .limit(1);
    return { success: true, starred: !!star };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (typeof errorDigest === "string" && errorDigest.includes("NEXT_REDIRECT")) {
        throw error;
      }
    }
    console.error("Error checking star status:", error);
    return { success: false, error: "Failed to check star status" };
  }
}
