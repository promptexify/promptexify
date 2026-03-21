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

// ---------------------------------------------------------------------------
// postsPageSize
// ---------------------------------------------------------------------------

const _getPostsPageSize = unstable_cache(
  async () => {
    const [row] = await db
      .select({ postsPageSize: settings.postsPageSize })
      .from(settings)
      .orderBy(desc(settings.updatedAt))
      .limit(1);
    return row?.postsPageSize ?? 12;
  },
  ["settings-posts-page-size"],
  { revalidate: SETTINGS_REVALIDATE, tags: [CACHE_TAGS.POSTS] }
);

/** Get the current posts page size. Falls back to 12 when settings are missing. */
export async function getPostsPageSize(): Promise<number> {
  return _getPostsPageSize();
}

// ---------------------------------------------------------------------------
// featuredPostsLimit
// ---------------------------------------------------------------------------

const _getFeaturedPostsLimit = unstable_cache(
  async () => {
    const [row] = await db
      .select({ featuredPostsLimit: settings.featuredPostsLimit })
      .from(settings)
      .orderBy(desc(settings.updatedAt))
      .limit(1);
    return row?.featuredPostsLimit ?? 12;
  },
  ["settings-featured-posts-limit"],
  { revalidate: SETTINGS_REVALIDATE, tags: [CACHE_TAGS.POSTS] }
);

/** Get the current featured posts limit. Falls back to 12 when settings are missing. */
export async function getFeaturedPostsLimit(): Promise<number> {
  return _getFeaturedPostsLimit();
}

/** Call this after settings are saved so the next request re-reads from DB. */
export async function clearContentFlagsCache() {
  await revalidateCache(CACHE_TAGS.POSTS);
}
