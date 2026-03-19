-- Performance indexes: extensions, triggers, and partial indexes
-- Run ONCE after Drizzle migrations, via: psql $DATABASE_URL -f scripts/perf-indexes.sql
-- Or add to scripts/deploy-db.ts before running db:migrate.
--
-- Safe to re-run (all statements use IF NOT EXISTS / OR REPLACE).

-- ---------------------------------------------------------------------------
-- 0. Move extensions out of the public schema (Supabase security advisory)
-- ---------------------------------------------------------------------------

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
END $$;

-- ---------------------------------------------------------------------------
-- 1. search_vector trigger
-- Keeps posts.search_vector in sync with title + description.
-- ---------------------------------------------------------------------------

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
$$;

DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;
CREATE TRIGGER posts_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description
  ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_search_vector_update();

-- 2. Backfill existing rows (idempotent — only updates rows where vector is stale/null)
UPDATE posts
SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B')
WHERE search_vector IS NULL
   OR search_vector != (
     setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
     setweight(to_tsvector('english', coalesce(description, '')), 'B')
   );

-- ---------------------------------------------------------------------------
-- 3. Statistics target for commonly filtered columns
-- Helps the query planner make better row-count estimates.
-- ---------------------------------------------------------------------------

ALTER TABLE posts ALTER COLUMN "isPublished" SET STATISTICS 500;
ALTER TABLE posts ALTER COLUMN "categoryId"  SET STATISTICS 500;
ALTER TABLE posts ALTER COLUMN "authorId"    SET STATISTICS 500;
ALTER TABLE posts ALTER COLUMN status        SET STATISTICS 500;

ANALYZE posts;
ANALYZE tags;
ANALYZE "_PostToTag";
