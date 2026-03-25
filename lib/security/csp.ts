import { NextRequest } from "next/server";
import { headers } from 'next/headers';
import { nanoid } from 'nanoid';

// CSRF Protection - Keep existing functionality unchanged
export class CSRFProtection {
  private static readonly CSRF_TOKEN_LENGTH = 32;
  private static readonly CSRF_COOKIE_NAME =
    process.env.NODE_ENV === "production" ? "csrf-token-secure" : "csrf-token";
  private static readonly CSRF_HEADER_NAME = "x-csrf-token";

  /**
   * Generate a cryptographically secure CSRF token using Web Crypto API
   * Compatible with Edge Runtime
   */
  static generateToken(): string {
    // 32 random bytes → 64-char hex string (256 bits of entropy)
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Set CSRF token in a single httpOnly cookie.
   *
   * maxAge is 1 hour — intentionally shorter than the previous 24 h lifetime.
   * Tokens are rotated on every login (auth/callback) and cleared on logout,
   * so a 1 h window is sufficient for active sessions and minimises the blast
   * radius if a token is somehow leaked.
   *
   * @param secure - Explicit value for the cookie `secure` flag. When omitted,
   *   falls back to `NODE_ENV === "production"`. Call sites that have access to
   *   the request (e.g. Route Handlers) should derive this from
   *   `x-forwarded-proto` and pass it explicitly for consistency with how
   *   proxy.ts and app/api/csrf/route.ts set cookies.
   */
  static async setToken(token: string, secure?: boolean): Promise<void> {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const useSecure = secure ?? (process.env.NODE_ENV === "production");

    cookieStore.set(this.CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: useSecure,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60, // 1 hour — rotated on auth state changes
    });
  }

  /**
   * Read the CSRF token from the single authoritative cookie.
   */
  static async getTokenFromCookie(): Promise<string | null> {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      return cookieStore.get(this.CSRF_COOKIE_NAME)?.value ?? null;
    } catch (error) {
      console.error("[CSRF] Failed to get token from cookie:", error);
      return null;
    }
  }

  /**
   * Get CSRF token from request headers
   */
  static getTokenFromHeaders(request: NextRequest): string | null {
    const token = request.headers.get(this.CSRF_HEADER_NAME);
    return token;
  }

  /**
   * Get CSRF token from form data
   */
  static getTokenFromFormData(formData: FormData): string | null {
    return formData.get("csrf_token") as string | null;
  }

  /**
   * Timing-safe string comparison using Web Crypto API
   * Compatible with Edge Runtime
   */
  private static async timingSafeEqual(a: string, b: string): Promise<boolean> {
    // No early-exit on length — that leaks token length via timing side-channel.
    // HMAC-SHA256 always produces 32-byte digests regardless of input length,
    // so the final XOR loop is always constant-time.
    const encoder = new TextEncoder();
    const aBytes = encoder.encode(a);
    const bBytes = encoder.encode(b);

    // Use HMAC with a random key to ensure timing safety
    const key = await crypto.subtle.generateKey(
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const [signatureA, signatureB] = await Promise.all([
      crypto.subtle.sign("HMAC", key, aBytes),
      crypto.subtle.sign("HMAC", key, bBytes),
    ]);

    // Both signatures are always 32 bytes (HMAC-SHA256), so no length check needed
    const sigA = new Uint8Array(signatureA);
    const sigB = new Uint8Array(signatureB);

    let result = 0;
    for (let i = 0; i < sigA.length; i++) {
      result |= sigA[i] ^ sigB[i];
    }

    return result === 0;
  }

  /**
   * Validate CSRF token with improved error handling and recovery.
   * 
   * @param submittedToken - token from request header or form data
   * @param preReadCookieToken - optional pre-read cookie value; when provided,
   *   skips the `cookies()` lookup (useful in Edge Middleware where
   *   `request.cookies` is more reliable than `next/headers` cookies()).
   */
  static async validateToken(
    submittedToken: string | null,
    preReadCookieToken?: string | null,
  ): Promise<boolean> {
    if (!submittedToken) {
      console.warn("[SECURITY] CSRF token missing from request");
      return false;
    }

    const cookieToken =
      preReadCookieToken !== undefined
        ? preReadCookieToken
        : await this.getTokenFromCookie();

    if (!cookieToken) {
      console.warn(
        "[SECURITY] CSRF validation failed: no stored token found"
      );
      return false;
    }

    try {
      const isValid = await this.timingSafeEqual(submittedToken, cookieToken);
      
      if (!isValid) {
        console.warn("[SECURITY] CSRF token validation failed: token mismatch");
      }
      
      return isValid;
    } catch {
      console.error("[SECURITY] Error during CSRF token validation");
      return false;
    }
  }

  /**
   * Get the CSRF cookie name for the current environment.
   */
  static getCookieName(): string {
    return this.CSRF_COOKIE_NAME;
  }

  /**
   * Get or create CSRF token for the current session.
   *
   * If setToken() fails the error propagates — a failed CSRF setup must be
   * loud, not silently swallowed into an unpersisted token that will always
   * fail validation.
   */
  static async getOrCreateToken(): Promise<string> {
    const existing = await this.getTokenFromCookie();
    if (existing) return existing;

    const token = this.generateToken();
    await this.setToken(token); // throws on failure — caller handles
    return token;
  }

  /**
   * Health check for CSRF token system.
   * Reports whether a valid token cookie is present for the current session.
   */
  static async healthCheck(): Promise<{
    hasToken: boolean;
    cookieIssues: string[];
    recommendations: string[];
  }> {
    const result = {
      hasToken: false,
      cookieIssues: [] as string[],
      recommendations: [] as string[],
    };

    try {
      const token = await this.getTokenFromCookie();
      result.hasToken = !!token;

      if (!token) {
        result.cookieIssues.push("No CSRF token cookie found — client should call GET /api/csrf");
        result.recommendations.push(
          "Ensure the browser called /api/csrf before submitting forms, " +
          "and that the cookie was not cleared by a logout without re-login."
        );
      }

      return result;
    } catch (error) {
      result.cookieIssues.push(
        `Health check failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      result.recommendations.push("Check cookie configuration and server setup");
      return result;
    }
  }

  /**
   * Clear the CSRF token cookie.
   * Called on logout to invalidate the token immediately rather than waiting
   * for the 1-hour maxAge to expire.
   */
  static async clearTokens(): Promise<void> {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.delete(this.CSRF_COOKIE_NAME);
    } catch (error) {
      console.error("[CSRF] Failed to clear token:", error);
    }
  }
}

// Improved CSP Nonce - Following csp.md best practices
export class CSPNonce {
  /**
   * Generate a cryptographically secure nonce using nanoid
   * More efficient and URL-safe than crypto.randomUUID() + base64 conversion
   */
  static generate(): string {
    // Use nanoid for better performance and URL-safety
    // 32 characters provides sufficient entropy for CSP nonces
    return nanoid(32);
  }

  /**
   * Get nonce from request headers (set by middleware)
   */
  static async getFromHeaders(): Promise<string | null> {
    try {
      const headersList = await headers();
      return headersList.get('x-nonce') || null;
    } catch (error) {
      console.error("[CSP] Failed to get nonce from headers:", error);
      return null;
    }
  }

  /**
   * Get nonce from cookie (client-side access)
   */
  static async getFromCookie(): Promise<string | null> {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      return cookieStore.get('csp-nonce')?.value || null;
    } catch (error) {
      console.error("[CSP] Failed to get nonce from cookie:", error);
      return null;
    }
  }

  /**
   * Get nonce from window global (client-side)
   */
  static getFromWindow(): string | null {
    if (typeof window !== 'undefined' && (window as unknown as { __CSP_NONCE__?: string }).__CSP_NONCE__) {
      return (window as unknown as { __CSP_NONCE__?: string }).__CSP_NONCE__ || null;
    }
    return null;
  }

  /**
   * Safely get nonce from headers with fallback
   */
  static async getFromHeadersSafe(): Promise<string | null> {
    try {
      return await this.getFromHeaders();
    } catch {
      // Fallback for static rendering or edge cases
      return null;
    }
  }
}

// Environment Detection - Keep existing functionality
export class EnvironmentDetector {
  /**
   * Check if running in development environment
   */
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === "development";
  }

  /**
   * Check if running in production environment
   */
  static isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  }

  /**
   * Check if running in Edge Runtime
   */
  static isEdgeRuntime(): boolean {
    return (
      typeof process !== "undefined" && process.env.NEXT_RUNTIME === "edge"
    );
  }

  /**
   * Check if request is from localhost
   */
  static isLocalhost(request?: Request): boolean {
    if (!request) return false;
    
    const url = new URL(request.url);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  }

  /**
   * Check if in local development (dev server + localhost)
   */
  static isLocalDevelopment(): boolean {
    return this.isDevelopment();
  }

  /**
   * Get CSP configuration based on environment
   */
  static getCSPConfig() {
    return {
      isProduction: this.isProduction(),
      isDevelopment: this.isDevelopment(),
      isLocalDevelopment: this.isLocalDevelopment(),
      isEdgeRuntime: this.isEdgeRuntime(),
    };
  }
}

// Simplified Security Headers following csp.md approach
export class SecurityHeaders {
  /**
   * Get comprehensive security headers with CSP following csp.md best practices
   */
  static getSecurityHeaders(nonce?: string): Record<string, string> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    const headers: Record<string, string> = {
      "X-Content-Type-Options": "nosniff",
      "X-XSS-Protection": "0",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy":
        "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
    };

    // Production-only headers
    if (!isDevelopment) {
      headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
      headers["X-DNS-Prefetch-Control"] = "off";
    } else {
      // Development-friendly headers
      headers["X-Frame-Options"] = "SAMEORIGIN"; // Allow iframe for dev tools
    }

    // CSP - Following csp.md methodology exactly
    headers["Content-Security-Policy"] = this.generateCSP(nonce, isDevelopment);

    return headers;
  }

  /**
   * Generate CSP following the exact methodology from csp.md
   */
  static generateCSP(nonce?: string, isDevelopment: boolean = false): string {
    // Base CSP directives following csp.md structure
    const cspDirectives = [
      "default-src 'self'",
      this.buildScriptSrc(nonce, isDevelopment),
      this.buildStyleSrc(),
      this.buildImgSrc(),
      this.buildFontSrc(),
      this.buildConnectSrc(isDevelopment),
      this.buildFrameSrc(),
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
    ];

    return cspDirectives.join('; ');
  }

  /**
   * Get a debug version of the CSP for testing
   */
  static getCSPDebugInfo(nonce?: string, isDevelopment: boolean = false): {
    directives: Record<string, string>;
    fullCSP: string;
    externalDomains: ReturnType<typeof SecurityHeaders.getExternalDomains>;
  } {
    const domains = this.getExternalDomains();
    
    const directives = {
      'default-src': "'self'",
      'script-src': this.buildScriptSrc(nonce, isDevelopment),
      'style-src': this.buildStyleSrc(),
      'img-src': this.buildImgSrc(),
      'font-src': this.buildFontSrc(),
      'connect-src': this.buildConnectSrc(isDevelopment),
      'frame-src': this.buildFrameSrc(),
      'object-src': "'none'",
      'base-uri': "'self'",
      'form-action': "'self'",
      'frame-ancestors': "'none'",
      // Only add upgrade-insecure-requests in production
      ...(isDevelopment ? {} : { 'upgrade-insecure-requests': '' }),
    };

    return {
      directives,
      fullCSP: this.generateCSP(nonce, isDevelopment),
      externalDomains: domains,
    };
  }

  /**
   * Build script-src directive following csp.md approach
   */
  private static buildScriptSrc(nonce?: string, isDevelopment: boolean = false): string {
    const scriptSources = [
      "'self'",
      // Hashes for the next-themes ThemeProvider inline script that runs before
      // hydration to prevent FOUC.  The nonce is also passed to ThemeProvider,
      // but hashes serve as a fallback if the nonce prop is not applied (e.g.
      // static pages).  Regenerate with: npm run csp:hash
      "'sha256-n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk='",
      "'sha256-J9cZHZf5nVZbsm7Pqxc8RsURv1AIXkMgbhfrZvoOs/A='",
      // Hash of the inline script injected by Google Identity Services (GSI) client.
      "'sha256-UnthrFpGFotkvMOTp/ghVMSXoZZj9Y6epaMsaBAbUtg='",
      // Google services
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://googleads.g.doubleclick.net",
      "https://www.google.com",
      "https://accounts.google.com", 
      // Google One Tap and Identity Services
      "https://apis.google.com",
      "https://accounts.google.com",
      "https://oauth2.googleapis.com",
      "https://www.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      // Vercel Analytics
      "https://va.vercel-scripts.com",
      // Cloudflare Turnstile
      "https://challenges.cloudflare.com",
    ];


    if (isDevelopment) {
      // Development: Add 'unsafe-eval' for hot-reloading
      scriptSources.push("'unsafe-eval'");
    }

    // Always add nonce if provided, regardless of environment
    if (nonce) {
      scriptSources.push(`'nonce-${nonce}'`, "'strict-dynamic'");
    } else if (isDevelopment) {
      // Fallback for development without nonce
      scriptSources.push("'unsafe-inline'");
    }

    return `script-src ${scriptSources.join(" ")}`;
  }

  /**
   * Build style-src directive.
   *
   * Uses 'unsafe-inline' in both development and production because:
   *  - React style props (`style={{ ... }}`) render as element style *attributes*
   *  - Radix UI, framer-motion, sonner, and recharts all set inline styles
   *  - CSP nonces only cover `<style>` elements, NOT style attributes
   *  - Per CSP spec, when a nonce IS present, 'unsafe-inline' is silently
   *    ignored — so we intentionally omit the nonce from style-src to ensure
   *    'unsafe-inline' remains effective
   *
   * This is a widely accepted trade-off: inline styles pose minimal XSS risk
   * compared to inline scripts, and it is impractical to hash every dynamic
   * style value produced by third-party UI libraries.
   */
  private static buildStyleSrc(): string {
    const styleSources = [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
      "https://accounts.google.com",
    ];

    return `style-src ${styleSources.join(" ")}`;
  }

  /**
   * Build img-src directive for external image sources
   */
  private static buildImgSrc(): string {
    const domains = this.getExternalDomains();
    
    const imageSources = [
      "'self'",
      "blob:",
      "data:",
      // CDN domains (if configured)
      ...(domains.cdn.cloudfront ? [domains.cdn.cloudfront] : []),
      ...(domains.cdn.cloudflare ? [domains.cdn.cloudflare] : []),
      ...(domains.cdn.custom ? [domains.cdn.custom] : []),
      // Specific services that serve images
      domains.supabase, // Supabase storage (specific URL if available)
      "https://*.supabase.co", // Fallback for Supabase
      "https://*.googleusercontent.com", // Google profile images
      "https://*.googleapis.com", // Google services
      "https://lh3.googleusercontent.com", // Google profile pictures
      // AWS S3 storage (support multiple regions and custom domains)
      "https://*.amazonaws.com",
      "https://*.s3.amazonaws.com", 
      "https://s3.amazonaws.com",
      // DigitalOcean Spaces (support multiple regions)
      "https://*.digitaloceanspaces.com",
      // Google AdSense and other Google services
      "https://googleads.g.doubleclick.net",
      "https://www.google.com",
      "https://ssl.gstatic.com", // Google static content
      "https://www.gstatic.com", // Google static content
    ];

    return `img-src ${imageSources.join(" ")}`;
  }

  /**
   * Build font-src directive for external fonts
   */
  private static buildFontSrc(): string {
    const fontSources = [
      "'self'",
      "https://fonts.gstatic.com",
      "https://fonts.googleapis.com",
    ];

    return `font-src ${fontSources.join(" ")}`;
  }

  /**
   * Get environment-specific external domains
   */
  private static getExternalDomains() {
    return {
      supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "https://*.supabase.co",
      // Add your CDN domains here if using CloudFront, CloudFlare, etc.
      cdn: {
        cloudfront: process.env.NEXT_PUBLIC_CLOUDFRONT_URL,
        cloudflare: process.env.NEXT_PUBLIC_CLOUDFLARE_URL,
        custom: process.env.NEXT_PUBLIC_CDN_URL,
      }
    };
  }

  /**
   * Build connect-src directive for API connections
   */
  private static buildConnectSrc(isDevelopment: boolean = false): string {
    const domains = this.getExternalDomains();
    
    const connectSources = [
      "'self'",
      // CDN domains (if configured)
      ...(domains.cdn.cloudfront ? [domains.cdn.cloudfront] : []),
      ...(domains.cdn.cloudflare ? [domains.cdn.cloudflare] : []),
      ...(domains.cdn.custom ? [domains.cdn.custom] : []),
      // Supabase API (use specific URL if available)
      domains.supabase,
      domains.supabase.replace('https://', 'wss://'), // Supabase realtime
      // Google services
      "https://www.google-analytics.com",
      "https://analytics.google.com",
      "https://www.googletagmanager.com",
      "https://accounts.google.com",
      "https://apis.google.com",
      "https://region1.google-analytics.com", // GA4
      "https://www.google.com",
      // Google One Tap and Identity Services
      "https://oauth2.googleapis.com",
      "https://www.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      // AWS S3 (support multiple regions and custom domains)
      "https://*.amazonaws.com",
      "https://*.s3.amazonaws.com",
      "https://s3.amazonaws.com",
      // DigitalOcean Spaces (support multiple regions)
      "https://*.digitaloceanspaces.com",
      // Redis (if using cloud Redis with HTTP API)
      "https://*.redislabs.com",
      "https://*.redis.cloud",
      // Vercel Analytics
      "https://vitals.vercel-insights.com",
      "https://vitals.vercel-analytics.com", // Alternative domain for Vercel Analytics
      // Cloudflare Turnstile
      "https://challenges.cloudflare.com",
    ];

    if (isDevelopment) {
      // Allow localhost connections for development
      connectSources.push("http://localhost:*");
      connectSources.push("ws://localhost:*");
      connectSources.push("wss://localhost:*");
      connectSources.push("http://127.0.0.1:*");
    }

    return `connect-src ${connectSources.join(" ")}`;
  }

  /**
   * Build frame-src directive for iframe embeds
   */
  private static buildFrameSrc(): string {
    const frameSources = [
      "'self'", // MODIFICATION: Changed from 'none' to 'self'
      // Google services that may need iframes
      "https://accounts.google.com", // Google One Tap
      "https://www.google.com",
      // Google AdSense (if using iframe ads)
      "https://googleads.g.doubleclick.net",
      "https://tpc.googlesyndication.com",
      // Cloudflare Turnstile (renders in an iframe)
      "https://challenges.cloudflare.com",
    ];

    return `frame-src ${frameSources.join(" ")}`;
  }
}

// CSP Debug Utilities
export class CSPDebug {
  /**
   * Calculate SHA-256 hash for inline content
   */
  static async calculateHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    return `'sha256-${hashBase64}'`;
  }

  /**
   * Analyze CSP violation and suggest fixes
   */
  static async analyzeViolation(violatedDirective: string): Promise<{
    type: 'script' | 'style' | 'other';
    suggestedHash?: string;
    suggestedNonce?: boolean;
    recommendation: string;
  }> {
    if (violatedDirective === 'script-src') {
      return {
        type: 'script',
        recommendation: 'Add nonce to inline script or calculate hash',
        suggestedNonce: true,
      };
    } else if (violatedDirective === 'style-src') {
      return {
        type: 'style',
        recommendation: 'Add nonce to inline style or calculate hash',
        suggestedNonce: true,
      };
    }

    return {
      type: 'other',
      recommendation: 'Unknown violation type'
    };
  }

  /**
   * Get common inline content patterns for debugging
   */
  static getCommonPatterns() {
    return {
      scripts: [
        'window.__CSP_NONCE__ = "example-nonce";',
        'window.__CSP_NONCE__ = null; // Development mode - no CSP nonces',
        'gtag("config", "GA_MEASUREMENT_ID");',
        'window.dataLayer = window.dataLayer || [];',
        'function gtag(){dataLayer.push(arguments);}',
        'document.documentElement.classList.add("dark");',
        'document.documentElement.classList.remove("dark");',
      ],
      styles: [
        '[data-chart=id] { --color-primary: #000; }',
        '.dark { background-color: #000; }',
        '.light { background-color: #fff; }',
      ]
    };
  }
}

// Keep existing CSRF wrapper functionality unchanged
export function withCSRFProtection<T extends unknown[], R>(
  action: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      // Extract FormData from arguments to get CSRF token
      const formData = args.find(arg => arg instanceof FormData) as FormData | undefined;
      
      if (!formData) {
        throw new SecureActionError("CSRF protection requires FormData", "CSRF_NO_FORM_DATA", 400);
      }

      // Validate CSRF token
      const submittedToken = CSRFProtection.getTokenFromFormData(formData);
      const isValid = await CSRFProtection.validateToken(submittedToken);

      if (!isValid) {
        throw new SecureActionError("Invalid CSRF token", "CSRF_TOKEN_INVALID", 403);
      }

      // Execute the action if CSRF validation passes
      return await action(...args);
    } catch (error) {
      // Check if this is a Next.js redirect (expected behavior)
      if (error && typeof error === "object" && "digest" in error) {
        const errorDigest = (error as { digest?: string }).digest;
        if (
          typeof errorDigest === "string" &&
          errorDigest.includes("NEXT_REDIRECT")
        ) {
          // This is a redirect - re-throw it to allow the redirect to proceed
          throw error;
        }
      }

      if (error instanceof SecureActionError) {
        throw error;
      }

      // Re-throw Error instances so callers see the original message
      if (error instanceof Error) {
        throw error;
      }

      // Handle unexpected non-Error throws
      console.error("Secure action error:", error);
      throw new SecureActionError("Action failed", "ACTION_ERROR", 500);
    }
  };
}

// Keep existing error handling
export class SecureActionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "SecureActionError";
  }
}

export function handleSecureActionError(error: unknown): {
  error: string;
  code: string;
} {
  if (error instanceof SecureActionError) {
    return {
      error: error.message,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    if (process.env.VERBOSE_ERRORS === "true") {
      return {
        error: error.message,
        code: "UNKNOWN_ERROR",
      };
    }
  }

  return {
    error: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  };
}
