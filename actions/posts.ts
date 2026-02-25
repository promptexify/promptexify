"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { handleAuthRedirect } from "./auth";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";
import { PostStatus } from "@/app/generated/prisma";
import { withCSRFProtection } from "@/lib/security/csp";

import {
  sanitizeInput,
  sanitizeContent,
  sanitizeTagSlug,
} from "@/lib/security/sanitize";

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

      // Extract and validate form data
      const rawTitle = formData.get("title") as string;
      const rawSlug = formData.get("slug") as string;
      const rawDescription = formData.get("description") as string;
      const rawContent = formData.get("content") as string;
      const uploadPath = formData.get("uploadPath") as string;
      const uploadFileType = formData.get("uploadFileType") as "IMAGE" | "VIDEO";
      const blurData = formData.get("blurData") as string;
      const uploadMediaId = formData.get("uploadMediaId") as string;
      const previewPath = formData.get("previewPath") as string;
      const previewVideoPath = formData.get("previewVideoPath") as string;
      const category = formData.get("category") as string;
      const subcategory = formData.get("subcategory") as string;
      const tags = formData.get("tags") as string;

      // Sanitize inputs for enhanced security
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
        const existingPost = await prisma.post.findFirst({
          where: { slug },
          select: { id: true },
        });
        
        if (!existingPost) {
          break; // Slug is unique
        }
        
        // Generate new slug with counter
        slug = `${baseSlug}-${counter}`;
        counter++;
        
        // Prevent infinite loop
        if (counter > 1000) {
          throw new Error("Unable to generate unique slug");
        }
      }

      // Handle publish/status logic based on user role
      let isPublished = false;
      let status: PostStatus = PostStatus.DRAFT;

      if (user.role === "ADMIN") {
        // Admin can publish directly and control status
        isPublished = formData.get("isPublished") === "on";
        status = isPublished ? PostStatus.APPROVED : PostStatus.DRAFT;
      } else {
        // Regular users create posts with PENDING_APPROVAL status
        isPublished = false;
        status = PostStatus.PENDING_APPROVAL;
      }

      const isPremium = formData.get("isPremium") === "on";

      // Validate required fields
      if (!title || !content || !category) {
        throw new Error("Missing required fields");
      }

      // Get category ID - prefer subcategory if provided, otherwise use main category
      const selectedCategorySlug =
        subcategory && subcategory !== "" && subcategory !== "none"
          ? subcategory
          : category;
      const categoryRecord = await prisma.category.findUnique({
        where: { slug: selectedCategorySlug },
      });

      if (!categoryRecord) {
        throw new Error("Invalid category");
      }

      // Process and sanitize tags
      const tagNames = tags
        ? tags
            .split(",")
            .map((tag) => sanitizeInput(tag.trim()))
            .filter(Boolean)
        : [];

      // Enforce max tags per post according to settings
      const maxTagsPerPost = await (
        await import("@/lib/settings")
      ).getMaxTagsPerPost();
      if (tagNames.length > maxTagsPerPost) {
        throw new Error(`A post may only have up to ${maxTagsPerPost} tags`);
      }

      // Batch tag upserts in a single transaction to avoid N+1 queries
      const tagConnections = await prisma.$transaction(
        tagNames
          .map((tagName) => {
            const tagSlug = sanitizeTagSlug(tagName);
            if (!tagSlug) return null;
            return prisma.tag.upsert({
              where: { slug: tagSlug },
              update: {},
              create: { name: tagName, slug: tagSlug },
              select: { id: true },
            });
          })
          .filter((op): op is NonNullable<typeof op> => op !== null)
      );

      // Create the post
      const newPost = await prisma.post.create({
        data: {
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
          status: status,
          authorId: user.id,
          categoryId: categoryRecord.id,
          tags: {
            connect: tagConnections,
          },
        },
      });

      // Link media to the post
      const mediaIds = [uploadMediaId].filter(Boolean);
      if (mediaIds.length > 0) {
        await prisma.media.updateMany({
          where: {
            id: {
              in: mediaIds,
            },
            // Ensure we don't overwrite another post's media
            postId: null,
          },
          data: {
            postId: newPost.id,
          },
        });
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

      revalidatePath("/dashboard/posts");
      redirect("/dashboard/posts");
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
          // Unique constraint violation
          throw new Error("A post with this title already exists. Please choose a different title.");
        }
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

      // Extract form data
      const id = formData.get("id") as string;
      const title = formData.get("title") as string;
      const rawSlug = formData.get("slug") as string;
      const description = formData.get("description") as string;
      const content = formData.get("content") as string;
      const uploadPath = formData.get("uploadPath") as string;
      const uploadFileType = formData.get("uploadFileType") as "IMAGE" | "VIDEO";
      const blurData = formData.get("blurData") as string;
      const uploadMediaId = formData.get("uploadMediaId") as string;
      const previewPath = formData.get("previewPath") as string;
      const previewVideoPath = formData.get("previewVideoPath") as string;
      const category = formData.get("category") as string;
      const subcategory = formData.get("subcategory") as string;
      const tags = formData.get("tags") as string;
      const isPremium = formData.get("isPremium") === "on";

      // Validate required fields
      if (!id || !title || !content || !category) {
        throw new Error("Missing required fields");
      }

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
        const existingPost = await prisma.post.findFirst({
          where: { 
            slug,
            NOT: { id } // Exclude current post from uniqueness check
          },
          select: { id: true },
        });
        
        if (!existingPost) {
          break; // Slug is unique
        }
        
        // Generate new slug with counter
        slug = `${baseSlug}-${counter}`;
        counter++;
        
        // Prevent infinite loop
        if (counter > 1000) {
          throw new Error("Unable to generate unique slug");
        }
      }

      // Check if post exists and user has permission
      const existingPost = await prisma.post.findUnique({
        where: { id },
        include: {
          author: true,
          media: true,
        },
      });

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

      // Handle publish/status logic based on user role
      let isPublished = existingPost.isPublished;
      let status: PostStatus = existingPost.status as PostStatus;

      if (user.role === "ADMIN") {
        // Admin can control publish status and status
        const requestedPublish = formData.get("isPublished") === "on";
        isPublished = requestedPublish;
        status = requestedPublish ? PostStatus.APPROVED : PostStatus.DRAFT;
      } else {
        // Regular users cannot change publish status - stays pending approval
        isPublished = false;
        status = PostStatus.PENDING_APPROVAL;
      }

      // Get category ID - prefer subcategory if provided, otherwise use main category
      const selectedCategorySlug =
        subcategory && subcategory !== "" && subcategory !== "none"
          ? subcategory
          : category;
      const categoryRecord = await prisma.category.findUnique({
        where: { slug: selectedCategorySlug },
      });

      if (!categoryRecord) {
        throw new Error("Invalid category");
      }

      // Prepare media updates
      const newMediaIds = [uploadMediaId].filter(
        (id) => id && typeof id === "string"
      );
      const oldMediaIds = existingPost.media.map((m) => m.id);

      // IDs of media to be disassociated from the post
      const mediaToUnlink = oldMediaIds.filter(
        (id) => !newMediaIds.includes(id)
      );

      // IDs of media to be newly associated with the post
      const mediaToLink = newMediaIds.filter((id) => !oldMediaIds.includes(id));

      // Disassociate old media that is no longer used
      if (mediaToUnlink.length > 0) {
        await prisma.media.updateMany({
          where: {
            id: {
              in: mediaToUnlink,
            },
            postId: existingPost.id,
          },
          data: {
            postId: null,
          },
        });
      }

      // Process and sanitize tags, and disconnect old tags
      const newTagNames = tags
        ? tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

      // Enforce max tags per post according to settings
      const maxTagsPerPostUpdate = await (
        await import("@/lib/settings")
      ).getMaxTagsPerPost();
      if (newTagNames.length > maxTagsPerPostUpdate) {
        throw new Error(
          `A post may only have up to ${maxTagsPerPostUpdate} tags`
        );
      }

      // Batch tag upserts in a single transaction to avoid N+1 queries
      const newTagConnections = await prisma.$transaction(
        newTagNames
          .map((tagName) => {
            const tagSlug = tagName.toLowerCase().replace(/\s+/g, "-");
            return prisma.tag.upsert({
              where: { slug: tagSlug },
              update: {},
              create: { name: tagName, slug: tagSlug },
              select: { id: true },
            });
          })
      );

      // Update the post
      const updatedPost = await prisma.post.update({
        where: { id },
        data: {
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
          status: status,
          categoryId: categoryRecord.id,
          tags: {
            set: newTagConnections,
          },
          updatedAt: new Date(),
        },
      });

      // Associate new media with the post
      if (mediaToLink.length > 0) {
        await prisma.media.updateMany({
          where: {
            id: {
              in: mediaToLink,
            },
            postId: null, // Only link unassociated media
          },
          data: {
            postId: updatedPost.id,
          },
        });
      }


      revalidatePath("/dashboard/posts");
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

      redirect("/dashboard/posts");
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
          // Unique constraint violation
          throw new Error("A post with this title already exists. Please choose a different title.");
        }
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

    // Get current post status
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, title: true },
    });

    if (!existingPost) {
      throw new Error("Post not found");
    }

    if (existingPost.status !== "PENDING_APPROVAL") {
      throw new Error("Post is not pending approval");
    }

    // Approve and publish the post
    await prisma.post.update({
      where: { id: postId },
      data: {
        isPublished: true,
        status: PostStatus.APPROVED,
        updatedAt: new Date(),
      },
    });

    // Revalidate relevant paths and caches
    revalidatePath("/dashboard/posts");
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

    // Fetch current status
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, title: true },
    });

    if (!existingPost) {
      throw new Error("Post not found");
    }

    if (existingPost.status !== "PENDING_APPROVAL") {
      throw new Error("Only posts pending approval can be rejected");
    }

    await prisma.post.update({
      where: { id: postId },
      data: {
        isPublished: false,
        status: PostStatus.REJECTED,
        updatedAt: new Date(),
      },
    });

    // Revalidate relevant caches
    revalidatePath("/dashboard/posts");
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

    // Fetch post to verify permissions and get associated media
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        authorId: true,
        isPublished: true,
        status: true,
        uploadPath: true,
        uploadFileType: true,
        previewPath: true,
        previewVideoPath: true,
        media: {
          select: {
            id: true,
            relativePath: true,
            mimeType: true,
            filename: true,
          },
        },
        _count: {
          select: {
            bookmarks: true,
            favorites: true,
          },
        },
      },
    });

    if (!existingPost) {
      throw new Error("Post not found");
    }

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

    // Delete media records from database before deleting the post
    if (existingPost.media.length > 0) {
      await prisma.media.deleteMany({
        where: { postId: postId },
      });
      console.log(`Deleted ${existingPost.media.length} media records from database`);
    }

    // Delete post and all related data (cascading delete should handle other relations)
    await prisma.post.delete({
      where: { id: postId },
    });

    revalidatePath("/dashboard/posts");
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

    // Fetch the post to toggle
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isPublished: true, title: true },
    });

    if (!existingPost) {
      throw new Error("Post not found");
    }

    // Toggle the published status and update status accordingly
    const newPublishedState = !existingPost.isPublished;
    const newStatus = newPublishedState
      ? PostStatus.APPROVED
      : PostStatus.DRAFT;

    await prisma.post.update({
      where: { id: postId },
      data: {
        isPublished: newPublishedState,
        status: newStatus,
        updatedAt: new Date(),
      },
    });

    // Revalidate relevant paths and caches
    revalidatePath("/dashboard/posts");
    // Removed entry path revalidation to prevent modal performance issues
    revalidatePath("/"); // Home page might show published posts

    // Invalidate cache for this specific post so edit page shows updated status
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

    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isFeatured: true, title: true },
    });

    if (!existingPost) {
      throw new Error("Post not found");
    }

    const newFeaturedState = !existingPost.isFeatured;

    await prisma.post.update({
      where: { id: postId },
      data: {
        isFeatured: newFeaturedState,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/posts");
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
      revalidatePath("/dashboard/settings");
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
      revalidatePath("/dashboard/settings");
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
