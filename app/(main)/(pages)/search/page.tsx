import { getAllCategories, type SortOption } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { Suspense } from "react";
import { PostMasonrySkeleton } from "@/components/post-masonry-skeleton";
import { SearchClientWrapper } from "@/components/search-client-wrapper";
import { Queries } from "@/lib/query";
import { getSettingsAction } from "@/actions/settings";
import { SafeAsync } from "@/components/ui/safe-async";
import { setMetadata } from "@/config/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();
  if (query) {
    return setMetadata({
      title: `"${query}" — Search Results`,
      description: `Search results for "${query}" — Cursor rules, MCP configs, Claude Code skills, and AI coding prompts on Promptexify.`,
      robots: { index: false, follow: true },
    });
  }
  return setMetadata({
    title: "Search Prompts & Rules",
    description:
      "Search thousands of AI coding prompts, Cursor rules, MCP configs, and Claude Code skills on Promptexify.",
    robots: { index: false, follow: true },
  });
} // Required because we use getCurrentUser() which accesses cookies

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    subcategory?: string;
    premium?: string;
    page?: string;
    sort?: string;
  }>;
}

async function SearchResults({
  searchParams,
}: {
  searchParams: SearchPageProps["searchParams"];
}) {
  try {
    // Fetch all independent data in parallel
    let categories: Awaited<ReturnType<typeof getAllCategories>> = [];
    let currentUser = null;
    let settingsResult = null;

    const [categoriesResult, currentUserResult, settingsResultRaw] =
      await Promise.allSettled([
        getAllCategories(),
        getCurrentUser(),
        getSettingsAction(),
      ]);

    if (categoriesResult.status === "fulfilled") {
      categories = categoriesResult.value;
    } else {
      console.warn("Failed to load categories:", categoriesResult.reason);
    }

    if (currentUserResult.status === "fulfilled") {
      currentUser = currentUserResult.value;
    } else {
      console.warn("Failed to get current user:", currentUserResult.reason);
    }

    if (settingsResultRaw.status === "fulfilled") {
      settingsResult = settingsResultRaw.value;
    } else {
      console.warn("Failed to get settings:", settingsResultRaw.reason);
    }

    const params = await searchParams;

  const postsPageSize =
    settingsResult?.success && settingsResult.data?.postsPageSize
      ? settingsResult.data.postsPageSize
      : 12;

  const {
    q: qParam,
    category: categoryFilter,
    subcategory: subcategoryFilter,
    premium: premiumFilter,
    page: pageParam = "1",
    sort: sortBy = "latest",
  } = params;

  const searchQuery = typeof qParam === "string" ? qParam.trim() : "";
  const userId = currentUser?.userData?.id;
  const userType = currentUser?.userData?.type || null;

  // Parse page number
  const page = Math.max(1, parseInt(pageParam, 10) || 1);

  // Determine category ID for filtering
  let categoryId: string | undefined;
  if (
    subcategoryFilter &&
    subcategoryFilter !== "all" &&
    subcategoryFilter !== "none"
  ) {
    const subcategory = categories.find((c) => c.slug === subcategoryFilter);
    categoryId = subcategory?.id;
  } else if (categoryFilter && categoryFilter !== "all") {
    const category = categories.find((c) => c.slug === categoryFilter);
    categoryId = category?.id;
  }

  // Handle premium filter
  let isPremium: boolean | undefined;
  if (premiumFilter === "premium") {
    isPremium = true;
  } else if (premiumFilter === "free") {
    isPremium = false;
  }

  // Run search only when there is non-empty query; otherwise show paginated list
  const validSortOptions = ["latest", "popular", "trending", "relevance"] as const;
  const normalizedSort = validSortOptions.includes(sortBy as typeof validSortOptions[number])
    ? (sortBy as typeof validSortOptions[number])
    : "latest";

  let result;
  if (searchQuery.length > 0) {
    result = await Queries.posts.search(searchQuery, {
      page,
      limit: postsPageSize,
      userId,
      categoryId,
      isPremium,
      sortBy: normalizedSort === "latest" && page === 1 ? "relevance" : normalizedSort,
    });
  } else {
    result = await Queries.posts.getPaginated({
      page,
      limit: postsPageSize,
      userId,
      categoryId,
      isPremium,
      sortBy: normalizedSort as SortOption,
    });
  }

  const { data: posts, pagination } = result;

  return (
    <SearchClientWrapper
      posts={posts}
      userType={userType}
      searchQuery={searchQuery}
      pagination={pagination}
      searchParams={params}
    />
  );
  } catch (error) {
    console.error("Critical error in SearchResults:", error);
    throw error; // Let the error boundary handle this
  }
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  return (
    <Suspense fallback={<PostMasonrySkeleton />}>
      <SafeAsync>
        <SearchResults searchParams={searchParams} />
      </SafeAsync>
    </Suspense>
  );
}
