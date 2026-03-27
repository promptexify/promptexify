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

// Star (save) schemas
export const starSchema = z.object({
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

// Bulk import schema — each item in a JSON array must include a category slug.
// Used both client-side (preview validation) and server-side (action validation).
export const postBulkImportItemSchema = z.object({
  title: z
    .string()
    .min(1, "title is required")
    .max(200, "title must be 200 characters or less")
    .trim(),
  content: z
    .string()
    .min(10, "content must be at least 10 characters")
    .max(50000, "content must be 50,000 characters or less")
    .trim(),
  category: z
    .string()
    .min(1, "category is required")
    .regex(/^[a-z0-9-]+$/, "category must be a valid slug (lowercase, hyphens only)"),
  description: z
    .string()
    .max(500, "description must be 500 characters or less")
    .trim()
    .optional(),
  slug: z
    .string()
    .max(200, "slug must be 200 characters or less")
    .regex(
      /^[a-z0-9-]*$/,
      "slug can only contain lowercase letters, numbers, and hyphens"
    )
    .optional(),
  tags: z
    .array(z.string().max(50).trim())
    .max(20, "maximum 20 tags allowed")
    .optional()
    .default([]),
});

export type PostBulkImportItem = z.infer<typeof postBulkImportItemSchema>;

// JSON import schema — used client-side to validate pasted/dropped JSON before
// populating the post form. Intentionally more permissive than createPostFormSchema
// (e.g. no category) because import only fills in the text-level fields.
export const postImportSchema = z.object({
  title: z
    .string()
    .min(1, "title is required")
    .max(200, "title must be 200 characters or less")
    .trim(),
  content: z
    .string()
    .min(10, "content must be at least 10 characters")
    .max(50000, "content must be 50,000 characters or less")
    .trim(),
  description: z
    .string()
    .max(500, "description must be 500 characters or less")
    .trim()
    .optional(),
  slug: z
    .string()
    .max(200, "slug must be 200 characters or less")
    .regex(
      /^[a-z0-9-]*$/,
      "slug can only contain lowercase letters, numbers, and hyphens"
    )
    .optional(),
  tags: z
    .array(z.string().max(50, "each tag must be 50 characters or less").trim())
    .max(20, "maximum 20 tags allowed")
    .optional()
    .default([]),
});

export type PostImportData = z.infer<typeof postImportSchema>;

// ---------------------------------------------------------------------------
// Blog schemas
// ---------------------------------------------------------------------------

const blogSlugSchema = z
  .string()
  .trim()
  .max(200, "Slug must be 200 characters or less")
  .optional()
  .transform((v) => v || null)
  .refine((v) => !v || /^[a-z0-9-]+$/.test(v), "Slug can only contain lowercase letters, numbers, and hyphens")
  .refine((v) => !v || (!v.startsWith("-") && !v.endsWith("-")), "Slug cannot start or end with hyphens")
  .refine((v) => !v || !v.includes("--"), "Slug cannot contain consecutive hyphens");

export const createBlogPostFormSchema = z.object({
  title:            z.string().trim().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  slug:             blogSlugSchema,
  excerpt:          z.string().max(500, "Excerpt must be 500 characters or less").trim().optional().transform((v) => v || null),
  content:          z.string().min(1, "Content is required").max(200000, "Content must be 200,000 characters or less"),
  featuredImageUrl: z.union([z.string().url("Invalid image URL"), z.literal("")]).optional().transform((v) => v === "" || !v ? null : v),
  status:           z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

export const updateBlogPostFormSchema = createBlogPostFormSchema.extend({
  id: z.string().min(1, "ID is required"),
});

export const blogBulkImportItemSchema = z.object({
  title:            z.string().min(1, "title is required").max(200).trim(),
  content:          z.string().min(1, "content is required").max(200000).trim(),
  excerpt:          z.string().max(500).trim().optional(),
  slug:             z.string().max(200).regex(/^[a-z0-9-]*$/, "slug must be lowercase letters, numbers, hyphens").optional(),
  featuredImageUrl: z.union([z.string().url("invalid URL"), z.literal("")]).optional(),
  status:           z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

export type CreateBlogPostFormData = z.infer<typeof createBlogPostFormSchema>;
export type UpdateBlogPostFormData = z.infer<typeof updateBlogPostFormSchema>;
export type BlogBulkImportItem = z.infer<typeof blogBulkImportItemSchema>;

// Type exports
export type MagicLinkData = z.infer<typeof magicLinkSchema>;
export type SignInData = z.infer<typeof signInSchema>;
export type SignUpData = z.infer<typeof signUpSchema>;
export type StarData = z.infer<typeof starSchema>;
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
