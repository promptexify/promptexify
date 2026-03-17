import { NextResponse, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAllTags } from "@/lib/content";
import { db } from "@/lib/db";
import { tags as tagsTable } from "@/lib/db/schema";
import { eq, or, ilike } from "drizzle-orm";
import { createTagSchema } from "@/lib/schemas";
import {
  rateLimits,
  getClientIdentifier,
  getRateLimitHeaders,
} from "@/lib/security/limits";
import {
  sanitizeTagName,
  sanitizeTagSlug,
  validateTagSlug,
  SECURITY_HEADERS,
} from "@/lib/security/sanitize";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        {
          status: 401,
          headers: SECURITY_HEADERS,
        }
      );
    }

    // Role check - allow both ADMIN and USER
    if (user.userData?.role !== "ADMIN" && user.userData?.role !== "USER") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        {
          status: 403,
          headers: SECURITY_HEADERS,
        }
      );
    }

    // Rate limiting
    const clientId = getClientIdentifier(request, user.userData?.id);
    const rateLimitResult = await rateLimits.api(clientId);

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

    // Fetch tags
    const tags = await getAllTags();

    return NextResponse.json(tags, {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        ...getRateLimitHeaders(rateLimitResult),
        // Cache for 5 minutes since tags don't change frequently
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Tags API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      {
        status: 500,
        headers: SECURITY_HEADERS,
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // CSRF validation is handled by middleware for all POST /api/* requests.
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        {
          status: 401,
          headers: SECURITY_HEADERS,
        }
      );
    }

    // Role check - allow both ADMIN and USER
    if (user.userData?.role !== "ADMIN" && user.userData?.role !== "USER") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        {
          status: 403,
          headers: SECURITY_HEADERS,
        }
      );
    }

    // Rate limiting for tag creation
    const clientId = getClientIdentifier(request, user.userData?.id);
    const rateLimitResult = await rateLimits.createTag(clientId);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: "Too many tag creation requests. Please try again later.",
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

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        {
          status: 400,
          headers: SECURITY_HEADERS,
        }
      );
    }

    // Validate input using Zod schema
    const validationResult = createTagSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid input data",
          details: validationResult.error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        },
        {
          status: 400,
          headers: SECURITY_HEADERS,
        }
      );
    }

    const { name, slug: providedSlug } = validationResult.data;

    // Enhanced sanitization for security
    const sanitizedName = sanitizeTagName(name);
    if (!sanitizedName || sanitizedName.length === 0) {
      return NextResponse.json(
        {
          error:
            "Tag name contains invalid characters or is empty after sanitization",
        },
        {
          status: 400,
          headers: SECURITY_HEADERS,
        }
      );
    }

    // Generate or sanitize slug with strict validation
    let finalSlug: string;
    if (providedSlug) {
      finalSlug = sanitizeTagSlug(providedSlug);
    } else {
      finalSlug = sanitizeTagSlug(sanitizedName);
    }

    // Validate the final slug according to requirements
    if (!validateTagSlug(finalSlug)) {
      return NextResponse.json(
        {
          error:
            "Unable to generate a valid slug. Slug can only contain lowercase letters (a-z), numbers (0-9), and hyphens (-), cannot start or end with hyphens, and cannot contain consecutive hyphens.",
        },
        {
          status: 400,
          headers: SECURITY_HEADERS,
        }
      );
    }

    const [existingTag] = await db
      .select()
      .from(tagsTable)
      .where(or(ilike(tagsTable.name, sanitizedName), eq(tagsTable.slug, finalSlug)))
      .limit(1);

    if (existingTag) {
      // Return specific error message based on what matched
      const isNameMatch =
        existingTag.name.toLowerCase() === sanitizedName.toLowerCase();
      const isSlugMatch = existingTag.slug === finalSlug;

      let errorMessage = "A tag with this ";
      if (isNameMatch && isSlugMatch) {
        errorMessage += "name and slug already exists";
      } else if (isNameMatch) {
        errorMessage += "name already exists";
      } else {
        errorMessage += "slug already exists";
      }

      return NextResponse.json(
        {
          error: errorMessage,
          existingTag: {
            id: existingTag.id,
            name: existingTag.name,
            slug: existingTag.slug,
          },
        },
        {
          status: 409,
          headers: SECURITY_HEADERS,
        }
      );
    }

    const [newTag] = await db
      .insert(tagsTable)
      .values({ name: sanitizedName, slug: finalSlug })
      .returning();

    // Invalidate tags cache so new tag appears immediately
    revalidateCache(CACHE_TAGS.TAGS);

    return NextResponse.json(newTag!, {
      status: 201,
      headers: {
        ...SECURITY_HEADERS,
        ...getRateLimitHeaders(rateLimitResult),
      },
    });
  } catch (error) {
    console.error("Tags API POST error:", error);

    // Handle specific database errors
    if (error && typeof error === "object" && "code" in error) {
      const dbError = error as { code: string; meta?: unknown };

      if (dbError.code === "P2002") {
        // Unique constraint violation
        return NextResponse.json(
          { error: "A tag with these details already exists" },
          {
            status: 409,
            headers: SECURITY_HEADERS,
          }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create tag. Please try again." },
      {
        status: 500,
        headers: SECURITY_HEADERS,
      }
    );
  }
}

// Explicitly deny other HTTP methods
export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: {
        ...SECURITY_HEADERS,
        Allow: "GET, POST",
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
        Allow: "GET, POST",
      },
    }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: {
        ...SECURITY_HEADERS,
        Allow: "GET, POST",
      },
    }
  );
}
