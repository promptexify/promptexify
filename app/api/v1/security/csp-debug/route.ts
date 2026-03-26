import { NextRequest, NextResponse } from "next/server";
import { SecurityHeaders } from "@/lib/security/csp";
import { getCurrentUser } from "@/lib/auth";

/**
 * Debug endpoint for CSP configuration
 * Only accessible to admin users in development or for authenticated users in production
 */
export async function GET() {
  try {
    // Security check - only allow access in development or for admin users
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (!isDevelopment) {
      const user = await getCurrentUser();
      if (!user || user.userData?.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Unauthorized - Admin access required' },
          { status: 403 }
        );
      }
    }

    // Get CSP debug information
    const nonce = "debug-nonce-123"; // Sample nonce for debugging
    const cspDebugInfo = SecurityHeaders.getCSPDebugInfo(nonce, isDevelopment);

    // Get environment information
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasCloudfrontUrl: !!process.env.NEXT_PUBLIC_CLOUDFRONT_URL,
      hasCloudflareUrl: !!process.env.NEXT_PUBLIC_CLOUDFLARE_URL,
      hasCustomCdnUrl: !!process.env.NEXT_PUBLIC_CDN_URL,
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: envInfo,
      csp: {
        fullPolicy: cspDebugInfo.fullCSP,
        directives: cspDebugInfo.directives,
        externalDomains: cspDebugInfo.externalDomains,
      },
      recommendations: [
        isDevelopment ? "Set NEXT_PUBLIC_SUPABASE_URL for specific Supabase domain" : null,
        "Consider setting CDN URLs (NEXT_PUBLIC_CLOUDFRONT_URL, NEXT_PUBLIC_CLOUDFLARE_URL, or NEXT_PUBLIC_CDN_URL) for better security",
        "Test CSP in browser dev tools to ensure no violations",
        "Monitor CSP violations in production using CSP reporting"
      ].filter(Boolean),
    });

  } catch (error) {
    console.error('CSP debug error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate CSP debug info',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Test CSP violations endpoint
 * This can help test if the CSP is working correctly
 */
export async function POST(request: NextRequest) {
  try {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (!isDevelopment) {
      const user = await getCurrentUser();
      if (!user || user.userData?.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Unauthorized - Admin access required' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    
    // Log CSP violation for debugging
    console.log('[CSP-DEBUG] Test violation logged:', {
      timestamp: new Date().toISOString(),
      testData: body,
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      success: true,
      message: 'CSP test violation logged successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('CSP test error:', error);
    return NextResponse.json(
      { error: 'Failed to process CSP test' },
      { status: 500 }
    );
  }
} 