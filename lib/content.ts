import { db } from "@/lib/db";
import {
  posts,
  categories,
  tags,
  postToTag,
  stars,
} from "@/lib/db/schema";
import { eq, and, or, desc, asc, ilike, sql, inArray } from "drizzle-orm";
import { Queries, MetadataQueries, getCachedPosts } from "@/lib/query";
import { createCachedFunction, CACHE_TAGS, CACHE_DURATIONS } from "@/lib/cache";
import { cache } from "react";
import { unstable_cache } from "next/cache";

export interface PostWithDetails {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  content?: string; // Optional — list queries exclude content for performance
  isPremium: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  status: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
  };
  category: {
    id: string;
    name: string;
    slug: string;
    parent: {
      id: string;
      name: string;
      slug: string;
    } | null;
  };
  tags: {
    id: string;
    name: string;
    slug: string;
  }[];
  _count: {
    stars: number;
  };
}

export interface PostWithInteractions extends PostWithDetails {
  isStarred?: boolean;
}

export async function getPostsForSitemap(): Promise<{ id: string; slug: string; updatedAt: Date }[]> {
  const rows = await db
    .select({ id: posts.id, slug: posts.slug, updatedAt: posts.updatedAt })
    .from(posts)
    .where(eq(posts.isPublished, true))
    .orderBy(desc(posts.updatedAt));
  return rows;
}

export interface TagWithCount {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  _count: {
    posts: number;
  };
}

const getPostByIdMemoized = cache(async (id: string) => {
  return await Queries.posts.getById(id) as PostWithDetails | null;
});

const getAllPostsMemoized = cache(async (includeUnpublished = false) => {
  const result = await Queries.posts.getPaginated({
    page: 1,
    limit: 50,
    includeUnpublished,
  });
  return result.data as unknown as PostWithDetails[];
});

const getAllCategoriesMemoized = cache(async () => {
  return await MetadataQueries.getAllCategories();
});

const getAllTagsMemoized = cache(async () => {
  return await MetadataQueries.getAllTags();
});

// Internal uncached functions that use memoized versions for request deduplication.
async function _getAllPosts(
  includeUnpublished = false
): Promise<PostWithDetails[]> {
  return await getAllPostsMemoized(includeUnpublished);
}

async function _getPostById(id: string): Promise<PostWithDetails | null> {
  return await getPostByIdMemoized(id);
}

// Cached versions of the functions
export const getAllPosts = createCachedFunction(
  _getAllPosts,
  "get-all-posts",
  CACHE_DURATIONS.POSTS_LIST,
  [CACHE_TAGS.POSTS]
);

// Lightweight helper to avoid caching oversized objects when only IDs are needed
export async function getFeaturedPostIds(limit = 100): Promise<string[]> {
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.isPublished, true), eq(posts.isFeatured, true)))
    .orderBy(desc(posts.createdAt))
    .limit(limit);
  return rows.map((p) => p.id);
}

/**
 * Fetch only featured published posts (with full details) — avoids the
 * expensive pattern of fetching 500 posts and filtering client-side.
 *
 * Always uses the shared post cache (omits userId so the result is cacheable),
 * then overlays per-user star status with a single lightweight query.
 */
export async function getFeaturedPosts(
  userId?: string,
  limit = 12
): Promise<PostWithInteractions[]> {
  const result = await getCachedPosts({
    page: 1,
    limit,
    includeUnpublished: false,
    isFeatured: true,
    sortBy: "latest",
  });
  const postList = result.data as unknown as PostWithInteractions[];

  if (!userId || postList.length === 0) return postList;

  const postIds = postList.map((p) => p.id);
  const userStars = await db
    .select({ postId: stars.postId })
    .from(stars)
    .where(and(eq(stars.userId, userId), inArray(stars.postId, postIds)));
  const starSet = new Set(userStars.map((s) => s.postId));
  return postList.map((p) => ({ ...p, isStarred: starSet.has(p.id) }));
}

export const getPostById = createCachedFunction(
  _getPostById,
  "get-post-by-id",
  CACHE_DURATIONS.POST_DETAIL,
  [CACHE_TAGS.POST_BY_ID]
);

// Internal uncached functions for categories and tags that use memoized versions
async function _getAllCategories() {
  return await getAllCategoriesMemoized();
}

async function _getAllTags(): Promise<TagWithCount[]> {
  return await getAllTagsMemoized();
}

async function _getTagsPaginated(
  page: number = 1,
  pageSize: number = 10,
  searchQuery?: string,
  sortBy: "name" | "created" | "posts" = "name"
): Promise<PaginatedResult<TagWithCount>> {
  const validPage = Math.max(1, page);
  const validPageSize = Math.max(1, Math.min(100, pageSize));
  const skip = (validPage - 1) * validPageSize;

  const searchCondition = searchQuery
    ? or(
        ilike(tags.name, `%${searchQuery}%`),
        ilike(tags.slug, `%${searchQuery}%`)
      )
    : undefined;

  const [countResult, countRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tags)
      .where(searchCondition),
    db
      .select({
        tagId: postToTag.B,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(postToTag)
      .groupBy(postToTag.B),
  ]);
  const totalCount = countResult[0]?.count ?? 0;
  const countByTagId = new Map<string, number>(
    countRows.map((r) => [r.tagId, r.count ?? 0])
  );

  const order =
    sortBy === "created"
      ? [desc(tags.createdAt)]
      : [asc(tags.name)];

  const rawRows =
    sortBy === "posts"
      ? await db
          .select()
          .from(tags)
          .where(searchCondition)
          .orderBy(asc(tags.name))
      : await db
          .select()
          .from(tags)
          .where(searchCondition)
          .orderBy(...order)
          .limit(validPageSize)
          .offset(skip);

  const withCount: TagWithCount[] = rawRows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    _count: { posts: countByTagId.get(row.id) ?? 0 },
  }));

  let data = withCount;
  if (sortBy === "posts") {
    data = withCount
      .sort((a, b) => b._count.posts - a._count.posts)
      .slice(skip, skip + validPageSize);
  }

  const totalPages = Math.ceil(totalCount / validPageSize);
  return {
    data,
    totalCount,
    totalPages,
    currentPage: validPage,
    pageSize: validPageSize,
    hasNextPage: validPage < totalPages,
    hasPreviousPage: validPage > 1,
  };
}

async function _searchTags(query: string): Promise<TagWithCount[]> {
  const searchCondition = or(
    ilike(tags.name, `%${query}%`),
    ilike(tags.slug, `%${query}%`)
  );
  const [tagRows, countRows] = await Promise.all([
    db.select().from(tags).where(searchCondition).orderBy(asc(tags.name)),
    db
      .select({
        tagId: postToTag.B,
        count: sql<number>`count(*)::int`.as("count"),
      })
      .from(postToTag)
      .groupBy(postToTag.B),
  ]);
  const countByTagId = new Map<string, number>(
    countRows.map((r) => [r.tagId, r.count ?? 0])
  );
  return tagRows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    _count: { posts: countByTagId.get(row.id) ?? 0 },
  }));
}

async function _getPostsByCategory(
  categorySlug: string,
  includeUnpublished = false
): Promise<PostWithDetails[]> {
  const [cat] = await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1);
  if (!cat) return [];
  const result = await Queries.posts.getPaginated({
    page: 1,
    limit: 200,
    includeUnpublished,
    categoryId: cat.id,
  });
  return result.data as unknown as PostWithDetails[];
}

async function _searchPosts(query: string): Promise<PostWithDetails[]> {
  const result = await Queries.posts.search(query, { page: 1, limit: 200 });
  return result.data as unknown as PostWithDetails[];
}

// Cached versions for static data
export const getAllCategories = createCachedFunction(
  _getAllCategories,
  "get-all-categories",
  CACHE_DURATIONS.STATIC_DATA,
  [CACHE_TAGS.CATEGORIES]
);

/** Parent categories only (parentId is null), for header/nav menu. */
export interface ParentCategoryNav {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string }[];
}

const getParentCategoriesMemoized = cache(async (): Promise<ParentCategoryNav[]> => {
  const allRows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
      createdAt: categories.createdAt,
    })
    .from(categories)
    .orderBy(asc(categories.createdAt));

  const parents: ParentCategoryNav[] = [];
  const childrenByParent = new Map<string, { id: string; name: string; slug: string }[]>();

  for (const row of allRows) {
    if (row.parentId) {
      const siblings = childrenByParent.get(row.parentId) ?? [];
      siblings.push({ id: row.id, name: row.name, slug: row.slug });
      childrenByParent.set(row.parentId, siblings);
    }
  }

  for (const row of allRows) {
    if (!row.parentId) {
      parents.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        children: childrenByParent.get(row.id) ?? [],
      });
    }
  }

  return parents;
});

export const getParentCategories = createCachedFunction(
  getParentCategoriesMemoized,
  "get-parent-categories",
  CACHE_DURATIONS.STATIC_DATA,
  [CACHE_TAGS.CATEGORIES]
);

export const getAllTags = createCachedFunction(
  _getAllTags,
  "get-all-tags",
  CACHE_DURATIONS.STATIC_DATA,
  [CACHE_TAGS.TAGS]
);

export const getTagsPaginated = createCachedFunction(
  _getTagsPaginated,
  "get-tags-paginated",
  CACHE_DURATIONS.STATIC_DATA,
  [CACHE_TAGS.TAGS]
);

export const searchTags = createCachedFunction(
  _searchTags,
  "search-tags",
  CACHE_DURATIONS.SEARCH,
  [CACHE_TAGS.SEARCH_RESULTS]
);

// Cached versions for posts by category
export const getPostsByCategory = createCachedFunction(
  _getPostsByCategory,
  "get-posts-by-category",
  CACHE_DURATIONS.POSTS_LIST,
  [CACHE_TAGS.POSTS]
);

// Search results cache (shorter duration due to dynamic nature)
export const searchPosts = createCachedFunction(
  _searchPosts,
  "search-posts",
  CACHE_DURATIONS.SEARCH,
  [CACHE_TAGS.SEARCH_RESULTS]
);


export async function getTagById(id: string) {
  const [row] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (!row) return null;
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postToTag)
    .where(eq(postToTag.B, id));
  return { ...row, _count: { posts: countRow?.count ?? 0 } };
}

export async function getPostsWithInteractions(
  userId?: string,
  includeUnpublished = false
): Promise<PostWithInteractions[]> {
  const result = await Queries.posts.getPaginated({
    page: 1,
    limit: 500,
    includeUnpublished,
    userId,
  });
  return result.data as unknown as PostWithInteractions[];
}

export type SortOption = "latest" | "trending" | "popular" | "relevance";

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

async function _getUserPosts(userId: string): Promise<PostWithDetails[]> {
  const result = await Queries.posts.getPaginated({
    page: 1,
    limit: 500,
    authorId: userId,
    includeUnpublished: true,
  });
  return result.data as unknown as PostWithDetails[];
}

// Cached version of getUserPosts
export const getUserPosts = createCachedFunction(
  _getUserPosts,
  "get-user-posts",
  CACHE_DURATIONS.USER_DATA,
  [CACHE_TAGS.USER_POSTS, CACHE_TAGS.POSTS]
);

export async function getUserPostsPaginated(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<PaginatedResult<PostWithDetails>> {
  const result = await Queries.posts.getPaginated({
    authorId: userId,
    page,
    limit: pageSize,
    includeUnpublished: true,
  });
  const p = result.pagination;
  return {
    data: result.data as unknown as PostWithDetails[],
    totalCount: p.totalCount,
    totalPages: p.totalPages,
    currentPage: page,
    pageSize,
    hasNextPage: p.hasNextPage,
    hasPreviousPage: p.hasPreviousPage,
  };
}

export async function getPostsPaginated(
  page: number = 1,
  pageSize: number = 10,
  includeUnpublished = false
): Promise<PaginatedResult<PostWithDetails>> {
  const result = await Queries.posts.getPaginated({
    page,
    limit: pageSize,
    includeUnpublished,
  });
  const p = result.pagination;
  return {
    data: result.data as unknown as PostWithDetails[],
    totalCount: p.totalCount,
    totalPages: p.totalPages,
    currentPage: page,
    pageSize,
    hasNextPage: p.hasNextPage,
    hasPreviousPage: p.hasPreviousPage,
  };
}

export async function getPostsWithSorting(
  userId?: string,
  sortBy: SortOption = "latest",
  includeUnpublished = false
): Promise<PostWithInteractions[]> {
  const result = await Queries.posts.getPaginated({
    page: 1,
    limit: 500,
    includeUnpublished,
    userId,
    sortBy,
  });
  return result.data as unknown as PostWithInteractions[];
}

export async function getRelatedPosts(
  currentPostId: string,
  currentPost: PostWithDetails,
  userId?: string,
  limit: number = 6
): Promise<PostWithInteractions[]> {
  const tagIds = currentPost.tags.map((tag) => tag.id);
  const categoryId = currentPost.category.id;
  return Queries.posts.getRelated(currentPostId, categoryId, tagIds, limit, userId);
}

// Post Content Processing Functions
export const getPostContent = unstable_cache(
  async (id: string): Promise<PostWithDetails | null> => {
    return await getPostByIdMemoized(id);
  },
  ["post-content"],
  {
    tags: [CACHE_TAGS.POST_BY_ID],
    revalidate: CACHE_DURATIONS.POST_DETAIL,
  }
);

export const getPostsContent = unstable_cache(
  async (includeUnpublished = false): Promise<PostWithDetails[]> => {
    return await getAllPostsMemoized(includeUnpublished);
  },
  ["posts-content"],
  {
    tags: [CACHE_TAGS.POSTS],
    revalidate: CACHE_DURATIONS.POSTS_LIST,
  }
);

// Cache revalidation functions
export async function revalidatePostContent(id?: string) {
  const { revalidateCache } = await import("@/lib/cache");

  if (id) {
    // Revalidate specific post
    await revalidateCache(CACHE_TAGS.POST_BY_ID);
  } else {
    // Revalidate all posts
    await revalidateCache(CACHE_TAGS.POSTS);
  }
}

export async function revalidateAllPostsContent() {
  const { revalidateCache } = await import("@/lib/cache");
  await revalidateCache(CACHE_TAGS.POSTS);
}
