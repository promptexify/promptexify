/**
 * Cloudflare Turnstile server-side verification.
 *
 * Usage in server actions:
 *   const token = formData.get("cf-turnstile-response") as string;
 *   if (!await verifyTurnstile(token, ip)) {
 *     return { error: "CAPTCHA verification failed. Please try again." };
 *   }
 *
 * Gracefully skips verification when TURNSTILE_SECRET_KEY is not set,
 * so local dev works without a key configured.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string
): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Skip if not configured (local dev / CI)
  if (!secretKey) return true;

  if (!token) return false;

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    });

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    if (!res.ok) return false;

    const data = (await res.json()) as {
      success: boolean;
      hostname?: string;
      challenge_ts?: string;
    };

    if (!data.success) return false;

    // Replay prevention: validate the challenge was issued for this hostname.
    // A valid token from another domain must not grant access here.
    const rawAppUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
    let expectedHostname = "";
    try {
      expectedHostname = new URL(rawAppUrl).hostname;
    } catch {
      /* ignore malformed URL */
    }
    if (expectedHostname && data.hostname !== expectedHostname) return false;

    // Replay prevention: validate the challenge is recent (within 5 minutes).
    // Stale tokens could be replayed from previously captured challenges.
    if (data.challenge_ts) {
      const challengeAge = Date.now() - new Date(data.challenge_ts).getTime();
      if (challengeAge > 5 * 60 * 1000) return false;
    }

    return true;
  } catch (err) {
    console.error("[Turnstile] Verification error:", err);
    return false;
  }
}
