"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createUserInDatabaseAction } from "@/actions/auth";
import { useRouter } from "next/navigation";
import { TurnstileWidget } from "@/components/turnstile-widget";

declare global {
  interface Window {
    __CSP_NONCE__?: string;
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            nonce?: string;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
            itp_support?: boolean;
          }) => void;
          prompt: (
            momentListener?: (notification: {
              isNotDisplayed: () => boolean;
              isSkippedMoment: () => boolean;
              isDismissedMoment: () => boolean;
              getNotDisplayedReason: () => string;
              getSkippedReason: () => string;
              getDismissedReason: () => string;
            }) => void
          ) => void;
          cancel: () => void;
        };
      };
    };
  }
}

const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GSI_SCRIPT_ID = "google-one-tap-gsi";

/**
 * SHA-256 hash a string and return the hex digest.
 * Google receives the hash in initialize(); Supabase receives the raw value
 * in signInWithIdToken() and hashes it server-side for comparison.
 */
async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function GoogleOneTap() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const initializedRef = useRef(false);
  const scriptLoadingRef = useRef(false);
  const nonceRef = useRef<string>(crypto.randomUUID());
  const turnstileTokenRef = useRef<string | null>(null);
  const gsiReadyRef = useRef(false);

  const initAndPrompt = useCallback(async () => {
    // Both GSI script and Turnstile must be ready before showing One Tap
    if (initializedRef.current) return;
    if (!gsiReadyRef.current || !window.google?.accounts?.id) return;
    if (!turnstileTokenRef.current) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn(
        "Google One Tap: NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured"
      );
      return;
    }

    initializedRef.current = true;
    const supabase = supabaseRef.current;
    const rawNonce = nonceRef.current;
    const hashedNonce = await sha256Hex(rawNonce);

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        // Re-check token hasn't expired by the time user taps
        if (!turnstileTokenRef.current) {
          console.warn("Google One Tap: Turnstile token expired");
          initializedRef.current = false;
          return;
        }
        try {
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: credential,
            nonce: rawNonce,
          });

          if (error) {
            console.error("Google One Tap sign-in error:", error.message);
            return;
          }

          if (data.user) {
            const result = await createUserInDatabaseAction(data.user);
            if (result.error) {
              console.error("Failed to sync user to database:", result.error);
            }
            router.push("/");
          }
        } catch (err) {
          console.error("Google One Tap error:", err);
        }
      },
      nonce: hashedNonce,
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
      use_fedcm_for_prompt: true,
    });

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.info(
          "Google One Tap not displayed:",
          notification.getNotDisplayedReason()
        );
      } else if (notification.isSkippedMoment()) {
        console.info(
          "Google One Tap skipped:",
          notification.getSkippedReason()
        );
      } else if (notification.isDismissedMoment()) {
        console.info(
          "Google One Tap dismissed:",
          notification.getDismissedReason()
        );
      }
    });
  }, [router]);

  const handleTurnstileToken = useCallback(
    (token: string) => {
      turnstileTokenRef.current = token;
      // Turnstile passed — try to show One Tap if GSI is already loaded
      void initAndPrompt();
    },
    [initAndPrompt]
  );

  const handleTurnstileExpire = useCallback(() => {
    turnstileTokenRef.current = null;
  }, []);

  useEffect(() => {
    if (loading || user) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    // GSI script already loaded (e.g. cached by browser on client-side nav)
    if (window.google?.accounts?.id) {
      gsiReadyRef.current = true;
      void initAndPrompt();
      return;
    }

    if (scriptLoadingRef.current || document.getElementById(GSI_SCRIPT_ID)) {
      return;
    }

    scriptLoadingRef.current = true;
    const cspNonce =
      typeof window !== "undefined"
        ? window.__CSP_NONCE__ || undefined
        : undefined;

    const script = document.createElement("script");
    script.id = GSI_SCRIPT_ID;
    script.src = GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    if (cspNonce) {
      script.nonce = cspNonce;
    }

    script.onload = () => {
      scriptLoadingRef.current = false;
      gsiReadyRef.current = true;
      void initAndPrompt();
    };

    script.onerror = () => {
      scriptLoadingRef.current = false;
      console.error("Google One Tap: Failed to load GSI script");
    };

    document.head.appendChild(script);

    return () => {
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // Ignore cancel errors during cleanup
      }
      initializedRef.current = false;
      scriptLoadingRef.current = false;
      gsiReadyRef.current = false;
      nonceRef.current = crypto.randomUUID();
    };
  }, [user, loading, initAndPrompt]);

  // Only render (and fire Turnstile) for guest users
  if (user || loading) return null;

  return (
    <TurnstileWidget
      invisible
      onToken={handleTurnstileToken}
      onExpire={handleTurnstileExpire}
    />
  );
}
