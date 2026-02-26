"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostWithInteractions } from "@/lib/content";
import { BookmarkButton } from "@/components/bookmark-button";
import { FavoriteButton } from "@/components/favorite-button";
import { MediaImage, MediaVideo } from "@/components/media-display";
import {
  LockIcon,
  UnlockIcon,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from "@/components/ui/icons";
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

export function PostMasonryGrid({ posts, userType }: PostMasonryGridProps) {
  const [postPositions, setPostPositions] = useState<PostPosition[]>([]);
  const [containerHeight, setContainerHeight] = useState(0);
  const [columnWidth, setColumnWidth] = useState(0);
  const [columnCount, setColumnCount] = useState(1);
  const [previousPostCount, setPreviousPostCount] = useState(0);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [mutedVideos, setMutedVideos] = useState<Set<string>>(
    new Set(
      posts
        .filter(
          (post) => post.previewVideoPath && post.uploadFileType === "VIDEO"
        )
        .map((post) => post.id)
    )
  );

  // State to track which videos should be loaded and their loading status
  const [videosToShow, setVideosToShow] = useState<Set<string>>(new Set());
  const [videosLoaded, setVideosLoaded] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<Record<string, HTMLDivElement>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});
  const [imageDimensions, setImageDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});

  // Handle video play/pause from button clicks
  const handleVideoPlay = useCallback(
    (postId: string, event?: React.MouseEvent) => {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }

      if (!videosToShow.has(postId)) {
        // First click: show video, mark as playing, and it will auto-play when loaded
        setVideosToShow((prev) => new Set([...prev, postId]));
        setPlayingVideo(postId);
        return;
      }

      const video = videoRefs.current[postId];
      if (!video) {
        // Video not ready yet, just mark as playing for auto-play
        setPlayingVideo(postId);
        return;
      }

      // Prevent rapid clicking during video state changes
      if (video.readyState < 2) {
        console.log("Video not ready for playback yet");
        return;
      }

      if (playingVideo === postId) {
        video.pause();
        setPlayingVideo(null);
      } else {
        // Pause any currently playing video
        if (playingVideo) {
          const currentVideo = videoRefs.current[playingVideo];
          if (currentVideo && !currentVideo.paused) {
            currentVideo.pause();
          }
        }
        // Start playing this video
        video.play().catch((err) => {
          console.error("Failed to play video:", err);
          // Don't change state if play failed
        });
        setPlayingVideo(postId);
      }
    },
    [playingVideo, videosToShow]
  );

  // Handle video play event (from video element, not button)
  const handleVideoPlayEvent = useCallback(
    (postId: string) => {
      console.log(`Video started playing: ${postId}`);
      // Just ensure state is in sync - don't toggle
      if (playingVideo !== postId) {
        setPlayingVideo(postId);
      }
    },
    [playingVideo]
  );

  // Handle video pause event (from video element, not button)
  const handleVideoPauseEvent = useCallback(
    (postId: string) => {
      console.log(`Video paused: ${postId}`);
      // Clear playing state when video pauses
      if (playingVideo === postId) {
        setPlayingVideo(null);
      }
    },
    [playingVideo]
  );

  // Handle video mute/unmute
  const handleVideoMute = useCallback(
    (postId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      setMutedVideos((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(postId)) {
          newSet.delete(postId);
        } else {
          newSet.add(postId);
        }
        return newSet;
      });
    },
    []
  );

  // Handle video ended
  const handleVideoEnded = useCallback(
    (postId: string) => {
      if (playingVideo === postId) {
        setPlayingVideo(null);
      }
    },
    [playingVideo]
  );

  // Handle media load and calculate aspect ratio
  const handleMediaLoad = useCallback(
    (
      postId: string,
      event: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>
    ) => {
      const media = event.currentTarget;
      let width: number, height: number;

      if (media instanceof HTMLImageElement) {
        width = media.naturalWidth;
        height = media.naturalHeight;
      } else if (media instanceof HTMLVideoElement) {
        width = media.videoWidth;
        height = media.videoHeight;
      } else {
        return;
      }

      setImageDimensions((prev) => ({
        ...prev,
        [postId]: { width, height },
      }));
    },
    []
  );

  // Handle video loaded metadata
  const handleVideoLoadedMetadata = useCallback(
    (postId: string, event: React.SyntheticEvent<HTMLVideoElement>) => {
      setVideosLoaded((prev) => new Set([...prev, postId]));
      handleMediaLoad(postId, event);

      // Auto-play if this video should be playing
      if (playingVideo === postId) {
        const video = videoRefs.current[postId];
        if (video) {
          video.play();
        }
      }
    },
    [playingVideo, handleMediaLoad]
  );

  // Function to get dynamic aspect ratio style based on real media dimensions
  const getDynamicAspectRatio = (post: PostWithInteractions) => {
    // First check if we have real dimensions from media table
    if (post.media && post.media.length > 0) {
      const media = post.media[0];
      if (media.width && media.height) {
        const aspectRatio = media.width / media.height;
        // Cap aspect ratio to reasonable bounds for UI consistency
        const cappedRatio = Math.max(0.67, Math.min(1.8, aspectRatio));
        const width = Math.round(cappedRatio * 100);

        // Debug: Log aspect ratio info
        // console.log(`PostMasonry ${post.id}: Real dimensions ${media.width}x${media.height}, ratio: ${aspectRatio.toFixed(3)}, capped: ${cappedRatio.toFixed(3)}, CSS: ${width}/100`);

        return { aspectRatio: `${width} / 100` };
      }
    }

    // Check if we have tracked dimensions from image loading
    const dimensions = imageDimensions[post.id];
    if (dimensions) {
      const naturalRatio = dimensions.width / dimensions.height;
      const cappedRatio = Math.max(0.67, Math.min(1.8, naturalRatio));
      const width = Math.round(cappedRatio * 100);
      return { aspectRatio: `${width} / 100` };
    }

    // Generate a pseudo-random but consistent aspect ratio for each post while loading
    const hash = post.id.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    const normalized = Math.abs(hash) / 2147483648;
    const aspectRatio = 0.67 + normalized * 1.13;
    const width = Math.round(aspectRatio * 100);
    return { aspectRatio: `${width} / 100` };
  };

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
  }, [calculatePositions, posts.length, imageDimensions]);

  // Initialize visibility for initial posts and animate new ones
  useEffect(() => {
    if (posts.length === 0) return;

    // If this is the initial load, show all posts immediately
    if (previousPostCount === 0) {
      setPreviousPostCount(posts.length);
    } else {
      // If posts were added, animate them
      const newPosts = posts.slice(previousPostCount);
      if (newPosts.length > 0) {
        // Add new videos to muted list by default
        const newVideoPostIds = newPosts
          .filter(
            (post) => post.previewVideoPath && post.uploadFileType === "VIDEO"
          )
          .map((post) => post.id);

        if (newVideoPostIds.length > 0) {
          setMutedVideos((prev) => new Set([...prev, ...newVideoPostIds]));
        }

        // Animate them in with stagger
        newPosts.forEach((_, index) => {
          setTimeout(() => {}, index * 150); // 150ms delay between each post
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

  // Reset video states when playingVideo changes
  useEffect(() => {
    // Clean up video states for posts that are no longer playing
    posts.forEach((post) => {
      if (playingVideo !== post.id) {
        setVideosToShow((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(post.id)) {
            // Keep video loaded but not playing
          }
          return newSet;
        });
      }
    });
  }, [playingVideo, posts]);

  return (
    <>
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: containerHeight }}
      >
        {posts.map((post) => {
          const position = postPositions.find((p) => p.id === post.id);
          const isVideo =
            post.previewVideoPath && post.uploadFileType === "VIDEO";
          const showVideo = isVideo && videosToShow.has(post.id);
          const videoLoaded = isVideo && videosLoaded.has(post.id);

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
                    style={
                      // Apply dynamic aspect ratio to images preview and videos preview only
                      (post.previewPath && post.uploadFileType === "IMAGE") ||
                      (post.previewVideoPath && post.uploadFileType === "VIDEO")
                        ? getDynamicAspectRatio(post)
                        : {
                            height: "auto",
                            minHeight: "120px",
                            maxHeight: "200px",
                          }
                    }
                  >
                    {post.previewPath && post.uploadFileType === "IMAGE" ? (
                      // For images: Always use previewPath if available, fallback to previewPath
                      <MediaImage
                        src={post.previewPath || ""}
                        alt={post.title}
                        fill
                        className="object-cover rounded-b-lg absolute"
                        loading="lazy"
                        priority={posts.indexOf(post) < 4} // Prioritize first 4 images for LCP
                        blurDataURL={post.blurData || undefined}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        onLoad={(e) => handleMediaLoad(post.id, e)}
                      />
                    ) : isVideo ? (
                      <div className="relative w-full h-full">
                        {/* Show thumbnail with play button when video is not loaded */}
                        {!showVideo && post.previewPath && (
                          <MediaImage
                            src={post.previewPath}
                            alt={post.title}
                            fill
                            className="object-cover rounded-b-lg absolute"
                            loading="lazy"
                            priority={posts.indexOf(post) < 4} // Prioritize first 4 images for LCP
                            blurDataURL={post.blurData || undefined}
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            onLoad={(e) => handleMediaLoad(post.id, e)}
                          />
                        )}

                        {/* Show video when user clicks play */}
                        {showVideo && (
                          <MediaVideo
                            ref={(el) => {
                              if (el) videoRefs.current[post.id] = el;
                            }}
                            // Always use previewVideoPath as the primary source when available
                            src={post.previewVideoPath || ""}
                            previewSrc={post.previewPath || undefined}
                            previewVideoSrc={post.previewVideoPath || undefined}
                            alt={post.title}
                            fill
                            className="rounded-b-lg"
                            muted={mutedVideos.has(post.id)}
                            loop
                            playsInline
                            preload="metadata"
                            autoPlay={playingVideo === post.id} // Auto-play if this video should be playing
                            onLoadedMetadata={(e) => {
                              handleVideoLoadedMetadata(post.id, e);
                            }}
                            onPlay={() => {
                              handleVideoPlayEvent(post.id);
                            }}
                            onPause={() => {
                              handleVideoPauseEvent(post.id);
                            }}
                            onEnded={() => handleVideoEnded(post.id)}
                            blurDataURL={post.blurData || undefined}
                            usePreviewVideo={true}
                            fallbackToOriginal={false}
                          />
                        )}

                        {/* Loading indicator when video is being loaded */}
                        {showVideo && !videoLoaded && (
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
                            <div className="bg-white rounded-full p-2">
                              <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                          </div>
                        )}

                        {/* Video controls overlay - always visible on top left */}
                        <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
                          {/* Play/Pause button */}
                          <button
                            className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                            onClick={(e) => handleVideoPlay(post.id, e)}
                          >
                            {playingVideo === post.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>

                          {/* Mute/Unmute button */}
                          <button
                            className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                            onClick={(e) => handleVideoMute(post.id, e)}
                          >
                            {mutedVideos.has(post.id) ? (
                              <VolumeX className="w-4 h-4" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Text base post with shiny hover effect
                      <div
                        className="relative"
                        style={{
                          height: "auto",
                        }}
                      >
                        <PostTextBaseCard title={post.title} />
                      </div>
                    )}

                    {post.isPremium && (
                      <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                        <Badge className="text-foreground bg-gradient-to-r from-teal-500 to-sky-300 dark:from-teal-400 dark:to-sky-300 border border-black/20 dark:border-white/20">
                          {userType === "PREMIUM" ? (
                            <UnlockIcon className="w-4 h-4" />
                          ) : (
                            <LockIcon className="w-4 h-4" />
                          )}
                          Premium
                        </Badge>
                      </div>
                    )}

                    {/* Action buttons overlay */}
                    <div className="absolute bottom-3 right-3 px-3 flex gap-2 items-end justify-between z-20">
                      <div
                        className="flex items-bottom justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                      >
                        <FavoriteButton
                          postId={post.id}
                          className="border-1 border-black/20 dark:border-white/20 backdrop-blur-lg bg-background"
                          initialFavorited={post.isFavorited || false}
                        />
                        <BookmarkButton
                          postId={post.id}
                          className="border-1 border-black/20 dark:border-white/20 backdrop-blur-lg bg-background"
                          initialBookmarked={post.isBookmarked || false}
                        />
                      </div>
                      {/* <div className="flex items-end justify-end gap-1 flex-col flex-wrap">
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="text-xs bg-background"
                          >
                            {post.category.parent?.name || post.category.name}
                          </Badge>
                        </div>
                        <div className="flex items-end gap-1">
                          {post.tags &&
                            post.tags.slice(0, 2).map((tag) => (
                              <Badge
                                key={tag.id}
                                variant="outline"
                                className="text-xs bg-background"
                              >
                                {tag.name}
                              </Badge>
                            ))}
                        </div>
                      </div> */}
                    </div>
                  </div>
                </Card>
              </Link>

              {/* Content overlay positioned outside the Card */}
              <div className="z-10 mx-3 border border-t-0 rounded-b-lg border-black/20 dark:border-white/20">
                <div className="bg-background-muted backdrop-blur-sm rounded-b-lg px-4 py-2 text-xs text-muted-foreground">
                  <span className="line-clamp-2">
                    <span className="font-medium">Prompt: </span>

                    {post.description
                      ? post.description
                          .replace(/^# .+\n\n/, "")
                          .replace(/\n+/g, " ")
                          .substring(0, 100) +
                        (post.description.length > 100 ? "..." : "")
                      : "Something went wrong"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
