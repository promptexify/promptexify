"use client";

import { useState, useEffect, useCallback } from "react";
import { useCsrfContext } from "@/components/csrf-provider";

// ---------------------------------------------------------------------------
// Module-level singleton cache
//
// Shared across ALL useCSRF() callers in the same browser tab.
// - Only ONE /api/v1/csrf request is ever in-flight at a time (pendingFetch).
// - On page load the cache is seeded synchronously from the server-injected
//   context token (see useCSRF), so no network request is needed at all.
// - After 55 minutes the cache expires and refreshToken() / the useEffect
//   fallback re-fetches from /api/v1/csrf (token still valid on the server).
// - refreshToken() busts the cache and forces a new fetch.
// ---------------------------------------------------------------------------

const CACHE_DURATION_MS = 55 * 60 * 1000; // 55 minutes — safely below the 1-hour server cookie maxAge

let cachedToken: string | null = null;
let cacheExpiresAt: number | null = null;
let pendingFetch: Promise<string> | null = null;

function isCacheValid(): boolean {
  return cachedToken !== null && cacheExpiresAt !== null && Date.now() < cacheExpiresAt;
}

async function fetchCSRFToken(): Promise<string> {
  // Return cached value immediately if still valid.
  if (isCacheValid()) return cachedToken!;

  // Deduplicate concurrent fetches — all callers await the same Promise.
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    const response = await fetch("/api/v1/csrf", {
      method: "GET",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch CSRF token: ${response.status}`);
    }

    const data: { token: string } = await response.json();
    cachedToken = data.token;
    cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
    return cachedToken;
  })().finally(() => {
    pendingFetch = null;
  });

  return pendingFetch;
}

function bustCache(): void {
  cachedToken = null;
  cacheExpiresAt = null;
  pendingFetch = null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CSRFHookReturn {
  token: string | null;
  isLoading: boolean;
  error: string | null;
  refreshToken: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// useCSRF
// ---------------------------------------------------------------------------

export function useCSRF(): CSRFHookReturn {
  // Seed the module-level cache from the server-injected context token.
  // This runs in the render phase (before useState initializers) so that
  // isCacheValid() returns true on the very first render, eliminating the
  // loading state and the GET /api/v1/csrf round-trip entirely.
  //
  // The mutation is idempotent — seeding the same token value twice is safe.
  // React Strict Mode double-invokes renders in dev; this is fine because
  // cachedToken/cacheExpiresAt are not React state and the second seed is a
  // no-op (isCacheValid() returns true after the first seed).
  const contextToken = useCsrfContext();
  if (contextToken && !isCacheValid()) {
    cachedToken = contextToken;
    cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
  }

  const [token, setToken] = useState<string | null>(() => (isCacheValid() ? cachedToken : null));
  const [isLoading, setIsLoading] = useState(!isCacheValid());
  const [error, setError] = useState<string | null>(null);

  const loadToken = useCallback(async (bust = false) => {
    if (bust) bustCache();
    setIsLoading(true);
    setError(null);
    try {
      const t = await fetchCSRFToken();
      setToken(t);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("CSRF token fetch error:", message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // If already cached, set synchronously and skip the network round-trip.
    if (isCacheValid()) {
      setToken(cachedToken);
      setIsLoading(false);
      return;
    }
    loadToken();
  }, [loadToken]);

  const refreshToken = useCallback(async () => {
    await loadToken(true);
  }, [loadToken]);

  return { token, isLoading, error, refreshToken };
}

// ---------------------------------------------------------------------------
// useNonce  (unchanged)
// ---------------------------------------------------------------------------

export function useNonce(): string | null {
  const [nonce, setNonce] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "__CSP_NONCE__" in window) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNonce((window as { __CSP_NONCE__?: string }).__CSP_NONCE__ || null);
    }
  }, []);

  return nonce;
}

// ---------------------------------------------------------------------------
// useFormWithCSRF
// ---------------------------------------------------------------------------

export function useFormWithCSRF({
  onSubmit,
  onSuccess,
  onError,
}: {
  onSubmit: (formData: FormData) => Promise<void>;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}) {
  const { token, refreshToken } = useCSRF();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitForm = async (formData: FormData) => {
    if (!token) {
      onError?.("CSRF token not available");
      return;
    }

    setIsSubmitting(true);
    try {
      formData.set("csrf_token", token);
      await onSubmit(formData);
      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Submission failed";

      if (errorMessage.includes("CSRF") || errorMessage.includes("403")) {
        try {
          await refreshToken();
        } catch (refreshError) {
          console.error("Failed to refresh CSRF token:", refreshError);
        }
      }

      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitForm, isSubmitting, token };
}

// ---------------------------------------------------------------------------
// useCSRFForm
// ---------------------------------------------------------------------------

export function useCSRFForm() {
  const { token, isLoading, error } = useCSRF();

  const createFormDataWithCSRF = (formElement?: HTMLFormElement) => {
    const formData = formElement ? new FormData(formElement) : new FormData();
    if (token) formData.set("csrf_token", token);
    return formData;
  };

  const getHeadersWithCSRF = async (additionalHeaders: Record<string, string> = {}) => {
    return {
      ...additionalHeaders,
      ...(token && { "X-CSRF-Token": token }),
    };
  };

  const isReady = !isLoading && !error && !!token;

  return { token, createFormDataWithCSRF, getHeadersWithCSRF, isReady, isLoading, error };
}
