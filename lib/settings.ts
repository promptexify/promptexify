import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { CACHE_DURATIONS, CACHE_TAGS, revalidateCache } from "@/lib/cache";

const SETTINGS_REVALIDATE = CACHE_DURATIONS.POSTS_LIST; // 600s — same order of magnitude as 5 min

// ---------------------------------------------------------------------------
// maxTagsPerPost
// ---------------------------------------------------------------------------

const _getMaxTagsPerPost = unstable_cache(
  async () => {
    const [row] = await db
      .select({ maxTagsPerPost: settings.maxTagsPerPost })
      .from(settings)
      .orderBy(desc(settings.updatedAt))
      .limit(1);
    return row?.maxTagsPerPost ?? 20;
  },
  ["settings-max-tags-per-post"],
  { revalidate: SETTINGS_REVALIDATE, tags: [CACHE_TAGS.POSTS] }
);

/**
 * Get the current "Max Tags Per Post" value from the Settings table.
 * Falls back to the default (20) when settings are missing.
 */
export async function getMaxTagsPerPost(): Promise<number> {
  return _getMaxTagsPerPost();
}

// ---------------------------------------------------------------------------
// allowUserPosts
// ---------------------------------------------------------------------------

const _getAllowUserPosts = unstable_cache(
  async () => {
    const [row] = await db
      .select({ allowUserPosts: settings.allowUserPosts })
      .from(settings)
      .orderBy(desc(settings.updatedAt))
      .limit(1);
    return row?.allowUserPosts ?? true;
  },
  ["settings-allow-user-posts"],
  { revalidate: SETTINGS_REVALIDATE, tags: [CACHE_TAGS.POSTS] }
);

/** Whether regular users are allowed to submit posts for approval. */
export async function getAllowUserPosts(): Promise<boolean> {
  return _getAllowUserPosts();
}

/** Call this after settings are saved so the next request re-reads from DB. */
export async function clearContentFlagsCache() {
  await revalidateCache(CACHE_TAGS.POSTS);
}
