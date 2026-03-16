/**
 * Drizzle schema matching existing Prisma/Postgres tables.
 * Column names follow Prisma defaults (camelCase unless @map in schema).
 *
 * RLS policies mirror the original Prisma migration policies and protect
 * data when accessed via the Supabase PostgREST API (anon/authenticated).
 * Server-side Drizzle queries use a role with BYPASSRLS so they are
 * unaffected, but RLS acts as a defense-in-depth layer.
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { authenticatedRole } from "drizzle-orm/supabase";

// -----------------------------------------------------------------------------
// Enums (match Prisma schema)
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

// Type aliases for use outside schema (replacing Prisma enums)
export type PostStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export type StorageType = "S3" | "LOCAL" | "DOSPACE";

// -----------------------------------------------------------------------------
// Reusable SQL fragments for RLS policies
// -----------------------------------------------------------------------------

const authUid = sql`auth.uid()::text`;
const isAdmin = sql`current_user_is_admin()`;
const isOwnerOrAdmin = (col: string) =>
  sql.raw(`("${col}" = auth.uid()::text OR current_user_is_admin())`);

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
    type: userTypeEnum("type").default("FREE"),
    role: userRoleEnum("role").default("USER"),
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
    index("users_email_idx").on(t.email),
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
    parentId: text("parentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("categories_parent_id_idx").on(t.parentId),
    index("categories_name_idx").on(t.name),
    index("categories_slug_idx").on(t.slug),
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
    index("tags_name_idx").on(t.name),
    index("tags_slug_idx").on(t.slug),
    index("tags_created_at_desc_idx").on(t.createdAt),
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
    isPremium: boolean("isPremium").default(false),
    isFeatured: boolean("isFeatured").default(false),
    isPublished: boolean("isPublished").default(false),
    status: postStatusEnum("status").default("DRAFT"),
    authorId: text("authorId").notNull(),
    categoryId: text("categoryId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    blurData: text("blurData"),
    uploadFileType: uploadFileTypeEnum("uploadFileType"),
    uploadPath: text("uploadPath"),
    previewPath: text("previewPath"),
    previewVideoPath: text("previewVideoPath"),
  },
  (t) => [
    index("posts_is_published_created_at_idx").on(t.isPublished, t.createdAt),
    index("posts_category_published_created_idx").on(
      t.categoryId,
      t.isPublished,
      t.createdAt
    ),
    index("posts_author_created_at_idx").on(t.authorId, t.createdAt),
    index("posts_is_premium_is_published_idx").on(t.isPremium, t.isPublished),
    index("posts_is_featured_is_published_idx").on(t.isFeatured, t.isPublished),
    index("posts_status_created_at_idx").on(t.status, t.createdAt),
    index("posts_published_premium_created_idx").on(
      t.isPublished,
      t.isPremium,
      t.createdAt
    ),
    index("posts_author_status_idx").on(t.authorId, t.status),
    index("posts_author_published_status_idx").on(
      t.authorId,
      t.isPublished,
      t.status
    ),
    index("posts_author_status_created_idx").on(
      t.authorId,
      t.status,
      t.createdAt
    ),
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
// Post <-> Tag many-to-many (Prisma implicit table name: _PostToTag)
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
  () => [
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
// Bookmarks (user sees only own rows)
// -----------------------------------------------------------------------------

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    userId: text("userId").notNull(),
    postId: text("postId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("bookmarks_user_id_post_id_key").on(t.userId, t.postId),
    index("bookmarks_user_created_at_idx").on(t.userId, t.createdAt),
    index("bookmarks_post_id_idx").on(t.postId),
    pgPolicy("bookmarks_select_own", {
      as: "permissive",
      for: "select",
      to: "public",
      using: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("bookmarks_insert_own", {
      as: "permissive",
      for: "insert",
      to: "public",
      withCheck: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("bookmarks_update_own", {
      as: "permissive",
      for: "update",
      to: "public",
      using: sql`"userId" = ${authUid}`,
      withCheck: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("bookmarks_delete_own", {
      as: "permissive",
      for: "delete",
      to: "public",
      using: sql`"userId" = ${authUid}`,
    }),
  ]
).enableRLS();

// -----------------------------------------------------------------------------
// Favorites (user sees only own rows)
// -----------------------------------------------------------------------------

export const favorites = pgTable(
  "favorites",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    userId: text("userId").notNull(),
    postId: text("postId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("favorites_user_id_post_id_key").on(t.userId, t.postId),
    index("favorites_user_created_at_idx").on(t.userId, t.createdAt),
    index("favorites_post_id_idx").on(t.postId),
    index("favorites_post_created_at_idx").on(t.postId, t.createdAt),
    pgPolicy("favorites_select_own", {
      as: "permissive",
      for: "select",
      to: "public",
      using: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("favorites_insert_own", {
      as: "permissive",
      for: "insert",
      to: "public",
      withCheck: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("favorites_update_own", {
      as: "permissive",
      for: "update",
      to: "public",
      using: sql`"userId" = ${authUid}`,
      withCheck: sql`"userId" = ${authUid}`,
    }),
    pgPolicy("favorites_delete_own", {
      as: "permissive",
      for: "delete",
      to: "public",
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
    userId: text("userId"),
    entityType: text("entityType").notNull(),
    entityId: text("entityId"),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    metadata: jsonb("metadata"),
    severity: text("severity").notNull(),
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
    pgPolicy("logs_insert_authenticated", {
      as: "permissive",
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`true`,
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
    storageType: storageTypeEnum("storageType").default("S3"),
    s3BucketName: text("s3BucketName"),
    s3Region: text("s3Region"),
    s3AccessKeyId: text("s3AccessKeyId"),
    s3SecretKey: text("s3SecretKey"),
    s3CloudfrontUrl: text("s3CloudfrontUrl"),
    doSpaceName: text("doSpaceName"),
    doRegion: text("doRegion"),
    doAccessKeyId: text("doAccessKeyId"),
    doSecretKey: text("doSecretKey"),
    doCdnUrl: text("doCdnUrl"),
    localBasePath: text("localBasePath").default("/uploads"),
    localBaseUrl: text("localBaseUrl").default("/uploads"),
    maxImageSize: integer("maxImageSize").default(2097152),
    maxVideoSize: integer("maxVideoSize").default(10485760),
    enableCompression: boolean("enableCompression").default(true),
    compressionQuality: integer("compressionQuality").default(80),
    maxTagsPerPost: integer("maxTagsPerPost").default(20),
    enableCaptcha: boolean("enableCaptcha").default(false),
    requireApproval: boolean("requireApproval").default(true),
    maxPostsPerDay: integer("maxPostsPerDay").default(10),
    maxUploadsPerHour: integer("maxUploadsPerHour").default(20),
    enableAuditLogging: boolean("enableAuditLogging").default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    updatedBy: text("updatedBy").notNull(),
    postsPageSize: integer("postsPageSize").default(12),
    featuredPostsLimit: integer("featuredPostsLimit").default(12),
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
  bookmarks: many(bookmarks),
  favorites: many(favorites),
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
  bookmarks: many(bookmarks),
  favorites: many(favorites),
  media: many(media),
  postToTag: many(postToTag),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  post: one(posts, { fields: [bookmarks.postId], references: [posts.id] }),
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  post: one(posts, { fields: [favorites.postId], references: [posts.id] }),
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  post: one(posts, { fields: [media.postId], references: [posts.id] }),
}));

export const postToTagRelations = relations(postToTag, ({ one }) => ({
  post: one(posts, { fields: [postToTag.A], references: [posts.id] }),
  tag: one(tags, { fields: [postToTag.B], references: [tags.id] }),
}));
