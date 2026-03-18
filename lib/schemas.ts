import { z } from "zod";

// Authentication schemas - Updated for Magic Link only
export const magicLinkSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
});

// Legacy schemas - keeping for backward compatibility during migration
export const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signUpSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
});

// Bookmark schemas
export const bookmarkSchema = z.object({
  postId: z.string().uuid("Invalid post ID"),
});

// Favorite schemas
export const favoriteSchema = z.object({
  postId: z.string().uuid("Invalid post ID"),
});

// Enhanced post schemas with comprehensive validation and security measures
export const createPostSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less")
    .regex(
      /^[a-zA-Z0-9\s\-_.,!?()[\]'"&@#$%^*+=|\\/:;<>~`]*$/,
      "Title contains invalid characters"
    )
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, "Title cannot be empty after trimming"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(200, "Slug must be 200 characters or less")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .refine(
      (val) => !val.startsWith("-") && !val.endsWith("-"),
      "Slug cannot start or end with hyphens"
    )
    .refine(
      (val) => !val.includes("--"),
      "Slug cannot contain consecutive hyphens"
    )
    .transform((val) => val.trim()),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .regex(
      /^[a-zA-Z0-9\s\-_.,!?()[\]'"&@#$%^*+=|\\/:;<>~`\n\r]*$/,
      "Description contains invalid characters"
    )
    .transform((val) => val.trim())
    .optional()
    .nullable(),
  content: z
    .string()
    .min(10, "Content must be at least 10 characters")
    .max(50000, "Content must be 50,000 characters or less")
    .transform((val) => val.trim())
    .refine(
      (val) => val.length >= 10,
      "Content must be at least 10 characters after trimming"
    ),
  uploadPath: z.string().url("Invalid upload URL").optional().nullable(),
  uploadFileType: z.enum(["IMAGE", "VIDEO"]).optional().nullable(),
  categoryId: z.string().uuid("Invalid category ID"),
  tagIds: z
    .array(z.string().uuid("Invalid tag ID"))
    .max(10, "Maximum 10 tags allowed")
    .optional()
    .default([]),
  isPremium: z.boolean().default(false),
  isPublished: z.boolean().default(false),
});

export const updatePostSchema = createPostSchema.extend({
  id: z.string().uuid("Invalid post ID"),
});

// Enhanced tag schemas with strict validation for security
export const createTagSchema = z.object({
  name: z
    .string()
    .min(1, "Tag name is required")
    .max(50, "Tag name must be 50 characters or less")
    .regex(
      /^[a-zA-Z0-9\s\-_]+$/,
      "Tag name can only contain letters, numbers, spaces, hyphens, and underscores"
    )
    .transform((val) => val.trim().replace(/\s+/g, " "))
    .refine((val) => val.length > 0, "Tag name cannot be empty after trimming")
    .refine(
      (val) => val.length <= 50,
      "Tag name must be 50 characters or less after processing"
    ),
  slug: z
    .string()
    .max(50, "Slug must be 50 characters or less")
    .regex(
      /^[a-z0-9-]*$/,
      "Slug can only contain lowercase letters (a-z), numbers (0-9), and hyphens (-)"
    )
    .refine(
      (val) => val === "" || (!val.startsWith("-") && !val.endsWith("-")),
      "Slug cannot start or end with hyphens"
    )
    .refine(
      (val) => val === "" || !val.includes("--"),
      "Slug cannot contain consecutive hyphens"
    )
    .transform((val) => val.trim())
    .optional(),
});

export const updateTagSchema = createTagSchema.extend({
  id: z.string().uuid("Invalid tag ID"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50, "Slug must be 50 characters or less")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters (a-z), numbers (0-9), and hyphens (-)"
    )
    .refine(
      (val) => !val.startsWith("-") && !val.endsWith("-"),
      "Slug cannot start or end with hyphens"
    )
    .refine(
      (val) => !val.includes("--"),
      "Slug cannot contain consecutive hyphens"
    )
    .transform((val) => val.trim()),
});

// Category schemas with validation
export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Category name must be 100 characters or less")
    .regex(/^[a-zA-Z0-9\s-_&]+$/, "Category name contains invalid characters")
    .transform((val) => val.trim())
    .refine(
      (val) => val.length > 0,
      "Category name cannot be empty after trimming"
    ),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100, "Slug must be 100 characters or less")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .refine(
      (val) => !val.startsWith("-") && !val.endsWith("-"),
      "Slug cannot start or end with hyphens"
    )
    .refine(
      (val) => !val.includes("--"),
      "Slug cannot contain consecutive hyphens"
    )
    .transform((val) => val.trim())
    .optional(),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .transform((val) => val.trim())
    .optional()
    .nullable(),
  parentId: z.string().uuid("Invalid parent category ID").optional().nullable(),
});

export const updateCategorySchema = createCategorySchema.extend({
  id: z.string().uuid("Invalid category ID"),
});

// File upload schemas
export const fileUploadSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or less")
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, "Title contains invalid characters")
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, "Title cannot be empty after trimming"),
});

// User profile schemas with enhanced security
export const updateUserProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be 50 characters or less")
    // SECURITY: Allow a-z, A-Z, and spaces (for firstname lastname)
    .regex(
      /^[a-zA-Z\s]+$/,
      "Name can only contain letters (a-z, A-Z) and spaces"
    )
    .transform((val) => val.trim().replace(/\s+/g, " ")) // Normalize multiple spaces to single space
    .refine(
      (val) => val.length >= 2,
      "Name must be at least 2 characters after trimming"
    )
    .refine(
      (val) => val.length <= 50,
      "Name must be 50 characters or less after trimming"
    )
    // SECURITY: Ensure name doesn't start or end with spaces and has actual letters
    .refine(
      (val) => /^[a-zA-Z].*[a-zA-Z]$|^[a-zA-Z]$/.test(val),
      "Name must start and end with letters"
    )
    // SECURITY: Prevent excessive spaces (max 3 consecutive spaces)
    .refine(
      (val) => !/\s{4,}/.test(val),
      "Name cannot contain excessive spaces"
    )
    // SECURITY: Additional validation to prevent suspicious patterns
    .refine((val) => {
      const withoutSpaces = val.replace(/\s/g, "");
      return !(
        (/^[aeiouAEIOU]+$/.test(withoutSpaces) && withoutSpaces.length > 10) ||
        /((.)\2{4,})/.test(withoutSpaces)
      );
    }, "Invalid name format"),
  bio: z
    .string()
    .max(200, "Bio must be 200 characters or less")
    .regex(/^[a-zA-Z0-9\s.,!?-]*$/, "Bio contains invalid characters")
    .transform((val) => val.trim())
    .optional()
    .nullable(),
  avatar: z.string().url("Invalid avatar URL").optional().nullable(),
});

// Enhanced search and pagination schemas with stricter validation
export const searchSchema = z.object({
  q: z
    .string()
    .max(100, "Search query must be 100 characters or less")
    .regex(/^[a-zA-Z0-9\s\-_.]*$/, "Search query contains invalid characters")
    .transform((val) => val.trim())
    .refine(
      (val) => !val || val.length === 0 || val.replace(/\s+/g, "").length > 0,
      "Search query cannot be only whitespace"
    )
    .refine(
      (val) => !val || !/^[\s\-_.]*$/.test(val),
      "Search query must contain at least one alphanumeric character"
    )
    .optional(),
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .max(1000, "Page must be 1000 or less")
    .default(1),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(50, "Limit must be 50 or less")
    .default(12),
  category: z
    .string()
    .regex(/^[a-z0-9-]*$/, "Category contains invalid characters")
    .optional(),
  subcategory: z
    .string()
    .regex(/^[a-z0-9-]*$/, "Subcategory contains invalid characters")
    .optional(),
  premium: z.enum(["free", "premium", "all"]).optional(),
});

// API response schemas for type safety
export const apiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  data: z.any().optional(),
});

// Rate limiting schemas
export const rateLimitSchema = z.object({
  identifier: z.string().min(1, "Identifier is required"),
  limit: z.number().int().min(1, "Limit must be at least 1"),
  window: z.number().int().min(1000, "Window must be at least 1000ms"),
});

// FormData schemas for post server actions.
// All FormData values arrive as strings; these schemas coerce them
// to the correct types so actions never need manual string-handling.
// Safe characters for blur placeholder data URIs (base64 + data URI prefix).
const BLUR_DATA_PATTERN = /^data:image\/(webp|jpeg|jpg|png|gif|avif);base64,[A-Za-z0-9+/]+=*$/;

// Returns true if the string contains ASCII control characters that shouldn't
// appear in user-facing text (excludes \t \n \r which are legitimate).
function hasControlChars(v: string): boolean {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    // Block C0 controls except HT(9), LF(10), CR(13)
    if ((c <= 8) || c === 11 || c === 12 || (c >= 14 && c <= 31)) return true;
  }
  return false;
}

// Valid path segment: absolute URL or root-relative path, no traversal.
function isSafePath(v: string | null): boolean {
  if (!v) return true;
  if (v.includes("..")) return false;
  if (v.includes("\0")) return false;
  return true;
}

const postFormBaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less")
    .refine((v) => !hasControlChars(v), "Title contains invalid characters"),
  slug: z
    .string()
    .trim()
    .max(200, "Slug must be 200 characters or less")
    .optional()
    .transform((v) => v || null)
    .refine(
      (v) => !v || /^[a-z0-9-]+$/.test(v),
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .refine(
      (v) => !v || (!v.startsWith("-") && !v.endsWith("-")),
      "Slug cannot start or end with hyphens"
    )
    .refine((v) => !v || !v.includes("--"), "Slug cannot contain consecutive hyphens"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || !hasControlChars(v), "Description contains invalid characters"),
  content: z
    .string()
    .trim()
    .min(10, "Content must be at least 10 characters")
    .max(50000, "Content must be 50,000 characters or less"),
  category: z
    .string()
    .min(1, "Category is required")
    .regex(/^[a-z0-9-]+$/, "Invalid category slug"),
  subcategory: z
    .string()
    .optional()
    .transform((v) => (!v || v === "none") ? null : v)
    .refine((v) => !v || /^[a-z0-9-]+$/.test(v), "Invalid subcategory slug"),
  tags: z
    .string()
    .max(2000, "Tags value is too long") // guard against giant payloads before splitting
    .optional()
    .transform((v) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : []))
    .refine((v) => v.length <= 20, "Too many tags"),
  // Path fields: accept absolute URLs (from cloud storage) or root-relative paths.
  // Reject path traversal, null bytes, and enforce a generous max length.
  uploadPath: z
    .string()
    .max(2048, "uploadPath is too long")
    .optional()
    .transform((v) => v || null)
    .refine(isSafePath, "uploadPath must not contain path traversal sequences"),
  uploadFileType: z
    .string()
    .optional()
    .transform((v) => (v === "IMAGE" || v === "VIDEO" ? v : null)),
  // Must be a UUID if present — prevents arbitrary string injection into media table.
  uploadMediaId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine(
      (v) => !v || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
      "Invalid media ID"
    ),
  previewPath: z
    .string()
    .max(2048, "previewPath is too long")
    .optional()
    .transform((v) => v || null)
    .refine(isSafePath, "previewPath must not contain path traversal sequences"),
  previewVideoPath: z
    .string()
    .max(2048, "previewVideoPath is too long")
    .optional()
    .transform((v) => v || null)
    .refine(isSafePath, "previewVideoPath must not contain path traversal sequences"),
  // blurData must be a safe base64 data URI — it is rendered directly in CSS.
  blurData: z
    .string()
    .max(4096, "blurData is too long")
    .optional()
    .transform((v) => v || null)
    .refine(
      (v) => !v || BLUR_DATA_PATTERN.test(v),
      "blurData must be a valid image data URI"
    ),
  // Checkboxes send "on" when checked, absent when unchecked
  isPublished: z.string().optional().transform((v) => v === "on"),
  isPremium: z.string().optional().transform((v) => v === "on"),
});

export const createPostFormSchema = postFormBaseSchema;
export const updatePostFormSchema = postFormBaseSchema.extend({
  id: z.string().uuid("Invalid post ID"),
});

export type CreatePostFormData = z.infer<typeof createPostFormSchema>;
export type UpdatePostFormData = z.infer<typeof updatePostFormSchema>;

// Type exports
export type MagicLinkData = z.infer<typeof magicLinkSchema>;
export type SignInData = z.infer<typeof signInSchema>;
export type SignUpData = z.infer<typeof signUpSchema>;
export type BookmarkData = z.infer<typeof bookmarkSchema>;
export type FavoriteData = z.infer<typeof favoriteSchema>;
export type CreatePostData = z.infer<typeof createPostSchema>;
export type UpdatePostData = z.infer<typeof updatePostSchema>;
export type CreateTagData = z.infer<typeof createTagSchema>;
export type UpdateTagData = z.infer<typeof updateTagSchema>;
export type CreateCategoryData = z.infer<typeof createCategorySchema>;
export type UpdateCategoryData = z.infer<typeof updateCategorySchema>;
export type FileUploadData = z.infer<typeof fileUploadSchema>;
export type UpdateUserProfileData = z.infer<typeof updateUserProfileSchema>;
export type SearchData = z.infer<typeof searchSchema>;
export type ApiResponseData = z.infer<typeof apiResponseSchema>;
export type RateLimitData = z.infer<typeof rateLimitSchema>;
