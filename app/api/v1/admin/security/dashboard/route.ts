import { NextResponse } from "next/server";
import { SecurityMonitor } from "@/lib/security/monitor";
import { getCurrentUser } from "@/lib/auth";
import { SecurityAlert } from "@/lib/security/monitor";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData || currentUser.userData.role !== "ADMIN") {
      await SecurityAlert.unauthorizedAccess(
        "security-dashboard",
        currentUser?.userData?.id
      );
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }

    const stats = SecurityMonitor.getSecurityStats();
    const recentEvents = SecurityMonitor.getRecentEvents(50);
    const suspiciousActivity = SecurityMonitor.detectSuspiciousActivity();

    return NextResponse.json({
      success: true,
      data: {
        stats,
        recentEvents,
        suspiciousActivity,
        timestamp: new Date().toISOString(),
      },
    }, { headers: SECURITY_HEADERS });
  } catch (error) {
    console.error("Security dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch security data" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

export async function DELETE() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData || currentUser.userData.role !== "ADMIN") {
      await SecurityAlert.unauthorizedAccess(
        "security-dashboard-clear",
        currentUser?.userData?.id
      );
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }

    SecurityMonitor.clearEvents();

    return NextResponse.json({
      success: true,
      message: "Security events cleared",
    }, { headers: SECURITY_HEADERS });
  } catch (error) {
    console.error("Security dashboard clear error:", error);
    return NextResponse.json(
      { error: "Failed to clear security data" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}
