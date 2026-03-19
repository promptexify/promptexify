-- Restrict log inserts via PostgREST to admins only.
-- Previously any authenticated user could insert arbitrary audit log entries.
-- Server-side Drizzle queries use BYPASSRLS and are unaffected.

DROP POLICY IF EXISTS "logs_insert_authenticated" ON "logs";--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'logs'
      AND policyname = 'logs_insert_admin'
  ) THEN
    CREATE POLICY "logs_insert_admin"
      ON "logs"
      AS PERMISSIVE
      FOR INSERT
      TO public
      WITH CHECK (current_user_is_admin());
  END IF;
END $$;
