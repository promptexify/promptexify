import { NextResponse } from "next/server";
import { CSRFProtection, SecurityHeaders } from "@/lib/security/csp";

/**
 * GET /api/csrf
 * Returns a CSRF token for client-side forms and sets the corresponding
 * httpOnly cookie so the middleware can validate subsequent mutating requests.
 */
export async function GET() {
  try {
    const token = await CSRFProtection.getOrCreateToken();
    const securityHeaders = SecurityHeaders.getSecurityHeaders();
    const isProduction = process.env.NODE_ENV === "production";

    const response = NextResponse.json(
      { token },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          ...securityHeaders,
        },
      }
    );

    // Set the CSRF cookie directly on the response object for reliability.
    // Using `cookies().set()` from `next/headers` can be unreliable when
    // middleware rewrites response headers (e.g. Supabase session refresh).
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict" as const,
      path: "/",
      maxAge: 60 * 60 * 24,
    };

    response.cookies.set(CSRFProtection.getCookieName(), token, cookieOptions);
    response.cookies.set(CSRFProtection.getBackupCookieName(), token, cookieOptions);

    return response;
  } catch (error) {
    console.error("CSRF token generation error:", error);

    const securityHeaders = SecurityHeaders.getSecurityHeaders();

    return NextResponse.json(
      {
        error: "Failed to generate CSRF token",
        code: "CSRF_GENERATION_ERROR",
      },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...securityHeaders,
        },
      }
    );
  }
}
