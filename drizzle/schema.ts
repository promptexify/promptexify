import { pgTable, index, uniqueIndex, pgPolicy, text, timestamp, boolean, foreignKey, integer, doublePrecision, jsonb, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const oauthProvider = pgEnum("OAuthProvider", ['GOOGLE', 'EMAIL'])
export const postStatus = pgEnum("PostStatus", ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'])
export const storageType = pgEnum("StorageType", ['S3', 'LOCAL', 'DOSPACE'])
export const uploadFileType = pgEnum("UploadFileType", ['IMAGE', 'VIDEO'])
export const userRole = pgEnum("UserRole", ['USER', 'ADMIN'])
export const userType = pgEnum("UserType", ['FREE', 'PREMIUM'])


export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	email: text().notNull(),
	name: text(),
	avatar: text(),
	type: userType().default('FREE').notNull(),
	role: userRole().default('USER').notNull(),
	oauth: oauthProvider().notNull(),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	stripePriceId: text("stripe_price_id"),
	stripeCurrentPeriodEnd: timestamp("stripe_current_period_end", { precision: 3, mode: 'string' }),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	disabled: boolean().default(false).notNull(),
}, (table) => [
	index("users_createdAt_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("users_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("users_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("users_id_role_idx").using("btree", table.id.asc().nullsLast().op("text_ops"), table.role.asc().nullsLast().op("enum_ops")),
	index("users_id_type_stripe_current_period_end_idx").using("btree", table.id.asc().nullsLast().op("timestamp_ops"), table.type.asc().nullsLast().op("text_ops"), table.stripeCurrentPeriodEnd.asc().nullsLast().op("text_ops")),
	index("users_stripe_customer_id_idx").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")),
	uniqueIndex("users_stripe_customer_id_key").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")),
	uniqueIndex("users_stripe_subscription_id_key").using("btree", table.stripeSubscriptionId.asc().nullsLast().op("text_ops")),
	index("users_type_role_idx").using("btree", table.type.asc().nullsLast().op("enum_ops"), table.role.asc().nullsLast().op("enum_ops")),
	pgPolicy("Users can update profiles", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(( SELECT is_admin() AS is_admin) OR ((( SELECT auth.uid() AS uid))::text = id))`, withCheck: sql`
CASE
    WHEN ( SELECT is_admin() AS is_admin) THEN true
    ELSE (((( SELECT auth.uid() AS uid))::text = id) AND (role = ( SELECT users_1.role
       FROM users users_1
      WHERE (users_1.id = (( SELECT auth.uid() AS uid))::text))) AND (type = ( SELECT users_1.type
       FROM users users_1
      WHERE (users_1.id = (( SELECT auth.uid() AS uid))::text))) AND (oauth = ( SELECT users_1.oauth
       FROM users users_1
      WHERE (users_1.id = (( SELECT auth.uid() AS uid))::text))))
END`  }),
	pgPolicy("Users can view own profile or admins can view all", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const favorites = pgTable("favorites", {
	id: text().primaryKey().notNull(),
	userId: text().notNull(),
	postId: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("favorites_postId_createdAt_idx").using("btree", table.postId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("favorites_postId_idx").using("btree", table.postId.asc().nullsLast().op("text_ops")),
	index("favorites_userId_createdAt_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	uniqueIndex("favorites_userId_postId_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.postId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.postId],
			foreignColumns: [posts.id],
			name: "favorites_postId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "favorites_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	pgPolicy("Favorites can be created", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(("userId" = (( SELECT auth.uid() AS uid))::text) AND (( SELECT auth.uid() AS uid) IS NOT NULL) AND can_access_post(("postId")::uuid))`  }),
	pgPolicy("Favorites can be deleted", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Favorites can be viewed by owner or admin", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const categories = pgTable("categories", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	parentId: text(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("categories_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	uniqueIndex("categories_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("categories_parentId_idx").using("btree", table.parentId.asc().nullsLast().op("text_ops")),
	index("categories_parentId_name_idx").using("btree", table.parentId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	index("categories_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	uniqueIndex("categories_slug_key").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "categories_parentId_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	pgPolicy("Categories access policy", { as: "permissive", for: "all", to: ["anon", "authenticated"], using: sql`
CASE
    WHEN (( SELECT current_setting('request.method'::text, true) AS current_setting) = 'GET'::text) THEN true
    ELSE ( SELECT ( SELECT is_admin() AS is_admin) AS is_admin)
END`, withCheck: sql`( SELECT ( SELECT is_admin() AS is_admin) AS is_admin)`  }),
]);

export const tags = pgTable("tags", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
}, (table) => [
	index("tags_createdAt_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("tags_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	uniqueIndex("tags_name_key").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("tags_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	uniqueIndex("tags_slug_key").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	pgPolicy("Tags access policy", { as: "permissive", for: "all", to: ["anon", "authenticated"], using: sql`
CASE
    WHEN (( SELECT current_setting('request.method'::text, true) AS current_setting) = 'GET'::text) THEN true
    ELSE ( SELECT ( SELECT is_admin() AS is_admin) AS is_admin)
END`, withCheck: sql`( SELECT ( SELECT is_admin() AS is_admin) AS is_admin)`  }),
]);

export const bookmarks = pgTable("bookmarks", {
	id: text().primaryKey().notNull(),
	userId: text().notNull(),
	postId: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("bookmarks_postId_idx").using("btree", table.postId.asc().nullsLast().op("text_ops")),
	index("bookmarks_userId_createdAt_idx").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	uniqueIndex("bookmarks_userId_postId_key").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.postId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.postId],
			foreignColumns: [posts.id],
			name: "bookmarks_postId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "bookmarks_userId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	pgPolicy("Bookmarks can be created", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(("userId" = (( SELECT auth.uid() AS uid))::text) AND (( SELECT auth.uid() AS uid) IS NOT NULL) AND can_access_post(("postId")::uuid))`  }),
	pgPolicy("Bookmarks can be deleted", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Bookmarks can be viewed", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const logs = pgTable("logs", {
	id: text().primaryKey().notNull(),
	action: text().notNull(),
	userId: text(),
	entityType: text().notNull(),
	entityId: text(),
	ipAddress: text(),
	userAgent: text(),
	metadata: jsonb(),
	severity: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("logs_action_createdAt_idx").using("btree", table.action.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("logs_createdAt_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("logs_entityType_entityId_idx").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
	index("logs_severity_action_createdAt_idx").using("btree", table.severity.asc().nullsLast().op("timestamp_ops"), table.action.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("logs_severity_createdAt_idx").using("btree", table.severity.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("logs_userId_action_createdAt_idx").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.action.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("logs_userId_createdAt_idx").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	pgPolicy("Logs can be created by authenticated users", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(( SELECT auth.uid() AS uid) IS NOT NULL)`  }),
	pgPolicy("Logs can be viewed", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const settings = pgTable("settings", {
	id: text().primaryKey().notNull(),
	storageType: storageType().default('S3').notNull(),
	s3BucketName: text(),
	s3Region: text(),
	s3AccessKeyId: text(),
	s3SecretKey: text(),
	s3CloudfrontUrl: text(),
	doSpaceName: text(),
	doRegion: text(),
	doAccessKeyId: text(),
	doSecretKey: text(),
	doCdnUrl: text(),
	localBasePath: text().default('/uploads'),
	localBaseUrl: text().default('/uploads'),
	maxImageSize: integer().default(2097152).notNull(),
	maxVideoSize: integer().default(10485760).notNull(),
	enableCompression: boolean().default(true).notNull(),
	compressionQuality: integer().default(80).notNull(),
	maxTagsPerPost: integer().default(20).notNull(),
	enableCaptcha: boolean().default(false).notNull(),
	requireApproval: boolean().default(true).notNull(),
	maxPostsPerDay: integer().default(10).notNull(),
	maxUploadsPerHour: integer().default(20).notNull(),
	enableAuditLogging: boolean().default(true).notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	updatedBy: text().notNull(),
	postsPageSize: integer().default(12).notNull(),
	featuredPostsLimit: integer().default(12).notNull(),
}, (table) => [
	index("settings_createdAt_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("settings_storageType_idx").using("btree", table.storageType.asc().nullsLast().op("enum_ops")),
	index("settings_updatedAt_idx").using("btree", table.updatedAt.desc().nullsFirst().op("timestamp_ops")),
	index("settings_updatedBy_idx").using("btree", table.updatedBy.asc().nullsLast().op("text_ops")),
	pgPolicy("Settings can be managed", { as: "permissive", for: "all", to: ["authenticated"], using: sql`( SELECT ( SELECT is_admin() AS is_admin) AS is_admin)`, withCheck: sql`( SELECT ( SELECT is_admin() AS is_admin) AS is_admin)`  }),
]);

export const posts = pgTable("posts", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	slug: text().notNull(),
	description: text(),
	content: text().notNull(),
	isPremium: boolean().default(false).notNull(),
	isFeatured: boolean().default(false).notNull(),
	isPublished: boolean().default(false).notNull(),
	status: postStatus().default('DRAFT').notNull(),
	authorId: text().notNull(),
	categoryId: text().notNull(),
	createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
	blurData: text(),
	uploadFileType: uploadFileType(),
	uploadPath: text(),
	previewPath: text(),
	previewVideoPath: text(),
}, (table) => [
	index("posts_authorId_createdAt_idx").using("btree", table.authorId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("posts_authorId_isPublished_status_idx").using("btree", table.authorId.asc().nullsLast().op("text_ops"), table.isPublished.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("posts_authorId_status_createdAt_idx").using("btree", table.authorId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("enum_ops"), table.createdAt.desc().nullsFirst().op("enum_ops")),
	index("posts_authorId_status_idx").using("btree", table.authorId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("posts_categoryId_isPublished_createdAt_idx").using("btree", table.categoryId.asc().nullsLast().op("timestamp_ops"), table.isPublished.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("posts_isFeatured_isPublished_idx").using("btree", table.isFeatured.asc().nullsLast().op("bool_ops"), table.isPublished.asc().nullsLast().op("bool_ops")),
	index("posts_isPremium_isPublished_idx").using("btree", table.isPremium.asc().nullsLast().op("bool_ops"), table.isPublished.asc().nullsLast().op("bool_ops")),
	index("posts_isPublished_createdAt_idx").using("btree", table.isPublished.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("posts_isPublished_isPremium_createdAt_idx").using("btree", table.isPublished.asc().nullsLast().op("bool_ops"), table.isPremium.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("bool_ops")),
	uniqueIndex("posts_slug_key").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	index("posts_status_createdAt_idx").using("btree", table.status.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [users.id],
			name: "posts_authorId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "posts_categoryId_fkey"
		}).onUpdate("cascade").onDelete("restrict"),
	pgPolicy("Posts can be created by authenticated users", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(("authorId" = (( SELECT auth.uid() AS uid))::text) AND (( SELECT auth.uid() AS uid) IS NOT NULL))`  }),
	pgPolicy("Posts can be deleted", { as: "permissive", for: "delete", to: ["authenticated"] }),
	pgPolicy("Posts can be updated", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Posts can be viewed", { as: "permissive", for: "select", to: ["anon", "authenticated"] }),
]);

export const postToTag = pgTable("_PostToTag", {
	a: text("A").notNull(),
	b: text("B").notNull(),
}, (table) => [
	index().using("btree", table.b.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.a],
			foreignColumns: [posts.id],
			name: "_PostToTag_A_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.b],
			foreignColumns: [tags.id],
			name: "_PostToTag_B_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	primaryKey({ columns: [table.a, table.b], name: "_PostToTag_AB_pkey"}),
	pgPolicy("PostToTag access policy", { as: "permissive", for: "all", to: ["anon", "authenticated"], using: sql`
CASE
    WHEN (( SELECT current_setting('request.method'::text, true) AS current_setting) = 'GET'::text) THEN true
    ELSE (( SELECT ( SELECT is_admin() AS is_admin) AS is_admin) OR (EXISTS ( SELECT 1
       FROM posts
      WHERE ((posts.id = "_PostToTag"."A") AND (posts."authorId" = (( SELECT auth.uid() AS uid))::text)))))
END`, withCheck: sql`(( SELECT ( SELECT is_admin() AS is_admin) AS is_admin) OR (EXISTS ( SELECT 1
   FROM posts
  WHERE ((posts.id = "_PostToTag"."A") AND (posts."authorId" = (( SELECT auth.uid() AS uid))::text)))))`  }),
]);
