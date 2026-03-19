import React, { Suspense } from "react";
import Link from "next/link";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { getTagsPaginated } from "@/lib/content";
import { Badge } from "@/components/ui/badge";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Plus, Tag } from "@/components/ui/icons";
import { TagActionsDropdown } from "@/components/dashboard/(actions)/tag-actions-dropdown";
import { TagFilters } from "@/components/dashboard/tag-filters";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

interface TagsManagementPageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    sortBy?: string;
  }>;
}

// Table skeleton
function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Main content component
async function TagsManagementContent({
  searchParams,
}: TagsManagementPageProps) {
  let currentPage: number;
  let validPageSize: number;
  let filters: { search: string | undefined; sortBy: "name" | "created" | "posts" };
  let paginatedTags: Awaited<ReturnType<typeof getTagsPaginated>>;

  try {
    // Parse search params
    const params = await searchParams;
    currentPage = parseInt(params.page || "1", 10);
    const pageSize = parseInt(params.pageSize || "10", 10);

    // Parse filter parameters
    filters = {
      search: params.search,
      sortBy: (params.sortBy as "name" | "created" | "posts") || "name",
    };

    // Validate page size
    validPageSize = Math.min(Math.max(pageSize, 5), 50);

    // Get tags with pagination and search
    paginatedTags = await getTagsPaginated(
      currentPage,
      validPageSize,
      filters.search,
      filters.sortBy
    );
  } catch (error) {
    console.error("Error loading tags:", error);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>
            Failed to load tags. Please try again later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Generate pagination links
  const generatePageLink = (page: number) => {
      const url = new URL("/tags", "http://localhost");

      // Add current filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== "name") {
          url.searchParams.set(key, value);
        }
      });

      // Add page and pageSize
      if (page !== 1) {
        url.searchParams.set("page", page.toString());
      }
      if (validPageSize !== 10) {
        url.searchParams.set("pageSize", validPageSize.toString());
      }

      return url.pathname + url.search;
    };

    return (
      <>
        {/* Tags Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Tags</CardTitle>
            <CardDescription>
              Manage your content tags and their usage across posts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Filters */}
            <TagFilters
              currentPageSize={validPageSize}
              currentPage={currentPage}
              totalCount={paginatedTags.totalCount}
              filters={filters}
            />

            {paginatedTags.data.length === 0 ? (
              <div className="text-center py-8">
                <Tag className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">
                  {filters.search ? "No tags found" : "No tags found"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {filters.search
                    ? `No tags match your search "${filters.search}".`
                    : "Create your first tag to start organizing content."}
                </p>
                <Link href="/tags/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Tag
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Posts</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTags.data.map((tag) => (
                      <TableRow key={tag.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {tag.name}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {tag.slug}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {tag._count.posts} posts
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(tag.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <TagActionsDropdown tag={tag} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {paginatedTags.totalPages > 1 && (
                  <div className="flex justify-center">
                    <Pagination>
                      <PaginationContent>
                        {paginatedTags.hasPreviousPage && (
                          <PaginationItem>
                            <PaginationPrevious
                              href={generatePageLink(currentPage - 1)}
                            />
                          </PaginationItem>
                        )}

                        {/* Show page numbers */}
                        {Array.from(
                          { length: Math.min(7, paginatedTags.totalPages) },
                          (_, i) => {
                            let pageNumber: number;

                            if (paginatedTags.totalPages <= 7) {
                              pageNumber = i + 1;
                            } else if (currentPage <= 4) {
                              pageNumber = i + 1;
                            } else if (
                              currentPage >=
                              paginatedTags.totalPages - 3
                            ) {
                              pageNumber = paginatedTags.totalPages - 6 + i;
                            } else {
                              pageNumber = currentPage - 3 + i;
                            }

                            return (
                              <PaginationItem key={pageNumber}>
                                <PaginationLink
                                  href={generatePageLink(pageNumber)}
                                  isActive={pageNumber === currentPage}
                                >
                                  {pageNumber}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          }
                        )}

                        {paginatedTags.hasNextPage && (
                          <PaginationItem>
                            <PaginationNext
                              href={generatePageLink(currentPage + 1)}
                            />
                          </PaginationItem>
                        )}
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </>
    );
}


export default async function TagsManagementPage({
  searchParams,
}: TagsManagementPageProps) {
  // Check admin access
  const user = await requireAdmin();

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "200px",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-6 lg:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground">
                Organize your content with tags for better discoverability.
              </p>
            </div>
            <Link href="/tags/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Tag
              </Button>
            </Link>
          </div>

          <Suspense fallback={<TableSkeleton />}>
            <TagsManagementContent searchParams={searchParams} />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
