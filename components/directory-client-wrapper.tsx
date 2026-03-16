"use client";

import { DirectoryFilters } from "@/components/directory-filters";
import { InfinitePostGrid } from "@/components/infinite-scroll-grid";
import { Container } from "@/components/ui/container";
import { PostWithInteractions } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Search } from "@/components/ui/icons";
import Link from "next/link";

interface DirectoryClientWrapperProps {
  initialPosts: PostWithInteractions[];
  hasNextPage: boolean;
  totalCount: number;
  userType?: "FREE" | "PREMIUM" | null;
  pageSize: number;
  pagination: {
    totalCount: number;
    hasNextPage: boolean;
  };
  categoryName?: string;
  categoryDescription?: string;
}

export function DirectoryClientWrapper({
  initialPosts,
  userType,
  pageSize,
  pagination,
  categoryName,
  categoryDescription,
}: DirectoryClientWrapperProps) {
  return (
    <Container>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-8 gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-2">
            {categoryName ?? "Prompt Directory"}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            {categoryDescription ??
              "Find the perfect prompt for your creative and professional needs."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DirectoryFilters />
        </div>
      </div>

      {/* Results Summary */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground">
          Showing {pagination.totalCount} prompt{pagination.totalCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Posts Grid */}
      {initialPosts.length > 0 ? (
        <InfinitePostGrid
          initialPosts={initialPosts}
          hasNextPage={pagination.hasNextPage}
          totalCount={pagination.totalCount}
          userType={userType}
          pageSize={pageSize}
        />
      ) : (
        <div className="text-center py-16">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No prompts found</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            No prompts are available right now. Check back later!
          </p>
          <Button variant="outline" asChild>
            <Link href="/directory">Refresh</Link>
          </Button>
        </div>
      )}
    </Container>
  );
}
