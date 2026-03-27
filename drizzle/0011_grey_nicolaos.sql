CREATE TYPE "public"."BlogStatus" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"content" text DEFAULT '' NOT NULL,
	"featuredImageUrl" text,
	"readingTime" integer,
	"authorId" text NOT NULL,
	"status" "BlogStatus" DEFAULT 'DRAFT' NOT NULL,
	"publishedAt" timestamp with time zone,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "blog_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_posts_status_published_at_idx" ON "blog_posts" USING btree ("status","publishedAt");--> statement-breakpoint
CREATE INDEX "blog_posts_slug_status_idx" ON "blog_posts" USING btree ("slug") WHERE "status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "blog_posts_author_created_at_idx" ON "blog_posts" USING btree ("authorId","createdAt");--> statement-breakpoint
CREATE POLICY "blog_posts_select_published_or_admin" ON "blog_posts" AS PERMISSIVE FOR SELECT TO public USING ("status" = 'PUBLISHED' OR current_user_is_admin());--> statement-breakpoint
CREATE POLICY "blog_posts_insert_admin" ON "blog_posts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "blog_posts_update_admin" ON "blog_posts" AS PERMISSIVE FOR UPDATE TO public USING (current_user_is_admin()) WITH CHECK (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "blog_posts_delete_admin" ON "blog_posts" AS PERMISSIVE FOR DELETE TO public USING (current_user_is_admin());