import { prisma, DatabaseMetrics } from "@/lib/prisma";
import {
  createCachedFunction,
  CACHE_TAGS,
  CACHE_DURATIONS,
  memoize,
} from "@/lib/cache";
import { Prisma } from "@/app/generated/prisma";

/**
 * Optimized Query Utilities for Better Performance
 *
 * Key optimizations:
 * - Minimal select statements to reduce data transfer
 * - Proper pagination with cursor-based approach for large datasets
 * - Query result caching with appropriate TTL
 * - Performance monitoring and slow query detection
 * - Consolidated query logic to prevent duplication
 * - Request-scoped memoization for repeated calls
 */

// Optimized select objects for different use cases
export const POST_SELECTS = {
  // Minimal selection for listing pages
  list: {
    id: true,
    title: true,
    slug: true,
    description: true,
    content: true,
    uploadPath: true,
    uploadFileType: true,
    previewPath: true,
    previewVideoPath: true,
    blurData: true,
    isPremium: true,
    isPublished: true,
    isFeatured: true,
    status: true,
    media: {
      select: {
        id: true,
        mimeType: true,
        relativePath: true,
        width: true,
        height: true,
      },
    },
    authorId: true,
    createdAt: true,
    updatedAt: true,
    author: {
      select: {
        id: true,
        name: true,
        avatar: true,
        email: true,
      },
    },
    category: {
      select: {
        id: true,
        name: true,
        slug: true,
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    },
    tags: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    _count: {
      select: {
        bookmarks: true,
        favorites: true,
      },
    },
  },

  // Full selection for detail pages
  full: {
    id: true,
    title: true,
    slug: true,
    description: true,
    content: true,
    uploadPath: true,
    uploadFileType: true,
    previewPath: true,
    previewVideoPath: true,
    blurData: true,
    isPremium: true,
    isFeatured: true,
    isPublished: true,
    status: true,
    media: {
      select: {
        id: true,
        mimeType: true,
        relativePath: true,
      },
    },

    authorId: true,
    createdAt: true,
    updatedAt: true,
    author: {
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    },
    category: {
      select: {
        id: true,
        name: true,
        slug: true,
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    },
    tags: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    _count: {
      select: {
        favorites: true,
        bookmarks: true,
      },
    },
  },

  // API selection with user interaction data
  api: {
    id: true,
    title: true,
    slug: true,
    description: true,
    content: true,
    uploadPath: true,
    uploadFileType: true,
    blurData: true,
    isPremium: true,
    isPublished: true,

    createdAt: true,
    updatedAt: true,
    author: {
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    },
    category: {
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    },
    tags: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    _count: {
      select: {
        bookmarks: true,
        favorites: true,
      },
    },
  },

  // Admin selection with additional fields
  admin: {
    id: true,
    title: true,
    slug: true,
    description: true,
    content: true,
    uploadPath: true,
    uploadFileType: true,
    blurData: true,
    isPremium: true,
    isPublished: true,
    status: true,

    authorId: true,
    createdAt: true,
    updatedAt: true,
    author: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
    category: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    _count: {
      select: {
        favorites: true,
        bookmarks: true,
      },
    },
  },
} as const;

export const USER_SELECTS = {
  profile: {
    id: true,
    name: true,
    email: true,
    avatar: true,
    type: true,
    role: true,
    createdAt: true,
  },

  admin: {
    id: true,
    name: true,
    email: true,
    avatar: true,
    type: true,
    role: true,
    stripeCustomerId: true,
    stripeSubscriptionId: true,
    stripeCurrentPeriodEnd: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        posts: true,
        bookmarks: true,
        favorites: true,
      },
    },
  },
} as const;

/**
 * Enhanced pagination interface with cursor support
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
  sortBy?: "latest" | "popular" | "trending";
}

// Type definitions for query results
export type PostListResult = Prisma.PostGetPayload<{
  select: typeof POST_SELECTS.list;
}>;

export type PostFullResult = Prisma.PostGetPayload<{
  select: typeof POST_SELECTS.full;
}>;

// Types for posts with interaction status
export type PostWithInteractions = Omit<
  PostListResult,
  "bookmarks" | "favorites"
> & {
  isBookmarked?: boolean;
  isFavorited?: boolean;
  bookmarks?: undefined;
  favorites?: undefined;
};

export type PostFullWithInteractions = Omit<
  PostFullResult,
  "bookmarks" | "favorites"
> & {
  isBookmarked?: boolean;
  isFavorited?: boolean;
  bookmarks?: undefined;
  favorites?: undefined;
};

type PostGetPaginatedParams = PaginationParams & {
  includeUnpublished?: boolean;
  categoryId?: string;
  authorId?: string;
  isPremium?: boolean;
  userId?: string;
};

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

/**
 * Enhanced Post Queries Class with comprehensive caching
 */
export class PostQueries {
  /**
   * Get paginated posts with comprehensive filtering and caching
   */
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
      userId,
      sortBy = "latest",
    } = params;

    const skip = (page - 1) * limit;

    // Build where clause with optimized category filtering
    const where: Prisma.PostWhereInput = {
      isPublished: includeUnpublished ? undefined : true,
      ...(authorId && { authorId }),
      ...(isPremium !== undefined && { isPremium }),
    };

    // Optimize category filtering - use direct categoryId first, then parent lookup
    if (categoryId) {
      where.OR = [{ categoryId }, { category: { parentId: categoryId } }];
    }

    // Build order by clause - keep existing structure but optimize query separation
    const orderBy:
      | Prisma.PostOrderByWithRelationInput
      | Prisma.PostOrderByWithRelationInput[] =
      sortBy === "popular"
        ? { favorites: { _count: "desc" } }
        : sortBy === "trending"
          ? [{ favorites: { _count: "desc" } }, { createdAt: "desc" }]
          : { createdAt: "desc" };

    const endTimer = DatabaseMetrics.startQuery();

    try {
      // Fetch posts without user interactions first for better performance
      const [posts, totalCount] = await Promise.all([
        prisma.post.findMany({
          where,
          select: POST_SELECTS.list,
          orderBy,
          skip,
          take: limit,
        }).catch((error) => {
          console.error("Post query failed:", error);
          // Return empty array on query failure
          return [];
        }),
        prisma.post.count({ where }).catch((error) => {
          console.error("Post count query failed:", error);
          // Return 0 on count failure
          return 0;
        }),
      ]);

      let transformedPosts: PostWithInteractions[];

      // If userId is provided, fetch bookmark/favorite status in a separate optimized query
      if (userId && posts.length > 0) {
        const postIds = posts.map((post) => post.id);

        // Fetch all bookmarks and favorites for these posts in one query each
        const [bookmarks, favorites] = await Promise.all([
          prisma.bookmark.findMany({
            where: {
              userId,
              postId: { in: postIds },
            },
            select: { postId: true },
          }).catch((error) => {
            console.warn("Bookmark query failed:", error);
            return [];
          }),
          prisma.favorite.findMany({
            where: {
              userId,
              postId: { in: postIds },
            },
            select: { postId: true },
          }).catch((error) => {
            console.warn("Favorite query failed:", error);
            return [];
          }),
        ]);

        // Create lookup sets for O(1) access
        const bookmarkedPostIds = new Set(bookmarks.map((b) => b.postId));
        const favoritedPostIds = new Set(favorites.map((f) => f.postId));

        // Transform posts with interaction data
        transformedPosts = posts.map((post) => ({
          ...post,
          isBookmarked: bookmarkedPostIds.has(post.id),
          isFavorited: favoritedPostIds.has(post.id),
        }));
      } else {
        // No user context - no interactions
        transformedPosts = posts.map((post) => ({
          ...post,
          isBookmarked: false,
          isFavorited: false,
        }));
      }

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: transformedPosts,
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

  /**
   * Search posts with full-text search and filters
   */
  static async search(
    query: string,
    params: PaginationParams & {
      userId?: string;
      categoryId?: string;
      isPremium?: boolean;
    }
  ): Promise<PaginatedResult<PostWithInteractions>> {
    const { page = 1, limit = 12, userId, categoryId, isPremium } = params;
    const skip = (page - 1) * limit;

    const searchTerms = query.trim().split(/\s+/).filter(Boolean);
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

    // Build complex search where clause with optimized category filtering
    const searchWhere: Prisma.PostWhereInput = {
      isPublished: true,
      AND: searchTerms.map((term) => ({
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          // content search removed — ILIKE on full body causes sequential scans;
          // title + description + tags give sufficient search coverage
          { tags: { some: { name: { contains: term, mode: "insensitive" } } } },
        ],
      })),
      ...(isPremium !== undefined && { isPremium }),
    };

    // Optimize category filtering - apply after other filters
    if (categoryId) {
      searchWhere.OR = [{ categoryId }, { category: { parentId: categoryId } }];
    }

    const endTimer = DatabaseMetrics.startQuery();

    try {
      // Fetch posts without user interactions first for better performance
      const [posts, totalCount] = await Promise.all([
        prisma.post.findMany({
          where: searchWhere,
          select: POST_SELECTS.list,
          orderBy: [{ favorites: { _count: "desc" } }, { createdAt: "desc" }],
          skip,
          take: limit,
        }).catch((error) => {
          console.error("Search posts query failed:", error);
          // Return empty array on query failure
          return [];
        }),
        prisma.post.count({ where: searchWhere }).catch((error) => {
          console.error("Search count query failed:", error);
          // Return 0 on count failure
          return 0;
        }),
      ]);

      let transformedPosts: PostWithInteractions[];

      // If userId is provided, fetch bookmark/favorite status in optimized separate queries
      if (userId && posts.length > 0) {
        const postIds = posts.map((post) => post.id);

        // Fetch all bookmarks and favorites for these posts in one query each
        const [bookmarks, favorites] = await Promise.all([
          prisma.bookmark.findMany({
            where: {
              userId,
              postId: { in: postIds },
            },
            select: { postId: true },
          }).catch((error) => {
            console.warn("Bookmark query failed:", error);
            return [];
          }),
          prisma.favorite.findMany({
            where: {
              userId,
              postId: { in: postIds },
            },
            select: { postId: true },
          }).catch((error) => {
            console.warn("Favorite query failed:", error);
            return [];
          }),
        ]);

        // Create lookup sets for O(1) access
        const bookmarkedPostIds = new Set(bookmarks.map((b) => b.postId));
        const favoritedPostIds = new Set(favorites.map((f) => f.postId));

        // Transform posts with interaction data
        transformedPosts = posts.map((post) => ({
          ...post,
          isBookmarked: bookmarkedPostIds.has(post.id),
          isFavorited: favoritedPostIds.has(post.id),
        }));
      } else {
        // No user context - no interactions
        transformedPosts = posts.map((post) => ({
          ...post,
          isBookmarked: false,
          isFavorited: false,
        }));
      }

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: transformedPosts,
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

  /**
   * Get related posts based on category and tags
   */
  static async getRelated(
    postId: string,
    categoryId: string,
    tagIds: string[],
    limit = 6,
    userId?: string
  ): Promise<PostWithInteractions[]> {
    const endTimer = DatabaseMetrics.startQuery();

    try {
      // Strategy: Find posts that share tags or category, excluding current post
      const relatedPosts = await prisma.post.findMany({
        where: {
          isPublished: true,
          id: { not: postId },
          OR: [
            { categoryId },
            { category: { parentId: categoryId } },
            ...(tagIds.length > 0
              ? [{ tags: { some: { id: { in: tagIds } } } }]
              : []),
          ],
        },
        select: {
          ...POST_SELECTS.list,
          ...(userId && {
            bookmarks: {
              where: { userId },
              select: { id: true },
            },
            favorites: {
              where: { userId },
              select: { id: true },
            },
          }),
        },
        orderBy: [{ favorites: { _count: "desc" } }, { createdAt: "desc" }],
        take: limit,
      });

      // Transform posts to include interaction status
      const transformedPosts: PostWithInteractions[] = relatedPosts.map(
        (post) => {
          const { bookmarks, favorites, ...rest } = post as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          return {
            ...rest,
            isBookmarked: userId ? (bookmarks?.length ?? 0) > 0 : false,
            isFavorited: userId ? (favorites?.length ?? 0) > 0 : false,
          };
        }
      );

      return transformedPosts;
    } finally {
      endTimer();
    }
  }

  /**
   * Get post by ID with full details
   */
  static async getById(
    id: string,
    userId?: string
  ): Promise<PostFullWithInteractions | null> {
    const endTimer = DatabaseMetrics.startQuery();

    try {
      const post = await prisma.post.findUnique({
        where: { id },
        select: {
          ...POST_SELECTS.full,
          ...(userId && {
            bookmarks: {
              where: { userId },
              select: { id: true },
            },
            favorites: {
              where: { userId },
              select: { id: true },
            },
          }),
        },
      });

      if (!post) return null;

      // Destructure interaction arrays when present and map to boolean flags
      const { bookmarks, favorites, ...rest } = post as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      return {
        ...rest,
        isBookmarked: userId ? (bookmarks?.length ?? 0) > 0 : false,
        isFavorited: userId ? (favorites?.length ?? 0) > 0 : false,
      } as PostFullWithInteractions;
    } finally {
      endTimer();
    }
  }

  /**
   * Get post by slug with full details
   */
  static async getBySlug(
    slug: string,
    userId?: string
  ): Promise<PostFullWithInteractions | null> {
    const endTimer = DatabaseMetrics.startQuery();

    try {
      const post = await prisma.post.findUnique({
        where: { slug },
        select: {
          ...POST_SELECTS.full,
          ...(userId && {
            bookmarks: {
              where: { userId },
              select: { id: true },
            },
            favorites: {
              where: { userId },
              select: { id: true },
            },
          }),
        },
      });

      if (!post) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { bookmarks, favorites, ...rest } = post as any;

      return {
        ...rest,
        isBookmarked: userId ? (bookmarks?.length ?? 0) > 0 : false,
        isFavorited: userId ? (favorites?.length ?? 0) > 0 : false,
      } as PostFullWithInteractions;
    } finally {
      endTimer();
    }
  }

  /**
   * Get popular posts (trending)
   */
  static async getPopular(
    limit = 10,
    userId?: string
  ): Promise<PostListResult[]> {
    const endTimer = DatabaseMetrics.startQuery();

    try {
      const posts = await prisma.post.findMany({
        where: { isPublished: true },
        select: {
          ...POST_SELECTS.list,
          ...(userId && {
            bookmarks: {
              where: { userId },
              select: { id: true },
            },
            favorites: {
              where: { userId },
              select: { id: true },
            },
          }),
        },
        orderBy: [{ favorites: { _count: "desc" } }, { createdAt: "desc" }],
        take: limit,
      });

      return posts as PostListResult[];
    } finally {
      endTimer();
    }
  }

  /**
   * Get efficient post statistics for dashboard
   */
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
      const baseWhere: Prisma.PostWhereInput = {
        ...(params.authorId && { authorId: params.authorId }),
        ...(params.categoryId && {
          OR: [
            { categoryId: params.categoryId },
            { category: { parentId: params.categoryId } },
          ],
        }),
      };

      const grouped = await prisma.post.groupBy({
          by: ["status", "isPublished", "isPremium", "isFeatured"],
          where: baseWhere,
          _count: true,
        });

      // Derive individual counts from grouped results
      let total = 0;
      let published = 0;
      let draft = 0;
      let pending = 0;
      let rejected = 0;
      let premium = 0;
      let featured = 0;

      for (const row of grouped) {
        const count = row._count;

        // Count towards total based on includeUnpublished flag
        if (params.includeUnpublished || row.isPublished) {
          total += count;
        }
        if (row.isPublished) published += count;
        if (row.status === "DRAFT") draft += count;
        if (row.status === "PENDING_APPROVAL") pending += count;
        if (row.status === "REJECTED") rejected += count;
        if (row.isPremium && row.isPublished) premium += count;
        if (row.isFeatured && row.isPublished) featured += count;
      }

      return {
        total,
        published,
        draft,
        pending,
        rejected,
        premium,
        featured,
      };
    } finally {
      endTimer();
    }
  }
}

/**
 * Enhanced Metadata Queries for Categories and Tags
 */
export class MetadataQueries {
  /**
   * Get all categories with post counts
   */
  static async getAllCategories() {
    const endTimer = DatabaseMetrics.startQuery();

    try {
      return await prisma.category.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          parent: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          children: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
            orderBy: { name: "asc" },
          },
          _count: {
            select: {
              posts: {
                where: { isPublished: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });
    } finally {
      endTimer();
    }
  }

  /**
   * Get all tags with post counts
   */
  static async getAllTags() {
    const endTimer = DatabaseMetrics.startQuery();

    try {
      return await prisma.tag.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          _count: {
            select: {
              posts: {
                where: { isPublished: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });
    } finally {
      endTimer();
    }
  }

  /**
   * Get popular tags (most used)
   */
  static async getPopularTags(limit = 20) {
    const endTimer = DatabaseMetrics.startQuery();

    try {
      return await prisma.tag.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          _count: {
            select: {
              posts: {
                where: { isPublished: true },
              },
            },
          },
        },
        orderBy: {
          posts: {
            _count: "desc",
          },
        },
        take: limit,
      });
    } finally {
      endTimer();
    }
  }
}

/**
 * Cached versions of common queries with request-scoped memoization
 */

// Memoized functions for request deduplication
const memoizedGetPaginated = memoize(
  (params: PostGetPaginatedParams) => PostQueries.getPaginated(params),
  (params) => `posts-paginated-${JSON.stringify(params)}`
);

const memoizedSearch = memoize(
  (
    query: string,
    params: PaginationParams & {
      userId?: string;
      categoryId?: string;
      isPremium?: boolean;
    }
  ) => PostQueries.search(query, params),
  (query, params) => `posts-search-${query}-${JSON.stringify(params)}`
);

const memoizedGetRelated = memoize(
  (
    postId: string,
    categoryId: string,
    tagIds: string[],
    limit: number,
    userId?: string
  ) => PostQueries.getRelated(postId, categoryId, tagIds, limit, userId),
  (postId, categoryId, tagIds, limit, userId) =>
    `related-${postId}-${categoryId}-${tagIds.join(",")}-${limit}-${
      userId || "anon"
    }`
);

// Cached versions with appropriate TTLs
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

// Cached metadata queries
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

/**
 * Consolidated query interface for easy consumption
 * Uses cached versions for anonymous users, direct methods for authenticated users
 */
export const Queries = {
  // Posts
  posts: {
    // For paginated queries, use direct method if userId is present to avoid stale user data
    getPaginated: (params: PostGetPaginatedParams) => {
      return params.userId
        ? PostQueries.getPaginated(params)
        : getCachedPosts(params);
    },

    // For search queries, use direct method if userId is present
    search: (
      query: string,
      params: PaginationParams & {
        userId?: string;
        categoryId?: string;
        isPremium?: boolean;
      }
    ) => {
      return params.userId
        ? PostQueries.search(query, params)
        : getCachedPostSearch(query, params);
    },

    // Always use direct method for getById to ensure fresh user data
    getById: PostQueries.getById,

    // Always use direct method for getBySlug to ensure fresh user data
    getBySlug: PostQueries.getBySlug,

    // For related posts, use direct method if userId is present
    getRelated: (
      postId: string,
      categoryId: string,
      tagIds: string[],
      limit: number,
      userId?: string
    ) => {
      return userId
        ? PostQueries.getRelated(postId, categoryId, tagIds, limit, userId)
        : getCachedRelatedPosts(postId, categoryId, tagIds, limit, userId);
    },

    // For popular posts, use direct method if userId is present
    getPopular: (limit: number, userId?: string) => {
      return userId
        ? PostQueries.getPopular(limit, userId)
        : getCachedPopularPosts(limit, userId);
    },

    // Stats queries - always direct for fresh data
    getStats: PostQueries.getStats,
  },

  // Metadata queries can remain cached as they don't contain user-specific data
  categories: {
    getAll: getCachedCategories,
  },

  tags: {
    getAll: getCachedTags,
    getPopular: getCachedPopularTags,
  },
} as const;
