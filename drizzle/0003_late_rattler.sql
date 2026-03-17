CREATE TYPE "public"."LogSeverity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
DROP INDEX "categories_name_idx";--> statement-breakpoint
DROP INDEX "categories_slug_idx";--> statement-breakpoint
DROP INDEX "tags_name_idx";--> statement-breakpoint
DROP INDEX "tags_slug_idx";--> statement-breakpoint
DROP INDEX "users_email_idx";--> statement-breakpoint
DELETE FROM "logs" WHERE "severity" NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
ALTER TABLE "logs" ALTER COLUMN "severity" SET DATA TYPE "public"."LogSeverity" USING "severity"::"public"."LogSeverity";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "isPremium" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "isFeatured" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "isPublished" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "storageType" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "localBasePath" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "localBaseUrl" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "maxImageSize" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "maxVideoSize" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "enableCompression" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "compressionQuality" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "maxTagsPerPost" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "enableCaptcha" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "requireApproval" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "maxPostsPerDay" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "maxUploadsPerHour" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "enableAuditLogging" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "postsPageSize" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "featuredPostsLimit" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_A_B_pk" PRIMARY KEY("A","B");--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_categories_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "postToTag_a_idx" ON "_PostToTag" USING btree ("A");