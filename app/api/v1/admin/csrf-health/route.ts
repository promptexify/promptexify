import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CSRFProtection } from "@/lib/security/csp";

/**
 * GET - CSRF Health Check Endpoint (Admin Only)
 *
 * This endpoint helps diagnose CSRF token issues by providing
 * detailed information about the current token state.
 */
export async function GET() {
  try {
    // Require admin access
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    // Perform CSRF health check
    const healthResult = await CSRFProtection.healthCheck();

    // Get additional debug info
    const debugInfo = {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      userAgent:
        process.env.NODE_ENV === "development" ? "debug-mode" : "hidden",
    };

    return NextResponse.json({
      status: "healthy",
      csrf: healthResult,
      debug: debugInfo,
      recommendations: healthResult.recommendations,
    });
  } catch (error) {
    console.error("CSRF health check error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to check CSRF health",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Clear CSRF Tokens (Admin Only)
 *
 * This endpoint allows admins to clear all CSRF tokens for recovery.
 */
export async function POST() {
  try {
    // Require admin access
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    // Clear all CSRF tokens
    await CSRFProtection.clearTokens();

    return NextResponse.json({
      success: true,
      message: "All CSRF tokens cleared successfully",
      timestamp: new Date().toISOString(),
      recommendation: "Client applications should refresh their tokens",
    });
  } catch (error) {
    console.error("CSRF token clear error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to clear CSRF tokens",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
