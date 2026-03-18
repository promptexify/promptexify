"use server";

import {
  signInWithPassword,
  signUpWithPassword,
  signInWithMagicLink,
  signInWithOAuth,
  signOut,
  upsertUserInDatabase,
} from "@/lib/auth";
import {
  type SignInData,
  type SignUpData,
  type MagicLinkData,
} from "@/lib/schemas";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { withCSRFProtection, handleSecureActionError } from "@/lib/security/csp";
import { rateLimits } from "@/lib/security/limits";

// Helper function to handle authentication redirects properly
function handleAuthRedirect(): never {
  redirect("/signin");
}

/** Extract client IP from server action request headers */
async function getActionClientIP(): Promise<string> {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  const realIp = hdrs.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || realIp || "unknown";
}

// Re-export auth functions as server actions with CSRF protection
export const signInAction = withCSRFProtection(async (formData: FormData) => {
  try {
    const ip = await getActionClientIP();
    const rl = await rateLimits.auth(`auth:signin:${ip}`);
    if (!rl.allowed) {
      return { error: "Too many sign-in attempts. Please try again later." };
    }

    // Extract data from FormData
    const data: SignInData = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    return await signInWithPassword(data);
  } catch (error) {
    return handleSecureActionError(error);
  }
});

export const signUpAction = withCSRFProtection(async (formData: FormData) => {
  try {
    const ip = await getActionClientIP();
    const rl = await rateLimits.auth(`auth:signup:${ip}`);
    if (!rl.allowed) {
      return { error: "Too many sign-up attempts. Please try again later." };
    }

    // Extract data from FormData
    const data: SignUpData = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      name: formData.get("name") as string,
    };

    return await signUpWithPassword(data);
  } catch (error) {
    return handleSecureActionError(error);
  }
});

export const magicLinkAction = withCSRFProtection(
  async (formData: FormData) => {
    try {
      const ip = await getActionClientIP();
      // Rate limit by IP — prevents email spam / Supabase OTP quota exhaustion
      const rl = await rateLimits.auth(`auth:magic:${ip}`);
      if (!rl.allowed) {
        return { error: "Too many requests. Please wait before requesting another link." };
      }

      // Extract data from FormData
      const data: MagicLinkData = {
        email: formData.get("email") as string,
        name: (formData.get("name") as string) || undefined,
      };

      return await signInWithMagicLink(data);
    } catch (error) {
      return handleSecureActionError(error);
    }
  }
);

export async function oauthAction(provider: "google") {
  return await signInWithOAuth(provider);
}

// Server action to create/update user in database after Google One Tap authentication
export async function createUserInDatabaseAction(userData: {
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
    await upsertUserInDatabase(userData);
    return { success: true };
  } catch (error) {
    console.error("Error creating user in database:", error);
    return {
      error: "Failed to create user in database",
      success: false,
    };
  }
}

export async function signOutAction() {
  try {
    // Perform secure logout with comprehensive cleanup
    await signOut();

    // If we reach here, there was no redirect (shouldn't happen with proper signOut)
    return { success: true };
  } catch (error) {
    // Check if this is a Next.js redirect (which means success)
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (
        typeof errorDigest === "string" &&
        errorDigest.includes("NEXT_REDIRECT")
      ) {
        // This is a successful sign out with redirect - re-throw to allow redirect
        throw error;
      }
    }

    // This is an actual error - log securely (don't expose sensitive data)
    console.error("Sign out action error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });

    // Return secure error message
    return {
      error:
        "Sign out failed. Please try again or contact support if the issue persists.",
      // Include a security flag to indicate failed logout attempt
      securityFlag: true,
    };
  }
}

// Re-export helper function for use in other action files
export { handleAuthRedirect };
