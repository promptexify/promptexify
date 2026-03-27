import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    // Browser should use relative path
    return window.location.origin;
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    // SSR should use NEXT_PUBLIC_BASE_URL
    return process.env.NEXT_PUBLIC_BASE_URL;
  }

  if (process.env.VERCEL_URL) {
    // Vercel deployment
    return `https://${process.env.VERCEL_URL}`;
  }

  // Default to localhost for development
  return "http://localhost:3000";
}

// Auth utility types and functions
export interface UserData {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
  type: "FREE" | "PREMIUM" | null;
  role: "USER" | "ADMIN" | null;
  oauth: "GOOGLE" | "EMAIL";
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithData extends User {
  userData?: UserData | null;
}

// Role-based utility functions (client-side safe)
export function hasRole(
  user: UserWithData | null,
  role: "USER" | "ADMIN"
): boolean {
  return user?.userData?.role === role;
}

export function isAdmin(user: UserWithData | null): boolean {
  return hasRole(user, "ADMIN");
}

export function isUser(user: UserWithData | null): boolean {
  return hasRole(user, "USER");
}

export function isPremium(user: UserWithData | null): boolean {
  return user?.userData?.type === "PREMIUM";
}

// Security validation functions
export function validateSessionIntegrity(user: User | null): boolean {
  if (!user) return false;

  // Check if essential user properties exist
  return !!(
    user.id &&
    user.email &&
    user.aud === "authenticated" &&
    user.role === "authenticated"
  );
}

// Secure logout utility functions
export function clearClientSideData(): void {
  try {
    // Clear localStorage items safely
    const localStorageKeysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && shouldClearStorageKey(key)) {
        localStorageKeysToRemove.push(key);
      }
    }
    localStorageKeysToRemove.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(`Failed to remove localStorage key: ${key}`, error);
      }
    });

    // Clear sessionStorage items safely
    const sessionStorageKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && shouldClearStorageKey(key)) {
        sessionStorageKeysToRemove.push(key);
      }
    }
    sessionStorageKeysToRemove.forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {
        console.warn(`Failed to remove sessionStorage key: ${key}`, error);
      }
    });
  } catch (error) {
    console.warn("Client-side data cleanup warning:", error);
  }
}

// Helper function to determine which storage keys should be cleared
function shouldClearStorageKey(key: string): boolean {
  const sensitiveKeyPatterns = [
    "supabase",
    "auth",
    "token",
    "user",
    "session",
    "sb-",
    "auth-token",
    "refresh-token",
    "access-token",
  ];

  return sensitiveKeyPatterns.some((pattern) =>
    key.toLowerCase().includes(pattern.toLowerCase())
  );
}

// Enhanced session validation for logout scenarios
export async function validateCurrentSession(): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return false;
    }

    return validateSessionIntegrity(user);
  } catch (error) {
    console.warn("Session validation error:", error);
    return false;
  }
}

// Security logging for audit trails (client-safe)
export function logSecurityEvent(
  event: string,
  details?: Record<string, unknown>
): void {
  const securityLog = {
    event,
    timestamp: new Date().toISOString(),
    userAgent:
      typeof window !== "undefined" ? window.navigator.userAgent : "server",
    url: typeof window !== "undefined" ? window.location.href : "server",
    ...details,
  };

  // Log to console in development, would integrate with monitoring in production
  if (process.env.NODE_ENV === "development") {
    console.info("Security Event:", securityLog);
  }

  // In production, you would send this to your monitoring/logging service
  // Example: sendToMonitoringService(securityLog);
}

/**
 * Safely format timestamp for display, following Stripe best practices
 * Handles both Unix timestamps (seconds) and JavaScript timestamps (milliseconds)
 *
 * @param timestamp - Can be Unix timestamp (seconds) or JS timestamp (milliseconds) or null/undefined
 * @param locale - Locale for formatting (default: "en-US")
 * @returns Formatted date string or fallback message
 */
export function formatStripeDate(
  timestamp: number | null | undefined,
  locale: string = "en-US"
): string {
  if (!timestamp) return "N/A";

  try {
    let date: Date;

    // Detect if timestamp is in seconds (Stripe format) or milliseconds (JS format)
    // Unix timestamps are typically 10 digits, JS timestamps are 13+ digits
    if (timestamp < 10000000000) {
      // Likely Unix timestamp in seconds - convert to milliseconds
      date = new Date(timestamp * 1000);
    } else {
      // Likely already in milliseconds
      date = new Date(timestamp);
    }

    // Validate the date is reasonable (between 1970 and 2050)
    const year = date.getFullYear();
    if (year < 1970 || year > 2050) {
      console.error("Invalid date year:", year, "from timestamp:", timestamp);
      return "Invalid date";
    }

    // Verify the date is valid
    if (isNaN(date.getTime())) {
      console.error("Invalid date from timestamp:", timestamp);
      return "Invalid date";
    }

    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (error) {
    console.error("Error formatting date:", error, "Timestamp:", timestamp);
    return "Invalid date";
  }
}

export function estimateReadingTime(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
