"use client";

import { useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostWithInteractions } from "@/lib/content";
import { StarButton } from "@/components/star-button";
import { MediaImage, MediaVideo } from "@/components/media-display";

import {
  Play,
  Pause,
  Volume2,
  VolumeX,
} from "@/components/ui/icons";
import { PostTextBaseCard } from "@/components/post-text-base-card";

interface PostCardProps {
  post: PostWithInteractions;
  userType?: "FREE" | "PREMIUM" | null;
  width: number;
  onVideoStateChange?: (postId: string, isPlaying: boolean) => void;
  isVideoMuted?: boolean;
  onVideoMuteChange?: (postId: string, isMuted: boolean) => void;
  playingVideo?: string | null;
}

export function PostCard({
  post,
  width,
  onVideoStateChange,
  isVideoMuted = true,
  onVideoMuteChange,
  playingVideo,
  ...rest
}: PostCardProps) {
  void rest; // userType and other optional props reserved for future use
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // We now directly use previewPath for images, no need for the hook

  // Calculate aspect ratio based on real media dimensions or fallback
  const getDynamicAspectRatio = () => {
    if (post.uploadPath && post.media && post.media.length > 0) {
      // Use real image dimensions from media table
      const media = post.media[0];
      if (media.width && media.height) {
        const aspectRatio = media.width / media.height;
        // Cap aspect ratio to reasonable bounds for UI consistency
        const cappedRatio = Math.max(0.67, Math.min(1.8, aspectRatio));
        const width = Math.round(cappedRatio * 100);

        // Debug: Log aspect ratio info to help verify blur/image matching
        // console.log(`Post ${post.id}: Real dimensions ${media.width}x${media.height}, ratio: ${aspectRatio.toFixed(3)}, capped: ${cappedRatio.toFixed(3)}, CSS: ${width}/100`);

        return { aspectRatio: `${width} / 100` };
      }
    }

    // Fallback for posts without media dimensions
    return { aspectRatio: "75 / 100" }; // Default 3:4 ratio
  };

  // Handle media load for dimensions tracking
  const handleMediaLoad = useCallback(() => {
    // Media loaded successfully - could track dimensions here if needed
  }, []);

  // Handle video play/pause from button clicks
  const handleVideoPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Prevent rapid clicking during video state changes
    if (video.readyState < 2) {
      // console.log("Video not ready for playback yet");
      return;
    }

    if (playingVideo === post.id) {
      video.pause();
      onVideoStateChange?.(post.id, false);
    } else {
      video.play().catch((err) => {
        console.error("Failed to play video:", err);
        // Don't change state if play failed
      });
      onVideoStateChange?.(post.id, true);
    }
  }, [post.id, playingVideo, onVideoStateChange]);

  // Handle video play event (from video element, not button)
  const handleVideoPlayEvent = useCallback(() => {
    // console.log(`Video started playing: ${post.id}`);
    // Just ensure state is in sync - don't toggle
    if (playingVideo !== post.id) {
      onVideoStateChange?.(post.id, true);
    }
  }, [post.id, playingVideo, onVideoStateChange]);

  // Handle video pause event (from video element, not button)
  const handleVideoPauseEvent = useCallback(() => {
    //  console.log(`Video paused: ${post.id}`);
    // Clear playing state when video pauses
    if (playingVideo === post.id) {
      onVideoStateChange?.(post.id, false);
    }
  }, [post.id, playingVideo, onVideoStateChange]);

  // Handle video ended
  const handleVideoEnded = useCallback(() => {
    if (playingVideo === post.id) {
      onVideoStateChange?.(post.id, false);
    }
  }, [post.id, playingVideo, onVideoStateChange]);

  // Handle video loaded metadata
  const handleVideoLoadedMetadata = useCallback(() => {
    handleMediaLoad();

    // Auto-play if this video should be playing
    if (playingVideo === post.id) {
      const video = videoRef.current;
      if (video) {
        video.play();
      }
    }
  }, [playingVideo, post.id, handleMediaLoad]);

  // Update video play/pause state when external playingVideo changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playingVideo === post.id) {
      video.play();
    } else {
      video.pause();
    }
  }, [playingVideo, post.id]);

  // Update video mute state
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = isVideoMuted;
    }
  }, [isVideoMuted]);

  return (
    <div ref={containerRef} style={{ width }}>
      <Link href={`/entry/${post.id}`} scroll={false}>
        <Card className="overflow-hidden hover:shadow-lg cursor-zoom-in py-0 shadow-lg">
          <div
            className="relative"
            style={
              post.uploadPath
                ? getDynamicAspectRatio()
                : { height: "auto", minHeight: "120px" }
            }
          >
            {post.previewPath ? (
              post.uploadFileType === "IMAGE" ? (
                <MediaImage
                  src={post.previewPath}
                  alt={post.title}
                  fill
                  className="object-cover rounded-b-lg absolute"
                  loading="lazy"
                  blurDataURL={post.blurData || undefined}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  onLoad={() => handleMediaLoad()}
                />
              ) : (
                <MediaVideo
                  ref={videoRef}
                  src={post.previewVideoPath || ""}
                  previewSrc={post.previewPath || undefined}
                  previewVideoSrc={post.previewVideoPath || undefined}
                  alt={post.title}
                  fill
                  className="rounded-b-lg"
                  muted={isVideoMuted}
                  loop
                  playsInline
                  preload="metadata"
                  autoPlay={playingVideo === post.id} // Auto-play if this video should be playing
                  onLoadedMetadata={() => handleVideoLoadedMetadata()}
                  onPlay={handleVideoPlayEvent}
                  onEnded={handleVideoEnded}
                  onPause={handleVideoPauseEvent}
                  blurDataURL={post.blurData || undefined}
                  usePreviewVideo={true}
                  fallbackToOriginal={false}
                />
              )
            ) : (
              <PostTextBaseCard title={post.title} className="min-h-[120px]" />
            )}

            {/* Custom video controls overlay for videos */}
            {post.uploadFileType === "VIDEO" && (
              <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
                <div className="flex gap-2">
                  {/* Play/pause button */}
                  <button
                    className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors pointer-events-auto"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleVideoPlay();
                    }}
                  >
                    {playingVideo === post.id ? (
                      <Pause className="w-4 h-4 text-white" />
                    ) : (
                      <Play className="w-4 h-4 text-white" />
                    )}
                  </button>

                  {/* Mute/unmute button */}
                  <button
                    className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors pointer-events-auto"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onVideoMuteChange?.(post.id, !isVideoMuted);
                    }}
                  >
                    {isVideoMuted ? (
                      <VolumeX className="w-4 h-4 text-white" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            )}

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
