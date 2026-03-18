import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";
import { CSPNonce, SecurityHeaders, CSRFProtection } from "@/lib/security/csp";
import {
  rateLimits,
  getClientIdentifier,
  getRateLimitHeaders,
  SecurityEvents,
  getClientIP,
  sanitizeUserAgent,
} from "@/lib/edge";

export async function middleware(request: NextRequest) {
  try {
    // Generate nonce for CSP - simplified logic
    const isDevelopment = process.env.NODE_ENV === 'development';
    const nonce = CSPNonce.generate(); // Always generate nonce for consistency

    // Handle Supabase session
    const response = await updateSession(request);

    // If updateSession returns a redirect, follow it immediately.
    if (response.headers.has("Location")) {
      return response;
    }

    // Prepare request headers for modification
    const requestHeaders = new Headers(request.headers);

    // Set nonce in headers for Server Components to access
    requestHeaders.set("x-nonce", nonce);

    // Set nonce in cookie for client components (httpOnly: false so client can read).
    // No maxAge — this is a session cookie that expires when the browser tab closes.
    // Derive `secure` from the actual protocol, not NODE_ENV, so `next start` on
    // plain HTTP (e.g. localhost) works without the cookie being rejected.
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (request.url.startsWith("https") ? "https" : "http");
    response.cookies.set("csp-nonce", nonce, {
      httpOnly: false,
      secure: proto === "https",
      sameSite: "strict",
    });

    // Apply security headers with CSP
    const securityHeaders = SecurityHeaders.getSecurityHeaders(nonce);
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Get client IP for logging and rate limiting
    const clientIp = getClientIP(request);

    // For non-GET requests, validate CSRF token (except for auth endpoints and webhooks)
    if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
      const pathname = request.nextUrl.pathname;

      // Skip CSRF for certain endpoints
      const skipCSRF = [
        "/api/webhooks/",
        "/api/upload/",
        "/api/media/resolve", // Read-only media URL resolution
        "/auth/callback",
        "/api/auth/",
        // Allow CSP violation reports (no CSRF token sent by browsers)
        "/api/security/csp-report",
      ];

      // Special handling for dynamic routes that should skip CSRF
      const shouldSkipCSRF = skipCSRF.some((path) =>
        pathname.startsWith(path)
      );

      const shouldValidateCSRF = !shouldSkipCSRF;

      if (shouldValidateCSRF && pathname.startsWith("/api/")) {
        const csrfToken = CSRFProtection.getTokenFromHeaders(request);

        if (!csrfToken) {
          return NextResponse.json(
            { error: "CSRF token required", code: "CSRF_TOKEN_MISSING" },
            { status: 403, headers: securityHeaders }
          );
        }

        // Read CSRF cookie directly from the request object — more reliable
        // in Edge Middleware than `cookies()` from `next/headers`.
        const csrfCookieName = CSRFProtection.getCookieName();
        const csrfCookieToken =
          request.cookies.get(csrfCookieName)?.value ||
          request.cookies.get(CSRFProtection.getBackupCookieName())?.value ||
          null;

        const isValid = await CSRFProtection.validateToken(csrfToken, csrfCookieToken);
        if (!isValid) {
          return NextResponse.json(
            { error: "Invalid CSRF token", code: "CSRF_TOKEN_INVALID" },
            { status: 403, headers: securityHeaders }
          );
        }
      }

      // Log successful state-changing requests for monitoring
      const skipLogging = ["/api/webhooks/", "/api/upload/"];

      // Ignore logging for localhost IPs in development
      const isLocal =
        !clientIp ||
        clientIp === "127.0.0.1" ||
        clientIp === "::1" ||
        clientIp === "0:0:0:0:0:0:0:1";
      if (
        !skipLogging.some((path) => pathname.startsWith(path)) &&
        (!isDevelopment || !isLocal)
      ) {
        console.log(
          `[SECURITY] ${request.method} ${pathname} - IP: ${clientIp} - User-Agent: ${sanitizeUserAgent(
            request.headers.get("user-agent")
          )}`
        );
      }
    }

    // ------------------
    // PATH-BASED API RATE LIMITS (one bucket per request to avoid double-counting)
    // ------------------
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const pathname = request.nextUrl.pathname;
      const clientId = getClientIdentifier(request as unknown as Request);

      // Apply the strictest applicable limit per path to reduce abuse
      let rateLimitResult;
      if (pathname.startsWith("/api/upload/")) {
        rateLimitResult = await rateLimits.upload(clientId);
      } else if (pathname.startsWith("/api/admin/")) {
        rateLimitResult = await rateLimits.admin(clientId);
      } else if (pathname.startsWith("/api/auth/")) {
        rateLimitResult = await rateLimits.auth(clientId);
      } else if (pathname === "/api/csrf") {
        rateLimitResult = await rateLimits.csrf(clientId);
      } else if (pathname.startsWith("/api/media/resolve") || pathname.startsWith("/api/media/preview/")) {
        rateLimitResult = await rateLimits.mediaResolve(clientId);
      } else {
        rateLimitResult = await rateLimits.api(clientId);
      }

      // Attach rate-limit headers so clients can introspect remaining quota
      Object.entries(getRateLimitHeaders(rateLimitResult)).forEach(
        ([key, value]) => response.headers.set(key, String(value))
      );

      if (!rateLimitResult.allowed) {
        const retryAfterSec = Math.ceil(
          (rateLimitResult.resetTime - Date.now()) / 1000
        );
        console.warn(
          `[RATE_LIMIT] Exceeded for ${clientId} on ${pathname} - IP: ${clientIp}`
        );
        await SecurityEvents.rateLimitExceeded(
          clientId,
          pathname,
          request.headers.get("user-agent") ?? undefined
        );

        return NextResponse.json(
          {
            error: "Too many requests",
            code: "RATE_LIMIT_EXCEEDED",
            retryAfter: retryAfterSec,
          },
          {
            status: 429,
            headers: {
              ...Object.fromEntries(response.headers.entries()),
              ...Object.fromEntries(
                Object.entries(getRateLimitHeaders(rateLimitResult)).map(
                  ([k, v]) => [k, String(v)]
                )
              ),
              "Retry-After": String(retryAfterSec),
            },
          }
        );
      }
    }

    // Update request with modified headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
      headers: response.headers,
    });
  } catch (error) {
    console.error("Middleware error:", error);
    // Return a basic error response with security headers
    const basicSecurityHeaders = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "0",
    };

    return NextResponse.json(
      { error: "Internal server error", code: "MIDDLEWARE_ERROR" },
      { status: 500, headers: basicSecurityHeaders }
    );
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes) - but we want to process these for CSRF
     * - _next/static (static files)
     * - _next/image (image optimization files)  
     * - favicon.ico (favicon file)
     * Update: Include API routes for CSRF protection and rate limiting
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
