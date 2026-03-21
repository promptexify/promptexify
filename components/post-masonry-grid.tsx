"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

interface PostPosition {
  id: string;
  x: number;
  y: number;
  height: number;
}

export function PostMasonryGrid({ posts, ...rest }: PostMasonryGridProps) {
  void rest; // userType reserved for future use
  const [postPositions, setPostPositions] = useState<PostPosition[]>([]);
  const [containerHeight, setContainerHeight] = useState(0);
  const [columnWidth, setColumnWidth] = useState(0);
  const [columnCount, setColumnCount] = useState(1);
  const [previousPostCount, setPreviousPostCount] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<Record<string, HTMLDivElement>>({});

  // Calculate responsive column count and width
  const calculateLayout = useCallback(() => {
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const gap = 24; // 1.5rem = 24px
    let cols = 1;

    // Responsive breakpoints matching CSS
    if (containerWidth >= 1280) cols = 4;
    else if (containerWidth >= 1024) cols = 3;
    else if (containerWidth >= 640) cols = 2;
    else cols = 1;

    const width = (containerWidth - gap * (cols - 1)) / cols;

    setColumnCount(cols);
    setColumnWidth(width);
  }, []);

  // Calculate positions for masonry layout
  const calculatePositions = useCallback(() => {
    if (!containerRef.current || columnWidth === 0 || posts.length === 0) {
      return;
    }

    const gap = 24;
    const columnHeights = new Array(columnCount).fill(0);
    const newPositions: PostPosition[] = [];

    posts.forEach((post) => {
      const postElement = postRefs.current[post.id];
      if (!postElement) return;

      // Find shortest column
      const shortestColumnIndex = columnHeights.indexOf(
        Math.min(...columnHeights)
      );

      const x = shortestColumnIndex * (columnWidth + gap);
      const y = columnHeights[shortestColumnIndex];
      const height = postElement.offsetHeight;

      newPositions.push({
        id: post.id,
        x,
        y,
        height,
      });

      columnHeights[shortestColumnIndex] += height + gap;
    });

    setPostPositions(newPositions);
    setContainerHeight(Math.max(...columnHeights) - gap);
  }, [posts, columnWidth, columnCount]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      calculateLayout();
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    calculateLayout();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculateLayout]);

  // Recalculate positions when layout changes or posts change
  useEffect(() => {
    // Small delay to ensure DOM elements are rendered
    const timer = setTimeout(() => {
      calculatePositions();
    }, 100);

    return () => clearTimeout(timer);
  }, [calculatePositions, posts.length]);

  // Initialize visibility for initial posts and animate new ones
  useEffect(() => {
    if (posts.length === 0) return;

    // If this is the initial load, show all posts immediately
    if (previousPostCount === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviousPostCount(posts.length);
    } else {
      // If posts were added, animate them
      const newPosts = posts.slice(previousPostCount);
      if (newPosts.length > 0) {
        // Animate them in with stagger
        newPosts.forEach((_, index) => {
          setTimeout(() => { }, index * 150); // 150ms delay between each post
        });

        setPreviousPostCount(posts.length);
      }
    }
  }, [posts, previousPostCount]);

  // Observer for image loads to trigger recalculation
  useEffect(() => {
    const observer = new MutationObserver(() => {
      calculatePositions();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style"],
      });
    }

    return () => observer.disconnect();
  }, [calculatePositions]);

  return (
    <>
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: containerHeight }}
      >
        {posts.map((post) => {
          const position = postPositions.find((p) => p.id === post.id);

          return (
            <div
              key={post.id}
              ref={(el) => {
                if (el) {
                  postRefs.current[post.id] = el;
                } else {
                  // Clean up when element is unmounted
                  const existingEl = postRefs.current[post.id];
                  if (existingEl) {
                    delete postRefs.current[post.id];
                  }
                }
              }}
              className="absolute transition-opacity duration-500 ease-in-out"
              style={{
                width: columnWidth,
                left: position?.x || 0,
                top: position?.y || 0,
                opacity: position ? 1 : 0,
                pointerEvents: position ? "auto" : "none",
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
                    <div
                      className="relative"
                      style={{
                        height: "auto",
                      }}
                    >
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

              {/* Content overlay positioned outside the Card */}
              <div className="z-10 mx-3 border border-t-0 rounded-b-lg border-black/20 dark:border-white/20">
                <div className="bg-background-muted backdrop-blur-sm rounded-b-lg px-4 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {post.category.parent?.name || post.category.name}
                    </Badge>
                    <span className="truncate text-right">{post.author.name || "Unknown"}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
