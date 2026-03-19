-- Required by trigram indexes below
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gin;--> statement-breakpoint
DROP INDEX "posts_published_premium_created_idx";--> statement-breakpoint
DROP INDEX "posts_author_status_idx";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
CREATE INDEX "postToTag_b_idx" ON "_PostToTag" USING btree ("B");--> statement-breakpoint
CREATE INDEX "posts_published_created_partial_idx" ON "posts" USING btree ("createdAt") WHERE "isPublished" = true;--> statement-breakpoint
CREATE INDEX "posts_search_vector_gin_idx" ON "posts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "posts_title_trgm_idx" ON "posts" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "posts_description_trgm_idx" ON "posts" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tags_name_trgm_idx" ON "tags" USING gin ("name" gin_trgm_ops);