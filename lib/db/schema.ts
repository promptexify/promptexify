/**
 * Drizzle ORM schema for all application tables.
 * Column names use camelCase matching the existing Postgres table structure.
 *
 * RLS policies protect data when accessed via the Supabase PostgREST API
 * (anon/authenticated roles). Server-side Drizzle queries use a role with
 * BYPASSRLS so they are unaffected, but RLS acts as a defense-in-depth layer.
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  pgPolicy,
  primaryKey,
  customType,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Custom type for PostgreSQL tsvector (full-text search)
const tsvectorType = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { authenticatedRole } from "drizzle-orm/supabase";

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export const userTypeEnum = pgEnum("UserType", ["FREE", "PREMIUM"]);
export const userRoleEnum = pgEnum("UserRole", ["USER", "ADMIN"]);
export const oauthProviderEnum = pgEnum("OAuthProvider", ["GOOGLE", "EMAIL"]);
export const postStatusEnum = pgEnum("PostStatus", [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
]);
export const uploadFileTypeEnum = pgEnum("UploadFileType", ["IMAGE", "VIDEO"]);
export const storageTypeEnum = pgEnum("StorageType", ["S3", "LOCAL", "DOSPACE"]);
export const logSeverityEnum = pgEnum("LogSeverity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

// Type aliases for use outside schema
export type PostStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export type StorageType = "S3" | "LOCAL" | "DOSPACE";
export type LogSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// -----------------------------------------------------------------------------
// Reusable SQL fragments for RLS policies
// -----------------------------------------------------------------------------

const authUid = sql`auth.uid()::text`;
const isAdmin = sql`current_user_is_admin()`;
const OWNER_COLS = new Set(["authorId", "uploadedBy", "userId"]);
const isOwnerOrAdmin = (col: string) => {
  if (!OWNER_COLS.has(col)) throw new Error(`isOwnerOrAdmin: unknown column "${col}"`);
  return sql.raw(`("${col}" = auth.uid()::text OR current_user_is_admin())`);
};

// -----------------------------------------------------------------------------
// Users
// -----------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    email: text("email").notNull().unique(),
    name: text("name"),
    avatar: text("avatar"),
    type: userTypeEnum("type").default("FREE").notNull(),
    role: userRoleEnum("role").default("USER").notNull(),
    oauth: oauthProviderEnum("oauth").notNull(),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripePriceId: text("stripe_price_id"),
    stripeCurrentPeriodEnd: timestamp("stripe_current_period_end"),
    disabled: boolean("disabled").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("users_id_role_idx").on(t.id, t.role),
    index("users_id_type_stripe_idx").on(t.id, t.type, t.stripeCurrentPeriodEnd),
    index("users_stripe_customer_id_idx").on(t.stripeCustomerId),
    index("users_type_role_idx").on(t.type, t.role),
    index("users_created_at_desc_idx").on(t.createdAt),
    // RLS policies
    pgPolicy("users_select_own_or_admin", {
      as: "permissive",
      for: "select",
      to: "public",
      using: sql`id = ${authUid} OR ${isAdmin}`,
    }),
    pgPolicy("users_insert_own", {
      as: "permissive",
      for: "insert",
      to: "public",
      withCheck: sql`id = ${authUid}`,
    }),
    pgPolicy("users_update_own", {
      as: "permissive",
      for: "update",
      to: "public",
      using: sql`id = ${authUid}`,
      withCheck: sql`id = ${authUid}`,
    }),
    pgPolicy("users_delete_admin_only", {
      as: "permissive",
      for: "delete",
      to: "public",
      using: isAdmin,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Categories (read all; write admin only)
// -----------------------------------------------------------------------------

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    parentId: text("parentId").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("categories_parent_id_idx").on(t.parentId),
    index("categories_parent_id_name_idx").on(t.parentId, t.name),
    pgPolicy("categories_select_all", {
      as: "permissive",
      for: "select",
      to: "public",
      using: sql`true`,
    }),
    pgPolicy("categories_insert_admin", {
      as: "permissive",
      for: "insert",
      to: "public",
      withCheck: isAdmin,
    }),
    pgPolicy("categories_update_admin", {
      as: "permissive",
      for: "update",
      to: "public",
      using: isAdmin,
      withCheck: isAdmin,
    }),
    pgPolicy("categories_delete_admin", {
      as: "permissive",
      for: "delete",
      to: "public",
      using: isAdmin,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Tags (read all; write admin only)
// -----------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("tags_created_at_desc_idx").on(t.createdAt),
    index("tags_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
    pgPolicy("tags_select_all", {
      as: "permissive",
      for: "select",
      to: "public",
      using: sql`true`,
    }),
    pgPolicy("tags_insert_admin", {
      as: "permissive",
      for: "insert",
      to: "public",
      withCheck: isAdmin,
    }),
    pgPolicy("tags_update_admin", {
      as: "permissive",
      for: "update",
      to: "public",
      using: isAdmin,
      withCheck: isAdmin,
    }),
    pgPolicy("tags_delete_admin", {
      as: "permissive",
      for: "delete",
      to: "public",
      using: isAdmin,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Posts (public read published; author/admin full access; authenticated insert)
// -----------------------------------------------------------------------------

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    content: text("content").notNull(),
    isPremium: boolean("isPremium").default(false).notNull(),
    isFeatured: boolean("isFeatured").default(false).notNull(),
    isPublished: boolean("isPublished").default(false).notNull(),
    status: postStatusEnum("status").default("DRAFT").notNull(),
    authorId: text("authorId").notNull(),
    categoryId: text("categoryId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    blurData: text("blurData"),
    uploadFileType: uploadFileTypeEnum("uploadFileType"),
    uploadPath: text("uploadPath"),
    previewPath: text("previewPath"),
    previewVideoPath: text("previewVideoPath"),
    // Stored tsvector for GIN-indexed full-text search (maintained by trigger in perf-indexes.sql)
    searchVector: tsvectorType("search_vector"),
  },
  (t) => [
    // Core list/filter indexes
    index("posts_is_published_created_at_idx").on(t.isPublished, t.createdAt),
    index("posts_category_published_created_idx").on(t.categoryId, t.isPublished, t.createdAt),
    index("posts_author_created_at_idx").on(t.authorId, t.createdAt),
    index("posts_is_premium_is_published_idx").on(t.isPremium, t.isPublished),
    index("posts_is_featured_is_published_idx").on(t.isFeatured, t.isPublished),
    index("posts_status_created_at_idx").on(t.status, t.createdAt),
    // Author-scoped indexes (posts_author_published_status_idx supersedes the old posts_author_status_idx)
    index("posts_author_published_status_idx").on(t.authorId, t.isPublished, t.status),
    index("posts_author_status_created_idx").on(t.authorId, t.status, t.createdAt),
    // Partial index: covers the most common "published posts by recency" scan path
    index("posts_published_created_partial_idx").on(t.createdAt).where(sql`"isPublished" = true`),
    // GIN index on stored tsvector for fast full-text search (requires pg_trgm + trigger from perf-indexes.sql)
    index("posts_search_vector_gin_idx").using("gin", t.searchVector),
    // Trigram indexes for ILIKE-based partial matching (require pg_trgm extension)
    index("posts_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("posts_description_trgm_idx").using("gin", t.description.op("gin_trgm_ops")),
    pgPolicy("posts_select_published_or_own_or_admin", {
      as: "permissive",
      for: "select",
      to: "public",
      using: sql`"isPublished" = true OR "authorId" = ${authUid} OR ${isAdmin}`,
    }),
    pgPolicy("posts_insert_authenticated", {
      as: "permissive",
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`"authorId" = ${authUid}`,
    }),
    pgPolicy("posts_update_author_or_admin", {
      as: "permissive",
      for: "update",
      to: "public",
      using: sql`${isOwnerOrAdmin("authorId")}`,
      withCheck: sql`${isOwnerOrAdmin("authorId")}`,
    }),
    pgPolicy("posts_delete_author_or_admin", {
      as: "permissive",
      for: "delete",
      to: "public",
      using: sql`${isOwnerOrAdmin("authorId")}`,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Post <-> Tag many-to-many (_PostToTag table — legacy name kept for DB compatibility)
// -----------------------------------------------------------------------------

export const postToTag = pgTable(
  "_PostToTag",
  {
    A: text("A")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    B: text("B")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.A, t.B] }),
    index("postToTag_a_idx").on(t.A),
    // Index on B (tag side) — enables fast "which posts have tag X?" lookups
    index("postToTag_b_idx").on(t.B),
    pgPolicy("_PostToTag_select_all", {
      as: "permissive",
      for: "select",
      to: "public",
      using: sql`true`,
    }),
    pgPolicy("_PostToTag_insert_author_or_admin", {
      as: "permissive",
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`EXISTS (
        SELECT 1 FROM posts
        WHERE posts.id = "A"
        AND (posts."authorId" = auth.uid()::text OR current_user_is_admin())
      )`,
    }),
    pgPolicy("_PostToTag_delete_author_or_admin", {
      as: "permissive",
      for: "delete",
      to: "public",
      using: sql`EXISTS (
        SELECT 1 FROM posts
        WHERE posts.id = "A"
        AND (posts."authorId" = auth.uid()::text OR current_user_is_admin())
      )`,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Stars / saved posts (was "bookmarks" — table name kept as-is in DB)
// -----------------------------------------------------------------------------

export const stars = pgTable(
  "bookmarks",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    postId: text("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("bookmarks_user_id_post_id_key").on(t.userId, t.postId),
    index("bookmarks_user_created_at_idx").on(t.userId, t.createdAt),
    index("bookmarks_post_id_idx").on(t.postId),
    pgPolicy("bookmarks_select_own", {
      as: "permissive", for: "select", to: "public",
      using: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("bookmarks_insert_own", {
      as: "permissive", for: "insert", to: "public",
      withCheck: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("bookmarks_update_own", {
      as: "permissive", for: "update", to: "public",
      using: sql`"userId" = ${authUid}`,
      withCheck: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("bookmarks_delete_own", {
      as: "permissive", for: "delete", to: "public",
      using: sql`"userId" = ${authUid}`,
    }),
  ]
).enableRLS();


// -----------------------------------------------------------------------------
// Logs (admin read; authenticated can insert for audit trail)
// -----------------------------------------------------------------------------

export const logs = pgTable(
  "logs",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    action: text("action").notNull(),
    userId: text("userId").references(() => users.id, { onDelete: "set null" }),
    entityType: text("entityType").notNull(),
    entityId: text("entityId"),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    metadata: jsonb("metadata"),
    severity: logSeverityEnum("severity").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("logs_created_at_desc_idx").on(t.createdAt),
    index("logs_user_created_at_idx").on(t.userId, t.createdAt),
    index("logs_action_created_at_idx").on(t.action, t.createdAt),
    index("logs_severity_created_at_idx").on(t.severity, t.createdAt),
    index("logs_entity_type_id_idx").on(t.entityType, t.entityId),
    index("logs_severity_action_created_idx").on(
      t.severity,
      t.action,
      t.createdAt
    ),
    index("logs_user_action_created_idx").on(t.userId, t.action, t.createdAt),
    pgPolicy("logs_select_admin", {
      as: "permissive",
      for: "select",
      to: "public",
      using: isAdmin,
    }),
    pgPolicy("logs_insert_admin", {
      as: "permissive",
      for: "insert",
      to: "public",
      withCheck: isAdmin,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Media (read all; insert authenticated; update/delete owner or admin)
// -----------------------------------------------------------------------------

export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    filename: text("filename").notNull().unique(),
    relativePath: text("relativePath").notNull(),
    originalName: text("originalName").notNull(),
    mimeType: text("mimeType").notNull(),
    fileSize: integer("fileSize").notNull(),
    width: integer("width"),
    height: integer("height"),
    duration: real("duration"),
    uploadedBy: text("uploadedBy").notNull(),
    postId: text("postId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    blurDataUrl: text("blurDataUrl"),
  },
  (t) => [
    index("media_relative_path_idx").on(t.relativePath),
    index("media_post_id_idx").on(t.postId),
    index("media_uploaded_by_idx").on(t.uploadedBy),
    index("media_mime_type_idx").on(t.mimeType),
    index("media_created_at_desc_idx").on(t.createdAt),
    pgPolicy("media_select_all", {
      as: "permissive",
      for: "select",
      to: "public",
      using: sql`true`,
    }),
    pgPolicy("media_insert_authenticated", {
      as: "permissive",
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`"uploadedBy" = ${authUid}`,
    }),
    pgPolicy("media_update_owner_or_admin", {
      as: "permissive",
      for: "update",
      to: "public",
      using: sql`${isOwnerOrAdmin("uploadedBy")}`,
      withCheck: sql`${isOwnerOrAdmin("uploadedBy")}`,
    }),
    pgPolicy("media_delete_owner_or_admin", {
      as: "permissive",
      for: "delete",
      to: "public",
      using: sql`${isOwnerOrAdmin("uploadedBy")}`,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Settings (admin only; contains secrets like S3 keys)
// -----------------------------------------------------------------------------

export const settings = pgTable(
  "settings",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    storageType: storageTypeEnum("storageType").default("S3").notNull(),
    s3BucketName: text("s3BucketName"),
    s3Region: text("s3Region"),
    s3AccessKeyIdVaultId: uuid("s3AccessKeyIdVaultId"),
    s3SecretKeyVaultId: uuid("s3SecretKeyVaultId"),
    s3CloudfrontUrl: text("s3CloudfrontUrl"),
    doSpaceName: text("doSpaceName"),
    doRegion: text("doRegion"),
    doAccessKeyIdVaultId: uuid("doAccessKeyIdVaultId"),
    doSecretKeyVaultId: uuid("doSecretKeyVaultId"),
    doCdnUrl: text("doCdnUrl"),
    localBasePath: text("localBasePath").default("/uploads").notNull(),
    localBaseUrl: text("localBaseUrl").default("/uploads").notNull(),
    maxImageSize: integer("maxImageSize").default(2097152).notNull(),
    maxVideoSize: integer("maxVideoSize").default(10485760).notNull(),
    enableCompression: boolean("enableCompression").default(true).notNull(),
    compressionQuality: integer("compressionQuality").default(80).notNull(),
    maxTagsPerPost: integer("maxTagsPerPost").default(20).notNull(),
    enableCaptcha: boolean("enableCaptcha").default(false).notNull(),
    requireApproval: boolean("requireApproval").default(true).notNull(),
    maxPostsPerDay: integer("maxPostsPerDay").default(10).notNull(),
    maxUploadsPerHour: integer("maxUploadsPerHour").default(20).notNull(),
    enableAuditLogging: boolean("enableAuditLogging").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    updatedBy: text("updatedBy").notNull(),
    postsPageSize: integer("postsPageSize").default(12).notNull(),
    featuredPostsLimit: integer("featuredPostsLimit").default(12).notNull(),
    allowUserPosts: boolean("allowUserPosts").default(true).notNull(),
    allowUserUploads: boolean("allowUserUploads").default(true).notNull(),
  },
  (t) => [
    index("settings_storage_type_idx").on(t.storageType),
    index("settings_updated_by_idx").on(t.updatedBy),
    index("settings_created_at_desc_idx").on(t.createdAt),
    index("settings_updated_at_desc_idx").on(t.updatedAt),
    pgPolicy("settings_select_admin", {
      as: "permissive",
      for: "select",
      to: "public",
      using: isAdmin,
    }),
    pgPolicy("settings_insert_admin", {
      as: "permissive",
      for: "insert",
      to: "public",
      withCheck: isAdmin,
    }),
    pgPolicy("settings_update_admin", {
      as: "permissive",
      for: "update",
      to: "public",
      using: isAdmin,
      withCheck: isAdmin,
    }),
    pgPolicy("settings_delete_admin", {
      as: "permissive",
      for: "delete",
      to: "public",
      using: isAdmin,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Relation types for Drizzle relational queries (optional)
// -----------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  stars: many(stars),
  posts: many(posts),
}));

export const categoriesRelations = relations(
  categories,
  ({ one, many }) => ({
    parent: one(categories, {
      fields: [categories.parentId],
      references: [categories.id],
      relationName: "CategoryParent",
    }),
    children: many(categories, { relationName: "CategoryParent" }),
    posts: many(posts),
  })
);

export const tagsRelations = relations(tags, ({ many }) => ({
  postToTag: many(postToTag),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
  stars: many(stars),
  media: many(media),
  postToTag: many(postToTag),
}));

export const starsRelations = relations(stars, ({ one }) => ({
  post: one(posts, { fields: [stars.postId], references: [posts.id] }),
  user: one(users, { fields: [stars.userId], references: [users.id] }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  post: one(posts, { fields: [media.postId], references: [posts.id] }),
}));

export const postToTagRelations = relations(postToTag, ({ one }) => ({
  post: one(posts, { fields: [postToTag.A], references: [posts.id] }),
  tag: one(tags, { fields: [postToTag.B], references: [tags.id] }),
}));
