# Promptexify

**Directory for the New Coding Era.**

A curated directory of Rules, MCP configurations, Skills, and prompts built for AI coding tools like Cursor and Claude Code. Copy, paste, and go.

## Demo

| Directory | Admin Dashboard |
|-----------|----------------|
| ![Promptexify Directory](public/promptexify-directory.webp) | ![Promptexify Dashboard](public/promptexify-dashboard.webp) |

## What is Promptexify?

Promptexify is a community-driven prompt marketplace for vibe coders — developers who build with AI. Instead of writing prompts from scratch, you discover, copy, and share ready-to-use templates optimized for AI coding workflows.

- **Rules** — Project and editor rules for Cursor, Claude Code, and more
- **MCP Configurations** — Ready-to-use Model Context Protocol setups
- **Skills** — Reusable AI skill definitions
- **Prompts** — Tested, copy-paste-ready prompts for everyday coding tasks

> Prompts can generate inaccurate results. Always review output before using in production.

## Features

- **Searchable Library** — Full-text search across titles, descriptions, tags, and categories
- **Copy-Paste Ready** — No modifications needed; prompts work out of the box
- **Categories & Tags** — Hierarchical organization for quick discovery
- **User Authentication** — Sign in with Google (OAuth + One Tap) or email magic link via Supabase Auth
- **Personal Collections** — Save and organize your favorite prompts
- **Community Contributions** — Share your own prompts with the community
- **Content Moderation** — Draft/approval workflow to maintain quality
- **Admin Dashboard** — Full content and user management interface
- **Free to Use** — No payments, no subscriptions, no paywalls
- **Bot Protection** — Cloudflare Turnstile CAPTCHA on all auth and submission flows

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack), React 18 |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Supabase Auth (OAuth, Magic Link, Google One Tap) |
| Styling | Tailwind CSS + Shadcn UI |
| Cache / Rate Limiting | Redis (in-memory fallback) |
| Security | CSP nonces, CSRF tokens, rate limiting, Turnstile CAPTCHA, audit logs |

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase project (PostgreSQL + Auth)
- Redis (optional in dev — in-memory fallback available)

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/promptexify/promptexify.git
   cd promptexify
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp env.template .env.local
   # Fill in your Supabase, database, and Redis credentials
   ```

4. **Set up the database**

   ```bash
   npm run db:deploy    # Apply RLS functions + migrations
   npm run db:seed      # Optional: seed sample data
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

See `env.template` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `SUPABASE_JWT_SECRET` | Yes | Supabase JWT secret |
| `NEXT_PUBLIC_BASE_URL` | Yes | Public URL of the app (e.g. `https://promptexify.com`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | No | Google OAuth client ID — enables Google One Tap on the homepage. Must match the client ID configured in Supabase's Google provider. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | Cloudflare Turnstile site key — shows the CAPTCHA widget on auth/submission pages. Omit to skip CAPTCHA in local dev. |
| `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile secret key — used server-side to verify tokens. Required in production when site key is set. |
| `REDIS_URL` | No | Redis connection URL. Falls back to in-memory when omitted (dev only). |

> **Google One Tap + Turnstile:** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must be the same client ID configured under **Supabase → Authentication → Providers → Google**. One Tap is only shown to unauthenticated users and only after Turnstile passes. The Google OAuth client must have your domain listed under **Authorized JavaScript origins** in Google Cloud Console.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Build for production (runs DB deploy first) |
| `npm start` | Start production server |
| `npm run db:deploy` | Full deploy: RLS functions + Drizzle migrations |
| `npm run db:migrate` | Apply pending migrations only |
| `npm run db:rls` | Apply RLS helper functions only |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:studio` | Open Drizzle Studio GUI |
| `npm run db:seed` | Seed the database |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run lint:format` | Format with Prettier |

## Architecture

### Request Flow

```
Request
  → Middleware (Supabase session, CSP nonce, CSRF validation, rate limiting)
  → Route Handler / Server Action
  → Drizzle ORM → PostgreSQL
```

### Route Groups

```
app/
  (auth)/           # Public auth pages: signin, signup
  (main)/           # Public site: home, directory, entry/[id]
    @modal/         # Parallel route: post preview modal
  (protected)/      # Authenticated routes
    dashboard/      # Posts, stars, settings
  api/              # REST endpoints: posts, admin, webhooks, etc.
```

### Key Directories

```
├── app/                  # Next.js App Router pages and layouts
├── components/           # React components
├── actions/              # Server actions (CSRF-protected)
├── lib/
│   ├── db/               # Drizzle ORM: schema.ts, migrations, db client
│   ├── security/         # CSP, CSRF, sanitize, audit logging
│   ├── auth.ts           # getCurrentUser, requireAuth, requireAdmin
│   ├── cache.ts          # unstable_cache + Redis/memory fallback
│   └── query.ts          # PostQueries, MetadataQueries
├── drizzle/              # SQL migrations + snapshots
├── proxy.ts              # Next.js middleware: session, CSP, CSRF, rate limiting
└── scripts/
    └── deploy-db.ts      # Production DB deploy (migrations + RLS + indexes)
```

### Database & Deployment

`npm run build` automatically runs `scripts/deploy-db.ts` before the Next.js build:

1. Runs all pending Drizzle migrations
2. Applies RLS helper functions
3. Applies performance indexes and search vector triggers

Schema changes deploy automatically on every production build — no manual migration step needed.

## Security

- **CSP** — Per-request nonces via middleware; passed to components via `x-nonce` header and `csp-nonce` cookie
- **CSRF** — Token validated by middleware for all mutating calls; server actions wrapped with `withCSRFProtection()`
- **Rate Limiting** — Redis-backed with in-memory fallback; scoped limits per route type
- **Turnstile CAPTCHA** — Cloudflare Turnstile on all auth and post submission flows; visible widget on sign-in, sign-up, and post forms; invisible on Google One Tap. All actions are disabled until the challenge passes. Gracefully skipped when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is not set.
- **Input Sanitization** — Applied before all DB writes via `lib/security/sanitize.ts`
- **Audit Logging** — Security events logged to the `logs` table
- **Row-Level Security** — Postgres RLS policies enforced at the database level

## Contributing

Contributions are welcome! Open an issue to discuss ideas or submit a pull request.

## Disclaimer

This project is open source for learning purposes only. Unauthorized testing, attacking, or exploiting [promptexify.com](https://promptexify.com) or any production instance you do not own is **illegal** and strictly prohibited.

This codebase was built as a real-world web application to study modern security practices in a hands-on way. You are welcome to clone it, run it locally, and explore its security architecture on your own infrastructure.

If you discover a vulnerability, please open an issue so we can learn from it together.

## License

MIT
