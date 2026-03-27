import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
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

export async function proxy(request: NextRequest) {
  try {
    // Generate nonce for CSP - simplified logic
    const isDevelopment = process.env.NODE_ENV === 'development';
    const nonce = CSPNonce.generate(); // Always generate nonce for consistency

    // Handle Supabase session — getUser() validates the JWT with Supabase servers.
    const { response, userId: verifiedUserId } = await updateSession(request);

    // If updateSession returns a redirect, follow it immediately.
    if (response.headers.has("Location")) {
      return response;
    }

    // Prepare request headers for modification
    const requestHeaders = new Headers(request.headers);

    // ------------------------------------------------------------------
    // USER IDENTITY RESOLUTION
    //
    // Two authentication paths — exactly one wins per request:
    //
    //  A) Cookie session (web browser)
    //     updateSession() already validated the Supabase JWT via the cookie
    //     and returned verifiedUserId.
    //
    //  B) Bearer token (iOS app / API client)
    //     Native apps send `Authorization: Bearer <supabase_access_token>`.
    //     CSRF does NOT apply to bearer-authenticated requests — the browser's
    //     automatic cookie attachment is the root cause of CSRF, and native
    //     clients never exhibit that behaviour.
    //
    // Always delete x-user-id first so a client can never forge it.
    // ------------------------------------------------------------------
    requestHeaders.delete("x-user-id");

    // Path A — cookie session (browser)
    if (verifiedUserId) {
      requestHeaders.set("x-user-id", verifiedUserId);
    }

    // Path B — Bearer token (iOS / API)
    // Only evaluated when the cookie session produced no userId (avoids
    // a redundant Supabase network call for normal browser requests).
    let bearerUserId: string | null = null;
    const isApiRequest = request.nextUrl.pathname.startsWith("/api/");

    if (!verifiedUserId && isApiRequest) {
      const authHeader = request.headers.get("authorization");
      const rawBearer =
        authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

      if (rawBearer) {
        try {
          // Validate the JWT with Supabase using a cookie-less client.
          // getUser(jwt) performs a server-side check against Supabase's
          // auth server — it does not trust the JWT's payload alone.
          const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => [], setAll: () => {} } }
          );
          const {
            data: { user },
          } = await supabase.auth.getUser(rawBearer);

          if (user) {
            bearerUserId = user.id;
            // Stamp x-user-id so downstream handlers use the same fast-path
            // as cookie-authenticated requests.
            requestHeaders.delete("x-user-id");
            requestHeaders.set("x-user-id", bearerUserId);
          }
        } catch {
          // Invalid / expired bearer token.
          // Fall through — the request will fail CSRF validation (if mutating)
          // or proceed as anonymous (if GET).
        }
      }
    }

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

    // ------------------------------------------------------------------
    // CSRF TOKEN INJECTION
    //
    // Read or mint the CSRF token here in middleware so that Server Components
    // can forward it to the React tree via CsrfClientProvider — eliminating
    // the need for a client-side GET /api/v1/csrf round-trip on page load.
    //
    // Pattern mirrors x-user-id: always delete first to prevent client forgery,
    // then stamp the authoritative value derived from the request cookie.
    // ------------------------------------------------------------------
    requestHeaders.delete("x-csrf-token-value");

    const csrfCookieName = CSRFProtection.getCookieName();
    const existingCsrfToken = request.cookies.get(csrfCookieName)?.value;
    const csrfTokenValue = existingCsrfToken ?? CSRFProtection.generateToken();

    requestHeaders.set("x-csrf-token-value", csrfTokenValue);

    // If we minted a new token (no cookie existed), persist it as a response
    // cookie so the browser carries it on all subsequent requests.
    if (!existingCsrfToken) {
      response.cookies.set(csrfCookieName, csrfTokenValue, {
        httpOnly: true,
        secure: proto === "https",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60, // 1 hour — matches /api/v1/csrf route
      });
    }

    // Apply security headers with CSP
    const securityHeaders = SecurityHeaders.getSecurityHeaders(nonce);
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Get client IP for logging and rate limiting
    const clientIp = getClientIP(request);

    // ------------------------------------------------------------------
    // CSRF VALIDATION
    //
    // Applies only to cookie-authenticated (browser) requests.
    // Bearer-authenticated (iOS / API) requests are exempt — bearer tokens
    // cannot be forged by a malicious cross-origin page, so the double-submit
    // pattern adds no security value for them.
    // ------------------------------------------------------------------
    if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
      const pathname = request.nextUrl.pathname;

      // Endpoints that never need CSRF (no cookies involved, or system calls)
      const skipCSRFPaths = [
        "/api/v1/webhooks/",   // Signature-verified (e.g. Stripe webhook secret)
        "/auth/callback",      // OAuth redirect — no session cookie yet
        "/api/v1/auth/",       // Supabase-managed auth flows
        "/api/v1/security/csp-report", // Browser-initiated CSP violation reports
      ];

      const pathSkipsCsrf = skipCSRFPaths.some((p) => pathname.startsWith(p));
      // Bearer-authenticated requests are also exempt (see explanation above)
      const shouldValidateCSRF =
        !pathSkipsCsrf && !bearerUserId && pathname.startsWith("/api/");

      if (shouldValidateCSRF) {
        const csrfToken = CSRFProtection.getTokenFromHeaders(request);

        if (!csrfToken) {
          return NextResponse.json(
            { error: "CSRF token required", code: "CSRF_TOKEN_MISSING" },
            { status: 403, headers: securityHeaders }
          );
        }

        // Read the CSRF cookie directly from the request (more reliable in
        // middleware than `cookies()` from `next/headers`).
        const csrfCookieToken =
          request.cookies.get(CSRFProtection.getCookieName())?.value ?? null;

        const isValid = await CSRFProtection.validateToken(
          csrfToken,
          csrfCookieToken
        );
        if (!isValid) {
          return NextResponse.json(
            { error: "Invalid CSRF token", code: "CSRF_TOKEN_INVALID" },
            { status: 403, headers: securityHeaders }
          );
        }
      }

      // Log successful state-changing requests for monitoring
      const skipLogging = ["/api/v1/webhooks/", "/api/v1/upload/"];

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
      if (pathname.startsWith("/api/v1/upload/")) {
        rateLimitResult = await rateLimits.upload(clientId);
      } else if (pathname.startsWith("/api/v1/admin/")) {
        rateLimitResult = await rateLimits.admin(clientId);
      } else if (pathname.startsWith("/api/v1/auth/")) {
        rateLimitResult = await rateLimits.auth(clientId);
      } else if (pathname === "/api/v1/csrf") {
        rateLimitResult = await rateLimits.csrf(clientId);
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
