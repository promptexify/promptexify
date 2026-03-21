/**
 * Query layer built on Drizzle ORM.
 * Caching, memoization, and public API for all post/metadata queries.
 */

import { db, DatabaseMetrics } from "@/lib/db";
import {
  posts,
  users,
  categories,
  tags,
  postToTag,
  stars,
} from "@/lib/db/schema";
import {
  createCachedFunction,
  CACHE_TAGS,
  CACHE_DURATIONS,
  memoize,
} from "@/lib/cache";
import {
  eq,
  and,
  or,
  inArray,
  desc,
  asc,
  ilike,
  sql,
  exists,
  aliasedTable,
  type SQL,
} from "drizzle-orm";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PostListAuthor {
  id: string;
  name: string | null;
  avatar: string | null;
  email: string;
}

export interface PostListCategoryParent {
  id: string;
  name: string;
  slug: string;
}

export interface PostListCategory {
  id: string;
  name: string;
  slug: string;
  parent: PostListCategoryParent | null;
}

export interface PostListTag {
  id: string;
  name: string;
  slug: string;
}

export interface PostListResult {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isPremium: boolean;
  isPublished: boolean;
  isFeatured: boolean;
  status: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  author: PostListAuthor;
  category: PostListCategory;
  tags: PostListTag[];
  _count: { stars: number };
}

export interface PostFullResult extends PostListResult {
  content: string;
}

export interface PostWithInteractions extends PostListResult {
  isStarred?: boolean;
}

export interface PostFullWithInteractions extends PostFullResult {
  isStarred?: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
  sortBy?: "latest" | "popular" | "trending" | "relevance";
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

type PostGetPaginatedParams = PaginationParams & {
  includeUnpublished?: boolean;
  categoryId?: string;
  authorId?: string;
  isPremium?: boolean;
  isFeatured?: boolean;
  userId?: string;
};

// Placeholder exports retained for API compatibility; shapes are defined inline per query
export const POST_SELECTS = { list: {}, full: {}, api: {}, admin: {} } as const;
export const USER_SELECTS = { profile: {}, admin: {} } as const;

// -----------------------------------------------------------------------------
// Helpers: fetch tags/media/counts for a set of post ids and merge into list
// -----------------------------------------------------------------------------

async function getTagsForPostIds(postIds: string[]): Promise<Map<string, PostListTag[]>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      postId: postToTag.A,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(postToTag)
    .innerJoin(tags, eq(postToTag.B, tags.id))
    .where(inArray(postToTag.A, postIds));
  const map = new Map<string, PostListTag[]>();
  for (const r of rows) {
    const list = map.get(r.postId) ?? [];
    list.push({ id: r.id, name: r.name, slug: r.slug });
    map.set(r.postId, list);
  }
  return map;
}

async function getStarCounts(postIds: string[]): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({ postId: stars.postId, count: sql<number>`count(*)::int` })
    .from(stars)
    .where(inArray(stars.postId, postIds))
    .groupBy(stars.postId);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.postId, r.count);
  return map;
}

// Alias for parent category join (same table twice)
const parentCategory = aliasedTable(categories, "parent_category");

// -----------------------------------------------------------------------------
// PostQueries
// -----------------------------------------------------------------------------

export class PostQueries {
  static async getPaginated(
    params: PostGetPaginatedParams
  ): Promise<PaginatedResult<PostWithInteractions>> {
    const {
      page = 1,
      limit = 12,
      includeUnpublished = false,
      categoryId,
      authorId,
      isPremium,
      isFeatured,
      userId,
      sortBy = "latest",
    } = params;
    const skip = (page - 1) * limit;

    const conditions: (SQL | undefined)[] = [];
    if (!includeUnpublished) conditions.push(eq(posts.isPublished, true));
    if (authorId) conditions.push(eq(posts.authorId, authorId));
    if (isPremium !== undefined) conditions.push(eq(posts.isPremium, isPremium));
    if (isFeatured !== undefined) conditions.push(eq(posts.isFeatured, isFeatured));
    if (categoryId) {
      const subIds = db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, categoryId));
      const catCond = or(eq(posts.categoryId, categoryId), inArray(posts.categoryId, subIds));
      if (catCond) conditions.push(catCond);
    }
    const whereClause = and(...conditions);

    // Aggregated stars subquery — avoids correlated subquery per row for popular/trending sorts
    const starCounts = db
      .select({ postId: stars.postId, cnt: sql<number>`count(*)::int`.as("cnt") })
      .from(stars)
      .groupBy(stars.postId)
      .as("star_counts");

    const endTimer = DatabaseMetrics.startQuery();
    try {
      const orderByClause =
        sortBy === "popular"
          ? [desc(sql`coalesce(${starCounts.cnt}, 0)`), desc(posts.createdAt)]
          : sortBy === "trending"
            ? [desc(sql`coalesce(${starCounts.cnt}, 0)`), desc(posts.createdAt)]
            : [desc(posts.createdAt)];

      const [rows, countResult] = await Promise.all([
        db
          .select({
            postId: posts.id,
            title: posts.title,
            slug: posts.slug,
            description: posts.description,
            isPremium: posts.isPremium,
            isFeatured: posts.isFeatured,
            isPublished: posts.isPublished,
            status: posts.status,
            authorId: posts.authorId,
            categoryId: posts.categoryId,
            createdAt: posts.createdAt,
            updatedAt: posts.updatedAt,
            authorUserId: users.id,
            authorName: users.name,
            authorAvatar: users.avatar,
            authorEmail: users.email,
            catId: categories.id,
            catName: categories.name,
            catSlug: categories.slug,
            parentId: parentCategory.id,
            parentName: parentCategory.name,
            parentSlug: parentCategory.slug,
          })
          .from(posts)
          .leftJoin(users, eq(posts.authorId, users.id))
          .leftJoin(categories, eq(posts.categoryId, categories.id))
          .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
          .leftJoin(starCounts, eq(posts.id, starCounts.postId))
          .where(whereClause)
          .orderBy(...orderByClause)
          .limit(limit)
          .offset(skip),
        // COUNT only needs posts — whereClause references posts.* and a categories subquery,
        // not the joined categories alias, so the category joins are unnecessary here.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(posts)
          .where(whereClause),
      ]);
      const totalCount = Number(countResult[0]?.count ?? 0);

      const postIds = rows.map((r) => r.postId);
      const [tagsMap, counts] = await Promise.all([
        getTagsForPostIds(postIds),
        getStarCounts(postIds),
      ]);

      let starSet: Set<string> = new Set();
      if (userId && postIds.length > 0) {
        const userStars = await db.select({ postId: stars.postId }).from(stars).where(and(eq(stars.userId, userId), inArray(stars.postId, postIds)));
        starSet = new Set(userStars.map((s) => s.postId));
      }

      const data: PostWithInteractions[] = rows.map((r) => {
        return {
          id: r.postId,
          title: r.title,
          slug: r.slug,
          description: r.description,
          isPremium: r.isPremium ?? false,
          isPublished: r.isPublished ?? false,
          isFeatured: r.isFeatured ?? false,
          status: r.status ?? "DRAFT",
          authorId: r.authorId,
          createdAt: r.createdAt!,
          updatedAt: r.updatedAt!,
          author: {
            id: r.authorUserId ?? "",
            name: r.authorName,
            avatar: r.authorAvatar,
            email: r.authorEmail ?? "",
          },
          category: {
            id: r.catId ?? "",
            name: r.catName ?? "",
            slug: r.catSlug ?? "",
            parent: r.parentId
              ? { id: r.parentId, name: r.parentName ?? "", slug: r.parentSlug ?? "" }
              : null,
          },
          tags: tagsMap.get(r.postId) ?? [],
          _count: { stars: counts.get(r.postId) ?? 0 },
          isStarred: userId ? starSet.has(r.postId) : false,
        };
      });

      const totalPages = Math.ceil(totalCount / limit);
      return {
        data,
        pagination: {
          totalCount,
          totalPages,
          currentPage: page,
          pageSize: limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } finally {
      endTimer();
    }
  }

  static async search(
    query: string,
    params: PaginationParams & {
      userId?: string;
      categoryId?: string;
      isPremium?: boolean;
      sortBy?: "relevance" | "latest" | "popular" | "trending";
    }
  ): Promise<PaginatedResult<PostWithInteractions>> {
    const { page = 1, limit = 12, userId, categoryId, isPremium, sortBy = "relevance" } = params;
    const skip = (page - 1) * limit;

    const trimmed = typeof query === "string" ? query.trim() : "";
    const searchTerms = trimmed.split(/\s+/).filter(Boolean);
    if (searchTerms.length === 0) {
      return {
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

    // Build a PostgreSQL tsquery with prefix matching on the last term
    // so typing "reac" matches "react", "reactive", etc.
    const sanitizedTerms = searchTerms
      .map((t) => t.replace(/[^a-zA-Z0-9]/g, ""))
      .filter((t) => t.length > 0);

    const tsQueryString =
      sanitizedTerms.length > 0
        ? sanitizedTerms
            .map((t, i) => (i === sanitizedTerms.length - 1 ? `${t}:*` : t))
            .join(" & ")
        : null;

    // Use stored search_vector column (GIN-indexed) instead of computing tsvector on every row
    const fullTextCondition = tsQueryString
      ? sql`${posts.searchVector} @@ to_tsquery('english', ${tsQueryString})`
      : null;

    // Relevance rank using stored vector — avoids redundant tsvector computation at query time
    const rankExpr = tsQueryString
      ? sql<number>`ts_rank(${posts.searchVector}, to_tsquery('english', ${tsQueryString}))`
      : sql<number>`0`;

    // Pre-fetch tag IDs matching the search terms — eliminates correlated subquery per row
    let matchingTagIds: string[] = [];
    if (searchTerms.length > 0) {
      const tagRows = await db
        .select({ id: tags.id })
        .from(tags)
        .where(or(...searchTerms.map((term) => ilike(tags.name, `%${term}%`))));
      matchingTagIds = tagRows.map((r) => r.id);
    }

    // ilike fallback conditions for broader matching (short queries, special chars, etc.)
    const ilikeConditions = searchTerms.map((term) => {
      const conds: SQL[] = [
        ilike(posts.title, `%${term}%`),
        ilike(posts.description, `%${term}%`),
      ];
      // Use pre-fetched tag IDs with simple inArray (no correlated join per row)
      if (matchingTagIds.length > 0) {
        conds.push(
          exists(
            db
              .select()
              .from(postToTag)
              .where(and(eq(postToTag.A, posts.id), inArray(postToTag.B, matchingTagIds)))
          )
        );
      }
      conds.push(ilike(categories.name, `%${term}%`));
      return or(...conds);
    });

    // Combine: full-text OR (all ilike terms must match)
    const combinedSearch = fullTextCondition
      ? or(fullTextCondition, and(...ilikeConditions))
      : and(...ilikeConditions);

    const searchWhere = and(
      eq(posts.isPublished, true),
      combinedSearch,
      isPremium !== undefined ? eq(posts.isPremium, isPremium) : undefined
    );

    let whereClause: SQL | undefined = searchWhere;
    if (categoryId) {
      const subIds = db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, categoryId));
      whereClause = and(searchWhere, or(eq(posts.categoryId, categoryId), inArray(posts.categoryId, subIds)));
    }

    // Aggregated stars subquery — avoids correlated subquery per row for popular/trending sorts
    const starCounts = db
      .select({ postId: stars.postId, cnt: sql<number>`count(*)::int`.as("cnt") })
      .from(stars)
      .groupBy(stars.postId)
      .as("star_counts");

    // Determine ordering based on sortBy
    const orderByClause =
      sortBy === "latest"
        ? [desc(posts.createdAt)]
        : sortBy === "popular"
          ? [desc(sql`coalesce(${starCounts.cnt}, 0)`), desc(posts.createdAt)]
          : sortBy === "trending"
            ? [desc(sql`coalesce(${starCounts.cnt}, 0)`), desc(posts.createdAt)]
            : [desc(rankExpr), desc(posts.createdAt)]; // "relevance" (default)

    const endTimer = DatabaseMetrics.startQuery();
    try {
      const [rows, countResult] = await Promise.all([
        db
          .select({
            postId: posts.id,
            title: posts.title,
            slug: posts.slug,
            description: posts.description,
            isPremium: posts.isPremium,
            isFeatured: posts.isFeatured,
            isPublished: posts.isPublished,
            status: posts.status,
            authorId: posts.authorId,
            categoryId: posts.categoryId,
            createdAt: posts.createdAt,
            updatedAt: posts.updatedAt,
            authorUserId: users.id,
            authorName: users.name,
            authorAvatar: users.avatar,
            authorEmail: users.email,
            catId: categories.id,
            catName: categories.name,
            catSlug: categories.slug,
            parentId: parentCategory.id,
            parentName: parentCategory.name,
            parentSlug: parentCategory.slug,
          })
          .from(posts)
          .leftJoin(users, eq(posts.authorId, users.id))
          .leftJoin(categories, eq(posts.categoryId, categories.id))
          .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
          .leftJoin(starCounts, eq(posts.id, starCounts.postId))
          .where(whereClause)
          .orderBy(...orderByClause)
          .limit(limit)
          .offset(skip),
        // COUNT needs the categories join because whereClause may reference categories.name via ilike
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(posts)
          .leftJoin(categories, eq(posts.categoryId, categories.id))
          .where(whereClause),
      ]);
      const totalCount = Number(countResult[0]?.count ?? 0);

      const postIds = rows.map((r) => r.postId);
      const [tagsMap, counts] = await Promise.all([
        getTagsForPostIds(postIds),
        getStarCounts(postIds),
      ]);

      let starSet = new Set<string>();
      if (userId && postIds.length > 0) {
        const userStars = await db.select({ postId: stars.postId }).from(stars).where(and(eq(stars.userId, userId), inArray(stars.postId, postIds)));
        starSet = new Set(userStars.map((s) => s.postId));
      }

      const data: PostWithInteractions[] = rows.map((r) => {
        return {
          id: r.postId,
          title: r.title,
          slug: r.slug,
          description: r.description,
          isPremium: r.isPremium ?? false,
          isPublished: r.isPublished ?? false,
          isFeatured: r.isFeatured ?? false,
          status: r.status ?? "DRAFT",
          authorId: r.authorId,
          createdAt: r.createdAt!,
          updatedAt: r.updatedAt!,
          author: { id: r.authorUserId ?? "", name: r.authorName, avatar: r.authorAvatar, email: r.authorEmail ?? "" },
          category: {
            id: r.catId ?? "",
            name: r.catName ?? "",
            slug: r.catSlug ?? "",
            parent: r.parentId ? { id: r.parentId, name: r.parentName ?? "", slug: r.parentSlug ?? "" } : null,
          },
          tags: tagsMap.get(r.postId) ?? [],
          _count: { stars: counts.get(r.postId) ?? 0 },
          isStarred: userId ? starSet.has(r.postId) : false,
        };
      });

      const totalPages = Math.ceil(totalCount / limit);
      return {
        data,
        pagination: {
          totalCount,
          totalPages,
          currentPage: page,
          pageSize: limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } finally {
      endTimer();
    }
  }

  static async getRelated(
    postId: string,
    categoryId: string,
    tagIds: string[],
    limit = 6,
    userId?: string
  ): Promise<PostWithInteractions[]> {
    const endTimer = DatabaseMetrics.startQuery();
    try {
      const subIds = db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, categoryId));
      const orConditions: SQL[] = [
        eq(posts.categoryId, categoryId),
        inArray(posts.categoryId, subIds),
      ];
      if (tagIds.length > 0) {
        orConditions.push(
          exists(
            db
              .select()
              .from(postToTag)
              .where(and(eq(postToTag.A, posts.id), inArray(postToTag.B, tagIds)))
          )
        );
      }
      // Aggregated stars subquery — avoids correlated subquery per row
      const starCounts = db
        .select({ postId: stars.postId, cnt: sql<number>`count(*)::int`.as("cnt") })
        .from(stars)
        .groupBy(stars.postId)
        .as("star_counts");

      const rows = await db
        .select({
          postId: posts.id,
          title: posts.title,
          slug: posts.slug,
          description: posts.description,
          isPremium: posts.isPremium,
          isFeatured: posts.isFeatured,
          isPublished: posts.isPublished,
          status: posts.status,
          authorId: posts.authorId,
          categoryId: posts.categoryId,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
          authorUserId: users.id,
          authorName: users.name,
          authorAvatar: users.avatar,
          authorEmail: users.email,
          catId: categories.id,
          catName: categories.name,
          catSlug: categories.slug,
          parentId: parentCategory.id,
          parentName: parentCategory.name,
          parentSlug: parentCategory.slug,
        })
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .leftJoin(categories, eq(posts.categoryId, categories.id))
        .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
        .leftJoin(starCounts, eq(posts.id, starCounts.postId))
        .where(
          and(
            eq(posts.isPublished, true),
            sql`${posts.id} != ${postId}`,
            or(...orConditions)
          )
        )
        .orderBy(desc(sql`coalesce(${starCounts.cnt}, 0)`), desc(posts.createdAt))
        .limit(limit);

      const postIds = rows.map((r) => r.postId);
      const [tagsMap, counts] = await Promise.all([
        getTagsForPostIds(postIds),
        getStarCounts(postIds),
      ]);

      let starSet = new Set<string>();
      if (userId && postIds.length > 0) {
        const userStars = await db.select({ postId: stars.postId }).from(stars).where(and(eq(stars.userId, userId), inArray(stars.postId, postIds)));
        starSet = new Set(userStars.map((s) => s.postId));
      }

      return rows.map((r) => {
        return {
          id: r.postId,
          title: r.title,
          slug: r.slug,
          description: r.description,
          isPremium: r.isPremium ?? false,
          isPublished: r.isPublished ?? false,
          isFeatured: r.isFeatured ?? false,
          status: r.status ?? "DRAFT",
          authorId: r.authorId,
          createdAt: r.createdAt!,
          updatedAt: r.updatedAt!,
          author: { id: r.authorUserId ?? "", name: r.authorName, avatar: r.authorAvatar, email: r.authorEmail ?? "" },
          category: {
            id: r.catId ?? "",
            name: r.catName ?? "",
            slug: r.catSlug ?? "",
            parent: r.parentId ? { id: r.parentId, name: r.parentName ?? "", slug: r.parentSlug ?? "" } : null,
          },
          tags: tagsMap.get(r.postId) ?? [],
          _count: { stars: counts.get(r.postId) ?? 0 },
          isStarred: userId ? starSet.has(r.postId) : false,
        };
      });
    } finally {
      endTimer();
    }
  }

  static async getById(id: string, userId?: string): Promise<PostFullWithInteractions | null> {
    const endTimer = DatabaseMetrics.startQuery();
    try {
      const rows = await db
        .select()
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .leftJoin(categories, eq(posts.categoryId, categories.id))
        .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
        .where(eq(posts.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const p = row.posts;
      const parentCat =
        (row as { parent_category?: { id: string; name: string; slug: string } | null })
          .parent_category ?? null;
      const [tagsList, counts, starRow] = await Promise.all([
        getTagsForPostIds([p.id]),
        getStarCounts([p.id]),
        userId
          ? db.select().from(stars).where(and(eq(stars.postId, p.id), eq(stars.userId, userId))).limit(1)
          : Promise.resolve([] as (typeof stars.$inferSelect)[]),
      ]);
      const isStarred = starRow.length > 0;
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        content: p.content,
        isPremium: p.isPremium ?? false,
        isFeatured: p.isFeatured ?? false,
        isPublished: p.isPublished ?? false,
        status: p.status ?? "DRAFT",
        authorId: p.authorId,
        createdAt: p.createdAt!,
        updatedAt: p.updatedAt!,
        author: {
          id: row.users?.id ?? "",
          name: row.users?.name ?? null,
          avatar: row.users?.avatar ?? null,
          email: row.users?.email ?? "",
        },
        category: {
          id: row.categories?.id ?? "",
          name: row.categories?.name ?? "",
          slug: row.categories?.slug ?? "",
          parent: parentCat
            ? { id: parentCat.id, name: parentCat.name ?? "", slug: parentCat.slug ?? "" }
            : null,
        },
        tags: tagsList.get(p.id) ?? [],
        _count: { stars: counts.get(p.id) ?? 0 },
        isStarred,
      } as PostFullWithInteractions;
    } finally {
      endTimer();
    }
  }

  static async getBySlug(slug: string, userId?: string): Promise<PostFullWithInteractions | null> {
    const endTimer = DatabaseMetrics.startQuery();
    try {
      const rows = await db
        .select()
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .leftJoin(categories, eq(posts.categoryId, categories.id))
        .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
        .where(eq(posts.slug, slug))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const p = row.posts;
      const parentCat =
        (row as { parent_category?: { id: string; name: string; slug: string } | null })
          .parent_category ?? null;
      const [tagsList, counts, starRow] = await Promise.all([
        getTagsForPostIds([p.id]),
        getStarCounts([p.id]),
        userId
          ? db.select().from(stars).where(and(eq(stars.postId, p.id), eq(stars.userId, userId))).limit(1)
          : Promise.resolve([] as (typeof stars.$inferSelect)[]),
      ]);
      const isStarred = starRow.length > 0;
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        content: p.content,
        isPremium: p.isPremium ?? false,
        isFeatured: p.isFeatured ?? false,
        isPublished: p.isPublished ?? false,
        status: p.status ?? "DRAFT",
        authorId: p.authorId,
        createdAt: p.createdAt!,
        updatedAt: p.updatedAt!,
        author: {
          id: row.users?.id ?? "",
          name: row.users?.name ?? null,
          avatar: row.users?.avatar ?? null,
          email: row.users?.email ?? "",
        },
        category: {
          id: row.categories?.id ?? "",
          name: row.categories?.name ?? "",
          slug: row.categories?.slug ?? "",
          parent: parentCat
            ? { id: parentCat.id, name: parentCat.name ?? "", slug: parentCat.slug ?? "" }
            : null,
        },
        tags: tagsList.get(p.id) ?? [],
        _count: { stars: counts.get(p.id) ?? 0 },
        isStarred,
      } as PostFullWithInteractions;
    } finally {
      endTimer();
    }
  }

  static async getPopular(limit = 10, userId?: string): Promise<PostListResult[]> {
    const endTimer = DatabaseMetrics.startQuery();
    try {
      const result = await PostQueries.getPaginated({
        page: 1,
        limit,
        includeUnpublished: false,
        sortBy: "popular",
        userId,
      });
      return result.data;
    } finally {
      endTimer();
    }
  }

  static async getStats(params: {
    authorId?: string;
    includeUnpublished?: boolean;
    categoryId?: string;
  }): Promise<{
    total: number;
    published: number;
    draft: number;
    pending: number;
    rejected: number;
    premium: number;
    featured: number;
  }> {
    const endTimer = DatabaseMetrics.startQuery();
    try {
      const conditions: (SQL | undefined)[] = [];
      if (params.authorId) conditions.push(eq(posts.authorId, params.authorId));
      if (params.categoryId) {
        const subIds = db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, params.categoryId));
        const catCond = or(eq(posts.categoryId, params.categoryId), inArray(posts.categoryId, subIds));
        if (catCond) conditions.push(catCond);
      }
      const whereClause = and(...conditions);

      const rows = await db
        .select({
          status: posts.status,
          isPublished: posts.isPublished,
          isPremium: posts.isPremium,
          isFeatured: posts.isFeatured,
          count: sql<number>`count(*)::int`,
        })
        .from(posts)
        .where(whereClause)
        .groupBy(posts.status, posts.isPublished, posts.isPremium, posts.isFeatured);

      let total = 0,
        published = 0,
        draft = 0,
        pending = 0,
        rejected = 0,
        premium = 0,
        featured = 0;
      for (const r of rows) {
        const c = r.count;
        if (params.includeUnpublished || r.isPublished) total += c;
        if (r.isPublished) published += c;
        if (r.status === "DRAFT") draft += c;
        if (r.status === "PENDING_APPROVAL") pending += c;
        if (r.status === "REJECTED") rejected += c;
        if (r.isPremium && r.isPublished) premium += c;
        if (r.isFeatured && r.isPublished) featured += c;
      }
      return { total, published, draft, pending, rejected, premium, featured };
    } finally {
      endTimer();
    }
  }
}

// -----------------------------------------------------------------------------
// MetadataQueries
// -----------------------------------------------------------------------------

export class MetadataQueries {
  static async getAllCategories() {
    const endTimer = DatabaseMetrics.startQuery();
    try {
      const rows = await db.query.categories.findMany({
        columns: {
          id: true,
          name: true,
          slug: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
        with: {
          parent: { columns: { id: true, name: true, slug: true } },
          children: { columns: { id: true, name: true, slug: true } },
        },
        orderBy: asc(categories.createdAt),
      });

      const postCounts = await db
        .select({ categoryId: posts.categoryId, count: sql<number>`count(*)::int` })
        .from(posts)
        .where(eq(posts.isPublished, true))
        .groupBy(posts.categoryId);
      const countMap = new Map(postCounts.map((r) => [r.categoryId, r.count]));

      return rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        parent: c.parent,
        children: c.children ?? [],
        _count: { posts: countMap.get(c.id) ?? 0 },
      }));
    } finally {
      endTimer();
    }
  }

  static async getAllTags() {
    const endTimer = DatabaseMetrics.startQuery();
    try {
      const rows = await db
        .select({
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          createdAt: tags.createdAt,
          postCount: sql<number>`(
            SELECT count(*)::int FROM "postToTag" pt
            JOIN posts p ON p.id = pt."A"
            WHERE pt."B" = ${tags.id} AND p."isPublished" = true
          )`,
        })
        .from(tags)
        .orderBy(asc(tags.name));

      return rows.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        createdAt: t.createdAt,
        _count: { posts: t.postCount },
      }));
    } finally {
      endTimer();
    }
  }

  static async getPopularTags(limit = 20) {
    const endTimer = DatabaseMetrics.startQuery();
    try {
      // Single JOIN query replaces two sequential queries (count then fetch tags)
      const rows = await db
        .select({
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          postCount: sql<number>`count(${postToTag.A})::int`,
        })
        .from(tags)
        .innerJoin(postToTag, eq(tags.id, postToTag.B))
        .innerJoin(posts, and(eq(postToTag.A, posts.id), eq(posts.isPublished, true)))
        .groupBy(tags.id, tags.name, tags.slug)
        .orderBy(desc(sql`count(${postToTag.A})`))
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        _count: { posts: r.postCount },
      }));
    } finally {
      endTimer();
    }
  }
}

// -----------------------------------------------------------------------------
// Cached and memoized exports
// -----------------------------------------------------------------------------

const memoizedGetPaginated = memoize(
  (params: PostGetPaginatedParams) => PostQueries.getPaginated(params),
  (params) => `posts-paginated-${JSON.stringify(params)}`
);
const memoizedSearch = memoize(
  (
    query: string,
    params: PaginationParams & { userId?: string; categoryId?: string; isPremium?: boolean }
  ) => PostQueries.search(query, params),
  (query, params) => `posts-search-${query}-${JSON.stringify(params)}`
);
const memoizedGetRelated = memoize(
  (postId: string, categoryId: string, tagIds: string[], limit: number, userId?: string) =>
    PostQueries.getRelated(postId, categoryId, tagIds, limit, userId),
  (postId, categoryId, tagIds, limit, userId) =>
    `related-${postId}-${categoryId}-${tagIds.join(",")}-${limit}-${userId || "anon"}`
);

export const getCachedPosts = createCachedFunction(
  memoizedGetPaginated,
  "posts-paginated",
  CACHE_DURATIONS.POSTS_LIST,
  [CACHE_TAGS.POSTS]
);
export const getCachedPostSearch = createCachedFunction(
  memoizedSearch,
  "posts-search",
  CACHE_DURATIONS.SEARCH,
  [CACHE_TAGS.SEARCH_RESULTS, CACHE_TAGS.POSTS]
);
export const getCachedRelatedPosts = createCachedFunction(
  memoizedGetRelated,
  "related-posts",
  CACHE_DURATIONS.POSTS_LIST,
  [CACHE_TAGS.RELATED_POSTS]
);
export const getCachedPostById = createCachedFunction(
  (id: string, userId?: string) => PostQueries.getById(id, userId),
  "post-by-id",
  CACHE_DURATIONS.POST_DETAIL,
  [CACHE_TAGS.POST_BY_ID]
);
export const getCachedPostBySlug = createCachedFunction(
  (slug: string, userId?: string) => PostQueries.getBySlug(slug, userId),
  "post-by-slug",
  CACHE_DURATIONS.POST_DETAIL,
  [CACHE_TAGS.POST_BY_SLUG]
);
export const getCachedPopularPosts = createCachedFunction(
  (limit: number, userId?: string) => PostQueries.getPopular(limit, userId),
  "popular-posts",
  CACHE_DURATIONS.POPULAR_CONTENT,
  [CACHE_TAGS.POPULAR_POSTS]
);
export const getCachedCategories = createCachedFunction(
  MetadataQueries.getAllCategories,
  "all-categories",
  CACHE_DURATIONS.STATIC_DATA,
  [CACHE_TAGS.CATEGORIES]
);
export const getCachedTags = createCachedFunction(
  MetadataQueries.getAllTags,
  "all-tags",
  CACHE_DURATIONS.STATIC_DATA,
  [CACHE_TAGS.TAGS]
);
export const getCachedPopularTags = createCachedFunction(
  (limit: number) => MetadataQueries.getPopularTags(limit),
  "popular-tags",
  CACHE_DURATIONS.STATIC_DATA,
  [CACHE_TAGS.TAGS]
);

export const Queries = {
  posts: {
    getPaginated: (params: PostGetPaginatedParams) =>
      params.userId ? PostQueries.getPaginated(params) : getCachedPosts(params),
    search: (
      query: string,
      params: PaginationParams & { userId?: string; categoryId?: string; isPremium?: boolean }
    ) => (params.userId ? PostQueries.search(query, params) : getCachedPostSearch(query, params)),
    getById: PostQueries.getById,
    getBySlug: PostQueries.getBySlug,
    getRelated: (
      postId: string,
      categoryId: string,
      tagIds: string[],
      limit: number,
      userId?: string
    ) =>
      userId
        ? PostQueries.getRelated(postId, categoryId, tagIds, limit, userId)
        : getCachedRelatedPosts(postId, categoryId, tagIds, limit, userId),
    getPopular: (limit: number, userId?: string) =>
      userId ? PostQueries.getPopular(limit, userId) : getCachedPopularPosts(limit, userId),
    getStats: PostQueries.getStats,
  },
  categories: { getAll: getCachedCategories },
  tags: { getAll: getCachedTags, getPopular: getCachedPopularTags },
} as const;
