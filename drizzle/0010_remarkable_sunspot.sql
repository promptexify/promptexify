-- =============================================================================
-- Step 1: RLS helper functions (must exist before policies are created)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id::uuid = auth.uid()
    AND role = 'ADMIN'
  );
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;--> statement-breakpoint

-- =============================================================================
-- Step 2: Schema migration — drop removed media/storage/upload columns & tables
-- =============================================================================

DROP TABLE IF EXISTS "media" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "settings_storage_type_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_slug_published_idx" ON "posts" USING btree ("slug") WHERE "isPublished" = true;--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN IF EXISTS "blurData";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN IF EXISTS "uploadFileType";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN IF EXISTS "uploadPath";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN IF EXISTS "previewPath";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN IF EXISTS "previewVideoPath";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "storageType";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "s3BucketName";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "s3Region";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "s3AccessKeyIdVaultId";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "s3SecretKeyVaultId";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "s3CloudfrontUrl";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "doSpaceName";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "doRegion";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "doAccessKeyIdVaultId";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "doSecretKeyVaultId";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "doCdnUrl";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "localBasePath";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "localBaseUrl";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "maxImageSize";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "maxVideoSize";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "enableCompression";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "compressionQuality";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "maxUploadsPerHour";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "allowUserUploads";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."StorageType";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."UploadFileType";--> statement-breakpoint

-- RLS policies
DROP POLICY IF EXISTS "logs_insert_admin" ON "logs";--> statement-breakpoint
CREATE POLICY "logs_insert_admin" ON "logs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_user_is_admin());--> statement-breakpoint
DROP POLICY IF EXISTS "_PostToTag_insert_author_or_admin" ON "_PostToTag";--> statement-breakpoint
CREATE POLICY "_PostToTag_insert_author_or_admin" ON "_PostToTag" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM posts
  WHERE posts.id = "A"
  AND (posts."authorId" = auth.uid()::text OR current_user_is_admin())
));--> statement-breakpoint
DROP POLICY IF EXISTS "_PostToTag_delete_author_or_admin" ON "_PostToTag";--> statement-breakpoint
CREATE POLICY "_PostToTag_delete_author_or_admin" ON "_PostToTag" AS PERMISSIVE FOR DELETE TO public USING (EXISTS (
  SELECT 1 FROM posts
  WHERE posts.id = "A"
  AND (posts."authorId" = auth.uid()::text OR current_user_is_admin())
));--> statement-breakpoint

-- =============================================================================
-- Step 3: Performance indexes, search vector trigger, and statistics
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'btree_gin' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION btree_gin SET SCHEMA extensions;
  END IF;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION posts_search_vector_update()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;--> statement-breakpoint
CREATE TRIGGER posts_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description
  ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_search_vector_update();--> statement-breakpoint

UPDATE posts
SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B')
WHERE search_vector IS NULL
   OR search_vector != (
     setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
     setweight(to_tsvector('english', coalesce(description, '')), 'B')
   );--> statement-breakpoint

ALTER TABLE posts ALTER COLUMN "isPublished" SET STATISTICS 500;--> statement-breakpoint
ALTER TABLE posts ALTER COLUMN "categoryId"  SET STATISTICS 500;--> statement-breakpoint
ALTER TABLE posts ALTER COLUMN "authorId"    SET STATISTICS 500;--> statement-breakpoint
ALTER TABLE posts ALTER COLUMN status        SET STATISTICS 500;--> statement-breakpoint

ANALYZE posts;--> statement-breakpoint
ANALYZE tags;--> statement-breakpoint
ANALYZE "_PostToTag";--> statement-breakpoint

-- =============================================================================
-- Step 4: Register migration in Drizzle tracking table
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS drizzle;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);--> statement-breakpoint
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('1a82c69257b23722f8714d142ce2214ee421a2fe87b5a7c60088ed77915cb451', 1774058108368)
ON CONFLICT DO NOTHING;
