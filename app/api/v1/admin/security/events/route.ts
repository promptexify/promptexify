import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getRecentSecurityEvents } from "@/lib/security/audit";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

/**
 * GET /api/admin/security/events
 * Returns recent security events for admin dashboard
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin access
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Admin access required" },
        {
          status: 403,
          headers: SECURITY_HEADERS,
        }
      );
    }

    // Get limit from query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    // Fetch recent security events
    const events = await getRecentSecurityEvents(limit);

    return NextResponse.json(
      {
        events,
        total: events.length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: SECURITY_HEADERS,
      }
    );
  } catch (error) {
    console.error("Failed to fetch security events:", error);

    return NextResponse.json(
      { error: "Failed to fetch security events" },
      {
        status: 500,
        headers: SECURITY_HEADERS,
      }
    );
  }
}
