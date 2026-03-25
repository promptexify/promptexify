import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(
  request: NextRequest
): Promise<{ response: NextResponse; userId: string | null }> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          // Recreate response to ensure new cookies propagate
          supabaseResponse = NextResponse.next({ request });

          // Derive `secure` from the actual request protocol rather than
          // NODE_ENV so that `next start` on plain HTTP works without cookie
          // rejection, and production behind a TLS terminator (where
          // x-forwarded-proto is "https") is handled correctly.
          const proto =
            request.headers.get("x-forwarded-proto") ??
            (request.url.startsWith("https") ? "https" : "http");
          const useSecure = proto === "https";

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // sameSite: "strict" hardens Supabase's default of "lax" —
              // do not remove this override.
              sameSite: "strict",
              secure: useSecure,
            });
          });
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const [userResult, sessionResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);

  const user = userResult.data.user;

  // Proactively refresh session if access token is about to expire (<30s)
  try {
    const session = sessionResult.data.session;
    if (session && session.expires_at) {
      const expiresInMs = session.expires_at * 1000 - Date.now();
      if (expiresInMs < 30_000) {
        await supabase.auth.refreshSession();
      }
    }
  } catch (error) {
    console.error("Supabase session refresh error:", error);
  }

  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
  supabaseResponse.headers.set("X-Frame-Options", "DENY");
  supabaseResponse.headers.set("X-XSS-Protection", "0");
  supabaseResponse.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  // Protected routes - require authentication (dashboard and top-level app routes)
  const protectedPrefixes = [
    "/dashboard",
    "/stars",
    "/account",
    "/settings",
    "/posts",
    "/categories",
    "/tags",
    "/users",
  ];
  const isProtected = protectedPrefixes.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );
  if (isProtected && !user) {
    // Clear any potentially stale auth cookies on unauthorized access
    const redirectResponse = NextResponse.redirect(
      new URL("/signin", request.url)
    );

    // Clear auth-related cookies for security
    const authCookieNames = ["sb-access-token", "sb-refresh-token"];
    authCookieNames.forEach((cookieName) => {
      redirectResponse.cookies.delete(cookieName);
    });

    return { response: redirectResponse, userId: null };
  }

  // For authenticated users, we'll handle role-based redirects in the pages themselves
  // since we can't access Drizzle in middleware. This is more performant anyway.
  // The main authentication check is done above.

  // Redirect authenticated users away from auth pages
  if (
    (request.nextUrl.pathname === "/signin" ||
      request.nextUrl.pathname === "/signup") &&
    user
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return { response: NextResponse.redirect(url), userId: null };
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so: NextResponse.next({ request })
  // 2. Copy over the cookies, like so: response.cookies.setAll(supabaseResponse.cookies.getAll())

  return { response: supabaseResponse, userId: user?.id ?? null };
}
