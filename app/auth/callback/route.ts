import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { CSRFProtection } from "@/lib/security/csp";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();

    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Auth callback error:", error);
        return NextResponse.redirect(`${origin}/auth/auth-code-error`);
      }

      if (data.user) {
        // Create or update user in database
        await upsertUserInDatabase(data.user);
      }

      // Issue a fresh CSRF token on login — rotates the pre-login token so
      // an attacker who obtained the old token cannot reuse it post-auth.
      const newCsrfToken = CSRFProtection.generateToken();
      const proto =
        request.headers.get("x-forwarded-proto") ??
        (request.url.startsWith("https") ? "https" : "http");

      const redirectResponse = NextResponse.redirect(`${origin}${next}`);
      redirectResponse.cookies.set(CSRFProtection.getCookieName(), newCsrfToken, {
        httpOnly: true,
        secure: proto === "https",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60, // 1 hour
      });
      return redirectResponse;
    } catch (error) {
      console.error("Callback processing error:", error);
      return NextResponse.redirect(`${origin}/auth/auth-code-error`);
    }
  }

  // If no code, redirect to sign in
  return NextResponse.redirect(`${origin}/signin`);
}

// Helper function to create/update user in database
async function upsertUserInDatabase(supabaseUser: {
  id: string;
  email?: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
    avatar_url?: string;
  };
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
}) {
  try {
    const providers = supabaseUser.app_metadata?.providers || [];
    const primaryProvider = supabaseUser.app_metadata?.provider;

    let oauthProvider: "GOOGLE" | "EMAIL" = "EMAIL";
    if (providers.includes("google") || primaryProvider === "google") {
      oauthProvider = "GOOGLE";
    } else if (
      providers.includes("email") ||
      primaryProvider === "email" ||
      !primaryProvider
    ) {
      oauthProvider = "EMAIL";
    }

    const email = supabaseUser.email || "";
    const name =
      supabaseUser.user_metadata?.name ||
      supabaseUser.user_metadata?.full_name ||
      email.split("@")[0] ||
      "User";
    const avatar = supabaseUser.user_metadata?.avatar_url || undefined;
    const now = new Date();

    await db
      .insert(users)
      .values({
        id: supabaseUser.id,
        email,
        name,
        avatar,
        oauth: oauthProvider,
        type: "FREE",
        role: "USER",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email,
          name,
          avatar,
          oauth: oauthProvider,
          updatedAt: now,
        },
      });

    console.log(
      `Successfully upserted user: ${email} with provider: ${oauthProvider}`
    );
  } catch (error) {
    console.error("Database upsert error in callback:", error);
  }
}
