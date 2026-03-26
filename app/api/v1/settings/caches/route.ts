import { NextResponse } from "next/server";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

/**
 * POST /api/v1/settings/caches
 * No-op endpoint kept for backward compatibility.
 * Media upload functionality has been removed.
 *
 * CSRF: Protected by middleware (proxy.ts) which validates the CSRF token for
 * all POST /api/* requests. Do NOT re-wrap with withCSRFProtection() — that
 * wrapper expects FormData in args, not a NextRequest, and will always throw.
 */
export async function POST() {
  return NextResponse.json(
    { success: true, message: "Caches cleared" },
    { headers: SECURITY_HEADERS }
  );
}

// Explicitly deny other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: {
        ...SECURITY_HEADERS,
        Allow: "POST",
      },
    }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: {
        ...SECURITY_HEADERS,
        Allow: "POST",
      },
    }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: {
        ...SECURITY_HEADERS,
        Allow: "POST",
      },
    }
  );
}
