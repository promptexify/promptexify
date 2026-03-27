"use server";

import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import type { BlogStatus } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";
import { withCSRFProtection } from "@/lib/security/csp";
import { sanitizeInput, sanitizeContent } from "@/lib/security/sanitize";
import {
  createBlogPostFormSchema,
  updateBlogPostFormSchema,
  blogBulkImportItemSchema,
} from "@/lib/schemas";
import { estimateReadingTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Error sanitization — only whitelisted messages are forwarded to the client;
// everything else is logged server-side and replaced with a generic fallback.
// ---------------------------------------------------------------------------

const SAFE_BLOG_MESSAGES = new Set([
  "Unauthorized: Admin access required",
  "Article not found",
  "Invalid article ID",
  "Invalid form data",
  "Unable to generate unique slug",
  "Maximum 50 articles per import",
]);

function toSafeBlogError(error: unknown, fallback: string): Error {
  if (error instanceof Error && SAFE_BLOG_MESSAGES.has(error.message)) {
    return error;
  }
  console.error("[BLOG_ACTION_ERROR]", error);
  return new Error(fallback);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (true) {
    const [existing] = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug))
      .limit(1);
    if (!existing || existing.id === excludeId) break;
    slug = `${base}-${counter++}`;
    if (counter > 1000) throw new Error("Unable to generate unique slug");
  }
  return slug;
}

function invalidateBlogCache() {
  revalidateCache([
    CACHE_TAGS.BLOG_POSTS,
    CACHE_TAGS.BLOG_POST_BY_SLUG,
    CACHE_TAGS.BLOG_POST_BY_ID,
    CACHE_TAGS.ANALYTICS,
  ]);
  revalidatePath("/blog");
  revalidatePath("/blog/[slug]", "page");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createBlogPostAction = withCSRFProtection(async (formData: FormData) => {
  const currentUser = await getCurrentUser();
  if (!currentUser?.userData) redirect("/signin");
  if (currentUser.userData.role !== "ADMIN") throw new Error("Unauthorized: Admin access required");

  const raw = Object.fromEntries(
    Array.from(formData.entries()).filter(([, v]) => typeof v === "string")
  );
  const parsed = createBlogPostFormSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid form data");
  }

  const { title: rawTitle, slug: rawSlug, excerpt: rawExcerpt, content: rawContent, featuredImageUrl, status } = parsed.data;

  const title   = sanitizeInput(rawTitle);
  const excerpt = rawExcerpt ? sanitizeInput(rawExcerpt) : null;
  const content = sanitizeContent(rawContent);

  const baseSlug = rawSlug || toSlug(title);
  const slug     = await ensureUniqueSlug(baseSlug);
  const readingTime = estimateReadingTime(content);
  const publishedAt = status === "PUBLISHED" ? new Date() : null;

  const [inserted] = await db
    .insert(blogPosts)
    .values({
      title,
      slug,
      excerpt,
      content,
      featuredImageUrl: featuredImageUrl ?? null,
      readingTime,
      authorId: currentUser.userData.id,
      status: status as BlogStatus,
      publishedAt,
    })
    .returning({ id: blogPosts.id });

  if (!inserted) throw new Error("Failed to create article");

  invalidateBlogCache();
  redirect("/blog/admin");
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateBlogPostAction = withCSRFProtection(async (formData: FormData) => {
  const currentUser = await getCurrentUser();
  if (!currentUser?.userData) redirect("/signin");
  if (currentUser.userData.role !== "ADMIN") throw new Error("Unauthorized: Admin access required");

  const raw = Object.fromEntries(
    Array.from(formData.entries()).filter(([, v]) => typeof v === "string")
  );
  const parsed = updateBlogPostFormSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid form data");
  }

  const { id, title: rawTitle, slug: rawSlug, excerpt: rawExcerpt, content: rawContent, featuredImageUrl, status } = parsed.data;

  const [existing] = await db.select({ id: blogPosts.id, status: blogPosts.status, publishedAt: blogPosts.publishedAt }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  if (!existing) throw new Error("Article not found");

  const title   = sanitizeInput(rawTitle);
  const excerpt = rawExcerpt ? sanitizeInput(rawExcerpt) : null;
  const content = sanitizeContent(rawContent);

  const baseSlug = rawSlug || toSlug(title);
  const slug     = await ensureUniqueSlug(baseSlug, id);
  const readingTime = estimateReadingTime(content);

  // Only set publishedAt the first time a post transitions to PUBLISHED
  const wasPublished = existing.status === "PUBLISHED";
  const publishedAt  = status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : null;

  await db
    .update(blogPosts)
    .set({ title, slug, excerpt, content, featuredImageUrl: featuredImageUrl ?? null, readingTime, status: status as BlogStatus, publishedAt, updatedAt: new Date() })
    .where(eq(blogPosts.id, id));

  invalidateBlogCache();
  void wasPublished; // suppress unused warning
  redirect("/blog/admin");
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

// CSRF: Protected by Next.js's built-in Server Action Origin header check.
// Accepts a plain string (not FormData) so cannot use withCSRFProtection().
// All call sites use startTransition — no raw fetch.
export async function deleteBlogPostAction(id: string) {
  try {
    if (!id || typeof id !== "string") throw new Error("Invalid article ID");

    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) redirect("/signin");
    if (currentUser.userData.role !== "ADMIN") throw new Error("Unauthorized: Admin access required");

    const [existing] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
    if (!existing) throw new Error("Article not found");

    await db.delete(blogPosts).where(eq(blogPosts.id, id));
    invalidateBlogCache();
    return { success: true };
  } catch (error) {
    throw toSafeBlogError(error, "Failed to delete article");
  }
}

// ---------------------------------------------------------------------------
// Toggle publish
// ---------------------------------------------------------------------------

// CSRF: Protected by Next.js's built-in Server Action Origin header check.
// Accepts a plain string (not FormData) so cannot use withCSRFProtection().
// All call sites use startTransition — no raw fetch.
export async function toggleBlogPublishAction(id: string) {
  try {
    if (!id || typeof id !== "string") throw new Error("Invalid article ID");

    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) redirect("/signin");
    if (currentUser.userData.role !== "ADMIN") throw new Error("Unauthorized: Admin access required");

    const [existing] = await db
      .select({ id: blogPosts.id, status: blogPosts.status, title: blogPosts.title, publishedAt: blogPosts.publishedAt })
      .from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
    if (!existing) throw new Error("Article not found");

    const newStatus: BlogStatus = existing.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    const publishedAt = newStatus === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : null;

    await db.update(blogPosts).set({ status: newStatus, publishedAt, updatedAt: new Date() }).where(eq(blogPosts.id, id));
    invalidateBlogCache();
    return { success: true, message: `"${existing.title}" ${newStatus === "PUBLISHED" ? "published" : "unpublished"}` };
  } catch (error) {
    throw toSafeBlogError(error, "Failed to update article status");
  }
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export type BlogBulkImportResult = {
  results: Array<{ index: number; title: string; success: boolean; error?: string }>;
  created: number;
  failed: number;
};

export const bulkImportBlogPostsAction = withCSRFProtection(
  async (formData: FormData): Promise<BlogBulkImportResult> => {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData || currentUser.userData.role !== "ADMIN") {
      throw new Error("Unauthorized: Admin access required");
    }

    const postsJson = formData.get("posts_json");
    if (typeof postsJson !== "string" || !postsJson.trim()) throw new Error("Missing posts_json field");

    let rawItems: unknown;
    try { rawItems = JSON.parse(postsJson); } catch { throw new Error("Invalid JSON payload"); }
    if (!Array.isArray(rawItems)) throw new Error("Expected a JSON array");
    if (rawItems.length === 0) throw new Error("Array is empty — nothing to import");
    if (rawItems.length > 50) throw new Error("Maximum 50 articles per import");

    const importResults: BlogBulkImportResult["results"] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const parsed = blogBulkImportItemSchema.safeParse(rawItems[i]);
      if (!parsed.success) {
        importResults.push({
          index: i,
          title: (rawItems[i] as Record<string, unknown>)?.title as string ?? `Item ${i + 1}`,
          success: false,
          error: parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
        });
        continue;
      }

      const item = parsed.data;
      try {
        const title   = sanitizeInput(item.title);
        const excerpt = item.excerpt ? sanitizeInput(item.excerpt) : null;
        const content = sanitizeContent(item.content);
        const baseSlug = item.slug || toSlug(title);
        const slug     = await ensureUniqueSlug(baseSlug);
        const readingTime = estimateReadingTime(content);
        const status: BlogStatus = item.status as BlogStatus;
        const publishedAt = status === "PUBLISHED" ? new Date() : null;

        await db.insert(blogPosts).values({
          title, slug, excerpt, content,
          featuredImageUrl: item.featuredImageUrl ?? null,
          readingTime, authorId: currentUser.userData.id,
          status, publishedAt,
        });

        importResults.push({ index: i, title: item.title, success: true });
      } catch (err) {
        importResults.push({
          index: i, title: item.title, success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    invalidateBlogCache();
    return {
      results: importResults,
      created: importResults.filter((r) => r.success).length,
      failed:  importResults.filter((r) => !r.success).length,
    };
  }
);
