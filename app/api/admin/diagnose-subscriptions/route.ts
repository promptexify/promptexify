import { NextResponse } from "next/server";
import { diagnoseOrphanedSubscriptions } from "@/lib/subscription";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    // requireAdmin() redirects to /dashboard if not an authenticated admin
    await requireAdmin();

    // Run the orphaned subscription diagnosis
    const result = await diagnoseOrphanedSubscriptions();

    return NextResponse.json({
      success: true,
      message: `Found ${result.totalFound} orphaned subscriptions`,
      orphanedSubscriptions: result.orphanedSubscriptions,
      totalFound: result.totalFound,
      recommendations:
        result.totalFound > 0
          ? [
              "Review orphaned subscriptions to identify sync issues",
              "Check if customers exist in your database with different email addresses",
              "Consider implementing webhook replay for missed events",
              "Verify webhook endpoint configuration",
            ]
          : [
              "No orphaned subscriptions found - all subscriptions are properly synced",
            ],
    });
  } catch (error) {
    console.error("Error diagnosing subscriptions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
