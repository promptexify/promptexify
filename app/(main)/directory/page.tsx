import { getAllCategories } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { Suspense } from "react";
import { PostMasonrySkeleton } from "@/components/post-masonry-skeleton";
import { DirectoryClientWrapper } from "@/components/directory-client-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Queries } from "@/lib/query";
import { getPostsPageSize } from "@/lib/settings";
import { SafeAsync } from "@/components/ui/safe-async";
import { Container } from "@/components/ui/container";
import { getMetadata } from "@/config/seo";

export const metadata = getMetadata("directory");

interface DirectoryPageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    subcategory?: string;
    premium?: string;
    sort?: string;
  }>;
}

export const dynamic = "force-dynamic";

// Directory page skeleton that matches the full layout
function DirectoryPageSkeleton() {
  return (
    <Container>
      {/* Header skeleton */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-8 gap-4">
        <div className="flex-1">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-5 w-full max-w-2xl" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-[140px] rounded-md" />
        </div>
      </div>

      {/* Results summary skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Posts grid skeleton */}
      <PostMasonrySkeleton count={16} />
    </Container>
  );
}

async function DirectoryContent({
  searchParams,
}: {
  searchParams: DirectoryPageProps["searchParams"];
}) {
  try {
    // Fetch all independent setup data in parallel before resolving search params
    const [categoriesResult, userResult, pageSizeResult, params] = await Promise.all([
      getAllCategories().catch((e) => { console.warn("Failed to load categories:", e); return [] as Awaited<ReturnType<typeof getAllCategories>>; }),
      getCurrentUser().catch((e) => { console.warn("Failed to get current user:", e); return null; }),
      getPostsPageSize().catch(() => 12),
      searchParams,
    ]);

    const categories = categoriesResult;
    const currentUser = userResult;
    const postsPageSize = pageSizeResult;

    const {
      q: qParam,
      category: categoryFilter,
      subcategory: subcategoryFilter,
      premium: premiumFilter,
      sort: sortParam,
    } = params;

    const searchQuery = typeof qParam === "string" ? qParam.trim() : "";
    const userId = currentUser?.userData?.id;
    const userType = currentUser?.userData?.type || null;
    const validSorts = ["latest", "popular", "trending", "relevance"] as const;
    const sortBy = validSorts.includes(sortParam as typeof validSorts[number])
      ? (sortParam as typeof validSorts[number])
      : "latest";

    // Determine category ID for filtering
    let categoryId: string | undefined;
    if (
      subcategoryFilter &&
      subcategoryFilter !== "all" &&
      subcategoryFilter !== "none"
    ) {
      // Find the actual category ID from the slug
      const subcategory = categories.find((c) => c.slug === subcategoryFilter);
      categoryId = subcategory?.id;
    } else if (categoryFilter && categoryFilter !== "all") {
      // Find the actual category ID from the slug
      const category = categories.find((c) => c.slug === categoryFilter);
      categoryId = category?.id;
    }

    // Resolve parent category metadata for the header
    let activeCategoryName: string | undefined;
    let activeCategoryDescription: string | undefined;
    if (categoryFilter && categoryFilter !== "all") {
      const matchedCategory = categories.find(
        (c) => c.slug === categoryFilter
      );
      if (matchedCategory) {
        activeCategoryName = matchedCategory.name;
        activeCategoryDescription = matchedCategory.description ?? undefined;
      }
    }

    // Handle premium filter
    let isPremium: boolean | undefined;
    if (premiumFilter === "premium") {
      isPremium = true;
    } else if (premiumFilter === "free") {
      isPremium = false;
    }

    let result;
    if (searchQuery.length > 0) {
      result = await Queries.posts.search(searchQuery, {
        page: 1,
        limit: postsPageSize,
        userId,
        categoryId,
        isPremium,
        sortBy: sortBy === "latest" ? "relevance" : sortBy,
      });
    } else {
      result = await Queries.posts.getPaginated({
        page: 1,
        limit: postsPageSize,
        userId,
        categoryId,
        isPremium,
        sortBy: sortBy === "relevance" ? "latest" : sortBy,
      });
    }

    const { data: posts, pagination } = result;

    return (
      <DirectoryClientWrapper
        initialPosts={posts}
        hasNextPage={pagination.hasNextPage}
        totalCount={pagination.totalCount}
        userType={userType}
        pageSize={postsPageSize}
        pagination={pagination}
        categoryName={activeCategoryName}
        categoryDescription={activeCategoryDescription}
      />
    );
  } catch (error) {
    console.error("Critical error in DirectoryContent:", error);
    throw error; // Let the error boundary handle this
  }
}

export default function DirectoryPage({ searchParams }: DirectoryPageProps) {
  return (
    <Suspense fallback={<DirectoryPageSkeleton />}>
      <SafeAsync>
        <DirectoryContent searchParams={searchParams} />
      </SafeAsync>
    </Suspense>
  );
}
