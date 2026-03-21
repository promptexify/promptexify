"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostWithInteractions } from "@/lib/content";
import { StarButton } from "@/components/star-button";
import { PostTextBaseCard } from "@/components/post-text-base-card";

interface PostCardProps {
  post: PostWithInteractions;
  userType?: "FREE" | "PREMIUM" | null;
  width: number;
}

export function PostCard({
  post,
  width,
  ...rest
}: PostCardProps) {
  void rest; // userType and other optional props reserved for future use

  return (
    <div style={{ width }}>
      <Link href={`/entry/${post.id}`} scroll={false}>
        <Card className="overflow-hidden hover:shadow-lg cursor-zoom-in py-0 shadow-lg">
          <div
            className="relative"
            style={{ height: "auto", minHeight: "120px" }}
          >
            <PostTextBaseCard title={post.title} className="min-h-[120px]" />
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
                {post.title}
              </h3>
            </div>

            {post.description && (
              <p className="text-muted-foreground text-xs mb-3 line-clamp-2">
                {post.description}
              </p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {post.category?.name}
                </Badge>
              </div>

              <div className="flex items-center gap-1">
                <StarButton
                  postId={post.id}
                  initialStarred={post.isStarred}
                  size="sm"
                />
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </div>
  );
}
