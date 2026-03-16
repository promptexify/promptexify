import { requireAuth } from "@/lib/auth";
import { SecurityEvents } from "@/lib/security/audit";
import { headers } from "next/headers";

// Force dynamic rendering for authentication-dependent routes
// This is required because authentication checks use cookies
export const dynamic = 'force-dynamic';

/**
 * Protected Layout Component
 * 
 * This layout enforces authentication for all routes under the (protected) group.
 * It implements defense-in-depth security by providing centralized authentication
 * checks that complement the middleware-level protection.
 * 
 * Security Features:
 * - Centralized authentication enforcement
 * - Audit logging for access attempts
 * - Secure error handling without information disclosure
 * - Follows OWASP secure coding guidelines
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const [user, headersList] = await Promise.all([
      requireAuth(),
      headers(),
    ]);

    // Fire-and-forget: audit logging must never block the page render
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    const clientIp = forwardedFor?.split(',')[0] || realIp || 'unknown';
    SecurityEvents.protectedAreaAccess(user.id, clientIp, 'dashboard-layout')
      ?.catch((e: unknown) => console.error('Audit logging failed:', e));

    return <>{children}</>;
  } catch (error) {
    console.error('Protected layout error:', error);
    throw error;
  }
}
