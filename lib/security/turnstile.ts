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

    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[Turnstile] Verification error:", err);
    return false;
  }
}
