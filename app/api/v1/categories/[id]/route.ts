import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, posts } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Role check - allow both ADMIN and USER
    if (user.userData?.role !== "ADMIN" && user.userData?.role !== "USER") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const [categoryRow] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!categoryRow) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    const [parent] = categoryRow.parentId
      ? await db.select().from(categories).where(eq(categories.id, categoryRow.parentId)).limit(1)
      : [null];
    const children = await db.select().from(categories).where(eq(categories.parentId, id));
    const [postsCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(eq(posts.categoryId, id));
    const category = {
      ...categoryRow,
      parent: parent ?? null,
      children,
      _count: { posts: postsCountRow?.count ?? 0 },
    };
    return NextResponse.json(category);
  } catch (error) {
    console.error("Category API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch category" },
      { status: 500 }
    );
  }
}
