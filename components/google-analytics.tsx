"use client";

import { GoogleAnalytics as NextGoogleAnalytics } from "@next/third-parties/google";
import { useEffect, useState } from "react";

interface GoogleAnalyticsProps {
  gaId: string;
}

export function GoogleAnalytics({ gaId }: GoogleAnalyticsProps) {
  const [nonce, setNonce] = useState<string | null>(null);

  useEffect(() => {
    // Get nonce from window global (set by layout)
    const cspNonce = (window as { __CSP_NONCE__?: string }).__CSP_NONCE__;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNonce(cspNonce || null);
  }, []);

  // If no GA ID, don't render anything
  if (!gaId) {
    return null;
  }

  // If we have a nonce, apply it to the GoogleAnalytics component
  if (nonce) {
    return <NextGoogleAnalytics gaId={gaId} nonce={nonce} />;
  }

  // Fallback without nonce (should not happen in production)
  return <NextGoogleAnalytics gaId={gaId} />;
}
