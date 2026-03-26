import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSecurityStats } from "@/lib/security/audit";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

/**
 * GET /api/admin/security/stats
 * Returns security statistics for admin dashboard
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

    // Get hours from query params (default 24 hours)
    const { searchParams } = new URL(request.url);
    const hours = Math.min(parseInt(searchParams.get("hours") || "24"), 168); // Max 1 week

    // Fetch security statistics
    const stats = await getSecurityStats(hours);

    return NextResponse.json(
      {
        stats,
        timeframe: `${hours} hours`,
        timestamp: new Date().toISOString(),
      },
      {
        headers: SECURITY_HEADERS,
      }
    );
  } catch (error) {
    console.error("Failed to fetch security stats:", error);

    return NextResponse.json(
      { error: "Failed to fetch security statistics" },
      {
        status: 500,
        headers: SECURITY_HEADERS,
      }
    );
  }
}
