import { prisma } from "@/lib/prisma";
import { createCachedFunction, CACHE_TAGS, CACHE_DURATIONS } from "@/lib/cache";
import { cache } from "react";
import { unstable_cache } from "next/cache";

export interface PostWithDetails {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  content?: string; // Optional — list queries exclude content for performance
  uploadPath: string | null;
  uploadFileType: "IMAGE" | "VIDEO" | null;
  previewPath: string | null;
  previewVideoPath?: string | null;
  blurData?: string | null; // Optional for now, will be filled in gradually
  isPremium: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  status: string;
  media: {
    id: string;
    mimeType: string;
    relativePath: string;
    width?: number | null;
    height?: number | null;
  }[];

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
    bookmarks: number;
    favorites: number;
  };
}

export interface PostWithBookmark extends PostWithDetails {
  isBookmarked?: boolean;
}

export interface PostWithFavorite extends PostWithDetails {
  isFavorited?: boolean;
}

export interface PostWithInteractions extends PostWithDetails {
  isBookmarked?: boolean;
  isFavorited?: boolean;
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

// Optimized base query for posts - only select necessary fields for listings
const optimizedPostSelect = {
  id: true,
  title: true,
  slug: true,
  content: true,
  description: true,
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
} as const;

// Full post select for detailed views (includes content)
const fullPostSelect = {
  ...optimizedPostSelect,
  content: true,
} as const;

// React cache for request memoization - deduplicates calls within a single request
const getPostByIdMemoized = cache(async (id: string) => {
  return await prisma.post.findUnique({
    where: { id },
    select: fullPostSelect,
  });
});

const getAllPostsMemoized = cache(async (includeUnpublished = false) => {
  return await prisma.post.findMany({
    where: includeUnpublished ? {} : { isPublished: true },
    select: fullPostSelect,
    orderBy: {
      createdAt: "desc",
    },
    // Safety limit to prevent unbounded fetching as dataset grows
    take: 200,
  });
});

const getAllCategoriesMemoized = cache(async () => {
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
          _count: {
            select: {
              posts: true,
            },
          },
        },
      },
      children: {
        select: {
          id: true,
          name: true,
          slug: true,
          _count: {
            select: {
              posts: true,
            },
          },
        },
      },
      _count: {
        select: {
          posts: {
            where: {
              isPublished: true,
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });
});

const getAllTagsMemoized = cache(async () => {
  return await prisma.tag.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: {
        select: {
          posts: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });
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
  const posts = await prisma.post.findMany({
    where: { isPublished: true, isFeatured: true },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return posts.map((p) => p.id);
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
  // Ensure valid page and pageSize values
  const validPage = Math.max(1, page);
  const validPageSize = Math.max(1, Math.min(100, pageSize)); // Max 100 items per page
  const skip = (validPage - 1) * validPageSize;

  // Build where clause for search
  const whereClause = searchQuery
    ? {
        OR: [
          { name: { contains: searchQuery, mode: "insensitive" as const } },
          { slug: { contains: searchQuery, mode: "insensitive" as const } },
        ],
      }
    : {};

  // Build order by clause for tags
  let orderBy: { name: "asc" } | { createdAt: "desc" } = { name: "asc" };
  if (sortBy === "created") {
    orderBy = { createdAt: "desc" };
  }
  // Note: Sorting by post count will be handled after the query since
  // Prisma doesn't support direct ordering by _count for related models

  // Use Promise.all for parallel execution to improve performance
  const [totalCount, rawTags] = await Promise.all([
    // Get total count for pagination metadata
    prisma.tag.count({
      where: whereClause,
    }),
    // Get tags without pagination first if sorting by posts, otherwise with pagination
    sortBy === "posts"
      ? prisma.tag.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            _count: {
              select: {
                posts: true,
              },
            },
          },
          orderBy: { name: "asc" }, // Default order first
        })
      : prisma.tag.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            _count: {
              select: {
                posts: true,
              },
            },
          },
          orderBy,
          skip,
          take: validPageSize,
        }),
  ]);

  // Handle manual sorting and pagination for post count
  let tags = rawTags;
  if (sortBy === "posts") {
    // Sort by post count manually
    tags = rawTags
      .sort((a, b) => b._count.posts - a._count.posts)
      .slice(skip, skip + validPageSize);
  }

  const totalPages = Math.ceil(totalCount / validPageSize);
  const hasNextPage = validPage < totalPages;
  const hasPreviousPage = validPage > 1;

  return {
    data: tags,
    totalCount,
    totalPages,
    currentPage: validPage,
    pageSize: validPageSize,
    hasNextPage,
    hasPreviousPage,
  };
}

async function _searchTags(query: string): Promise<TagWithCount[]> {
  return await prisma.tag.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: {
        select: {
          posts: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });
}

async function _getPostsByCategory(
  categorySlug: string,
  includeUnpublished = false
): Promise<PostWithDetails[]> {
  const posts = await prisma.post.findMany({
    where: {
      AND: [
        includeUnpublished ? {} : { isPublished: true },
        {
          OR: [
            { category: { slug: categorySlug } },
            { category: { parent: { slug: categorySlug } } },
          ],
        },
      ],
    },
    select: fullPostSelect,
    orderBy: {
      createdAt: "desc",
    },
  });

  return posts;
}

async function _searchPosts(query: string): Promise<PostWithDetails[]> {
  const posts = await prisma.post.findMany({
    where: {
      AND: [
        { isPublished: true },
        {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            // content search removed — ILIKE on full body causes sequential scans
            {
              tags: {
                some: {
                  name: { contains: query, mode: "insensitive" },
                },
              },
            },
          ],
        },
      ],
    },
    select: fullPostSelect,
    orderBy: {
      createdAt: "desc",
    },
  });

  return posts;
}

// Cached versions for static data
export const getAllCategories = createCachedFunction(
  _getAllCategories,
  "get-all-categories",
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
  return await prisma.tag.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          posts: true,
        },
      },
    },
  });
}

export async function getPostsWithInteractions(
  userId?: string,
  includeUnpublished = false
): Promise<PostWithInteractions[]> {
  const posts = await prisma.post.findMany({
    where: {
      ...(includeUnpublished ? {} : { isPublished: true }),
    },
    select: {
      ...optimizedPostSelect,
      bookmarks: userId
        ? {
            where: {
              userId: userId,
            },
            select: {
              id: true,
            },
          }
        : false,
      favorites: userId
        ? {
            where: {
              userId: userId,
            },
            select: {
              id: true,
            },
          }
        : false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return posts.map((post) => ({
    ...post,
    isBookmarked: userId ? post.bookmarks.length > 0 : false,
    isFavorited: userId ? post.favorites.length > 0 : false,
    bookmarks: undefined, // Remove bookmarks from the response
    favorites: undefined, // Remove favorites from the response
  })) as PostWithInteractions[];
}

export type SortOption = "latest" | "trending" | "popular";

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Internal uncached function for getUserPosts
async function _getUserPosts(userId: string): Promise<PostWithDetails[]> {
  const posts = await prisma.post.findMany({
    where: { authorId: userId },
    select: {
      ...optimizedPostSelect,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return posts;
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
  const [posts, totalCount] = await Promise.all([
    prisma.post.findMany({
      where: { authorId: userId },
      select: {
        ...optimizedPostSelect,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.post.count({ where: { authorId: userId } }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    data: posts,
    totalCount,
    totalPages,
    currentPage: page,
    pageSize,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export async function getPostsPaginated(
  page: number = 1,
  pageSize: number = 10,
  includeUnpublished = false
): Promise<PaginatedResult<PostWithDetails>> {
  const whereClause = includeUnpublished ? {} : { isPublished: true };

  const [posts, totalCount] = await Promise.all([
    prisma.post.findMany({
      where: whereClause,
      select: {
        ...optimizedPostSelect,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.post.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    data: posts,
    totalCount,
    totalPages,
    currentPage: page,
    pageSize,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export async function getPostsWithSorting(
  userId?: string,
  sortBy: SortOption = "latest",
  includeUnpublished = false
): Promise<PostWithInteractions[]> {
  const posts = await prisma.post.findMany({
    where: {
      ...(includeUnpublished ? {} : { isPublished: true }),
    },
    select: {
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
      authorId: true,
      createdAt: true,
      updatedAt: true,
      media: {
        select: {
          id: true,
          mimeType: true,
          relativePath: true,
        },
      },
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
      bookmarks: userId
        ? {
            where: {
              userId: userId,
            },
            select: {
              id: true,
            },
          }
        : false,
      favorites: userId
        ? {
            where: {
              userId: userId,
            },
            select: {
              id: true,
            },
          }
        : false,
      _count: {
        select: {
          bookmarks: true,
          favorites: true,
        },
      },
    },
    orderBy:
      sortBy === "latest"
        ? { createdAt: "desc" }
        : sortBy === "trending"
          ? { favorites: { _count: "desc" } }
          : sortBy === "popular"
            ? { favorites: { _count: "desc" } }
            : { createdAt: "desc" }, // fallback
  });

  return posts.map((post) => ({
    ...post,
    isBookmarked: userId ? post.bookmarks.length > 0 : false,
    isFavorited: userId ? post.favorites.length > 0 : false,
    bookmarks: undefined, // Remove bookmarks from the response
    favorites: undefined, // Remove favorites from the response
  })) as PostWithInteractions[];
}

export async function getRelatedPosts(
  currentPostId: string,
  currentPost: PostWithDetails,
  userId?: string,
  limit: number = 6
): Promise<PostWithInteractions[]> {
  // Get the current post's tags and category for matching
  const tagIds = currentPost.tags.map((tag) => tag.id);
  const categoryId = currentPost.category.id;
  const parentCategoryId = currentPost.category.parent?.id;

  const posts = await prisma.post.findMany({
    where: {
      AND: [
        { isPublished: true },
        { id: { not: currentPostId } }, // Exclude current post
        {
          OR: [
            // Same category
            { categoryId: categoryId },
            // Same parent category
            ...(parentCategoryId ? [{ categoryId: parentCategoryId }] : []),
            // Shared tags
            ...(tagIds.length > 0
              ? [
                  {
                    tags: {
                      some: {
                        id: { in: tagIds },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    },
    select: {
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
      authorId: true,
      createdAt: true,
      updatedAt: true,
      media: {
        select: {
          id: true,
          mimeType: true,
          relativePath: true,
        },
      },
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
      bookmarks: userId
        ? {
            where: {
              userId: userId,
            },
            select: {
              id: true,
            },
          }
        : false,
      favorites: userId
        ? {
            where: {
              userId: userId,
            },
            select: {
              id: true,
            },
          }
        : false,
      _count: {
        select: {
          bookmarks: true,
          favorites: true,
        },
      },
    },
    orderBy: [
      // Prioritize posts with more favorites
      { favorites: { _count: "desc" } },
      { createdAt: "desc" },
    ],
    take: limit,
  });

  return posts.map((post) => ({
    ...post,
    isBookmarked: userId ? post.bookmarks.length > 0 : false,
    isFavorited: userId ? post.favorites.length > 0 : false,
    bookmarks: undefined,
    favorites: undefined,
  })) as PostWithInteractions[];
}

// Post Content Processing Functions
export const getPostContent = unstable_cache(
  async (id: string): Promise<PostWithDetails | null> => {
    return await prisma.post.findUnique({
      where: { id },
      select: fullPostSelect,
    });
  },
  ["post-content"],
  {
    tags: [CACHE_TAGS.POST_BY_ID],
    revalidate: CACHE_DURATIONS.POST_DETAIL,
  }
);

export const getPostsContent = unstable_cache(
  async (includeUnpublished = false): Promise<PostWithDetails[]> => {
    return await prisma.post.findMany({
      where: includeUnpublished ? {} : { isPublished: true },
      select: fullPostSelect,
      orderBy: {
        createdAt: "desc",
      },
    });
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
