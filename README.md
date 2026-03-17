# ⚠️ IMPORTANT SECURITY NOTICE

- Built with Claude Code and Google Antigravity.
- This was built as a personal cybersecurity demonstration project.
- Feel free to fork and modify it for your own purposes.
- It contains intentional bugs and vulnerabilities that were included to serve its demonstration purposes.
- This repository's commit history may contain hardcoded credentials that were included for demonstration purposes only.
- Proceed at your own risk in production environment.

# Promptexify

A comprehensive AI prompt directory for ChatGPT, Claude, Gemini, AI Code Editor, and more. Discover, share, and manage high-quality AI prompts with powerful search, categorization, and collaboration features.

## Features

- **Comprehensive Prompt Library**: Browse thousands of tested AI prompts
- **Advanced Search & Filtering**: Find exactly what you need with powerful search
- **Categories & Tags**: Organize prompts with intuitive categorization
- **User Authentication**: Secure sign-up/sign-in with Supabase
- **Content Management**: Full CRUD operations for prompts and content
- **Free to use**: All features and prompts are free; no payments or subscriptions
- **Background Jobs**: BullMQ and Redis for async operations (e.g. CSV → posts pipeline)
- **Storage**: AWS S3, DigitalOcean Spaces, or local filesystem — configurable via DB settings
- **Admin Dashboard**: Complete admin interface for content management
- **Security-First**: CSRF protection, CSP, rate limiting, input sanitization, audit logging
- **Responsive Design**: Shadcn UI and Tailwind CSS

## Tech Stack

- **Framework**: Next.js 15 (App Router) with Turbopack, React 18
- **Database**: PostgreSQL with Drizzle ORM (schema at `lib/db/schema.ts`, migrations in `drizzle/`)
- **Authentication**: Supabase Auth (sessions; users mirrored to Drizzle `users` table)
- **Styling**: Tailwind CSS + Shadcn UI
- **Queue**: BullMQ with Redis (rate limiting and background jobs; in-memory fallback when Redis unavailable)
- **Storage**: AWS S3, DigitalOcean Spaces, or LOCAL — selectable in DB `settings` table
- **Security**: CSP (nonce-based), CSRF, rate limiting, sanitization, security headers, audit logs

## Security Implementation

This application implements security measures following industry best practices:

### Content Security Policy (CSP)

- **Dynamic nonce-based CSP**: Cryptographically secure nonces per request
- **Environment-aware**: Strict in production; relaxed in development (e.g. `'unsafe-eval'` for HMR)
- **Middleware-based**: Headers set in Next.js middleware; nonce via `x-nonce` header and `csp-nonce` cookie
- **Violation reporting**: CSP reports sent to `/api/security/csp-report`

### CSRF Protection

- **Token-based**: Secure tokens for all state-changing operations; stored in cookies
- **Server actions**: Wrapped with `withCSRFProtection()` from `lib/security/csp.ts`
- **API routes**: Middleware validates CSRF for mutating calls (webhooks, upload, auth callback, CSP report excluded)

### Rate Limiting

- **Redis-backed**: Distributed limits with in-memory fallback
- **Scoped**: Different limits for auth, uploads, and general API
- **Stricter in production**

### Other Security

- **Input sanitization**: `lib/security/sanitize.ts` — `sanitizeInput()`, `sanitizeContent()`, `sanitizeTagSlug()` before DB writes
- **Security headers**: HSTS, X-Frame-Options, etc.
- **Audit logging**: Auth failures, rate limits, etc. logged to `logs` model

## Development

### Prerequisites

- Node.js 18+ (20+ recommended)
- PostgreSQL
- Redis (for rate limiting and BullMQ; optional in dev — in-memory fallback)
- Supabase project
- Storage: AWS S3 or DigitalOcean Spaces (optional; local storage available)

### Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd promptexify
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment variables**

   ```bash
   cp env.template .env.local
   # Edit .env.local with your database, Supabase, Redis, and storage config
   ```

4. **Database**

   ```bash
   npm run db:migrate   # Deploy migrations
   npm run db:seed      # Optional: seed data
   ```

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). For background jobs (e.g. content automation), start the worker in another terminal: `npm run worker`.

### Environment Variables

See `env.template` for required and optional variables, including:

- PostgreSQL connection
- Supabase URL and anon key
- Redis URL (optional in dev)
- S3/Spaces credentials if using cloud storage

### Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Build Next.js application |
| `npm start` | Start production server |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema without migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed database |
| `npm run db:reset` | Reset database |
| `npm run worker` | Start BullMQ worker (content automation, etc.) |
| `npm run content:generate` | Run content automation (CSV → posts) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run lint:format` | Format with Prettier |
| `npm run csp:hash` | Generate CSP hash for inline script |
| `npm run csp:analyze` | Analyze a CSP violation report |

### Testing

There is no test runner. The only test file is `lib/security/sanitize.test.ts`. Run it with:

```bash
npx tsx lib/security/sanitize.test.ts
```

## Architecture

### Request Flow

```
Request → Middleware (Supabase session, CSP nonce, CSRF check, rate limit) → Route
```

### Route Groups

```
app/
  (auth)/           # signin, signup
  (main)/           # home, directory, entry/[id]
    @modal/         # Parallel route: entry preview modal
  (protected)/
    dashboard/      # posts, bookmarks, favorites, billing, settings
  api/              # posts, admin, upload, webhooks, csrf, analytics, etc.
```

### Key Directories

```
├── app/                  # Next.js App Router
├── components/           # React components
├── lib/
│   ├── db/               # Drizzle ORM: schema.ts, index.ts (singleton db client)
│   ├── security/         # CSP, CSRF, sanitize, audit, etc.
│   ├── auth.ts           # getCurrentUser, requireAuth, requireAdmin
│   ├── cache.ts          # unstable_cache + Redis/memory
│   └── query.ts          # PostQueries, MetadataQueries
├── drizzle/              # SQL migrations + relations.ts
├── actions/              # Server actions (CSRF-protected)
├── middleware.ts         # Session, CSP, CSRF, rate limiting
└── scripts/
    └── worker.ts         # BullMQ worker (e.g. process-csv → posts)
```

### Content Automation

The BullMQ worker processes jobs from the ContentAutomation queue (e.g. CSV rows → posts via `AutomationService.executeFromJsonInput()`). Run `npm run worker` when using features that depend on background jobs.
