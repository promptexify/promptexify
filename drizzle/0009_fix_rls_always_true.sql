-- Fix stale RLS policies that were created with USING (true) / WITH CHECK (true)
-- before Drizzle migrations ran. Drizzle uses CREATE POLICY (not CREATE OR REPLACE),
-- so old policies created via db:push or manual SQL are never updated.
-- This migration drops and recreates each affected policy with the correct condition.

-- ---------------------------------------------------------------------------
-- bookmarks
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "bookmarks_insert_own" ON "bookmarks";--> statement-breakpoint
CREATE POLICY "bookmarks_insert_own" ON "bookmarks"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ("userId" = auth.uid()::text);--> statement-breakpoint

DROP POLICY IF EXISTS "bookmarks_update_own" ON "bookmarks";--> statement-breakpoint
CREATE POLICY "bookmarks_update_own" ON "bookmarks"
  AS PERMISSIVE FOR UPDATE TO public
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);--> statement-breakpoint

DROP POLICY IF EXISTS "bookmarks_delete_own" ON "bookmarks";--> statement-breakpoint
CREATE POLICY "bookmarks_delete_own" ON "bookmarks"
  AS PERMISSIVE FOR DELETE TO public
  USING ("userId" = auth.uid()::text);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "categories_insert_admin" ON "categories";--> statement-breakpoint
CREATE POLICY "categories_insert_admin" ON "categories"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (current_user_is_admin());--> statement-breakpoint

DROP POLICY IF EXISTS "categories_update_admin" ON "categories";--> statement-breakpoint
CREATE POLICY "categories_update_admin" ON "categories"
  AS PERMISSIVE FOR UPDATE TO public
  USING (current_user_is_admin())
  WITH CHECK (current_user_is_admin());--> statement-breakpoint

DROP POLICY IF EXISTS "categories_delete_admin" ON "categories";--> statement-breakpoint
CREATE POLICY "categories_delete_admin" ON "categories"
  AS PERMISSIVE FOR DELETE TO public
  USING (current_user_is_admin());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tags_insert_admin" ON "tags";--> statement-breakpoint
CREATE POLICY "tags_insert_admin" ON "tags"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (current_user_is_admin());--> statement-breakpoint

DROP POLICY IF EXISTS "tags_update_admin" ON "tags";--> statement-breakpoint
CREATE POLICY "tags_update_admin" ON "tags"
  AS PERMISSIVE FOR UPDATE TO public
  USING (current_user_is_admin())
  WITH CHECK (current_user_is_admin());--> statement-breakpoint

DROP POLICY IF EXISTS "tags_delete_admin" ON "tags";--> statement-breakpoint
CREATE POLICY "tags_delete_admin" ON "tags"
  AS PERMISSIVE FOR DELETE TO public
  USING (current_user_is_admin());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "posts_insert_authenticated" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_insert_authenticated" ON "posts"
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ("authorId" = auth.uid()::text);--> statement-breakpoint

DROP POLICY IF EXISTS "posts_update_author_or_admin" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_update_author_or_admin" ON "posts"
  AS PERMISSIVE FOR UPDATE TO public
  USING ("authorId" = auth.uid()::text OR current_user_is_admin())
  WITH CHECK ("authorId" = auth.uid()::text OR current_user_is_admin());--> statement-breakpoint

DROP POLICY IF EXISTS "posts_delete_author_or_admin" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_delete_author_or_admin" ON "posts"
  AS PERMISSIVE FOR DELETE TO public
  USING ("authorId" = auth.uid()::text OR current_user_is_admin());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- _PostToTag
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "_PostToTag_insert_author_or_admin" ON "_PostToTag";--> statement-breakpoint
CREATE POLICY "_PostToTag_insert_author_or_admin" ON "_PostToTag"
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM posts
    WHERE posts.id = "A"
    AND (posts."authorId" = auth.uid()::text OR current_user_is_admin())
  ));--> statement-breakpoint

DROP POLICY IF EXISTS "_PostToTag_delete_author_or_admin" ON "_PostToTag";--> statement-breakpoint
CREATE POLICY "_PostToTag_delete_author_or_admin" ON "_PostToTag"
  AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS (
    SELECT 1 FROM posts
    WHERE posts.id = "A"
    AND (posts."authorId" = auth.uid()::text OR current_user_is_admin())
  ));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- media
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "media_insert_authenticated" ON "media";--> statement-breakpoint
CREATE POLICY "media_insert_authenticated" ON "media"
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ("uploadedBy" = auth.uid()::text);--> statement-breakpoint

DROP POLICY IF EXISTS "media_update_owner_or_admin" ON "media";--> statement-breakpoint
CREATE POLICY "media_update_owner_or_admin" ON "media"
  AS PERMISSIVE FOR UPDATE TO public
  USING ("uploadedBy" = auth.uid()::text OR current_user_is_admin())
  WITH CHECK ("uploadedBy" = auth.uid()::text OR current_user_is_admin());--> statement-breakpoint

DROP POLICY IF EXISTS "media_delete_owner_or_admin" ON "media";--> statement-breakpoint
CREATE POLICY "media_delete_owner_or_admin" ON "media"
  AS PERMISSIVE FOR DELETE TO public
  USING ("uploadedBy" = auth.uid()::text OR current_user_is_admin());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "settings_insert_admin" ON "settings";--> statement-breakpoint
CREATE POLICY "settings_insert_admin" ON "settings"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (current_user_is_admin());--> statement-breakpoint

DROP POLICY IF EXISTS "settings_update_admin" ON "settings";--> statement-breakpoint
CREATE POLICY "settings_update_admin" ON "settings"
  AS PERMISSIVE FOR UPDATE TO public
  USING (current_user_is_admin())
  WITH CHECK (current_user_is_admin());--> statement-breakpoint

DROP POLICY IF EXISTS "settings_delete_admin" ON "settings";--> statement-breakpoint
CREATE POLICY "settings_delete_admin" ON "settings"
  AS PERMISSIVE FOR DELETE TO public
  USING (current_user_is_admin());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_insert_own" ON "users";--> statement-breakpoint
CREATE POLICY "users_insert_own" ON "users"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (id = auth.uid()::text);--> statement-breakpoint

DROP POLICY IF EXISTS "users_update_own" ON "users";--> statement-breakpoint
CREATE POLICY "users_update_own" ON "users"
  AS PERMISSIVE FOR UPDATE TO public
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);--> statement-breakpoint

DROP POLICY IF EXISTS "users_delete_admin_only" ON "users";--> statement-breakpoint
CREATE POLICY "users_delete_admin_only" ON "users"
  AS PERMISSIVE FOR DELETE TO public
  USING (current_user_is_admin());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- logs — replace the old open policy if it still exists
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "logs_insert_authenticated" ON "logs";
