import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getUserStarsAction } from "@/actions";
import { PostMasonryGrid } from "@/components/post-masonry-grid";
import { PostMasonrySkeleton } from "@/components/post-masonry-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconStar } from "@/components/ui/icons";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Metadata } from "next";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Your Stars",
  description: "Your starred prompts and saved content",
};

async function StarsContent() {
  const user = await requireAuth();
  const userType = user?.userData?.type || null;

  const starsResult = await getUserStarsAction();

  if (!starsResult.success) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <IconStar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Unable to Load Stars</h3>
          <p className="text-muted-foreground text-center">
            {starsResult.error || "There was an error loading your stars. Please try again."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const stars = starsResult.stars || [];

  if (stars.length === 0) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <IconStar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Stars Yet</h3>
          <p className="text-muted-foreground text-center">
            You haven&apos;t starred any posts yet. Start exploring prompts and star your favorites!
          </p>
        </CardContent>
      </Card>
    );
  }

  const postsWithStars = stars
    .filter((s): s is typeof s & { post: NonNullable<typeof s.post> } => s.post != null)
    .map((star) => ({
      ...star.post,
      isStarred: true,
      _count: { stars: star.post._count?.stars || 0 },
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            {stars.length} {stars.length === 1 ? "star" : "stars"}
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <IconStar className="h-3 w-3" />
          {stars.length}
        </Badge>
      </div>

      <PostMasonryGrid posts={postsWithStars} userType={userType} />
    </div>
  );
}

function StarsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-6 w-16 bg-muted rounded animate-pulse" />
      </div>
      <PostMasonrySkeleton count={8} />
    </div>
  );
}

export default async function StarsPage() {
  const user = await requireAuth();

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
          <div className="space-y-6">
            <p className="text-muted-foreground">
              Posts you&apos;ve starred for later.
            </p>
            <Suspense fallback={<StarsLoading />}>
              <StarsContent />
            </Suspense>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
