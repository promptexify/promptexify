import React, { Suspense } from "react";
import Link from "next/link";
import { Plus } from "@/components/ui/icons";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

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

import { requireRole } from "@/lib/auth";
import { PostActionsDropdown } from "@/components/dashboard/(actions)/post-actions-dropdown";
import { getAllCategories } from "@/lib/content";
import { Queries } from "@/lib/query";
import { PostFilters } from "@/components/dashboard/post-filters";

import {
  IconCircleCheckFilled,
  IconCrown,
  IconLoader,
  IconX,
  IconFileText,
} from "@/components/ui/icons";
import { MediaImage } from "@/components/media-display";  

// Enable caching for better performance
// Use revalidate instead of force-dynamic for dashboard pages
export const revalidate = 60; // Revalidate every 60 seconds

// Dynamic metadata will be handled by the page component
// since we need to check user role for appropriate title

interface PostsManagementPageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    category?: string;
    subcategory?: string;
    status?: string;
    type?: string;
    featured?: string;
    sortBy?: string;
  }>;
}

// Table skeleton with individual row skeletons
function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Submissions</CardTitle>
        <CardDescription>Manage your content posts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing 0 of 0 posts
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Preview</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead>Views</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="w-12 h-12 rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-8 rounded" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Combined loading skeleton
function LoadingSkeleton() {
  return <TableSkeleton />;
}

// Filter option interface for the component
interface FilterOption {
  value: string;
  label: string;
}

interface UserData {
  id: string;
  role: string;
  email: string;
  name: string | null;
}

// Category interface based on the getAllCategories return type
interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  parent: {
    id: string;
    name: string;
    slug: string;
    _count: {
      posts: number;
    };
  } | null;
  children: {
    id: string;
    name: string;
    slug: string;
    _count: {
      posts: number;
    };
  }[];
  _count: {
    posts: number;
  };
}

// Main content component
async function PostsManagementContent({
  searchParams,
  user,
}: PostsManagementPageProps & { user: UserData }) {
  try {
    // Parse search params
    const params = await searchParams;
    const currentPage = parseInt(params.page || "1", 10);
    const pageSize = parseInt(params.pageSize || "10", 10);

    // Parse filter parameters
    const filters = {
      category: params.category,
      subcategory: params.subcategory,
      status: params.status,
      type: params.type,
      featured: params.featured,
      sortBy: params.sortBy || "newest",
    };

    // Validate page size
    const validPageSize = Math.min(Math.max(pageSize, 5), 50);

    // Use passed user information
    const isAdmin = user.role === "ADMIN";

    // Get categories for filter dropdown (cached)
    const allCategories = await getAllCategories();

    // Transform categories to filter options
    const categoryOptions: FilterOption[] = allCategories.map((cat: Category) => ({
      value: cat.slug,
      label: cat.parent ? `${cat.parent.name} > ${cat.name}` : cat.name,
    }));

    // Convert filter parameters to database query parameters
    let categoryId: string | undefined;
    if (filters.subcategory && filters.subcategory !== "all") {
      const subcategory = allCategories.find((c: Category) => c.slug === filters.subcategory);
      categoryId = subcategory?.id;
    } else if (filters.category && filters.category !== "all") {
      const category = allCategories.find((c: Category) => c.slug === filters.category);
      categoryId = category?.id;
    }

    let isPremium: boolean | undefined;
    if (filters.type === "premium") isPremium = true;
    else if (filters.type === "free") isPremium = false;

    // Map sortBy to database sorting options
    let sortBy: "latest" | "popular" | "trending" = "latest";
    if (filters.sortBy === "favorites") sortBy = "popular";
    else if (filters.sortBy === "oldest") sortBy = "latest"; // Will be handled differently

    // Use optimized paginated query instead of loading all posts
    const postsResult = await Queries.posts.getPaginated({
      page: currentPage,
      limit: validPageSize,
      userId: user.id,
      authorId: isAdmin ? undefined : user.id, // Users see only their posts
      categoryId,
      isPremium,
      sortBy,
      includeUnpublished: isAdmin, // Only admins see unpublished posts
    });

    // Apply client-side filters that can't be done at database level
    let filteredPosts = postsResult.data;

    // Status filtering (some status logic requires client-side filtering)
    if (filters.status && filters.status !== "all") {
      filteredPosts = filteredPosts.filter((post) => {
        switch (filters.status) {
          case "published": return post.isPublished;
          case "pending": return post.status === "PENDING_APPROVAL";
          case "draft": return post.status === "DRAFT";
          case "rejected": return post.status === "REJECTED";
          default: return true;
        }
      });
    }

    // Featured filtering for admins (client-side)
    if (isAdmin && filters.featured && filters.featured !== "all") {
      filteredPosts = filteredPosts.filter((post) =>
        filters.featured === "featured" ? post.isFeatured : !post.isFeatured
      );
    }

    // Apply client-side sorting for cases not handled by database
    if (filters.sortBy === "oldest") {
      filteredPosts.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    } else if (filters.sortBy === "title") {
      filteredPosts.sort((a, b) => a.title.localeCompare(b.title));
    }

    // Use database pagination data
    const totalCount = postsResult.pagination.totalCount;
    const totalPages = postsResult.pagination.totalPages;
    const hasNextPage = postsResult.pagination.hasNextPage;
    const hasPreviousPage = postsResult.pagination.hasPreviousPage;

    // Generate pagination links
    const generatePageLink = (page: number) => {
      const url = new URL("/dashboard/posts", "http://localhost");
      if (page > 1) {
        url.searchParams.set("page", page.toString());
      }
      if (validPageSize !== 10) {
        url.searchParams.set("pageSize", validPageSize.toString());
      }
      // Preserve filters in pagination links
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== "all" && value !== "newest") {
          url.searchParams.set(key, value);
        }
      });
      return url.pathname + url.search;
    };

    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>{isAdmin ? "All Posts" : "My Submissions"}</CardTitle>
            <CardDescription>
              {isAdmin
                ? "Manage all content posts and organize your directory."
                : "Manage your content posts."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PostFilters
              currentPageSize={validPageSize}
              currentPage={currentPage}
              totalCount={totalCount}
              filters={filters}
              categories={categoryOptions}
              isAdmin={isAdmin}
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Preview</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPosts.map((post) => {
                  // Only use fields from the post table
                  const previewSrc = post.previewPath || (post.uploadFileType === "IMAGE" ? post.previewPath : null) || (post.uploadFileType === "VIDEO" ? post.previewVideoPath : null);
                  return (
                    <TableRow key={post.id}>
                      <TableCell>
                        {previewSrc ? (
                          <MediaImage
                            src={previewSrc}
                            alt={post.title}
                            width={52}
                            height={52}
                            blurDataURL={post.blurData || undefined}
                            className="rounded-md object-cover w-12 h-12 border border-muted"
                          />
                        ) : (
                          <div className="w-12 h-12 flex items-center justify-center bg-muted rounded-md border border-muted text-xs text-muted-foreground">
                            <IconFileText className="h-6 w-6 opacity-20" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium line-clamp-1">
                            {post.title}
                          </div>
                        </div>
                      </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {post.category.parent?.name || post.category.name}
                        </Badge>
                        {post.category.parent && (
                          <Badge variant="outline" className="text-xs">
                            {post.category.name}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-row gap-1">
                        {post.status === "APPROVED" ||
                        (post.isPublished &&
                          post.status !== "PENDING_APPROVAL") ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-green-500 text-green-700 dark:text-green-400"
                          >
                            <IconCircleCheckFilled className="mr-1 h-3 w-3 fill-green-500 dark:fill-green-400" />
                            Published
                          </Badge>
                        ) : post.status === "PENDING_APPROVAL" ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-yellow-500 text-yellow-700 dark:text-yellow-400"
                          >
                            <IconLoader className="mr-1 h-3 w-3 fill-yellow-500 dark:fill-yellow-400" />
                            Pending Review
                          </Badge>
                        ) : post.status === "REJECTED" ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-red-500/50 text-red-700/50 dark:border-red-400/50 dark:text-red-200"
                          >
                            <IconX className="mr-1 h-3 w-3" />
                            Rejected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Draft
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Badge
                          variant={post.isPremium ? "default" : "outline"}
                          className={
                            post.isPremium
                              ? "text-xs bg-gradient-to-r from-zinc-200 to-zinc-300 dark:from-zinc-300 dark:to-zinc-400"
                              : "text-xs"
                          }
                        >
                          {post.isPremium ? (
                            <IconCrown className="h-3 w-3" />
                          ) : (
                            "Free"
                          )}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {post.isFeatured ? (
                        <Badge variant="secondary" className="text-xs">
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <IconX className="h-3 w-3" />
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      {new Date(post.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <PostActionsDropdown
                        post={post}
                        currentUserId={user.id}
                        currentUserRole={user.role}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center">
                <Pagination>
                  <PaginationContent>
                    {hasPreviousPage && (
                      <PaginationItem>
                        <PaginationPrevious
                          href={generatePageLink(currentPage - 1)}
                        />
                      </PaginationItem>
                    )}

                    {/* Show page numbers */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        // Show current page, first page, last page, and 2 pages around current
                        return (
                          page === 1 ||
                          page === totalPages ||
                          Math.abs(page - currentPage) <= 2
                        );
                      })
                      .map((page, index, array) => {
                        // Add ellipsis if there's a gap
                        const showEllipsisBefore =
                          index > 0 && array[index - 1] < page - 1;

                        return (
                          <React.Fragment key={page}>
                            {showEllipsisBefore && (
                              <PaginationItem>
                                <span className="px-3 py-2">...</span>
                              </PaginationItem>
                            )}
                            <PaginationItem>
                              <PaginationLink
                                href={generatePageLink(page)}
                                isActive={currentPage === page}
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          </React.Fragment>
                        );
                      })}

                    {hasNextPage && (
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
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    console.error("Error loading posts:", error);
    
    return (
      <>
        {/* Error state card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconX className="h-5 w-5 text-destructive" />
              Unable to Load Posts
            </CardTitle>
            <CardDescription>
              We encountered an issue while loading your posts. This might be due to a temporary network issue or server problem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>• Check your internet connection</p>
              <p>• Try refreshing the page</p>
              <p>• If the problem persists, contact support</p>
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="w-full sm:w-auto"
            >
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }
}

export default async function PostsManagementPage({
  searchParams,
}: PostsManagementPageProps) {
  // Enforce authentication and role-based access using standardized functions
  // Both ADMIN and USER roles can access posts management
  const user = await requireRole(["ADMIN", "USER"]);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
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
                {user.userData?.role === "ADMIN"
                  ? "Manage your content posts, create new prompts, and organize your directory."
                  : "Submit new prompts and manage your submissions."}
              </p>
            </div>
            <Link href="/dashboard/posts/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {user.userData?.role === "ADMIN" ? "New Post" : "Submit Prompt"}
              </Button>
            </Link>
          </div>

          <Suspense fallback={<LoadingSkeleton />}>
            <PostsManagementContent
              searchParams={searchParams}
              user={user.userData!}
            />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
