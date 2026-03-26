import { NextResponse } from "next/server";
import { checkAndHandleExpiredSubscriptions } from "@/lib/subscription";
import { requireAdmin } from "@/lib/auth";

export async function POST() {
  try {
    // requireAdmin() throws / redirects if the user is not an authenticated admin
    await requireAdmin();

    // Run the expired subscription check
    const result = await checkAndHandleExpiredSubscriptions();

    return NextResponse.json({
      success: true,
      message: `Processed ${result.processedCount} expired subscriptions`,
      processedCount: result.processedCount,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Error checking expired subscriptions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
