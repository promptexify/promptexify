import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  rateLimits,
  getClientIdentifier,
  getRateLimitHeaders,
} from "@/lib/security/limits";
import { sanitizeSearchQuery, SECURITY_HEADERS } from "@/lib/security/sanitize";

// Simple fallback sanitization for search queries that doesn't use JSDOM
function simpleSanitizeQuery(query: string): string {
  if (typeof query !== "string") {
    return "";
  }
  
  return query
    .trim()
    // Remove null bytes and control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F]/g, "")
    // Remove SQL injection patterns
    .replace(/[';\\"`]/g, "")
    // Remove HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove dangerous URL patterns
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/vbscript:/gi, "")
    // Keep only safe characters
    .replace(/[^\w\s\-_.]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    // Remove leading/trailing special characters
    .replace(/^[\s\-_.]+|[\s\-_.]+$/g, "")
    // Limit length
    .substring(0, 100)
    .trim();
}
import { Queries } from "@/lib/query";
import { getAllCategories } from "@/lib/content";

// Ensure Node.js runtime to support Drizzle and jsdom/DOMPurify used in sanitization
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let currentUser = null;
  let userId: string | undefined;
  
  // Add detailed request logging for debugging
  const requestUrl = request.url;
  const userAgent = request.headers.get("user-agent");
  console.log(`[POSTS-API] Request: ${requestUrl} from ${userAgent?.substring(0, 50)}...`);
  
  try {
    // Get current user for bookmark/favorite status with error handling
    try {
      currentUser = await getCurrentUser();
      userId = currentUser?.userData?.id;
    } catch (userError) {
      console.warn("Auth check failed (proceeding as anonymous):", userError);
      // Continue as anonymous user - don't fail the entire request
      userId = undefined;
    }

    // Rate limiting
    const clientId = getClientIdentifier(request, userId);
    const rateLimitResult = await rateLimits.search(clientId);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil(
            (rateLimitResult.resetTime - Date.now()) / 1000
          ),
        },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            ...getRateLimitHeaders(rateLimitResult),
            "Retry-After": String(
              Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
            ),
          },
        }
      );
    }

    // Parse and validate search parameters
    const { searchParams } = new URL(request.url);
    const rawParams = {
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "12",
      q: (searchParams.get("q") ?? "").trim(),
      category: searchParams.get("category") || "",
      subcategory: searchParams.get("subcategory") || "",
      premium: searchParams.get("premium") || "",
      sortBy: searchParams.get("sortBy") || "latest",
    };

    // Validate and sanitize parameters with better error handling
    let page: number;
    let limit: number;
    
    try {
      page = Math.max(1, Math.min(100, parseInt(rawParams.page, 10) || 1));
      limit = Math.max(1, Math.min(50, parseInt(rawParams.limit, 10) || 12));
    } catch (parseError) {
      console.warn("Parameter parsing error:", parseError);
      page = 1;
      limit = 12;
    }

    // Sanitize only when we have non-empty input; otherwise keep empty so we use paginated list
    let searchQuery: string;
    if (!rawParams.q || rawParams.q.length === 0) {
      searchQuery = "";
    } else {
      try {
        searchQuery = (await sanitizeSearchQuery(rawParams.q)).trim();
      } catch (sanitizeError) {
        console.error("[POSTS-API] Search query sanitization failed:", sanitizeError);
        searchQuery = simpleSanitizeQuery(rawParams.q).trim();
      }
    }

    // Do not run search when input is empty or whitespace-only
    const hasSearchQuery = searchQuery.length > 0;

    const categoryFilter = rawParams.category;
    const subcategoryFilter = rawParams.subcategory;
    const premiumFilter = rawParams.premium;
    const sortBy = ["latest", "popular", "trending", "relevance"].includes(rawParams.sortBy)
      ? (rawParams.sortBy as "latest" | "popular" | "trending" | "relevance")
      : "latest";

    // Get categories to convert slugs to IDs with error handling
    let categories: Array<{ id: string; slug: string; name: string }> = [];
    try {
      categories = await getAllCategories();
    } catch (categoryError) {
      console.warn("Failed to load categories (proceeding without category filter):", categoryError);
      // Continue without category filtering rather than failing
    }

    // Determine category ID for filtering (convert slug to ID)
    let categoryId: string | undefined;
    try {
      if (
        subcategoryFilter &&
        subcategoryFilter !== "all" &&
        subcategoryFilter !== "none" &&
        categories.length > 0
      ) {
        // Find the actual category ID from the slug
        const subcategory = categories.find((c) => c.slug === subcategoryFilter);
        categoryId = subcategory?.id;
      } else if (categoryFilter && categoryFilter !== "all" && categories.length > 0) {
        // Find the actual category ID from the slug
        const category = categories.find((c) => c.slug === categoryFilter);
        categoryId = category?.id;
      }
    } catch (categoryIdError) {
      console.warn("Category ID resolution failed:", categoryIdError);
      categoryId = undefined;
    }

    // Handle premium filter
    let isPremium: boolean | undefined;
    if (premiumFilter === "premium" || premiumFilter === "true") {
      isPremium = true;
    } else if (premiumFilter === "free" || premiumFilter === "false") {
      isPremium = false;
    }

    let result;

    // Use search only when we have non-empty query; otherwise use paginated list
    try {
      console.log(`[POSTS-API] Executing query - page: ${page}, limit: ${limit}, userId: ${userId || 'anonymous'}, categoryId: ${categoryId || 'none'}`);

      if (hasSearchQuery) {
        console.log(`[POSTS-API] Using search query: "${searchQuery}" sortBy: ${sortBy}`);
        result = await Queries.posts.search(searchQuery, {
          page,
          limit,
          userId,
          categoryId,
          isPremium,
          sortBy: sortBy as "relevance" | "latest" | "popular" | "trending",
        });
      } else {
        const paginatedSort = sortBy === "relevance" ? "latest" : sortBy;
        console.log(`[POSTS-API] Using paginated query with sortBy: ${paginatedSort}`);
        result = await Queries.posts.getPaginated({
          page,
          limit,
          userId,
          categoryId,
          isPremium,
          sortBy: paginatedSort,
        });
      }
      
      console.log(`[POSTS-API] Query successful - returned ${result.data.length} posts, hasNextPage: ${result.pagination.hasNextPage}`);
    } catch (queryError) {
      console.error("[POSTS-API] Database query failed:", {
        error: queryError instanceof Error ? queryError.message : queryError,
        stack: queryError instanceof Error ? queryError.stack : undefined,
        params: { page, limit, userId, categoryId, isPremium, sortBy, searchQuery },
      });
      
      // Return fallback empty result rather than 500 error
      result = {
        data: [],
        pagination: {
          totalCount: 0,
          totalPages: 0,
          currentPage: page,
          pageSize: limit,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    }

    // Ensure result structure is valid
    if (!result || !result.data || !result.pagination) {
      console.warn("Invalid query result, using fallback");
      result = {
        data: [],
        pagination: {
          totalCount: 0,
          totalPages: 0,
          currentPage: page,
          pageSize: limit,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    }

    // Transform the response to match expected structure (posts instead of data)
    const responseData = {
      posts: result.data,
      pagination: result.pagination,
    };

    // Determine cache strategy based on user authentication
    const cacheHeaders = userId
      ? {
          // For authenticated users, use private cache with shorter duration
          // to ensure bookmark/favorite state is fresh
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        }
      : {
          // For anonymous users, longer public cache is fine
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        };

    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        ...getRateLimitHeaders(rateLimitResult),
        ...cacheHeaders,
      },
    });
  } catch (error) {
    // Enhanced error logging for better debugging
    const errorDetails = {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      userId: userId || "anonymous",
      url: request.url,
      method: request.method,
    };
    
    console.error("Posts API error:", errorDetails);
    
    // Return a more specific error response
    return NextResponse.json(
      {
        error: "Failed to fetch posts",
        message: "An error occurred while loading posts. Please try again.",
        details: process.env.NODE_ENV === "development" ? errorDetails : undefined,
        fallback: {
          posts: [],
          pagination: {
            totalCount: 0,
            totalPages: 0,
            currentPage: 1,
            pageSize: 12,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      },
      {
        status: 500,
        headers: SECURITY_HEADERS,
      }
    );
  }
}

// Disable other HTTP methods for security
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

export async function PATCH() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: SECURITY_HEADERS }
  );
}
