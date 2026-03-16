-- RLS Helper Functions for Supabase
-- These functions are referenced by Drizzle pgPolicy definitions.
-- Run this BEFORE drizzle-kit migrate to ensure functions exist.
-- Safe to run repeatedly (CREATE OR REPLACE is idempotent).

-- current_user_is_admin(): returns true if the JWT bearer is an admin user
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text
    AND role = 'ADMIN'
  );
$$;

-- current_user_id(): returns the current user's UUID from the JWT
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;
