import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// maxTagsPerPost
// ---------------------------------------------------------------------------
let cachedMaxTagsPerPost: number | null = null;
let maxTagsExpiry = 0;

/**
 * Get the current "Max Tags Per Post" value from the Settings table.
 * Falls back to the default (20) when settings are missing.
 */
export async function getMaxTagsPerPost(): Promise<number> {
  const now = Date.now();
  if (cachedMaxTagsPerPost !== null && now < maxTagsExpiry) {
    return cachedMaxTagsPerPost;
  }
  const [row] = await db
    .select({ maxTagsPerPost: settings.maxTagsPerPost })
    .from(settings)
    .orderBy(desc(settings.updatedAt))
    .limit(1);
  cachedMaxTagsPerPost = row?.maxTagsPerPost ?? 20;
  maxTagsExpiry = now + CACHE_DURATION_MS;
  return cachedMaxTagsPerPost;
}

// ---------------------------------------------------------------------------
// allowUserPosts / allowUserUploads
// ---------------------------------------------------------------------------
interface ContentFlags {
  allowUserPosts: boolean;
  allowUserUploads: boolean;
}

let cachedContentFlags: ContentFlags | null = null;
let contentFlagsExpiry = 0;

async function getContentFlags(): Promise<ContentFlags> {
  const now = Date.now();
  if (cachedContentFlags !== null && now < contentFlagsExpiry) {
    return cachedContentFlags;
  }
  const [row] = await db
    .select({
      allowUserPosts: settings.allowUserPosts,
      allowUserUploads: settings.allowUserUploads,
    })
    .from(settings)
    .orderBy(desc(settings.updatedAt))
    .limit(1);
  cachedContentFlags = {
    allowUserPosts: row?.allowUserPosts ?? true,
    allowUserUploads: row?.allowUserUploads ?? true,
  };
  contentFlagsExpiry = now + CACHE_DURATION_MS;
  return cachedContentFlags;
}

/** Whether regular users are allowed to submit posts for approval. */
export async function getAllowUserPosts(): Promise<boolean> {
  return (await getContentFlags()).allowUserPosts;
}

/** Whether regular users are allowed to upload images/videos with their posts. */
export async function getAllowUserUploads(): Promise<boolean> {
  return (await getContentFlags()).allowUserUploads;
}

/** Call this after settings are saved so the next request re-reads from DB. */
export function clearContentFlagsCache() {
  cachedContentFlags = null;
  contentFlagsExpiry = 0;
  cachedMaxTagsPerPost = null;
  maxTagsExpiry = 0;
}
