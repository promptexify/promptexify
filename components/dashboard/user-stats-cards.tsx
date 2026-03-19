import { Calendar, IconStar } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { format } from "date-fns";
import Link from "next/link";

interface UserStatsCardsProps {
  totalStars: number;
  joinedDate: Date;
  recentStars: Array<{
    id: string;
    createdAt: Date;
    post: {
      id: string;
      title: string;
      slug: string;
      description?: string | null;
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
        parent?: { id: string; name: string; slug: string } | null;
      };
      tags?: Array<{
        id: string;
        name: string;
        slug: string;
      }>;
    };
  }>;
}

export function UserStatsCards({
  totalStars,
  joinedDate,
  recentStars,
}: UserStatsCardsProps) {
  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total Stars Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stars</CardTitle>
            <IconStar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStars}</div>
            <p className="text-xs text-muted-foreground">Posts saved for later</p>
          </CardContent>
        </Card>

        {/* Member Since Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Member Since</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {format(new Date(joinedDate), "MMM yyyy")}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(joinedDate), "MMMM d, yyyy")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Stars Section */}
      {recentStars.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Stars</CardTitle>
                <CardDescription>Your most recently starred posts</CardDescription>
              </div>
              <Link href="/stars" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentStars.map((star) => (
              <div
                key={star.id}
                className="flex items-start space-x-4 rounded-lg border p-4"
              >
                <IconStar className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div>
                    <Link
                      href={`/entry/${star.post.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {star.post.title}
                    </Link>
                    {star.post.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {star.post.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                      {star.post.category.name}
                    </Badge>
                    {star.post.tags?.slice(0, 2).map((tag) => (
                      <Badge key={tag.slug} variant="outline" className="text-xs">
                        {tag.name}
                      </Badge>
                    ))}
                    {(star.post.tags?.length ?? 0) > 2 && (
                      <span className="text-xs">
                        +{(star.post.tags?.length ?? 0) - 2} more
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Starred {format(new Date(star.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <Link
              href="/stars"
              className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              View all your starred posts →
            </Link>
          </CardFooter>
        </Card>
      )}

      {/* Empty State for Stars */}
      {recentStars.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Stars</CardTitle>
            <CardDescription>
              Your most recently starred posts will appear here
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-8">
            <IconStar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              You haven&apos;t starred any posts yet
            </p>
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Browse Posts
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
