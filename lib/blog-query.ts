"use server";

import { db } from "@/lib/db";
import { blogPosts, users } from "@/lib/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS, CACHE_DURATIONS } from "@/lib/cache";

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const BLOG_SELECT_LIST = {
  id:               blogPosts.id,
  slug:             blogPosts.slug,
  title:            blogPosts.title,
  excerpt:          blogPosts.excerpt,
  featuredImageUrl: blogPosts.featuredImageUrl,
  readingTime:      blogPosts.readingTime,
  status:           blogPosts.status,
  publishedAt:      blogPosts.publishedAt,
  createdAt:        blogPosts.createdAt,
  updatedAt:        blogPosts.updatedAt,
  author: {
    id:   users.id,
    name: users.name,
  },
} as const;

const BLOG_SELECT_FULL = {
  ...BLOG_SELECT_LIST,
  content:          blogPosts.content,
  authorId:         blogPosts.authorId,
} as const;



// ---------------------------------------------------------------------------
// Public queries (cached)
// ---------------------------------------------------------------------------

export const getPublishedBlogPosts = unstable_cache(
  async (page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      db
        .select(BLOG_SELECT_LIST)
        .from(blogPosts)
        .leftJoin(users, eq(blogPosts.authorId, users.id))
        .where(eq(blogPosts.status, "PUBLISHED"))
        .orderBy(desc(blogPosts.publishedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(blogPosts)
        .where(eq(blogPosts.status, "PUBLISHED")),
    ]);
    return {
      posts: rows,
      pagination: {
        page,
        limit,
        totalCount: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
        hasNextPage: offset + limit < Number(total),
      },
    };
  },
  ["blog-posts-list"],
  { revalidate: CACHE_DURATIONS.POSTS_LIST, tags: [CACHE_TAGS.BLOG_POSTS] }
);

export const getBlogPostBySlug = unstable_cache(
  async (slug: string) => {
    const [row] = await db
      .select(BLOG_SELECT_FULL)
      .from(blogPosts)
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "PUBLISHED")))
      .limit(1);
    return row ?? null;
  },
  ["blog-post-by-slug"],
  { revalidate: CACHE_DURATIONS.POST_DETAIL, tags: [CACHE_TAGS.BLOG_POST_BY_SLUG] }
);

export async function getBlogPostForSitemap() {
  return db
    .select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt })
    .from(blogPosts)
    .where(eq(blogPosts.status, "PUBLISHED"))
    .orderBy(desc(blogPosts.publishedAt));
}

// ---------------------------------------------------------------------------
// Admin queries (bypasses cache)
// ---------------------------------------------------------------------------

export async function getAllBlogPostsAdmin(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(BLOG_SELECT_LIST)
      .from(blogPosts)
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .orderBy(desc(blogPosts.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(blogPosts),
  ]);
  return {
    posts: rows,
    pagination: {
      page,
      limit,
      totalCount: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
      hasNextPage: offset + limit < Number(total),
    },
  };
}

export async function getBlogPostByIdAdmin(id: string) {
  const [row] = await db
    .select(BLOG_SELECT_FULL)
    .from(blogPosts)
    .leftJoin(users, eq(blogPosts.authorId, users.id))
    .where(eq(blogPosts.id, id))
    .limit(1);
  return row ?? null;
}
