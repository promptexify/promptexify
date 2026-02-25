"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PostMasonryGrid } from "@/components/post-masonry-grid";
import { PostWithInteractions } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/icons";

interface InfinitePostGridProps {
  initialPosts: PostWithInteractions[];
  totalCount: number;
  hasNextPage: boolean;
  userType?: "FREE" | "PREMIUM" | null;
  pageSize: number;
}

interface PostsResponse {
  posts: PostWithInteractions[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export function InfinitePostGrid({
  initialPosts,
  totalCount,
  hasNextPage: initialHasNextPage,
  userType,
  pageSize,
}: InfinitePostGridProps) {
  const [posts, setPosts] = useState<PostWithInteractions[]>(initialPosts);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const loadingRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const previousSearchParamsRef = useRef<string>("");
  const isLoadingRequestRef = useRef(false);
  const lastRequestPageRef = useRef<number>(0);
  const hasNextPageRef = useRef(initialHasNextPage);
  const currentPageRef = useRef(1);

  // Create a stable key for the search params to detect changes
  // Only include actual filtering parameters, ignore modal/entry params
  const searchParamsKey = useMemo(() => {
    if (!searchParams) return "";

    const params = new URLSearchParams();
    const q = searchParams.get("q");
    const category = searchParams.get("category");
    const subcategory = searchParams.get("subcategory");
    const premium = searchParams.get("premium");

    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (subcategory) params.set("subcategory", subcategory);
    if (premium) params.set("premium", premium);

    return params.toString();
  }, [searchParams]);

  // Update hasNextPageRef whenever hasNextPage state changes
  useEffect(() => {
    hasNextPageRef.current = hasNextPage;
  }, [hasNextPage]);

  // Update currentPageRef whenever currentPage state changes
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Reset posts when search params change
  useEffect(() => {
    if (previousSearchParamsRef.current !== searchParamsKey) {
      setPosts(initialPosts);
      setCurrentPage(1);
      setHasNextPage(initialHasNextPage);
      setError(null);
      setRetryCount(0);
      isLoadingRequestRef.current = false;
      lastRequestPageRef.current = 0;
      hasNextPageRef.current = initialHasNextPage;
      currentPageRef.current = 1; // Update ref
      previousSearchParamsRef.current = searchParamsKey;
    }
  }, [initialPosts, initialHasNextPage, searchParamsKey]);

  // Stable load more function - use refs for current values
  const loadMorePosts = useCallback(async () => {
    // Get the current page from ref at execution time
    const currentPageValue = currentPageRef.current;
    const nextPage = currentPageValue + 1;
    const currentHasNextPage = hasNextPageRef.current;

    console.log("LoadMorePosts called:", {
      currentPage: currentPageValue,
      nextPage,
      hasNextPage: currentHasNextPage,
      isLoading: isLoadingRequestRef.current,
      lastRequested: lastRequestPageRef.current,
    });

    // Prevent multiple simultaneous requests and duplicate page requests
    if (
      isLoadingRequestRef.current ||
      !currentHasNextPage ||
      lastRequestPageRef.current >= nextPage
    ) {
      console.log("Request blocked:", {
        isLoading: isLoadingRequestRef.current,
        hasNextPage: currentHasNextPage,
        lastRequested: lastRequestPageRef.current,
        nextPage,
      });
      return;
    }

    console.log(`Loading page ${nextPage}...`);

    // Mark this page as being requested
    lastRequestPageRef.current = nextPage;
    isLoadingRequestRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", nextPage.toString());
      params.set("limit", pageSize.toString());

      // Add current search parameters
      const q = searchParams?.get("q");
      const category = searchParams?.get("category");
      const subcategory = searchParams?.get("subcategory");
      const premium = searchParams?.get("premium");

      if (q) params.set("q", q);
      if (category) params.set("category", category);
      if (subcategory) params.set("subcategory", subcategory);
      if (premium) params.set("premium", premium);

      const response = await fetch(`/api/posts?${params.toString()}`);

      if (!response.ok) {
        // Try to parse error response for better error handling
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }

          // If server provides fallback data on error, use it
          if (errorData.fallback && response.status === 500) {
            console.warn("Using fallback data from server error response");

            // Update with fallback data instead of failing
            setPosts((prevPosts) => prevPosts); // Keep existing posts
            setHasNextPage(false); // Stop further loading
            setError("Unable to load more posts at this time.");
            return;
          }
        } catch {
          // If we can't parse the error response, use the status-based message
        }

        throw new Error(errorMessage);
      }

      const data: PostsResponse = await response.json();

      // Validate response structure
      if (!data || !data.posts || !data.pagination) {
        throw new Error("Invalid response structure from server");
      }

      // Use functional update to ensure we're working with the latest state
      setPosts((prevPosts) => {
        // Create a Set of existing post IDs to avoid duplicates
        const existingIds = new Set(prevPosts.map((post) => post.id));

        // Filter out any posts that already exist (safety check)
        const newPosts = data.posts.filter((post) => !existingIds.has(post.id));

        // Return the combined array maintaining order
        return [...prevPosts, ...newPosts];
      });

      setCurrentPage(data.pagination.currentPage);
      setHasNextPage(data.pagination.hasNextPage);
    } catch (error) {
      console.error("Error loading more posts:", error);

      // Provide more helpful error messages based on error type
      let userErrorMessage = "Failed to load more posts. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("fetch")) {
          userErrorMessage =
            "Network error. Please check your connection and try again.";
        } else if (error.message.includes("timeout")) {
          userErrorMessage = "Request timed out. Please try again.";
        } else if (error.message.includes("Invalid response")) {
          userErrorMessage = "Server returned invalid data. Please try again.";
        }
      }

      setError(userErrorMessage);
      // Reset the last requested page on error so user can retry
      lastRequestPageRef.current = currentPageValue;

      // Increment retry count for monitoring
      setRetryCount((prev) => prev + 1);
    } finally {
      setIsLoading(false);
      isLoadingRequestRef.current = false;
    }
  }, [searchParams, pageSize]);

  // Stable intersection observer with direct loading (no debouncing)
  useEffect(() => {
    if (!loadingRef.current) return;

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];

      if (!target.isIntersecting) {
        return;
      }

      // Use refs to get current values (not stale closure values)
      const currentHasNextPage = hasNextPageRef.current;
      const currentIsLoading = isLoadingRequestRef.current;

      // Check if we can load more
      if (currentHasNextPage && !currentIsLoading) {
        // Call loadMorePosts directly without debouncing
        loadMorePosts();
      }
    };

    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0.1,
      rootMargin: "0px 0px 950px 0px", // Large bottom margin to trigger at ~80% scroll progress
    });

    const currentRef = loadingRef.current;
    observer.observe(currentRef);

    return () => {
      observer.unobserve(currentRef);
    };
  }, [loadMorePosts]); // Include loadMorePosts dependency


  // Manual load more function for button clicks
  const handleManualLoadMore = useCallback(() => {
    loadMorePosts();
  }, [loadMorePosts]);

  // Memoize the posts array to prevent unnecessary re-renders
  const memoizedPosts = useMemo(() => posts, [posts]);

  return (
    <div className="space-y-6">
      {/* Posts Grid */}
      <PostMasonryGrid posts={memoizedPosts} userType={userType} />

      {/* Loading indicator and load more button */}
      <div ref={loadingRef} className="flex flex-col items-center space-y-4">
        {isLoading && (
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-muted-foreground">Loading more posts...</span>
          </div>
        )}

        {error && (
          <div className="text-center space-y-2">
            <p className="text-destructive text-sm">{error}</p>
            <Button
              onClick={handleManualLoadMore}
              variant="outline"
              size="sm"
              disabled={isLoading || isLoadingRequestRef.current}
            >
              Try Again
            </Button>
            {retryCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Attempts: {retryCount}
              </p>
            )}
          </div>
        )}

        {hasNextPage && !isLoading && !error && (
          <Button
            onClick={handleManualLoadMore}
            variant="outline"
            size="lg"
            disabled={isLoading || isLoadingRequestRef.current}
            className="min-w-[200px]"
          >
            Load More Posts
          </Button>
        )}

        {!hasNextPage && posts.length > 0 && (
          <div className="text-center py-6">
            <p className="text-muted-foreground">
              You&apos;ve reached the end! Showing all {posts.length} of{" "}
              {totalCount} posts.
            </p>
          </div>
        )}

        {posts.length === 0 && !isLoading && (
          <div className="text-center pb-12">
            <p className="text-muted-foreground">No posts found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
