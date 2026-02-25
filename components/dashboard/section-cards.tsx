import {
  IconTrendingDown,
  IconTrendingUp,
  IconBookmark,
  IconHeart,
  IconCategory,
} from "@/components/ui/icons";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Type definition for dashboard statistics
interface DashboardStats {
  posts: {
    total: number;
    newThisMonth: number;
    growthPercentage: number;
  };
  users: {
    total: number;
    newThisMonth: number;
    growthPercentage: number;
  };
  categories: {
    total: number;
    newThisMonth: number;
    growthPercentage: number;
  };
  tags: {
    total: number;
    newThisMonth: number;
    growthPercentage: number;
  };
  engagement: {
    totalBookmarks: number;
    totalFavorites: number;
  };
  popularCategories: Array<{
    id: string;
    name: string;
    _count: {
      posts: number;
    };
  }>;
  recentActivity: Array<{
    id: string;
    title: string;
    createdAt: Date;
    author: {
      name: string | null;
    };
  }>;
}

interface SectionCardsProps {
  dashboardStats?: DashboardStats;
  isLoading?: boolean;
}

interface EngagementCardsProps {
  dashboardStats?: DashboardStats;
  isLoading?: boolean;
}

// Utility function to format numbers with commas
function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

// Utility function to format growth percentage
function formatGrowthPercentage(percentage: number): {
  value: string;
  isPositive: boolean;
} {
  const isPositive = percentage >= 0;
  const formattedValue = `${isPositive ? "+" : ""}${percentage.toFixed(1)}%`;
  return { value: formattedValue, isPositive };
}

export function SectionCards({
  dashboardStats,
  isLoading = false,
}: SectionCardsProps) {
  // Show loading state or default values if no data
  if (isLoading || !dashboardStats) {
    return (
      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {/* Loading skeleton cards */}
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="@container/card">
            <CardHeader>
              <CardDescription>
                <div className="h-4 w-20 animate-pulse bg-muted rounded"></div>
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                <div className="h-8 w-16 animate-pulse bg-muted rounded"></div>
              </CardTitle>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="h-4 w-32 animate-pulse bg-muted rounded"></div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  const postsGrowth = formatGrowthPercentage(
    dashboardStats.posts.growthPercentage
  );
  const usersGrowth = formatGrowthPercentage(
    dashboardStats.users.growthPercentage
  );
  const categoriesGrowth = formatGrowthPercentage(
    dashboardStats.categories.growthPercentage
  );
  const tagsGrowth = formatGrowthPercentage(
    dashboardStats.tags.growthPercentage
  );

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {/* Post Cards */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Images</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(dashboardStats.posts.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {postsGrowth.isPositive ? (
                <IconTrendingUp />
              ) : (
                <IconTrendingDown />
              )}
              {postsGrowth.value}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground">
            {dashboardStats.posts.newThisMonth > 0
              ? `+${dashboardStats.posts.newThisMonth} new posts this month`
              : "No new posts this month"}
          </div>
        </CardFooter>
      </Card>

      {/* User Cards */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Users</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(dashboardStats.users.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {usersGrowth.isPositive ? (
                <IconTrendingUp />
              ) : (
                <IconTrendingDown />
              )}
              {usersGrowth.value}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground">
            {dashboardStats.users.newThisMonth > 0
              ? `+${dashboardStats.users.newThisMonth} new users this month`
              : "No new users this month"}
          </div>
        </CardFooter>
      </Card>

      {/* Category Cards */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Categories</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(dashboardStats.categories.total)}
          </CardTitle>
          {dashboardStats.categories.growthPercentage !== 0 && (
            <CardAction>
              <Badge variant="outline">
                {categoriesGrowth.isPositive ? (
                  <IconTrendingUp />
                ) : (
                  <IconTrendingDown />
                )}
                {categoriesGrowth.value}
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground">
            {dashboardStats.categories.newThisMonth > 0
              ? `+${dashboardStats.categories.newThisMonth} new categories this month`
              : "Categories organizing all content"}
          </div>
        </CardFooter>
      </Card>

      {/* Tag Cards */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Tags</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(dashboardStats.tags.total)}
          </CardTitle>
          {dashboardStats.tags.growthPercentage !== 0 && (
            <CardAction>
              <Badge variant="outline">
                {tagsGrowth.isPositive ? (
                  <IconTrendingUp />
                ) : (
                  <IconTrendingDown />
                )}
                {tagsGrowth.value}
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground">
            {dashboardStats.tags.newThisMonth > 0
              ? `+${dashboardStats.tags.newThisMonth} new tags this month`
              : "Tags for better content discovery"}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

// Engagement Cards Component - Shows user engagement metrics
export function EngagementCards({
  dashboardStats,
  isLoading = false,
}: EngagementCardsProps) {
  if (isLoading || !dashboardStats) {
    return (
      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {/* Loading skeleton cards */}
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i} className="@container/card">
            <CardHeader>
              <CardDescription>
                <div className="h-4 w-20 animate-pulse bg-muted rounded"></div>
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                <div className="h-8 w-16 animate-pulse bg-muted rounded"></div>
              </CardTitle>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="h-4 w-32 animate-pulse bg-muted rounded"></div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2">
      {/* Total Bookmarks Card */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <IconBookmark className="h-4 w-4" />
            Total Bookmarks
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(dashboardStats.engagement.totalBookmarks)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground">
            Images saved by users for later
          </div>
        </CardFooter>
      </Card>

      {/* Total Favorites Card */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <IconHeart className="h-4 w-4" />
            Total Favorites
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(dashboardStats.engagement.totalFavorites)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground">
            Images favorited by users
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

// Popular Categories Insight Card
export function PopularCategoriesCard({
  dashboardStats,
  isLoading = false,
}: EngagementCardsProps) {
  if (
    isLoading ||
    !dashboardStats ||
    !dashboardStats.popularCategories.length
  ) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <IconCategory className="h-4 w-4" />
            Popular Categories
          </CardDescription>
          <CardTitle className="text-lg font-semibold">
            {isLoading ? (
              <div className="h-6 w-32 animate-pulse bg-muted rounded"></div>
            ) : (
              "No categories available"
            )}
          </CardTitle>
        </CardHeader>
        {isLoading && (
          <CardFooter className="flex-col items-start gap-2 text-sm">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="h-4 w-full animate-pulse bg-muted rounded"
              ></div>
            ))}
          </CardFooter>
        )}
      </Card>
    );
  }

  return (
    <div>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <IconCategory className="h-4 w-4" />
            Popular Categories
          </CardDescription>
          <CardTitle className="text-lg font-semibold">
            Top Content Categories
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-2 text-sm">
          {dashboardStats.popularCategories
            .slice(0, 3)
            .map((category, index) => (
              <div
                key={category.id}
                className="flex items-center justify-between w-full"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    #{index + 1}
                  </Badge>
                  <span className="font-medium">{category.name}</span>
                </div>
                <span className="text-muted-foreground">
                  {formatNumber(category._count.posts)} posts
                </span>
              </div>
            ))}
        </CardFooter>
      </Card>
    </div>
  );
}
