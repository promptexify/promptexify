"use client";

import { Turnstile } from "@marsidev/react-turnstile";

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  className?: string;
  size?: "flexible" | "normal" | "compact";
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function TurnstileWidget({
  onSuccess,
  onExpire,
  onError,
  className,
  size = "flexible",
}: TurnstileWidgetProps) {
  if (!SITE_KEY) return null;

  return (
    <div className={className}>
      <Turnstile
        siteKey={SITE_KEY}
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
        options={{ theme: "auto", size }}
      />
    </div>
  );
}
