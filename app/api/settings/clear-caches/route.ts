import { NextResponse } from "next/server";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";
import { withCSRFProtection } from "@/lib/security/csp";

/**
 * POST /api/settings/clear-caches
 * No-op endpoint kept for backward compatibility.
 * Media upload functionality has been removed.
 */
export const POST = withCSRFProtection(async () => {
  return NextResponse.json(
    { success: true, message: "Caches cleared" },
    { headers: SECURITY_HEADERS }
  );
});

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
