"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          theme?: string;
          size?: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface TurnstileWidgetProps {
  /** Called when a challenge token is issued (or refreshed). */
  onToken?: (token: string) => void;
  /** Called when the token expires before the form is submitted. */
  onExpire?: () => void;
  /** When true, runs in invisible mode — no visible widget is rendered. Defaults to false. */
  invisible?: boolean;
  /** Widget size. 'flexible' stretches to container width; 'normal' is the standard fixed width (~300px). Defaults to 'flexible'. */
  size?: "normal" | "flexible" | "compact";
}

/**
 * Renders a Cloudflare Turnstile widget using explicit JS rendering.
 * Works correctly with React conditional rendering and App Router client-side navigation.
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set (local dev / CI).
 */
export function TurnstileWidget({
  onToken,
  onExpire,
  invisible = false,
  size = "flexible",
}: TurnstileWidgetProps = {}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // Keep refs so the widget callbacks always call the latest prop values
  // without adding them to the effect dependency array (avoids infinite re-renders
  // when parents pass inline functions).
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let widgetId: string | null = null;

    function tryRender() {
      if (!container || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(container, {
        sitekey: SITE_KEY,
        theme: "auto",
        size: invisible ? "invisible" : size,
        callback: (token: string) => onTokenRef.current?.(token),
        "expired-callback": () => onExpireRef.current?.(),
      });
    }

    tryRender(); // handles: script already loaded (client-side nav)
    window.addEventListener("turnstile-loaded", tryRender); // handles: script loads after component

    return () => {
      window.removeEventListener("turnstile-loaded", tryRender);
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [container, invisible, size]); // onToken/onExpire intentionally omitted — accessed via refs

  if (!SITE_KEY) return null;

  return (
    <>
      <div ref={setContainer} />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onLoad={() => window.dispatchEvent(new Event("turnstile-loaded"))}
      />
    </>
  );
}
