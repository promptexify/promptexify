import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAllCategories } from "@/lib/content";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    if (user.userData?.role !== "ADMIN" && user.userData?.role !== "USER") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }

    const categories = await getAllCategories();

    return NextResponse.json(categories, { headers: SECURITY_HEADERS });
  } catch (error) {
    console.error("Categories API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { ...SECURITY_HEADERS, Allow: "GET" } }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { ...SECURITY_HEADERS, Allow: "GET" } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { ...SECURITY_HEADERS, Allow: "GET" } }
  );
}
