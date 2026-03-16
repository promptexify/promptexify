ALTER TABLE "bookmarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "_PostToTag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE POLICY "bookmarks_select_own" ON "bookmarks" AS PERMISSIVE FOR SELECT TO public USING ("userId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "bookmarks_insert_own" ON "bookmarks" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("userId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "bookmarks_update_own" ON "bookmarks" AS PERMISSIVE FOR UPDATE TO public USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "bookmarks_delete_own" ON "bookmarks" AS PERMISSIVE FOR DELETE TO public USING ("userId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "categories_select_all" ON "categories" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "categories_insert_admin" ON "categories" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "categories_update_admin" ON "categories" AS PERMISSIVE FOR UPDATE TO public USING (current_user_is_admin()) WITH CHECK (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "categories_delete_admin" ON "categories" AS PERMISSIVE FOR DELETE TO public USING (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "favorites_select_own" ON "favorites" AS PERMISSIVE FOR SELECT TO public USING ("userId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "favorites_insert_own" ON "favorites" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("userId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "favorites_update_own" ON "favorites" AS PERMISSIVE FOR UPDATE TO public USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "favorites_delete_own" ON "favorites" AS PERMISSIVE FOR DELETE TO public USING ("userId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "logs_select_admin" ON "logs" AS PERMISSIVE FOR SELECT TO public USING (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "logs_insert_authenticated" ON "logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "media_select_all" ON "media" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "media_insert_authenticated" ON "media" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("uploadedBy" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "media_update_owner_or_admin" ON "media" AS PERMISSIVE FOR UPDATE TO public USING (("uploadedBy" = auth.uid()::text OR current_user_is_admin())) WITH CHECK (("uploadedBy" = auth.uid()::text OR current_user_is_admin()));--> statement-breakpoint
CREATE POLICY "media_delete_owner_or_admin" ON "media" AS PERMISSIVE FOR DELETE TO public USING (("uploadedBy" = auth.uid()::text OR current_user_is_admin()));--> statement-breakpoint
CREATE POLICY "_PostToTag_select_all" ON "_PostToTag" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "_PostToTag_insert_author_or_admin" ON "_PostToTag" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (
        SELECT 1 FROM posts
        WHERE posts.id = "A"
        AND (posts."authorId" = auth.uid()::text OR current_user_is_admin())
      ));--> statement-breakpoint
CREATE POLICY "_PostToTag_delete_author_or_admin" ON "_PostToTag" AS PERMISSIVE FOR DELETE TO public USING (EXISTS (
        SELECT 1 FROM posts
        WHERE posts.id = "A"
        AND (posts."authorId" = auth.uid()::text OR current_user_is_admin())
      ));--> statement-breakpoint
CREATE POLICY "posts_select_published_or_own_or_admin" ON "posts" AS PERMISSIVE FOR SELECT TO public USING ("isPublished" = true OR "authorId" = auth.uid()::text OR current_user_is_admin());--> statement-breakpoint
CREATE POLICY "posts_insert_authenticated" ON "posts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("authorId" = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "posts_update_author_or_admin" ON "posts" AS PERMISSIVE FOR UPDATE TO public USING (("authorId" = auth.uid()::text OR current_user_is_admin())) WITH CHECK (("authorId" = auth.uid()::text OR current_user_is_admin()));--> statement-breakpoint
CREATE POLICY "posts_delete_author_or_admin" ON "posts" AS PERMISSIVE FOR DELETE TO public USING (("authorId" = auth.uid()::text OR current_user_is_admin()));--> statement-breakpoint
CREATE POLICY "settings_select_admin" ON "settings" AS PERMISSIVE FOR SELECT TO public USING (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "settings_insert_admin" ON "settings" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "settings_update_admin" ON "settings" AS PERMISSIVE FOR UPDATE TO public USING (current_user_is_admin()) WITH CHECK (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "settings_delete_admin" ON "settings" AS PERMISSIVE FOR DELETE TO public USING (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "tags_select_all" ON "tags" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "tags_insert_admin" ON "tags" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "tags_update_admin" ON "tags" AS PERMISSIVE FOR UPDATE TO public USING (current_user_is_admin()) WITH CHECK (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "tags_delete_admin" ON "tags" AS PERMISSIVE FOR DELETE TO public USING (current_user_is_admin());--> statement-breakpoint
CREATE POLICY "users_select_own_or_admin" ON "users" AS PERMISSIVE FOR SELECT TO public USING (id = auth.uid()::text OR current_user_is_admin());--> statement-breakpoint
CREATE POLICY "users_insert_own" ON "users" AS PERMISSIVE FOR INSERT TO public WITH CHECK (id = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "users_update_own" ON "users" AS PERMISSIVE FOR UPDATE TO public USING (id = auth.uid()::text) WITH CHECK (id = auth.uid()::text);--> statement-breakpoint
CREATE POLICY "users_delete_admin_only" ON "users" AS PERMISSIVE FOR DELETE TO public USING (current_user_is_admin());