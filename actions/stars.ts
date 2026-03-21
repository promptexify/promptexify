"use server";

import { type StarData, starSchema } from "@/lib/schemas";
import { db } from "@/lib/db";
import { stars as starsTable } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";
import { PostQueries } from "@/lib/query";

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

    // Batch-fetch all starred posts in 3 parallel queries instead of N×4 sequential queries.
    // All returned posts are starred by definition — no need to re-check per-post star status.
    const postIds = starRows.map((s) => s.postId);
    const postList = await PostQueries.getByIds(postIds);
    const postMap = new Map(postList.map((p) => [p.id, { ...p, isStarred: true as const }]));
    const starsWithPosts = starRows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      post: postMap.get(s.postId) ?? null,
    }));
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
      .select({ id: starsTable.id })
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
