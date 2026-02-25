"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { MediaImage, MediaVideo } from "@/components/media-display";

import {
  Copy,
  Check,
  ArrowLeft,
  Share2,
  Home,
  ChevronRight,
  LockIcon,
  UnlockIcon,
  Play,
  Pause,
  Eye,
  FileText,
  Clock,
} from "@/components/ui/icons";

import { PostWithInteractions } from "@/lib/content";
import { BookmarkButton } from "@/components/bookmark-button";
import { FavoriteButton } from "@/components/favorite-button";

interface PostStandalonePageProps {
  post: PostWithInteractions;
  relatedPosts?: PostWithInteractions[];
  userType?: "FREE" | "PREMIUM" | null;
}

export function PostStandalonePage({
  post,
  relatedPosts = [],
  userType,
}: PostStandalonePageProps) {
  const router = useRouter();
  const [isCopied, setIsCopied] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});


  // Get video preview path from post
  const videoPreviewPath = post.uploadPath && post.uploadFileType === "VIDEO" && post.previewPath
    ? post.previewPath
    : null;

  const copyToClipboard = async () => {
    const contentToCopy =
      post.content || "No content available for this prompt.";

    try {
      await navigator.clipboard.writeText(contentToCopy);
      setIsCopied(true);
      toast.success("Prompt copied to clipboard!");

      // Reset after 10 seconds
      setTimeout(() => {
        setIsCopied(false);
      }, 10000);
    } catch {
      // Fallback for older browsers or when clipboard API is not available
      const textArea = document.createElement("textarea");
      textArea.value = contentToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setIsCopied(true);
      toast.success("Prompt copied to clipboard!");

      // Reset after 10 seconds
      setTimeout(() => {
        setIsCopied(false);
      }, 10000);
    }
  };

  const sharePost = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: post.title,
          text: post.description || "Check out this AI prompt",
          url: url,
        });
        return;
      } catch {
        // Fall back to clipboard if share fails
      }
    }

    // Fallback: copy URL to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setIsShared(true);
      toast.success("Link copied to clipboard!");

      setTimeout(() => {
        setIsShared(false);
      }, 3000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const togglePreview = () => {
    if (isAnimating) return;

    setIsAnimating(true);
    setShowPreview(!showPreview);

    // Reset animation state after transition completes
    setTimeout(() => {
      setIsAnimating(false);
    }, 600);
  };

  const goBack = () => {
    // Check if there's a previous page in history
    if (window.history.length > 1) {
      router.back();
    } else {
      // If no history, go to home page
      router.push("/");
    }
  };

  // Handle video play/pause from button clicks
  const handleVideoPlay = (videoId: string) => {
    if (videoId === 'main' && !showVideo) {
      // First click on main video: load the video
      setShowVideo(true);
      setPlayingVideo(videoId);
      return;
    }

    const video = videoRefs.current[videoId];
    if (!video) {
      // Video not loaded yet, just mark as playing
      setPlayingVideo(videoId);
      return;
    }

    // Prevent rapid clicking during video state changes
    if (video.readyState < 2) {
      console.log("Video not ready for playback yet");
      return;
    }

    if (playingVideo === videoId) {
      video.pause();
      setPlayingVideo(null);
    } else {
      // Pause all other videos
      if (playingVideo) {
        const currentVideo = videoRefs.current[playingVideo];
        if (currentVideo && !currentVideo.paused) {
          currentVideo.pause();
        }
      }
      
      // Start playing this video
      video.play().catch(err => {
        console.error("Failed to play video:", err);
        // Don't change state if play failed
      });
      setPlayingVideo(videoId);
    }
  };

  // Handle video play event (from video element, not button)
  const handleVideoPlayEvent = (videoId: string) => {
    console.log(`Video started playing: ${videoId}`);
    // Just ensure state is in sync - don't toggle
    if (playingVideo !== videoId) {
      setPlayingVideo(videoId);
    }
  };

  // Handle video pause event (from video element, not button)
  const handleVideoPauseEvent = (videoId: string) => {
    console.log(`Video paused: ${videoId}`);
    // Clear playing state when video pauses
    if (playingVideo === videoId) {
      setPlayingVideo(null);
    }
  };

  const handleMainVideoLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    setVideoLoaded(true);
    
    // Auto-play if this video should be playing
    if (playingVideo === 'main') {
      const video = event.currentTarget as HTMLVideoElement;
      video.play();
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <Container>
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="p-1 h-auto"
          >
            <Home className="h-4 w-4" />
          </Button>
          <ChevronRight className="h-4 w-4" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/directory")}
            className="p-1 h-auto text-muted-foreground hover:text-foreground"
          >
            Directory
          </Button>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">
            {post.category.parent?.name || post.category.name}
          </span>
          {post.category.parent && (
            <>
              <ChevronRight className="h-4 w-4" />
              <span className="text-foreground font-medium">
                {post.category.name}
              </span>
            </>
          )}
        </nav>

        {/* Header with navigation */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            onClick={goBack}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {post.category.parent?.name || post.category.name}
            </Badge>
            {post.category.parent && (
              <Badge variant="outline" className="text-xs">
                {post.category.name}
              </Badge>
            )}
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-6">
          {/* Main content column */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-2xl md:text-3xl mb-2">
                      {post.title}
                    </CardTitle>
                    {post.description && (
                      <p className="text-muted-foreground text-lg">
                        {post.description}
                      </p>
                    )}
                  </div>
                  {post.isPremium && (
                    <Badge className="bg-gradient-to-r from-teal-500 to-sky-500 text-foreground">
                      {userType === "PREMIUM" ? (
                        <UnlockIcon className="w-4 h-4 mr-1" />
                      ) : (
                        <LockIcon className="w-4 h-4 mr-1" />
                      )}
                      Premium
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={copyToClipboard}
                    variant="default"
                    className="flex items-center gap-2"
                    disabled={!post.content}
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy Prompt
                      </>
                    )}
                  </Button>

                  <FavoriteButton
                    postId={post.id}
                    initialFavorited={post.isFavorited}
                    variant="outline"
                  />

                  <BookmarkButton
                    postId={post.id}
                    initialBookmarked={post.isBookmarked}
                    variant="outline"
                  />

                  {/* Toggle Preview Button */}
                  {post.uploadPath && (
                    <Button
                      onClick={togglePreview}
                      variant="outline"
                      className="flex items-center gap-2"
                      disabled={isAnimating}
                    >
                      {showPreview ? (
                        <>
                          <FileText className="h-4 w-4" />
                          Show Prompt
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Show Preview
                        </>
                      )}
                    </Button>
                  )}

                  <Button
                    onClick={sharePost}
                    variant="outline"
                    className="flex items-center gap-2 ml-auto"
                  >
                    {isShared ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4" />
                        Share
                      </>
                    )}
                  </Button>
                </div>

                {/* Content container with smooth transitions */}
                <div className="bg-muted/30 rounded-lg border overflow-hidden">
                  <div className="px-8 flex items-center justify-between py-4">
                    <h3 className="text-lg font-semibold">
                      {showPreview ? "Preview:" : "Prompt:"}
                    </h3>
                    {!showPreview && (
                      <Badge variant="secondary" className="text-xs">
                        {post.content?.length || 0} characters
                      </Badge>
                    )}
                  </div>

                  <div className="relative h-96">
                    {/* Prompt content */}
                    <div
                      className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                        showPreview
                          ? "opacity-0 translate-y-4 pointer-events-none"
                          : "opacity-100 translate-y-0"
                      }`}
                    >
                      <div className="h-full overflow-y-auto">
                        <div className="px-8 pb-6">
                          <div className="whitespace-pre-wrap text-sm leading-relaxed break-words bg-card/20">
                            {post.content ||
                              "No content available for this prompt."}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Preview content */}
                    <div
                      className={`absolute inset-0 transition-all duration-500 ease-in-out ${
                        showPreview
                          ? "opacity-100 translate-y-0"
                          : "opacity-0 -translate-y-4 pointer-events-none"
                      }`}
                    >
                      <div className="h-full overflow-y-auto">
                        <div className="px-8 pb-6">
                          {post.uploadPath && post.uploadFileType === "VIDEO" ? (
                            <div className="relative w-full rounded-lg overflow-hidden">
                              {/* Show thumbnail with play button when video is not loaded */}
                              {!showVideo && videoPreviewPath && (
                                <MediaImage
                                  src={videoPreviewPath}
                                  alt={post.title}
                                  width={800}
                                  height={400}
                                  className="w-full h-auto max-h-80 object-contain"
                                  priority
                                  blurDataURL={post.blurData || undefined}
                                />
                              )}
                              
                              {/* Show video when user clicks play */}
                              {showVideo && (
                                <MediaVideo
                                  ref={(el) => {
                                    if (el) videoRefs.current['main'] = el;
                                  }}
                                  src={post.previewVideoPath || ""}
                                  previewSrc={post.previewPath || undefined}
                                  previewVideoSrc={post.previewVideoPath || undefined}
                                  controls
                                  className="w-full h-auto max-h-80 object-contain"
                                  preload="metadata"
                                  autoPlay={playingVideo === 'main'} // Auto-play if this video should be playing
                                  onLoadedMetadata={handleMainVideoLoadedMetadata}
                                  onPlay={() => handleVideoPlayEvent('main')}
                                  onPause={() => handleVideoPauseEvent('main')}
                                  usePreviewVideo={true}
                                  fallbackToOriginal={false}
                                />
                              )}

                              {/* Loading indicator when video is being loaded */}
                              {showVideo && !videoLoaded && (
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
                                  <div className="bg-white rounded-full p-3">
                                    <div className="w-6 h-6 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                                  </div>
                                </div>
                              )}

                              {/* Video controls overlay - always visible on top left */}
                              <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
                                {/* Play/Pause button */}
                                <button
                                  className="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-colors"
                                  onClick={() => handleVideoPlay('main')}
                                >
                                  {playingVideo === 'main' ? (
                                    <Pause className="w-6 h-6" />
                                  ) : (
                                    <Play className="w-6 h-6" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : post.uploadPath && post.uploadFileType === "IMAGE" ? (
                            <div className="relative w-full rounded-lg overflow-hidden">
                              <MediaImage
                                src={post.previewPath || post.uploadPath}
                                alt={post.title}
                                width={800}
                                height={400}
                                className="w-full h-auto max-h-80 object-contain"
                                priority
                                blurDataURL={post.blurData || undefined}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-32 text-muted-foreground">
                              <p className="text-sm">No preview available</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {post.tags.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Tags:
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <Badge key={tag.id} variant="outline">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-3">
                      {post.author && <span>By {post.author.name}</span>}
                      <span className="text-muted-foreground/20">|</span>
                      <Clock className="h-4 w-4" />
                      {new Date(post.createdAt).toLocaleDateString()}
                    </div>

                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Related posts sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="text-lg">Related Prompts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {relatedPosts.length > 0 ? (
                  relatedPosts.map((relatedPost) => (
                    <div
                      key={relatedPost.id}
                      className="group cursor-pointer border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                      onClick={() => router.push(`/entry/${relatedPost.id}`)}
                    >
                      <div className="flex items-start gap-3">
                                                  {relatedPost.uploadPath && (
                          <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0 relative">
                            {relatedPost.uploadPath && relatedPost.uploadFileType === "VIDEO" ? (
                              <>
                                <MediaVideo
                                  ref={(el) => {
                                    if (el)
                                      videoRefs.current[
                                        `related-${relatedPost.id}`
                                      ] = el;
                                  }}
                                  src={relatedPost.previewVideoPath || ""}
                                  previewSrc={relatedPost.previewPath || undefined}
                                  previewVideoSrc={relatedPost.previewVideoPath || undefined}
                                  className="w-full h-full object-cover"
                                  preload="metadata"
                                  muted
                                  autoPlay={playingVideo === `related-${relatedPost.id}`} // Auto-play if this video should be playing
                                  onPlay={() =>
                                    handleVideoPlayEvent(`related-${relatedPost.id}`)
                                  }
                                  onPause={() =>
                                    handleVideoPauseEvent(`related-${relatedPost.id}`)
                                  }
                                  usePreviewVideo={true}
                                  fallbackToOriginal={false}
                                />
                                {/* Video controls overlay - always visible on top left */}
                                <div className="absolute top-1 left-1 flex items-center gap-1 z-10">
                                  <button
                                    className="bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors pointer-events-auto"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleVideoPlay(`related-${relatedPost.id}`);
                                    }}
                                  >
                                    {playingVideo ===
                                    `related-${relatedPost.id}` ? (
                                      <Pause className="h-2 w-2 text-white" />
                                    ) : (
                                      <Play className="h-2 w-2 text-white" />
                                    )}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <MediaImage
                                src={relatedPost.previewPath || relatedPost.uploadPath!}
                                alt={relatedPost.title}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                            {relatedPost.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {relatedPost.category.parent?.name ||
                                relatedPost.category.name}
                            </Badge>

                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">No related prompts found</p>
                  </div>
                )}
                {/* Related actions */}
                <div className="text-left">
                  <Button
                    onClick={() => router.push("/")}
                    variant="outline"
                    size="lg"
                  >
                    Discover More Prompts
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}