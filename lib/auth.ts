"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/utils";
import {
  signInSchema,
  signUpSchema,
  magicLinkSchema,
  type SignInData,
  type SignUpData,
  type MagicLinkData,
} from "@/lib/schemas";
import { stripe } from "@/lib/stripe";
import { SecurityEvents, getClientIP } from "@/lib/security/audit";

// Primary Magic Link Authentication Function
export async function signInWithMagicLink(
  data: MagicLinkData,
  request?: Request
) {
  const supabase = await createClient();

  // Validate input
  const validatedData = magicLinkSchema.safeParse(data);
  if (!validatedData.success) {
    // Log validation failure
    if (request) {
      await SecurityEvents.inputValidationFailure(
        undefined,
        "email",
        data.email || "",
        getClientIP(request)
      );
    }
    return {
      error: validatedData.error.errors[0]?.message || "Invalid input",
    };
  }

  const { email, name } = validatedData.data;

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getBaseUrl()}/auth/callback`,
        data: {
          name: name || email.split("@")[0], // Store name in user metadata
        },
      },
    });

    if (error) {
      // Log authentication failure
      if (request) {
        await SecurityEvents.authenticationFailure(
          undefined,
          getClientIP(request),
          error.message
        );
      }
      return { error: error.message };
    }

    return {
      success: true,
      message: "Check your email for the magic link to sign in!",
    };
  } catch (error) {
    console.error("Magic link error:", error);
    return { error: "An unexpected error occurred. Please try again." };
  }
}

// Legacy functions - keeping for backward compatibility during migration
export async function signInWithPassword(data: SignInData) {
  const supabase = await createClient();

  // Validate input
  const validatedData = signInSchema.safeParse(data);
  if (!validatedData.success) {
    return {
      error: validatedData.error.errors[0]?.message || "Invalid input",
    };
  }

  const { email, password } = validatedData.data;

  try {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    if (authData.user) {
      // Update or create user in Prisma database
      await upsertUserInDatabase(authData.user);
    }

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Sign in error:", error);
    return { error: "An unexpected error occurred. Please try again." };
  }
}

export async function signUpWithPassword(data: SignUpData) {
  const supabase = await createClient();

  // Validate input
  const validatedData = signUpSchema.safeParse(data);
  if (!validatedData.success) {
    return {
      error: validatedData.error.errors[0]?.message || "Invalid input",
    };
  }

  const { email, password, name } = validatedData.data;

  try {
    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getBaseUrl()}/auth/callback`,
        data: {
          name: name || email.split("@")[0], // Use email prefix as fallback name
        },
      },
    });

    if (error) {
      return { error: error.message };
    }

    // If user is immediately confirmed, create/update in database
    if (authData.user && authData.user.email_confirmed_at) {
      await upsertUserInDatabase(authData.user);
    }

    return {
      success: true,
      needsVerification: !authData.user?.email_confirmed_at,
    };
  } catch (error) {
    console.error("Sign up error:", error);
    return { error: "An unexpected error occurred. Please try again." };
  }
}

export async function signInWithOAuth(provider: "google") {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${getBaseUrl()}/auth/callback`,
      queryParams: {
        prompt: "select_account", // Force account selection screen
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }

  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();

  try {
    // 1. Sign out from Supabase (this clears the session and cookies)
    const { error } = await supabase.auth.signOut({
      scope: "global", // This ensures sign out across all devices/sessions
    });

    if (error) {
      console.error("Supabase sign out error:", error);
      return { error: error.message };
    }

    // 2. Revalidate all cached data to ensure fresh state
    revalidatePath("/", "layout");

    // 3. Additional cache invalidation for security
    // This ensures no cached user data remains accessible
    revalidatePath("/dashboard", "layout");
    revalidatePath("/api", "layout");

    // 4. Secure redirect to sign-in page
    redirect("/signin");
  } catch (error) {
    // Check if this is a Next.js redirect (which is expected)
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (
        typeof errorDigest === "string" &&
        errorDigest.includes("NEXT_REDIRECT")
      ) {
        // This is an expected redirect, re-throw it
        throw error;
      }
    }

    console.error("Sign out error:", error);
    return { error: "An unexpected error occurred during sign out." };
  }
}

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // Get additional user data from Prisma
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
    });

    return {
      ...user,
      userData,
    };
  } catch (error) {
    console.error("Get current user error:", error);
    return null;
  }
});

/**
 * AUTHENTICATION & AUTHORIZATION UTILITIES
 * 
 * This module provides standardized authentication and authorization functions
 * that follow OWASP secure coding guidelines and implement defense-in-depth security.
 * 
 * SECURITY PATTERNS:
 * 
 * 1. STANDARDIZED AUTHENTICATION FUNCTIONS:
 *    - requireAuth(): Basic authentication check with automatic redirect
 *    - requireAdmin(): Admin-only access with role validation
 *    - requireRole(): Flexible role-based access control
 *    - getCurrentUser(): User data retrieval without redirect (use sparingly)
 * 
 * 2. CONSISTENT USAGE PATTERNS:
 *    - Layout Level: Use requireAuth() in protected layouts for defense-in-depth
 *    - Page Level: Use specific role functions (requireAdmin, requireRole)
 *    - API Routes: Use getCurrentUser() with manual validation for better error handling
 * 
 * 3. SECURITY BENEFITS:
 *    - Centralized authentication logic reduces code duplication
 *    - Consistent redirect behavior prevents information disclosure
 *    - Automatic audit logging for security monitoring
 *    - Role-based access control with secure defaults
 * 
 * 4. MIGRATION GUIDE:
 *    - Replace getCurrentUser() + manual checks with requireAuth()/requireAdmin()
 *    - Use requireRole(["ADMIN", "USER"]) for multi-role access
 *    - Implement layout-level authentication for route groups
 */

// Role-based access control utilities
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.userData?.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return user;
}

export async function requireRole(allowedRoles: Array<"USER" | "ADMIN">) {
  const user = await requireAuth();
  const userRole = user.userData?.role;

  if (!userRole || !allowedRoles.includes(userRole)) {
    // Redirect based on user role
    if (userRole === "USER") {
      redirect("/dashboard");
    } else {
      redirect("/");
    }
  }
  return user;
}

export async function requireUserAccess(allowedPaths: string[]) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/signin");
  }

  // Check if the current path is allowed for this user
  const currentPath = "/dashboard"; // This would be dynamic in real use
  if (!allowedPaths.includes(currentPath)) {
    redirect("/dashboard");
  }

  return user;
}

export async function hasActivePremiumSubscription(
  userId: string
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        stripePriceId: true,
        stripeCurrentPeriodEnd: true,
        stripeSubscriptionId: true,
        type: true,
      },
    });

    if (!user) return false;

    // Basic check: user must have premium type and valid subscription data
    const hasBasicPremiumData =
      user.type === "PREMIUM" &&
      !!user.stripePriceId &&
      !!user.stripeCurrentPeriodEnd;

    if (!hasBasicPremiumData) return false;

    // Check if subscription appears expired locally
    const isExpiredLocally =
      user.stripeCurrentPeriodEnd &&
      user.stripeCurrentPeriodEnd.getTime() + 86_400_000 <= Date.now();

    // If expired locally and we have subscription ID, sync with Stripe to be sure
    if (isExpiredLocally && user.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          user.stripeSubscriptionId
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscriptionData = subscription as any;

        const currentPeriodEnd = new Date(
          subscriptionData.current_period_end * 1000
        );
        const isPaidActive =
          subscriptionData.status === "active" ||
          subscriptionData.status === "trialing";
        const isActuallyExpired = currentPeriodEnd.getTime() < Date.now();

        // If subscription is truly expired, immediately downgrade user
        if (!isPaidActive || isActuallyExpired) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              type: "FREE",
              // Clear data if subscription is completely canceled
              ...(subscriptionData.status === "canceled" && {
                stripeSubscriptionId: null,
                stripePriceId: null,
                stripeCurrentPeriodEnd: null,
              }),
              updatedAt: new Date(),
            },
          });

          console.log(
            `Auto-downgraded expired subscription for user ${userId}`
          );
          return false;
        }

        // If Stripe shows active but local data is wrong, update local data
        if (isPaidActive && !isActuallyExpired) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              stripeCurrentPeriodEnd: currentPeriodEnd,
              type: "PREMIUM",
              updatedAt: new Date(),
            },
          });
          console.log(`Updated subscription data for user ${userId}`);
          return true;
        }
      } catch (error) {
        console.error("Error verifying subscription with Stripe:", error);
        // If we can't verify with Stripe and it appears expired locally, err on safe side
        return false;
      }
    }

    // Check if user has premium type and valid subscription (with grace period)
    return (
      user.type === "PREMIUM" &&
      !!user.stripePriceId &&
      !!user.stripeCurrentPeriodEnd &&
      user.stripeCurrentPeriodEnd.getTime() + 86_400_000 > Date.now()
    );
  } catch (error) {
    console.error("Error checking premium subscription:", error);
    return false;
  }
}

export async function requirePremiumAccess() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/signin");
  }

  const hasPremium = await hasActivePremiumSubscription(user.id);

  if (!hasPremium) {
    redirect("/dashboard");
  }

  return user;
}

// Helper function to create/update user in Prisma database
export async function upsertUserInDatabase(supabaseUser: {
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
    // Determine OAuth provider - prioritize EMAIL for Magic Link
    const providers = supabaseUser.app_metadata?.providers || [];
    const primaryProvider = supabaseUser.app_metadata?.provider;

    let oauthProvider: "GOOGLE" | "EMAIL" = "EMAIL";

    // Check if Google is among the providers
    if (providers.includes("google") || primaryProvider === "google") {
      oauthProvider = "GOOGLE";
    }
    // For email/Magic Link authentication, use EMAIL
    else if (
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

    await prisma.user.upsert({
      where: { id: supabaseUser.id },
      update: {
        email,
        name,
        avatar,
        oauth: oauthProvider,
        updatedAt: new Date(),
      },
      create: {
        id: supabaseUser.id,
        email,
        name,
        avatar,
        oauth: oauthProvider,
        type: "FREE",
        role: "USER",
      },
    });
  } catch (error) {
    console.error("Database upsert error:", error);
    // Don't throw here to avoid breaking auth flow
  }
}
