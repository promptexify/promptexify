import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAllCategories } from "@/lib/content";
import { Queries } from "@/lib/query";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

/**
 * Debug endpoint to help diagnose posts API issues in production
 * Only accessible to admin users
 */
export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData || currentUser.userData.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const testPage = parseInt(searchParams.get("page") || "2", 10);
    const testLimit = parseInt(searchParams.get("limit") || "12", 10);

    const debugInfo: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      testParams: { page: testPage, limit: testLimit },
    };

    // Test auth functionality
    try {
      debugInfo.auth = {
        userExists: !!currentUser,
        userData: currentUser?.userData ? {
          id: currentUser.userData.id,
          role: currentUser.userData.role,
          type: currentUser.userData.type,
        } : null,
      };
    } catch (authError) {
      debugInfo.authError = authError instanceof Error ? authError.message : "Unknown auth error";
    }

    // Test category loading
    try {
      const categories = await getAllCategories();
      debugInfo.categories = {
        count: categories.length,
        samples: categories.slice(0, 3).map(c => ({ id: c.id, slug: c.slug, name: c.name })),
      };
    } catch (categoryError) {
      debugInfo.categoryError = categoryError instanceof Error ? categoryError.message : "Unknown category error";
    }

    // Test posts query
    try {
      const result = await Queries.posts.getPaginated({
        page: testPage,
        limit: testLimit,
        userId: currentUser.userData?.id,
      });
      
      debugInfo.postsQuery = {
        success: true,
        dataLength: result.data.length,
        pagination: result.pagination,
        samplePost: result.data[0] ? {
          id: result.data[0].id,
          title: result.data[0].title,
          hasInteractions: {
            starred: result.data[0].isStarred,
          },
        } : null,
      };
    } catch (queryError) {
      debugInfo.queryError = {
        message: queryError instanceof Error ? queryError.message : "Unknown query error",
        stack: queryError instanceof Error ? queryError.stack : undefined,
      };
    }

    // Test search query
    try {
      const searchResult = await Queries.posts.search("test", {
        page: 1,
        limit: 5,
        userId: currentUser.userData?.id,
      });
      
      debugInfo.searchQuery = {
        success: true,
        dataLength: searchResult.data.length,
        pagination: searchResult.pagination,
      };
    } catch (searchError) {
      debugInfo.searchError = searchError instanceof Error ? searchError.message : "Unknown search error";
    }

    // Environment info
    debugInfo.environment = {
      nodeEnv: process.env.NODE_ENV,
      runtime: "nodejs",
      hasDatabase: !!process.env.DATABASE_URL,
      hasSupabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    };

    return NextResponse.json(
      {
        status: "debug_complete",
        debugInfo,
      },
      {
        status: 200,
        headers: SECURITY_HEADERS,
      }
    );
  } catch (error) {
    console.error("Debug endpoint error:", error);
    return NextResponse.json(
      {
        error: "Debug endpoint failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
        headers: SECURITY_HEADERS,
      }
    );
  }
}

// Disable other HTTP methods
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: SECURITY_HEADERS }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: SECURITY_HEADERS }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: SECURITY_HEADERS }
  );
}
