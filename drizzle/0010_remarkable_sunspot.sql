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
ALTER POLICY "logs_insert_admin" ON "logs" TO public WITH CHECK (current_user_is_admin());--> statement-breakpoint
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
DROP TYPE IF EXISTS "public"."StorageType";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."UploadFileType";
