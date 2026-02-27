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
    // Generate multiple UUIDs for better entropy
    const uuid1 = crypto.randomUUID().replace(/-/g, "");
    const uuid2 = crypto.randomUUID().replace(/-/g, "");
    const combined = uuid1 + uuid2;

    // Convert to base64url using btoa directly
    const base64 = btoa(combined);

    // Convert to base64url format
    return base64
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
      .slice(0, 43);
  }

  /**
   * Set CSRF token in secure cookie with improved reliability
   */
  static async setToken(token: string): Promise<void> {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const isProduction = process.env.NODE_ENV === "production";

      // Use more reliable cookie options
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict" as const,
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      };

      // Set primary cookie
      cookieStore.set(this.CSRF_COOKIE_NAME, token, cookieOptions);

      // Set backup cookie for reliability (with different name)
      const backupCookieName = `${this.CSRF_COOKIE_NAME}-backup`;
      cookieStore.set(backupCookieName, token, cookieOptions);

      // In development, also set a debug cookie without httpOnly for debugging
      if (!isProduction) {
        cookieStore.set(`${this.CSRF_COOKIE_NAME}-debug`, token, {
          ...cookieOptions,
          httpOnly: false,
        });
      }

      console.log(
        `[CSRF] Token set successfully with cookie name: ${this.CSRF_COOKIE_NAME}`
      );
    } catch (error) {
      console.error("[CSRF] Failed to set token:", error);
      throw error;
    }
  }

  /**
   * Get CSRF token from cookie with improved reliability and fallbacks
   */
  static async getTokenFromCookie(): Promise<string | null> {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const isProduction = process.env.NODE_ENV === "production";

      // Try primary cookie first
      let token = cookieStore.get(this.CSRF_COOKIE_NAME)?.value || null;

      // Try backup cookie if primary not found
      if (!token) {
        const backupCookieName = `${this.CSRF_COOKIE_NAME}-backup`;
        token = cookieStore.get(backupCookieName)?.value || null;
      }

      // In development, try debug cookie as final fallback
      if (!token && !isProduction) {
        token =
          cookieStore.get(`${this.CSRF_COOKIE_NAME}-debug`)?.value || null;
      }

      return token;
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
   * Validate CSRF token with improved error handling and recovery
   */
  static async validateToken(submittedToken: string | null): Promise<boolean> {
    if (!submittedToken) {
      console.warn("[SECURITY] CSRF token missing from request");
      return false;
    }

    const cookieToken = await this.getTokenFromCookie();

    // If no cookie token found, try to generate a new one for recovery
    if (!cookieToken) {
      console.warn(
        "[SECURITY] CSRF validation failed: missing stored token, attempting recovery"
      );

      try {
        // Try to generate a new token and set it
        const newToken = this.generateToken();
        await this.setToken(newToken);
        console.log("[SECURITY] Generated new CSRF token for session recovery");
        
        // For this request, still return false since the submitted token
        // won't match the newly generated one
        return false;
      } catch {
        console.error("[SECURITY] Failed to recover CSRF token");
        return false;
      }
    }

    try {
      // Use timing-safe comparison
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
   * Get or create CSRF token for the current session
   */
  static async getOrCreateToken(): Promise<string> {
    try {
      // Try to get existing token first
      let token = await this.getTokenFromCookie();
      
      if (!token) {
        // Generate new token if none exists
        token = this.generateToken();
        await this.setToken(token);
        console.log("[CSRF] Generated new CSRF token for session");
      }
      
      return token;
    } catch (error) {
      console.error("[CSRF] Failed to get or create token:", error);
      
      // Fallback: return a new token without setting cookie
      // This should be rare and only in emergency situations
      const fallbackToken = this.generateToken();
      console.warn("[CSRF] Using fallback token (not persisted)");
      return fallbackToken;
    }
  }

  /**
   * Health check for CSRF token system
   */
  static async healthCheck(): Promise<{
    hasToken: boolean;
    tokenAge?: number;
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
        result.cookieIssues.push("No CSRF token found in cookies");
        result.recommendations.push("Generate a new CSRF token");
      }

      // Check if debug cookie exists in development
      if (process.env.NODE_ENV !== "production") {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const debugToken = cookieStore.get(`${this.CSRF_COOKIE_NAME}-debug`)?.value;
        
        if (!debugToken) {
          result.cookieIssues.push("Debug CSRF cookie missing in development");
        }
      }

      return result;
    } catch (error) {
      result.cookieIssues.push(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.recommendations.push("Check cookie configuration and server setup");
      return result;
    }
  }

  /**
   * Clear all CSRF tokens (for logout, etc.)
   */
  static async clearTokens(): Promise<void> {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      
      // Clear all CSRF-related cookies
      const cookieNames = [
        this.CSRF_COOKIE_NAME,
        `${this.CSRF_COOKIE_NAME}-backup`,
        `${this.CSRF_COOKIE_NAME}-debug`,
      ];

      cookieNames.forEach(name => {
        cookieStore.delete(name);
      });

      console.log("[CSRF] All CSRF tokens cleared");
    } catch (error) {
      console.error("[CSRF] Failed to clear tokens:", error);
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
      // Basic security headers
      "X-Content-Type-Options": "nosniff",
      "X-XSS-Protection": "1; mode=block", 
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
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
      "block-all-mixed-content",
      // Only add upgrade-insecure-requests in production
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
    // FIX: Add the specific SHA hash from the error to allow the problematic inline script.
    const scriptSources = [
      "'self'",
      "'sha256-n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk='", // Allow specific inline script
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
      // Stripe payments
      "https://js.stripe.com",
      "https://checkout.stripe.com",
      // Vercel Analytics
      "https://va.vercel-scripts.com",
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
   * Build style-src directive following csp.md approach
   */
  private static buildStyleSrc(): string {
    // External style sources
    const externalStyles = [
      "'self'",
      "'unsafe-inline'", // Keep for UI libraries
      "https://fonts.googleapis.com",
      "https://checkout.stripe.com", // Stripe checkout styles
      "https://accounts.google.com", // FIX: Add for Google Sign-In styles
    ];

    return `style-src ${externalStyles.join(" ")}`;
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
      "https:", // Fallback for any HTTPS image (consider removing in production for stricter CSP)
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
      // Sanity CMS images
      "https://*.sanity.io",
      "https://cdn.sanity.io",
      // Google AdSense and other Google services
      "https://googleads.g.doubleclick.net",
      "https://www.google.com",
      "https://ssl.gstatic.com", // Google static content
      "https://www.gstatic.com", // Google static content
      // Stripe images
      "https://checkout.stripe.com",
      "https://q.stripe.com", // Stripe analytics pixels
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
      sanity: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID 
        ? `https://${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}.api.sanity.io`
        : "https://*.sanity.io",
      stripe: process.env.NODE_ENV === 'production' 
        ? ["https://js.stripe.com", "https://checkout.stripe.com"]
        : ["https://js.stripe.com", "https://checkout.stripe.com"],
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
      // Sanity CMS (use specific project if available)
      domains.sanity,
      "https://*.apicdn.sanity.io",
      "https://cdn.sanity.io",
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
      // Stripe
      "https://api.stripe.com",
      "https://events.stripe.com", // Stripe events
      "https://m.stripe.com", // Stripe mobile
      ...domains.stripe,
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
      // Stripe checkout
      "https://checkout.stripe.com",
      "https://js.stripe.com",
      // Google AdSense (if using iframe ads)
      "https://googleads.g.doubleclick.net",
      "https://tpc.googlesyndication.com",
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
      
      // Handle unexpected errors
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

  // Handle other types of errors
  if (error instanceof Error) {
    return {
      error: error.message,
      code: "UNKNOWN_ERROR",
    };
  }

  return {
    error: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  };
}
