import { type NextRequest, NextResponse } from "next/server";
import { CSRFProtection, SecurityHeaders } from "@/lib/security/csp";

/**
 * GET /api/v1/csrf
 * Returns a CSRF token and sets the corresponding httpOnly cookie.
 *
 * Token is reused from the existing cookie if present, otherwise a new one
 * is generated. The JSON body and Set-Cookie always carry the same value —
 * a single response.cookies.set() call avoids the double-Set-Cookie conflict
 * that occurred when getOrCreateToken() also wrote via next/headers cookies().
 *
 * The `secure` flag is derived from the actual request protocol so that
 * `next start` on localhost (HTTP) works without cookie rejection.
 */
export async function GET(request: NextRequest) {
  const cookieName = CSRFProtection.getCookieName();

  // Reuse existing token so concurrent fetches (e.g. multiple useCSRF mounts)
  // all get the same value and never race to create different tokens.
  const existingToken = request.cookies.get(cookieName)?.value;
  const token = existingToken ?? CSRFProtection.generateToken();

  // Base `secure` on the actual protocol, not NODE_ENV. This lets
  // `next start` work over plain HTTP locally while still enforcing secure
  // cookies behind a TLS terminator (where x-forwarded-proto is "https").
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (request.url.startsWith("https") ? "https" : "http");
  const secure = proto === "https";

  const response = NextResponse.json(
    { token },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        ...SecurityHeaders.getSecurityHeaders(),
      },
    }
  );

  // Single Set-Cookie — guarantees body token === cookie token.
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60, // 1 hour — matches server-side token lifetime
  });

  return response;
}
