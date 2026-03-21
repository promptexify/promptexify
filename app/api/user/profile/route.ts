import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";
import { CACHE_TAGS, CACHE_DURATIONS } from "@/lib/cache";

const getCachedUserById = (userId: string) =>
  unstable_cache(
    async () => {
      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return row ?? null;
    },
    [`user-profile-${userId}`],
    { revalidate: CACHE_DURATIONS.USER_DATA, tags: [CACHE_TAGS.USER_PROFILE] }
  )();

export async function GET() {
  try {
    // middleware (proxy.ts) already called supabase.auth.getUser() to validate
    // the JWT and stamped the verified user ID onto the request as x-user-id.
    const headersList = await headers();
    const userId = headersList.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    const userData = await getCachedUserById(userId);

    if (!userData) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: SECURITY_HEADERS }
      );
    }

    return NextResponse.json(userData, {
      headers: {
        ...SECURITY_HEADERS,
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("User profile API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user profile" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

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
