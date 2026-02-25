import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getUserBookmarksAction, getUserFavoritesAction } from "@/actions";
import { PostMasonryGrid } from "@/components/post-masonry-grid";
import { PostMasonrySkeleton } from "@/components/post-masonry-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bookmark, BookmarkX } from "@/components/ui/icons";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Metadata } from "next";

// Enable caching for better performance
export const revalidate = 30; // Revalidate every 30 seconds for user-specific data

export const metadata: Metadata = {
  title: "Your Bookmarks",
  description: "Your saved prompts and bookmarked content",
};

async function BookmarksContent() {
  // Get current user info
  const user = await requireAuth();
  const userType = user?.userData?.type || null;

  // Get user's bookmarks and favorites in parallel
  const [bookmarksResult, favoritesResult] = await Promise.all([
    getUserBookmarksAction(),
    getUserFavoritesAction(),
  ]);

  if (!bookmarksResult.success) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <BookmarkX className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            Unable to Load Bookmarks
          </h3>
          <p className="text-muted-foreground text-center">
            {bookmarksResult.error ||
              "There was an error loading your bookmarks. Please try again."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const bookmarks = bookmarksResult.bookmarks || [];
  const favorites = favoritesResult.success
    ? favoritesResult.favorites || []
    : [];

  // Create a set of favorited post IDs for quick lookup
  const favoritedPostIds = new Set(
    favorites.map((favorite) => favorite.postId)
  );

  if (bookmarks.length === 0) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Bookmark className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Bookmarks Yet</h3>
          <p className="text-muted-foreground text-center">
            You haven&apos;t bookmarked any posts yet. Start exploring prompts
            and bookmark your favorites!
          </p>
        </CardContent>
      </Card>
    );
  }

  // Transform bookmarks to posts with bookmark and favorite status
  const postsWithBookmarks = bookmarks.map((bookmark) => ({
    ...bookmark.post,
    isBookmarked: true,
    isFavorited: favoritedPostIds.has(bookmark.post.id),
    _count: {
      bookmarks: bookmark.post._count?.bookmarks || 0,
      favorites: bookmark.post._count?.favorites || 0,
    },
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            {bookmarks.length}{" "}
            {bookmarks.length === 1 ? "bookmark" : "bookmarks"}
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <Bookmark className="h-3 w-3" />
          {bookmarks.length}
        </Badge>
      </div>

      <PostMasonryGrid posts={postsWithBookmarks} userType={userType} />
    </div>
  );
}

function BookmarksLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-32 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="h-6 w-16 bg-muted rounded animate-pulse" />
      </div>

      <PostMasonrySkeleton count={8} />
    </div>
  );
}

export default async function BookmarksPage() {
  // Require authentication - both USER and ADMIN can access bookmarks
  const user = await requireAuth();

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
          <div className="space-y-6">
            <p className="text-muted-foreground">
              Posts you&apos;ve added to your bookmarks.
            </p>
            <Suspense fallback={<BookmarksLoading />}>
              <BookmarksContent />
            </Suspense>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
