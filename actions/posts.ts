"use server";

import { db } from "@/lib/db";
import {
  posts,
  categories,
  tags,
  postToTag,
  media,
} from "@/lib/db/schema";
import type { PostStatus } from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { handleAuthRedirect } from "./auth";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";
import { withCSRFProtection } from "@/lib/security/csp";
import { getAllowUserPosts, getAllowUserUploads } from "@/lib/settings";

import {
  sanitizeInput,
  sanitizeContent,
  sanitizeTagSlug,
} from "@/lib/security/sanitize";
import { createPostFormSchema, updatePostFormSchema } from "@/lib/schemas";

// Post management actions
export const createPostAction = withCSRFProtection(
  async (formData: FormData) => {
    try {
      // Get the current user
      const currentUser = await getCurrentUser();
      if (!currentUser?.userData) {
        handleAuthRedirect();
      }
      const user = currentUser.userData;

      // Check if user has permission to create posts (both USER and ADMIN can create)
      if (user.role !== "ADMIN" && user.role !== "USER") {
        throw new Error("Unauthorized: Only registered users can create posts");
      }

      // Enforce the kill switch for non-admin users
      if (user.role !== "ADMIN") {
        const [userPostsAllowed, userUploadsAllowed] = await Promise.all([
          getAllowUserPosts(),
          getAllowUserUploads(),
        ]);
        if (!userPostsAllowed) {
          throw new Error("User submissions are currently disabled.");
        }
        // Strip upload fields if user uploads are disabled
        if (!userUploadsAllowed) {
          formData.delete("uploadPath");
          formData.delete("uploadFileType");
          formData.delete("uploadMediaId");
          formData.delete("previewPath");
          formData.delete("previewVideoPath");
          formData.delete("blurData");
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
        uploadPath,
        uploadFileType,
        uploadMediaId,
        previewPath,
        previewVideoPath,
        blurData,
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
            uploadPath: uploadPath || null,
            uploadFileType: uploadFileType || null,
            previewPath: previewPath || null,
            previewVideoPath: previewVideoPath || null,
            blurData: blurData || null,
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

      const mediaIds = uploadMediaId ? [uploadMediaId] : [];
      if (mediaIds.length > 0) {
        await db
          .update(media)
          .set({ postId: newPost.id })
          .where(and(inArray(media.id, mediaIds), isNull(media.postId)));
      }

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
      // Get the current user
      const currentUser = await getCurrentUser();
      if (!currentUser?.userData) {
        handleAuthRedirect();
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
        uploadPath,
        uploadFileType,
        uploadMediaId,
        previewPath,
        previewVideoPath,
        blurData,
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

      const [postRow] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);
      if (!postRow) throw new Error("Post not found");
      const mediaRows = await db
        .select({ id: media.id })
        .from(media)
        .where(eq(media.postId, id));
      const existingPost = { ...postRow, media: mediaRows };

      if (!existingPost) {
        throw new Error("Post not found");
      }

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

      // Prepare media updates
      const newMediaIds = uploadMediaId ? [uploadMediaId] : [];
      const oldMediaIds = existingPost.media.map((m) => m.id);

      // IDs of media to be disassociated from the post
      const mediaToUnlink = oldMediaIds.filter(
        (id) => !newMediaIds.includes(id)
      );

      // IDs of media to be newly associated with the post
      const mediaToLink = newMediaIds.filter((id) => !oldMediaIds.includes(id));

      if (mediaToUnlink.length > 0) {
        await db
          .update(media)
          .set({ postId: null })
          .where(and(inArray(media.id, mediaToUnlink), eq(media.postId, existingPost.id)));
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
          uploadPath: uploadPath || null,
          uploadFileType: uploadFileType || null,
          previewPath: previewPath || null,
          previewVideoPath: previewVideoPath || null,
          blurData: blurData || null,
          isPremium,
          isPublished,
          status,
          categoryId: categoryRecord.id,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, id));

      if (mediaToLink.length > 0) {
        await db
          .update(media)
          .set({ postId: id })
          .where(and(inArray(media.id, mediaToLink), isNull(media.postId)));
      }


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
export async function approvePostAction(postId: string) {
  try {
    // Get the current user
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      handleAuthRedirect();
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
    console.error("Error approving post:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to approve post"
    );
  }
}

// Reject post action
export async function rejectPostAction(postId: string) {
  try {
    // Ensure we have an authenticated user
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      handleAuthRedirect();
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
    console.error("Error rejecting post:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to reject post"
    );
  }
}

// Delete post action
export async function deletePostAction(postId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      handleAuthRedirect();
    }

    const user = currentUser.userData;

    if (!postId || typeof postId !== "string") {
      throw new Error("Invalid post ID");
    }

    const [postRow] = await db
      .select({
        id: posts.id,
        title: posts.title,
        authorId: posts.authorId,
        isPublished: posts.isPublished,
        status: posts.status,
        uploadPath: posts.uploadPath,
        uploadFileType: posts.uploadFileType,
        previewPath: posts.previewPath,
        previewVideoPath: posts.previewVideoPath,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    if (!postRow) throw new Error("Post not found");

    const mediaRows = await db
      .select({
        id: media.id,
        relativePath: media.relativePath,
        mimeType: media.mimeType,
        filename: media.filename,
      })
      .from(media)
      .where(eq(media.postId, postId));
    const existingPost = { ...postRow, media: mediaRows };

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

    // Delete associated media files from storage before deleting the post
    const mediaDeletePromises: Promise<boolean>[] = [];

    // Delete media from the Media table
    for (const media of existingPost.media) {
      try {
        // Import storage functions dynamically to avoid circular imports
        const { deleteImage, deleteVideo, getPublicUrl } = await import("@/lib/image/storage");
        
        // Get the full URL for deletion
        const fullUrl = await getPublicUrl(media.relativePath);
        
        if (media.mimeType.startsWith("image/")) {
          mediaDeletePromises.push(deleteImage(fullUrl));
        } else if (media.mimeType.startsWith("video/")) {
          mediaDeletePromises.push(deleteVideo(fullUrl));
        }
      } catch (error) {
        console.error(`Failed to delete media file ${media.relativePath}:`, error);
        // Continue with other deletions even if one fails
      }
    }

    // Delete legacy media files if they exist (uploadPath from post)
    if (existingPost.uploadPath) {
      try {
        const { deleteImage, deleteVideo, getPublicUrl } = await import("@/lib/image/storage");
        const fullUrl = await getPublicUrl(existingPost.uploadPath);
        
        if (existingPost.uploadFileType === "IMAGE") {
          mediaDeletePromises.push(deleteImage(fullUrl));
        } else if (existingPost.uploadFileType === "VIDEO") {
          mediaDeletePromises.push(deleteVideo(fullUrl));
        }
      } catch (error) {
        console.error(`Failed to delete legacy upload file ${existingPost.uploadPath}:`, error);
      }
    }

    // Delete preview file if it exists
    if (existingPost.previewPath) {
      try {
        const { deleteImage, getPublicUrl } = await import("@/lib/image/storage");
        const previewUrl = await getPublicUrl(existingPost.previewPath);
        mediaDeletePromises.push(deleteImage(previewUrl));
      } catch (error) {
        console.error(`Failed to delete preview file ${existingPost.previewPath}:`, error);
      }
    }

    // Delete preview video file if it exists
    if (existingPost.previewVideoPath) {
      try {
        const { deleteVideo, getPublicUrl } = await import("@/lib/image/storage");
        const previewVideoUrl = await getPublicUrl(existingPost.previewVideoPath);
        mediaDeletePromises.push(deleteVideo(previewVideoUrl));
      } catch (error) {
        console.error(`Failed to delete preview video file ${existingPost.previewVideoPath}:`, error);
      }
    }

    // Wait for all media deletions to complete (with timeout)
    if (mediaDeletePromises.length > 0) {
      try {
        const results = await Promise.allSettled(mediaDeletePromises);
        const failedDeletions = results.filter(
          (result) => result.status === "rejected" || result.value === false
        ).length;

        if (failedDeletions > 0) {
          console.warn(
            `${failedDeletions} out of ${mediaDeletePromises.length} media files failed to delete from storage`
          );
        } else {
          console.log(
            `Successfully deleted ${mediaDeletePromises.length} media files from storage`
          );
        }
      } catch (error) {
        console.error("Error during media file deletion:", error);
        // Continue with post deletion even if media deletion fails
      }
    }

    if (existingPost.media.length > 0) {
      await db.delete(media).where(eq(media.postId, postId));
      console.log(`Deleted ${existingPost.media.length} media records from database`);
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
    console.error("Error deleting post:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to delete post"
    );
  }
}

// Toggle post publish action
export async function togglePostPublishAction(postId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      handleAuthRedirect();
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
    console.error("Error toggling post publish status:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to update post status"
    );
  }
}

// Toggle post featured action
export async function togglePostFeaturedAction(postId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      handleAuthRedirect();
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
    console.error("Error toggling post featured status:", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to update post featured status"
    );
  }
}

// Cleanup orphaned media action
export async function cleanupOrphanedMediaAction(dryRun: boolean = true) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      handleAuthRedirect();
    }

    // Only admins can run cleanup
    if (currentUser.userData.role !== "ADMIN") {
      throw new Error("Unauthorized: Admin access required");
    }

    // Import cleanup function
    const { cleanupOrphanedMedia } = await import("@/lib/image/storage");
    
    // Run cleanup
    const result = await cleanupOrphanedMedia(dryRun);

    const message = dryRun
      ? `Found ${result.orphanedCount} orphaned media files that can be cleaned up`
      : `Successfully cleaned up ${result.deletedCount} out of ${result.orphanedCount} orphaned media files`;

    // Revalidate relevant paths if actual cleanup was performed
    if (!dryRun && result.deletedCount > 0) {
      revalidatePath("/settings");
      revalidateCache([
        CACHE_TAGS.POSTS,
        CACHE_TAGS.POST_BY_ID,
        CACHE_TAGS.POST_BY_SLUG,
      ]);
    }

    return {
      success: true,
      message,
      data: {
        orphanedCount: result.orphanedCount,
        deletedCount: result.deletedCount,
        errors: result.errors,
        dryRun,
      },
    };
  } catch (error) {
    console.error("Error in cleanup orphaned media action:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to cleanup orphaned media"
    );
  }
}

// Cleanup orphaned preview files action
export async function cleanupOrphanedPreviewFilesAction(dryRun: boolean = true) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      handleAuthRedirect();
    }

    // Only admins can run cleanup
    if (currentUser.userData.role !== "ADMIN") {
      throw new Error("Unauthorized: Admin access required");
    }

    // Import cleanup function
    const { cleanupOrphanedPreviewFiles } = await import("@/lib/image/storage");
    
    // Run cleanup
    const result = await cleanupOrphanedPreviewFiles(dryRun);

    const message = dryRun
      ? `Found ${result.orphanedCount} orphaned preview files that can be cleaned up`
      : `Successfully cleaned up ${result.deletedCount} out of ${result.orphanedCount} orphaned preview files`;

    // Revalidate relevant paths if actual cleanup was performed
    if (!dryRun && result.deletedCount > 0) {
      revalidatePath("/settings");
      revalidateCache([
        CACHE_TAGS.POSTS,
        CACHE_TAGS.POST_BY_ID,
        CACHE_TAGS.POST_BY_SLUG,
      ]);
    }

    return {
      success: true,
      message,
      data: {
        orphanedCount: result.orphanedCount,
        deletedCount: result.deletedCount,
        errors: result.errors,
        orphanedFiles: result.orphanedFiles,
        dryRun,
      },
    };
  } catch (error) {
    console.error("Error in cleanup orphaned preview files action:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to cleanup orphaned preview files"
    );
  }
}
