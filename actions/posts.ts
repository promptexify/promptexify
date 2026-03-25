"use server";

import { db } from "@/lib/db";
import {
  posts,
  categories,
  tags,
  postToTag,
} from "@/lib/db/schema";
import type { PostStatus } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";
import { withCSRFProtection } from "@/lib/security/csp";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { headers } from "next/headers";
import { getAllowUserPosts } from "@/lib/settings";

import {
  sanitizeInput,
  sanitizeContent,
  sanitizeTagSlug,
} from "@/lib/security/sanitize";
import {
  createPostFormSchema,
  updatePostFormSchema,
  postBulkImportItemSchema,
} from "@/lib/schemas";
import { getMaxTagsPerPost } from "@/lib/settings";

// User-facing messages that are safe to surface verbatim.
// Everything else gets logged server-side and replaced with a generic message.
const SAFE_ACTION_MESSAGES = new Set([
  "CAPTCHA verification failed. Please try again.",
  "User submissions are currently disabled.",
  "Invalid form data",
  "Invalid category",
  "Unable to generate unique slug",
  "Post not found",
  "Post is not pending approval",
  "Only posts pending approval can be rejected",
  "Unauthorized: Admin access required",
  "Unauthorized: You can only edit your own posts",
  "Unauthorized: You can only delete your own posts",
  "Cannot edit approved posts. Please contact support for further assistance.",
  "Cannot edit rejected posts. Please contact support or create a new post.",
  "Cannot delete approved posts. Once your content has been approved by an admin, it cannot be deleted.",
  "Cannot delete rejected posts. Once your content has been rejected by an admin, it cannot be deleted.",
  "Unauthorized: Invalid user role",
  "A post with this title already exists. Please choose a different title.",
]);

function toSafeError(error: unknown, fallback: string): Error {
  if (error instanceof Error && SAFE_ACTION_MESSAGES.has(error.message)) {
    return error;
  }
  // Log the real error server-side but never expose internal details to clients
  console.error("[ACTION_ERROR]", error);
  return new Error(fallback);
}

// Post management actions
export const createPostAction = withCSRFProtection(
  async (formData: FormData) => {
    try {
      // Verify Turnstile CAPTCHA
      const hdrs = await headers();
      const ip =
        hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        hdrs.get("x-real-ip") ||
        undefined;
      const turnstileToken = formData.get("cf-turnstile-response") as string;
      if (!await verifyTurnstile(turnstileToken, ip)) {
        return { error: "CAPTCHA verification failed. Please try again." };
      }

      // Get the current user
      const currentUser = await getCurrentUser();
      if (!currentUser?.userData) {
        redirect("/signin");
      }
      const user = currentUser.userData;

      // Check if user has permission to create posts (both USER and ADMIN can create)
      if (user.role !== "ADMIN" && user.role !== "USER") {
        throw new Error("Unauthorized: Only registered users can create posts");
      }

      // Enforce the kill switch for non-admin users
      if (user.role !== "ADMIN") {
        const userPostsAllowed = await getAllowUserPosts();
        if (!userPostsAllowed) {
          throw new Error("User submissions are currently disabled.");
        }
      }

      // Parse and validate FormData with Zod — strips File objects, coerces
      // empty strings to null, "on" checkboxes to booleans, etc.
      const raw = Object.fromEntries(
        Array.from(formData.entries()).filter(([, v]) => typeof v === "string")
      );
      const parsed = createPostFormSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(parsed.error.errors[0]?.message ?? "Invalid form data");
      }

      const {
        title: rawTitle,
        slug: rawSlug,
        description: rawDescription,
        content: rawContent,
        category,
        subcategory,
        tags: tagNames,
        isPublished: formIsPublished,
        isPremium,
      } = parsed.data;

      // Sanitize free-text fields after schema validation
      const title = sanitizeInput(rawTitle);
      const description = rawDescription ? sanitizeInput(rawDescription) : null;
      const content = sanitizeContent(rawContent);

      // Generate slug if not provided
      const baseSlug =
        rawSlug ||
        title
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "");

      // Ensure slug uniqueness
      let slug = baseSlug;
      let counter = 1;
      
      while (true) {
        const [existingPost] = await db
          .select({ id: posts.id })
          .from(posts)
          .where(eq(posts.slug, slug))
          .limit(1);
        if (!existingPost) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
        if (counter > 1000) throw new Error("Unable to generate unique slug");
      }

      let isPublished = false;
      let status: PostStatus = "DRAFT";

      if (user.role === "ADMIN") {
        isPublished = formIsPublished;
        status = isPublished ? "APPROVED" : "DRAFT";
      } else {
        isPublished = false;
        status = "PENDING_APPROVAL";
      }

      // Get category ID — subcategory takes priority when present
      const selectedCategorySlug = subcategory ?? category;
      const [categoryRecord] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, selectedCategorySlug))
        .limit(1);
      if (!categoryRecord) throw new Error("Invalid category");

      const sanitizedTagNames = tagNames.map((t) => sanitizeInput(t)).filter(Boolean);
      const maxTagsPerPost = await (
        await import("@/lib/settings")
      ).getMaxTagsPerPost();
      if (sanitizedTagNames.length > maxTagsPerPost) {
        throw new Error(`A post may only have up to ${maxTagsPerPost} tags`);
      }

      const { newPost } = await db.transaction(async (tx) => {
        const tagIds: string[] = [];
        for (const tagName of sanitizedTagNames) {
          const tagSlug = sanitizeTagSlug(tagName);
          if (!tagSlug) continue;
          const [row] = await tx
            .insert(tags)
            .values({ name: tagName, slug: tagSlug })
            .onConflictDoUpdate({
              target: tags.slug,
              set: { name: tagName, updatedAt: new Date() },
            })
            .returning({ id: tags.id });
          if (row) tagIds.push(row.id);
        }

        const [inserted] = await tx
          .insert(posts)
          .values({
            title,
            slug,
            description: description || null,
            content,
            isPremium,
            isPublished,
            status,
            authorId: user.id,
            categoryId: categoryRecord.id,
          })
          .returning();
        if (!inserted) throw new Error("Failed to create post");

        const uniqueTagIds = [...new Set(tagIds)];
        if (uniqueTagIds.length > 0) {
          await tx.insert(postToTag).values(
            uniqueTagIds.map((B) => ({ A: inserted.id, B }))
          );
        }
        return { newPost: inserted };
      });

      // Revalidate cache tags for new post and tags (since tags may have been created)
      revalidateCache([
        CACHE_TAGS.POSTS,
        CACHE_TAGS.POST_BY_SLUG,
        CACHE_TAGS.POST_BY_ID,
        CACHE_TAGS.CATEGORIES,
        CACHE_TAGS.TAGS, // Important: Invalidate tags cache when new tags are created
        CACHE_TAGS.SEARCH_RESULTS,
        CACHE_TAGS.USER_POSTS, // Important: Invalidate user posts cache
        CACHE_TAGS.ANALYTICS, // Important: Invalidate analytics for dashboard stats
      ]);

      revalidatePath("/posts");
      redirect("/posts");
    } catch (error) {
      // Check if this is a Next.js redirect
      if (error && typeof error === "object" && "digest" in error) {
        const errorDigest = (error as { digest?: string }).digest;
        if (
          typeof errorDigest === "string" &&
          errorDigest.includes("NEXT_REDIRECT")
        ) {
          // This is a redirect - re-throw it to allow the redirect to proceed
          throw error;
        }
      }

      console.error("Error creating post:", error);

      // Handle specific database errors
      if (error && typeof error === "object" && "code" in error) {
        const dbError = error as { code: string; meta?: unknown };
        if (dbError.code === "P2002") {
          throw new Error("A post with this title already exists. Please choose a different title.");
        }
      }

      // Re-throw known Error instances (they already have user-friendly messages)
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Failed to create post");
    }
  }
);

// Update post action
export const updatePostAction = withCSRFProtection(
  async (formData: FormData) => {
    try {
      // Verify Turnstile CAPTCHA
      const hdrs = await headers();
      const ip =
        hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        hdrs.get("x-real-ip") ||
        undefined;
      const turnstileToken = formData.get("cf-turnstile-response") as string;
      if (!await verifyTurnstile(turnstileToken, ip)) {
        return { error: "CAPTCHA verification failed. Please try again." };
      }

      // Get the current user
      const currentUser = await getCurrentUser();
      if (!currentUser?.userData) {
        redirect("/signin");
      }
      const user = currentUser.userData;

      // Parse and validate FormData with Zod
      const raw = Object.fromEntries(
        Array.from(formData.entries()).filter(([, v]) => typeof v === "string")
      );
      const parsed = updatePostFormSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(parsed.error.errors[0]?.message ?? "Invalid form data");
      }

      const {
        id,
        title: rawTitle,
        slug: rawSlug,
        description: rawDescription,
        content: rawContent,
        category,
        subcategory,
        tags: tagNamesUpdate,
        isPublished: formIsPublished,
        isPremium,
      } = parsed.data;

      const title = sanitizeInput(rawTitle);
      const description = rawDescription ? sanitizeInput(rawDescription) : null;
      const content = sanitizeContent(rawContent);

      // Generate slug if not provided and ensure uniqueness
      const baseSlug =
        rawSlug ||
        title
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "");

      // Ensure slug uniqueness (excluding current post)
      let slug = baseSlug;
      let counter = 1;
      
      while (true) {
        const [existingBySlug] = await db
          .select({ id: posts.id })
          .from(posts)
          .where(eq(posts.slug, slug))
          .limit(1);
        const conflict = existingBySlug && existingBySlug.id !== id;
        if (!conflict) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
        if (counter > 1000) throw new Error("Unable to generate unique slug");
      }

      const [existingPost] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);
      if (!existingPost) throw new Error("Post not found");

      // Check user permissions
      if (user.role === "ADMIN") {
        // Admin can edit any post
      } else if (user.role === "USER") {
        // Users can only edit their own posts that haven't been approved yet
        if (existingPost.authorId !== user.id) {
          throw new Error("Unauthorized: You can only edit your own posts");
        }
        // Disable editing once post has been approved or rejected by admin
        if (existingPost.status === "APPROVED") {
          throw new Error(
            "Cannot edit approved posts. Please contact support for further assistance."
          );
        }
        if (existingPost.status === "REJECTED") {
          throw new Error(
            "Cannot edit rejected posts. Please contact support or create a new post."
          );
        }
      } else {
        throw new Error("Unauthorized: Invalid user role");
      }

      let isPublished = existingPost.isPublished;
      let status: PostStatus = existingPost.status as PostStatus;

      if (user.role === "ADMIN") {
        isPublished = formIsPublished;
        status = isPublished ? "APPROVED" : "DRAFT";
      } else {
        isPublished = false;
        status = "PENDING_APPROVAL";
      }

      const selectedCategorySlug = subcategory ?? category;
      const [categoryRecord] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, selectedCategorySlug))
        .limit(1);

      if (!categoryRecord) {
        throw new Error("Invalid category");
      }

      const newTagNames = tagNamesUpdate.map((t) => sanitizeInput(t)).filter(Boolean);
      const maxTagsPerPostUpdate = await (
        await import("@/lib/settings")
      ).getMaxTagsPerPost();
      if (newTagNames.length > maxTagsPerPostUpdate) {
        throw new Error(
          `A post may only have up to ${maxTagsPerPostUpdate} tags`
        );
      }

      const tagIds: string[] = [];
      for (const tagName of newTagNames) {
        const tagSlug = sanitizeTagSlug(tagName);
        if (!tagSlug) continue;
        const [row] = await db
          .insert(tags)
          .values({ name: tagName, slug: tagSlug })
          .onConflictDoUpdate({
            target: tags.slug,
            set: { name: tagName, updatedAt: new Date() },
          })
          .returning({ id: tags.id });
        if (row) tagIds.push(row.id);
      }

      await db.transaction(async (tx) => {
        await tx.delete(postToTag).where(eq(postToTag.A, id));
        if (tagIds.length > 0) {
          await tx.insert(postToTag).values(tagIds.map((B) => ({ A: id, B })));
        }
      });

      await db
        .update(posts)
        .set({
          title,
          slug,
          description: description ?? null,
          content,
          isPremium,
          isPublished,
          status,
          categoryId: categoryRecord.id,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, id));

      revalidatePath("/posts");
      // Removed entry path revalidation to prevent modal performance issues
      // Ensure caches are also invalidated to reflect new status
      revalidateCache([
        CACHE_TAGS.POSTS,
        CACHE_TAGS.POST_BY_ID,
        CACHE_TAGS.POST_BY_SLUG,
        CACHE_TAGS.CATEGORIES,
        CACHE_TAGS.TAGS,
        CACHE_TAGS.SEARCH_RESULTS,
        CACHE_TAGS.USER_POSTS,
        CACHE_TAGS.ANALYTICS,
      ]);

      redirect("/posts");
    } catch (error) {
      // Check if this is a Next.js redirect
      if (error && typeof error === "object" && "digest" in error) {
        const errorDigest = (error as { digest?: string }).digest;
        if (
          typeof errorDigest === "string" &&
          errorDigest.includes("NEXT_REDIRECT")
        ) {
          // This is a redirect - re-throw it to allow the redirect to proceed
          throw error;
        }
      }

      console.error("Error updating post:", error);

      // Handle specific database errors
      if (error && typeof error === "object" && "code" in error) {
        const dbError = error as { code: string; meta?: unknown };
        if (dbError.code === "P2002") {
          throw new Error("A post with this title already exists. Please choose a different title.");
        }
      }

      // Re-throw known Error instances (they already have user-friendly messages)
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Failed to update post");
    }
  }
);

// Approve post action
// CSRF: Protected by Next.js's built-in Server Action Origin header check.
// The framework rejects any Server Action RPC whose Origin doesn't match this
// deployment. This action accepts a plain string (not FormData) so it cannot
// use withCSRFProtection(). All call sites use startTransition — no raw fetch.
export async function approvePostAction(postId: string) {
  try {
    // Get the current user
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      redirect("/signin");
    }

    // Check admin permission
    if (currentUser.userData.role !== "ADMIN") {
      throw new Error("Unauthorized: Admin access required");
    }

    // Validate post ID
    if (!postId || typeof postId !== "string") {
      throw new Error("Invalid post ID");
    }

    const [existingPost] = await db
      .select({ id: posts.id, status: posts.status, title: posts.title })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existingPost) throw new Error("Post not found");
    if (existingPost.status !== "PENDING_APPROVAL") {
      throw new Error("Post is not pending approval");
    }

    await db
      .update(posts)
      .set({
        isPublished: true,
        status: "APPROVED",
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    // Revalidate relevant paths and caches
    revalidatePath("/posts");
    // Removed entry path revalidation to prevent modal performance issues
    // Ensure caches are also invalidated to reflect new status
    revalidateCache([
      CACHE_TAGS.POSTS,
      CACHE_TAGS.POST_BY_ID,
      CACHE_TAGS.POST_BY_SLUG,
      CACHE_TAGS.CATEGORIES,
      CACHE_TAGS.TAGS,
      CACHE_TAGS.SEARCH_RESULTS,
      CACHE_TAGS.USER_POSTS,
      CACHE_TAGS.ANALYTICS,
    ]);

    return {
      success: true,
      message: `Post "${existingPost.title}" approved and published successfully`,
    };
  } catch (error) {
    throw toSafeError(error, "Failed to approve post");
  }
}

// Reject post action
// CSRF: see approvePostAction comment above — same protection basis applies.
export async function rejectPostAction(postId: string) {
  try {
    // Ensure we have an authenticated user
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      redirect("/signin");
    }

    // Only admins can reject posts
    if (currentUser.userData.role !== "ADMIN") {
      throw new Error("Unauthorized: Admin access required");
    }

    if (!postId || typeof postId !== "string") {
      throw new Error("Invalid post ID");
    }

    const [existingPost] = await db
      .select({ id: posts.id, status: posts.status, title: posts.title })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existingPost) throw new Error("Post not found");
    if (existingPost.status !== "PENDING_APPROVAL") {
      throw new Error("Only posts pending approval can be rejected");
    }

    await db
      .update(posts)
      .set({
        isPublished: false,
        status: "REJECTED",
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    // Revalidate relevant caches
    revalidatePath("/posts");
    // Removed entry path revalidations to prevent modal performance issues
    revalidateCache([
      CACHE_TAGS.POSTS,
      CACHE_TAGS.POST_BY_ID,
      CACHE_TAGS.POST_BY_SLUG,
      CACHE_TAGS.CATEGORIES,
      CACHE_TAGS.TAGS,
      CACHE_TAGS.SEARCH_RESULTS,
      CACHE_TAGS.USER_POSTS,
      CACHE_TAGS.ANALYTICS,
    ]);

    return {
      success: true,
      message: `Post "${existingPost.title}" rejected successfully`,
    } as const;
  } catch (error) {
    throw toSafeError(error, "Failed to reject post");
  }
}

// Delete post action
// CSRF: see approvePostAction comment above — same protection basis applies.
export async function deletePostAction(postId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      redirect("/signin");
    }

    const user = currentUser.userData;

    if (!postId || typeof postId !== "string") {
      throw new Error("Invalid post ID");
    }

    const [existingPost] = await db
      .select({
        id: posts.id,
        title: posts.title,
        authorId: posts.authorId,
        isPublished: posts.isPublished,
        status: posts.status,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    if (!existingPost) throw new Error("Post not found");

    // Check user permissions
    if (user.role === "ADMIN") {
      // Admin can delete any post
    } else if (user.role === "USER") {
      // Users can only delete their own posts that haven't been approved yet
      if (existingPost.authorId !== user.id) {
        throw new Error("Unauthorized: You can only delete your own posts");
      }
      // Disable deletion once post has been approved or rejected by admin
      if (existingPost.status === "APPROVED") {
        throw new Error(
          "Cannot delete approved posts. Once your content has been approved by an admin, it cannot be deleted."
        );
      }
      if (existingPost.status === "REJECTED") {
        throw new Error(
          "Cannot delete rejected posts. Once your content has been rejected by an admin, it cannot be deleted."
        );
      }
    } else {
      throw new Error("Unauthorized: Invalid user role");
    }

    await db.delete(posts).where(eq(posts.id, postId));

    revalidatePath("/posts");
    revalidatePath("/");
    revalidatePath("/directory");
    // Removed entry path revalidation to prevent modal performance issues
    revalidateCache([
      CACHE_TAGS.POSTS,
      CACHE_TAGS.POST_BY_ID,
      CACHE_TAGS.POST_BY_SLUG,
      CACHE_TAGS.CATEGORIES,
      CACHE_TAGS.TAGS,
      CACHE_TAGS.SEARCH_RESULTS,
      CACHE_TAGS.USER_POSTS,
      CACHE_TAGS.ANALYTICS,
    ]);

    return {
      success: true,
      message: `Post "${existingPost.title}" deleted successfully`,
    };
  } catch (error) {
    throw toSafeError(error, "Failed to delete post");
  }
}

// Toggle post publish action
// CSRF: see approvePostAction comment above — same protection basis applies.
export async function togglePostPublishAction(postId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      redirect("/signin");
    }

    // Only admins can publish/unpublish posts
    if (currentUser.userData.role !== "ADMIN") {
      throw new Error("Unauthorized: Admin access required");
    }

    if (!postId || typeof postId !== "string") {
      throw new Error("Invalid post ID");
    }

    const [existingPost] = await db
      .select({ id: posts.id, isPublished: posts.isPublished, title: posts.title })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existingPost) throw new Error("Post not found");

    const newPublishedState = !existingPost.isPublished;
    const newStatus = newPublishedState ? "APPROVED" : "DRAFT";

    await db
      .update(posts)
      .set({
        isPublished: newPublishedState,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    revalidatePath("/posts");
    revalidatePath("/");

    revalidateCache([
      CACHE_TAGS.POSTS,
      CACHE_TAGS.POST_BY_ID,
      CACHE_TAGS.POST_BY_SLUG,
      CACHE_TAGS.CATEGORIES,
      CACHE_TAGS.TAGS,
      CACHE_TAGS.SEARCH_RESULTS,
      CACHE_TAGS.USER_POSTS,
      CACHE_TAGS.ANALYTICS,
    ]);

    return {
      success: true,
      message: `Post ${
        existingPost.isPublished ? "unpublished" : "published"
      } successfully`,
    };
  } catch (error) {
    throw toSafeError(error, "Failed to update post status");
  }
}

// Toggle post featured action
// CSRF: see approvePostAction comment above — same protection basis applies.
export async function togglePostFeaturedAction(postId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      redirect("/signin");
    }

    if (currentUser.userData.role !== "ADMIN") {
      throw new Error("Unauthorized: Admin access required");
    }

    if (!postId || typeof postId !== "string") {
      throw new Error("Invalid post ID");
    }

    const [existingPost] = await db
      .select({ id: posts.id, isFeatured: posts.isFeatured, title: posts.title })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existingPost) throw new Error("Post not found");

    const newFeaturedState = !existingPost.isFeatured;

    await db
      .update(posts)
      .set({ isFeatured: newFeaturedState, updatedAt: new Date() })
      .where(eq(posts.id, postId));

    revalidatePath("/posts");
    // Removed entry path revalidations to prevent modal performance issues
    revalidatePath("/");
    revalidateCache([
      CACHE_TAGS.POSTS,
      CACHE_TAGS.POST_BY_ID,
      CACHE_TAGS.POST_BY_SLUG,
      CACHE_TAGS.CATEGORIES,
      CACHE_TAGS.TAGS,
      CACHE_TAGS.SEARCH_RESULTS,
      CACHE_TAGS.USER_POSTS,
      CACHE_TAGS.ANALYTICS,
    ]);

    return {
      success: true,
      message: `Post ${
        existingPost.isFeatured ? "unfeatured" : "featured"
      } successfully`,
    };
  } catch (error) {
    throw toSafeError(error, "Failed to update post featured status");
  }
}

// ---------------------------------------------------------------------------
// Bulk import action — admin only, no Turnstile (admins are authenticated).
// Accepts a JSON string in formData["posts_json"] containing an array of post
// objects. Each item is validated server-side with postBulkImportItemSchema.
// Items with a missing/invalid category are skipped and reported as failures.
// All posts are created as DRAFT — admin reviews and publishes after import.
// ---------------------------------------------------------------------------
export type BulkImportResult = {
  results: Array<{
    index: number;
    title: string;
    success: boolean;
    error?: string;
  }>;
  created: number;
  failed: number;
};

export const bulkImportPostsAction = withCSRFProtection(
  async (formData: FormData): Promise<BulkImportResult> => {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData || currentUser.userData.role !== "ADMIN") {
      throw new Error("Unauthorized: Admin access required");
    }
    const user = currentUser.userData;

    // Parse JSON payload
    const postsJson = formData.get("posts_json");
    if (typeof postsJson !== "string" || !postsJson.trim()) {
      throw new Error("Missing posts_json field");
    }

    let rawItems: unknown;
    try {
      rawItems = JSON.parse(postsJson);
    } catch {
      throw new Error("Invalid JSON payload");
    }
    if (!Array.isArray(rawItems)) {
      throw new Error("Expected a JSON array of posts");
    }
    if (rawItems.length === 0) {
      throw new Error("Array is empty — nothing to import");
    }
    if (rawItems.length > 50) {
      throw new Error("Maximum 50 posts per import");
    }

    const maxTagsPerPost = await getMaxTagsPerPost();
    const importResults: BulkImportResult["results"] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const parsed = postBulkImportItemSchema.safeParse(rawItems[i]);
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
        const title = sanitizeInput(item.title);
        const description = item.description ? sanitizeInput(item.description) : null;
        const content = sanitizeContent(item.content);

        // Slug with uniqueness guarantee
        const baseSlug =
          item.slug ||
          title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const [existing] = await db
            .select({ id: posts.id })
            .from(posts)
            .where(eq(posts.slug, slug))
            .limit(1);
          if (!existing) break;
          slug = `${baseSlug}-${counter++}`;
          if (counter > 1000) throw new Error("Unable to generate unique slug");
        }

        // Category lookup
        const [categoryRecord] = await db
          .select()
          .from(categories)
          .where(eq(categories.slug, item.category))
          .limit(1);
        if (!categoryRecord) {
          throw new Error(`Category "${item.category}" not found`);
        }

        // Tags
        const sanitizedTagNames = (item.tags ?? [])
          .map((t) => sanitizeInput(t))
          .filter(Boolean);
        if (sanitizedTagNames.length > maxTagsPerPost) {
          throw new Error(`Exceeds max tags per post (${maxTagsPerPost})`);
        }

        await db.transaction(async (tx) => {
          const tagIds: string[] = [];
          for (const tagName of sanitizedTagNames) {
            const tagSlug = sanitizeTagSlug(tagName);
            if (!tagSlug) continue;
            const [row] = await tx
              .insert(tags)
              .values({ name: tagName, slug: tagSlug })
              .onConflictDoUpdate({
                target: tags.slug,
                set: { name: tagName, updatedAt: new Date() },
              })
              .returning({ id: tags.id });
            if (row) tagIds.push(row.id);
          }

          const [inserted] = await tx
            .insert(posts)
            .values({
              title,
              slug,
              description,
              content,
              isPremium: false,
              isPublished: false,
              status: "DRAFT" as PostStatus,
              authorId: user.id,
              categoryId: categoryRecord.id,
            })
            .returning();
          if (!inserted) throw new Error("Database insert failed");

          const uniqueTagIds = [...new Set(tagIds)];
          if (uniqueTagIds.length > 0) {
            await tx
              .insert(postToTag)
              .values(uniqueTagIds.map((B) => ({ A: inserted.id, B })));
          }
        });

        importResults.push({ index: i, title: item.title, success: true });
      } catch (err) {
        importResults.push({
          index: i,
          title: item.title,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Revalidate once after all items are processed
    revalidateCache([
      CACHE_TAGS.POSTS,
      CACHE_TAGS.POST_BY_SLUG,
      CACHE_TAGS.POST_BY_ID,
      CACHE_TAGS.CATEGORIES,
      CACHE_TAGS.TAGS,
      CACHE_TAGS.SEARCH_RESULTS,
      CACHE_TAGS.USER_POSTS,
      CACHE_TAGS.ANALYTICS,
    ]);
    revalidatePath("/posts");

    return {
      results: importResults,
      created: importResults.filter((r) => r.success).length,
      failed: importResults.filter((r) => !r.success).length,
    };
  }
);
