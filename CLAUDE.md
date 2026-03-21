# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start dev server with Turbopack

# Build & Production
npm run build            # Builds Next.js application
npm start                # Start production server

# Database
npm run db:deploy        # Full deploy: RLS helper functions + Drizzle migrations
npm run db:migrate       # Run pending Drizzle migrations only
npm run db:generate      # Generate migration from schema changes
npm run db:push          # Push schema changes without migrations (dev only) — NOTE: crashes on RLS policies in drizzle-kit 0.31.x; use db:deploy instead
npm run db:rls           # Apply RLS helper functions only
npm run db:studio        # Open Drizzle Studio GUI
npm run db:seed          # Seed the database
npm run db:reset         # Reset database

# Linting
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix ESLint issues
npm run lint:format      # Format with Prettier

# CSP utilities
npm run csp:hash         # Generate a CSP hash for an inline script
npm run csp:analyze      # Analyze a CSP violation report
```

No test runner is configured; the only test file is `lib/security/sanitize.test.ts`. Run it with:
```bash
npx tsx lib/security/sanitize.test.ts
```

## Architecture

### Tech Stack
- **Next.js 15** App Router with Turbopack, React 18
- **PostgreSQL** via **Drizzle ORM** (schema in `lib/db/schema.ts`, migrations in `drizzle/`)
- **Supabase Auth** — handles sessions; user records are mirrored into Drizzle `users` table via `upsertUserInDatabase`
- **Redis** — rate limiting; falls back to in-memory when Redis is unavailable
- **Cloudflare Turnstile** — CAPTCHA on auth and post submission pages; gracefully disabled when env vars are absent

### Route Groups

```
app/
  (auth)/          # Public auth pages: signin, signup
  (main)/          # Public-facing site: home, directory, entry/[id]
    @modal/        # Parallel route for post preview modal
  (protected)/     # Authenticated routes (layout enforces auth)
    dashboard/     # User dashboard
    posts/         # Post management: list, new, edit/[id]
    stars/         # User's starred posts
    tags/          # Tag management
  api/             # API routes: posts, admin, webhooks, csrf, analytics, etc.
```

### Data Flow

1. **Authentication**: Supabase session → `lib/supabase/middleware.ts` updates cookie → `getCurrentUser()` in `lib/auth.ts` fetches Supabase user + Drizzle `userData`. Use `requireAuth()` / `requireAdmin()` for protected server actions/routes.

2. **Posts**: Stored in Postgres. Queries are in `lib/query.ts` (`PostQueries`, `MetadataQueries` classes) with typed `POST_SELECTS` objects for list/full/api/admin shapes. The `Queries` object at the bottom provides a unified interface that bypasses cache for authenticated users.

3. **Caching**: `lib/cache.ts` wraps `unstable_cache` with Redis/memory fallback. Use `CACHE_TAGS` constants and `revalidateCache()` after mutations. Redis is auto-configured for development (`localhost:6379`).

4. **Server Actions**: All in `actions/`. Actions are wrapped with `withCSRFProtection()` from `lib/security/csp.ts`. Input is sanitized via `lib/security/sanitize.ts` before DB writes.

5. **Middleware** (`proxy.ts`): Runs on every request (except static/image assets). Handles: Supabase session refresh → CSP nonce injection (`x-nonce` header + `csp-nonce` cookie) → CSRF validation for non-GET API calls → Redis rate limiting.

### Security Architecture

- **CSP**: Nonce generated per request via `CSPNonce.generate()`, passed to Server Components via `x-nonce` header, to Client Components via `csp-nonce` cookie. `https://challenges.cloudflare.com` is allowed in `script-src`, `frame-src`, and `connect-src` for Turnstile.
- **CSRF**: Token stored in cookie, validated in middleware for all mutating API calls. Endpoints that skip CSRF: `/api/webhooks/`, `/api/auth/`, `/auth/callback`, `/api/security/csp-report`.
- **Rate limiting**: `lib/edge.ts` — Redis-backed, falls back to in-memory. Applied globally to `/api/*` routes in middleware.
- **Input sanitization**: `lib/security/sanitize.ts` — use `sanitizeInput()` for text fields, `sanitizeContent()` for HTML content, `sanitizeTagSlug()` for slugs.
- **Audit logging**: `lib/security/audit.ts` `SecurityEvents` — logs auth failures, rate limit hits, etc. to the `logs` table.
- **Row-Level Security (RLS)**: Defined in Drizzle schema (`lib/db/schema.ts`) via `pgPolicy()` + `.enableRLS()`. Helper functions (`current_user_is_admin()`, `current_user_id()`) in `scripts/rls-functions.sql`. Run `npm run db:deploy` to apply both RLS functions and migrations on deploy.
- **Turnstile CAPTCHA**: `lib/security/turnstile.ts` — server-side Cloudflare siteverify. Called in `magicLinkAction`, `createPostAction`, and `updatePostAction`. Client widget: `components/turnstile-widget.tsx` (renders nothing when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset). Token passed as `cf-turnstile-response` in FormData.

### Drizzle ORM

- Schema defined in `lib/db/schema.ts`. Migrations generated to `drizzle/` folder.
- `lib/db/index.ts` exports a singleton `db` client plus `withTransaction()` and `withErrorHandling()` utilities.
- Schema enums: `UserType` (FREE/PREMIUM), `UserRole` (USER/ADMIN), `PostStatus` (DRAFT/PENDING_APPROVAL/APPROVED/REJECTED), `OAuthProvider` (GOOGLE/EMAIL).
- **RLS policies** are declared inline in each table's third argument using `pgPolicy()` from `drizzle-orm/pg-core`. This ensures `drizzle-kit generate` includes them in migrations and won't drop them.
- **Deployment**: Always use `npm run db:deploy` (runs `scripts/deploy-db.ts`) which applies RLS helper functions first, then runs Drizzle migrations. Never use `drizzle-kit push` on a schema with RLS policies — it crashes with a `TypeError` in drizzle-kit 0.31.x.
- **Fresh DB setup**: If migrating to a new Supabase project, apply consolidated DDL via the Supabase MCP `apply_migration` tool (derived from `drizzle/meta/<latest>_snapshot.json`), then seed `drizzle.__drizzle_migrations` with the SHA256 hashes of all migration files using `readMigrationFiles()` from `drizzle-orm/migrator`.
- **Required extensions**: `pg_trgm` and `btree_gin` must exist before schema migration (`CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gin;`).
- **RLS helper function gotcha**: `current_user_is_admin()` uses `LANGUAGE sql` with `SECURITY DEFINER` and `SET search_path = public`. Both helper functions are defined in `scripts/rls-functions.sql` and applied via `npm run db:deploy`.

### Key Patterns

- **`actions/index.ts`** re-exports all server actions as a barrel.
- **Cache invalidation**: call `revalidateCache(CACHE_TAGS.POSTS)` (or relevant tag) after any data mutation. Tags include `USER_STARS`, `POST_BY_ID`, `POSTS`, etc.
- **Access**: All users have full access; no paid tiers. `hasActivePremiumSubscription()` in `lib/auth.ts` always returns true.
- **Parallel modal route**: `app/(main)/@modal/` intercepts `/entry/[id]` links to show a modal preview without full page navigation.
- **Server action responses**: Actions return `ActionResult` — `{ success: boolean; message?: string; error?: string; data?: unknown }`.
- **Client mutations**: Use `useTransition()` for async server actions in Client Components (not `useFormStatus`). Multiple `useTransition` calls are fine for parallel independent ops.
- **Validation**: Zod schemas live in `lib/schemas.ts`. Slugs enforce no leading/trailing/consecutive hyphens via regex.
- **Performance**: Use `React.cache()` for request-level memoization in Server Components. Use `Promise.allSettled()` for parallel fetches that should not block on failure. `PerformanceMonitor` (in `lib/`) measures async operations; slow DB queries (>500ms) are logged by `DatabasePerformanceMonitor`.
- **Stars**: Users can star posts. `actions/stars.ts` provides `toggleStarAction`, `getUserStarsAction`, `checkStarStatusAction`. Client button: `components/star-button.tsx`. Stars page: `app/(protected)/stars/`.
