-- Migrate storage credentials from plaintext columns to Supabase Vault.
-- Existing values are moved into vault.secrets (encrypted at rest);
-- only the vault UUIDs are stored in the settings table going forward.

ALTER TABLE "settings" ADD COLUMN "s3AccessKeyIdVaultId" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "s3SecretKeyVaultId" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "doAccessKeyIdVaultId" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "doSecretKeyVaultId" uuid;--> statement-breakpoint

UPDATE "settings"
SET
  "s3AccessKeyIdVaultId" = CASE
    WHEN "s3AccessKeyId" IS NOT NULL AND "s3AccessKeyId" != ''
    THEN vault.create_secret("s3AccessKeyId", 's3AccessKeyId')
    ELSE NULL
  END,
  "s3SecretKeyVaultId" = CASE
    WHEN "s3SecretKey" IS NOT NULL AND "s3SecretKey" != ''
    THEN vault.create_secret("s3SecretKey", 's3SecretKey')
    ELSE NULL
  END,
  "doAccessKeyIdVaultId" = CASE
    WHEN "doAccessKeyId" IS NOT NULL AND "doAccessKeyId" != ''
    THEN vault.create_secret("doAccessKeyId", 'doAccessKeyId')
    ELSE NULL
  END,
  "doSecretKeyVaultId" = CASE
    WHEN "doSecretKey" IS NOT NULL AND "doSecretKey" != ''
    THEN vault.create_secret("doSecretKey", 'doSecretKey')
    ELSE NULL
  END;--> statement-breakpoint

ALTER TABLE "settings" DROP COLUMN "s3AccessKeyId";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "s3SecretKey";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "doAccessKeyId";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "doSecretKey";
