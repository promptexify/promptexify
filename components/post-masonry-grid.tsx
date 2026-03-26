"use client";

import { useState, useLayoutEffect, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostWithInteractions } from "@/lib/content";
import { StarButton } from "@/components/star-button";
import { PostTextBaseCard } from "@/components/post-text-base-card";

interface PostMasonryGridProps {
  posts: PostWithInteractions[];
  userType?: "FREE" | "PREMIUM" | null;
}

interface Position {
  x: number;
  y: number;
}

function getColumnCount(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function PostMasonryGrid({ posts }: PostMasonryGridProps) {
  const [positions, setPositions] = useState<Map<string, Position>>(new Map());
  const [containerHeight, setContainerHeight] = useState(0);
  const [columnWidth, setColumnWidth] = useState(0);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPostIdsRef = useRef<Set<string>>(new Set());

  const computeLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container || posts.length === 0) return;

    const containerWidth = container.offsetWidth;
    if (!containerWidth) return;

    const cols = getColumnCount(containerWidth);
    const gap = 24;
    const colWidth = (containerWidth - gap * (cols - 1)) / cols;

    // Set widths directly on elements before measuring heights so that
    // text wrapping and element heights are accurate for the current column width.
    for (const el of postRefs.current.values()) {
      el.style.width = `${colWidth}px`;
    }

    // Compute masonry positions using a column-heights bin-packing approach.
    const columnHeights = new Array(cols).fill(0);
    const newPositions = new Map<string, Position>();

    for (const post of posts) {
      const el = postRefs.current.get(post.id);
      if (!el) continue;

      const shortest = columnHeights.indexOf(Math.min(...columnHeights));
      newPositions.set(post.id, {
        x: shortest * (colWidth + gap),
        y: columnHeights[shortest],
      });
      columnHeights[shortest] += el.offsetHeight + gap;
    }

    const maxHeight =
      columnHeights.length > 0
        ? Math.max(0, Math.max(...columnHeights) - gap)
        : 0;

    // Batch all state updates — React 18 batches these into a single re-render.
    setColumnWidth(colWidth);
    setPositions(newPositions);
    setContainerHeight(maxHeight);

    // Stagger new posts into view. "New" means not present in the previous render.
    const prevIds = prevPostIdsRef.current;
    const newIds = posts.map((p) => p.id).filter((id) => !prevIds.has(id));
    const isInitialLoad = prevIds.size === 0;

    if (newIds.length > 0) {
      const perItemDelay = isInitialLoad ? 40 : 60;
      newIds.forEach((id, i) => {
        setTimeout(() => {
          setVisibleIds((prev) => new Set([...prev, id]));
        }, i * perItemDelay);
      });
    }

    prevPostIdsRef.current = new Set(posts.map((p) => p.id));
  }, [posts]);

  // useLayoutEffect fires synchronously after React commits DOM changes but
  // before the browser paints. This eliminates the "jump" caused by the
  // previous setTimeout(100) approach, where cards would sit at (0,0) for
  // 100ms before snapping to their positions.
  useLayoutEffect(() => {
    computeLayout();
  }, [computeLayout]);

  // ResizeObserver is more precise than window "resize" and avoids the
  // MutationObserver loop (which fired on every style change, including those
  // triggered by computeLayout itself, causing infinite recalculation).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => computeLayout());
    observer.observe(container);
    return () => observer.disconnect();
  }, [computeLayout]);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: containerHeight, transition: "height 0.3s ease" }}
    >
      {posts.map((post) => {
        const pos = positions.get(post.id);
        const isVisible = visibleIds.has(post.id);

        return (
          <div
            key={post.id}
            ref={(el) => {
              if (el) postRefs.current.set(post.id, el);
              else postRefs.current.delete(post.id);
            }}
            className="absolute"
            style={{
              width: columnWidth || "100%",
              // transform is GPU-composited — avoids layout recalculation on
              // every position change, unlike left/top which trigger reflow.
              transform: pos
                ? `translate(${pos.x}px, ${pos.y}px)`
                : "translate(0px, 0px)",
              opacity: pos && isVisible ? 1 : 0,
              transition:
                "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease",
              pointerEvents: pos && isVisible ? "auto" : "none",
            }}
          >
            <Link href={`/entry/${post.id}`} scroll={false}>
              <Card className="overflow-hidden hover:shadow-lg cursor-zoom-in py-0 shadow-lg">
                <div
                  className="relative"
                  style={{
                    height: "auto",
                    minHeight: "120px",
                    maxHeight: "200px",
                  }}
                >
                  <div className="relative" style={{ height: "auto" }}>
                    <PostTextBaseCard title={post.title} />
                  </div>

                  {/* Action buttons overlay */}
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2 items-end justify-between z-20">
                    {/* Tags — bottom left */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {post.tags.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-xs bg-background/80 backdrop-blur-sm border-black/20 dark:border-white/20"
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                    {/* Star button — bottom right */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                    >
                      <StarButton
                        postId={post.id}
                        className="border-1 border-black/20 dark:border-white/20 backdrop-blur-lg bg-background"
                        initialStarred={post.isStarred || false}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </Link>

            {/* Content footer — outside the Card, matching original layout */}
            <div className="z-10 mx-3 border border-t-0 rounded-b-lg border-black/20 dark:border-white/20">
              <div className="bg-background-muted backdrop-blur-sm rounded-b-lg px-4 py-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {post.category.parent?.name || post.category.name}
                  </Badge>
                  <span className="truncate text-right">
                    {post.author.name || "Unknown"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
