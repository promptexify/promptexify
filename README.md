# ⚠️ IMPORTANT SECURITY NOTICE:

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
- **Content Management**: Full CRUD operations with Sanity CMS
- **Payments**: Stripe integration for premium features
- **Background Jobs**: BullMQ and Redis for async operations
- **Storage**: AWS S3 integration for robust media and file uploads
- **Admin Dashboard**: Complete admin interface for content management
- **Security-First**: Implements CSRF protection, CSP, rate limiting, and more
- **Responsive Design**: Beautiful UI with Shadcn components and Tailwind CSS

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS + Shadcn UI
- **Content**: Sanity CMS for rich content management
- **Payments**: Stripe for subscriptions and billing
- **Queue**: BullMQ with Redis for background processing
- **Storage**: AWS S3 for secure file uploads
- **Security**: Comprehensive security implementation with CSP and CSRF protection

## Security Implementation

This application implements enterprise-grade security following industry best practices:

### Content Security Policy (CSP)

Our CSP implementation follows the methodology outlined in `csp.md`:

- **Dynamic Nonce-Based CSP**: Uses cryptographically secure nonces generated per request
- **Environment-Aware Policies**: Strict CSP in production, relaxed in development
- **Middleware-Based**: CSP headers are set via Next.js middleware for optimal performance
- **Following Best Practices**: Implements the exact approach recommended in the csp.md guide

#### CSP Implementation Details:

1. **Nonce Generation**: Uses `crypto.randomUUID()` converted to base64 (following csp.md)
2. **Development vs Production**:
   - **Development**: Includes `'unsafe-eval'` for hot-reloading
   - **Production**: Strict nonce-based policy with `'strict-dynamic'`
3. **Header Management**: All security headers handled by middleware
4. **Violation Reporting**: CSP violations are logged to `/api/security/csp-report`

### CSRF Protection

- **Token-Based Protection**: Cryptographically secure tokens for all state-changing operations
- **Multiple Storage**: Tokens stored in secure cookies with backup mechanisms
- **Server Action Integration**: Automatic CSRF validation for all server actions
- **API Route Protection**: Middleware-level CSRF validation for API endpoints

### Rate Limiting

- **Redis-Backed**: Uses Redis for distributed rate limiting (fallback to in-memory)
- **Endpoint-Specific**: Different limits for auth, uploads, API calls, etc.
- **Environment-Aware**: Stricter limits in production

### Additional Security Features

- **Input Sanitization**: Comprehensive input validation and sanitization
- **Security Headers**: Full set of security headers (HSTS, X-Frame-Options, etc.)
- **Audit Logging**: Security events logged for monitoring
- **Error Handling**: Secure error responses without information disclosure

## Development

### Prerequisites

- Node.js 18+ (20+ recommended)
- PostgreSQL database
- Redis (required for rate limiting and background jobs)
- Supabase account
- Sanity account
- AWS S3 bucket (optional, for uploads)
- Stripe account (optional, for payments)

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

3. **Set up environment variables**

   ```bash
   cp env.template .env.local
   # Fill in your environment variables
   ```

4. **Set up the database**

   ```bash
   npm run db:migrate
   npm run db:push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

### Environment Variables

See `env.template` for all required environment variables including:

- Database connection (PostgreSQL)
- Supabase configuration
- Sanity configuration
- Stripe API keys
- Redis URL
- AWS S3 credentials (for file uploads)
- Other service configurations

### Security Development

When working with security features:

1. **CSP Development**: Use localhost for relaxed CSP, non-localhost for strict CSP testing
2. **CSRF Testing**: All forms automatically include CSRF tokens via the `useCSRF` hook
3. **Rate Limiting**: Test with different client identifiers to verify limits
4. **Security Headers**: Check browser dev tools to verify headers are set correctly

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run lint` - Run ESLint
- `npm run csp:analyze` - Analyze CSP violations (custom script)

## Architecture

### Security Architecture

```
Request → Middleware → CSP Headers + CSRF Validation → Route Handler
          ↓
          Rate Limiting + Security Logging
```

### File Structure

```
├── app/                    # Next.js App Router
├── components/             # React components
├── lib/
│   ├── security/          # Security implementations
│   │   ├── csp.ts         # CSP & CSRF protection
│   │   ├── sanitize.ts    # Input sanitization
│   │   ├── monitor.ts     # Security monitoring
│   │   └── limits.ts      # Rate limiting
│   ├── auth.ts            # Authentication utilities
│   └── ...
├── middleware.ts          # Security middleware
├── actions/               # Server actions (CSRF protected)
└── hooks/                 # React hooks including useCSRF
```
