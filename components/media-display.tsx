"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";

// Batched media resolver to reduce API calls
class BatchedMediaResolver {
  private static instance: BatchedMediaResolver;
  private pendingPaths: Set<string> = new Set();
  private resolvedUrls: Map<string, string> = new Map();
  private pendingCallbacks: Map<string, Array<(url: string) => void>> =
    new Map();
  private isProcessing = false;
  private batchTimeout: NodeJS.Timeout | null = null;

  static getInstance(): BatchedMediaResolver {
    if (!BatchedMediaResolver.instance) {
      BatchedMediaResolver.instance = new BatchedMediaResolver();
    }
    return BatchedMediaResolver.instance;
  }

  /**
   * Clear all cached URLs - useful when storage configuration changes
   */
  clearCache(): void {
    console.log(
      "🗑️  Clearing BatchedMediaResolver cache due to storage change"
    );
    this.resolvedUrls.clear();
    this.pendingPaths.clear();
    this.pendingCallbacks.clear();
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  /**
   * Static method to clear cache globally
   */
  static clearCache(): void {
    if (BatchedMediaResolver.instance) {
      BatchedMediaResolver.instance.clearCache();
    }
  }

  async resolveMediaUrl(path: string): Promise<string> {
    // If already resolved, return immediately
    if (this.resolvedUrls.has(path)) {
      return this.resolvedUrls.get(path)!;
    }

    // If it's already a full URL, return it as-is
    if (
      path.startsWith("http://") ||
      path.startsWith("https://") ||
      path.startsWith("blob:")
    ) {
      return path;
    }

    // Add to pending paths and set up callback
    this.pendingPaths.add(path);

    return new Promise((resolve) => {
      if (!this.pendingCallbacks.has(path)) {
        this.pendingCallbacks.set(path, []);
      }
      this.pendingCallbacks.get(path)!.push(resolve);

      // Schedule batch processing
      this.scheduleBatchProcessing();
    });
  }

  private scheduleBatchProcessing() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, 100); // Increased to 100ms debounce to collect more requests
  }

  private async processBatch() {
    if (this.isProcessing || this.pendingPaths.size === 0) {
      return;
    }

    this.isProcessing = true;
    const pathsToResolve = Array.from(this.pendingPaths);
    this.pendingPaths.clear();

    // console.log("🔄 BatchedMediaResolver: Processing paths:", pathsToResolve);

    try {
      const response = await fetch("/api/media/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paths: pathsToResolve }),
      });

      // console.log(
      //   "📡 BatchedMediaResolver: API response status:",
      //   response.status
      // );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const resolvedUrls = data.urls || [];

      // console.log("✅ BatchedMediaResolver: Resolved URLs:", {
      //   paths: pathsToResolve,
      //   resolvedUrls,
      //   singleUrl: data.url,
      // });

      // Handle single URL response
      if (pathsToResolve.length === 1 && data.url) {
        const resolvedUrl = data.url;
        this.resolvedUrls.set(pathsToResolve[0], resolvedUrl);
        const callbacks = this.pendingCallbacks.get(pathsToResolve[0]) || [];
        callbacks.forEach((callback) => callback(resolvedUrl));
        this.pendingCallbacks.delete(pathsToResolve[0]);
        return;
      }

      // Store resolved URLs and trigger callbacks
      pathsToResolve.forEach((path, index) => {
        const resolvedUrl = resolvedUrls[index] || path;
        this.resolvedUrls.set(path, resolvedUrl);

        // Trigger all callbacks for this path
        const callbacks = this.pendingCallbacks.get(path) || [];
        callbacks.forEach((callback) => callback(resolvedUrl));
        this.pendingCallbacks.delete(path);
      });
    } catch (error) {
      console.error(
        "❌ BatchedMediaResolver: Error resolving media URLs:",
        error
      );

      // Check if it's a rate limit error and implement exponential backoff
      if (error instanceof Error && error.message.includes("429")) {
        // console.warn(
        //   "🔄 BatchedMediaResolver: Rate limited, will retry with exponential backoff"
        // );
        // Re-add paths to pending for retry with exponential backoff
        pathsToResolve.forEach((path) => {
          this.pendingPaths.add(path);
        });

        // Schedule retry with exponential backoff
        setTimeout(() => {
          this.scheduleBatchProcessing();
        }, 2000); // 2 second delay for rate limit retry
      } else {
        // On other errors, resolve with original paths
        pathsToResolve.forEach((path) => {
          // console.warn(
          //   `⚠️ BatchedMediaResolver: Falling back to original path: ${path}`
          // );
          this.resolvedUrls.set(path, path);
          const callbacks = this.pendingCallbacks.get(path) || [];
          callbacks.forEach((callback) => callback(path));
          this.pendingCallbacks.delete(path);
        });
      }
    } finally {
      this.isProcessing = false;

      // Process any new pending paths that accumulated during processing
      if (this.pendingPaths.size > 0) {
        this.scheduleBatchProcessing();
      }
    }
  }
}

// Legacy function for backward compatibility (now uses batched resolver)
async function resolveMediaUrl(path: string): Promise<string> {
  return BatchedMediaResolver.getInstance().resolveMediaUrl(path);
}

// Export cache clearing function for use when storage configuration changes
export function clearMediaUrlCache(): void {
  BatchedMediaResolver.clearCache();
}

interface MediaImageProps {
  src: string; // Relative path like "images/user123-prompt-abc123.avif" or "preview/preview-user123-prompt-abc123.avif"
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
  loading?: "lazy" | "eager";
  sizes?: string;
  priority?: boolean;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  blurDataURL?: string;
}

interface MediaVideoProps {
  src: string; // Video path like "videos/user123-video-xyz789.mp4"
  previewSrc?: string; // Preview image path like "preview/user123abc123456789.webp"
  previewVideoSrc?: string; // Preview video path like "preview/user123abc123456789.mp4"
  alt?: string; // For accessibility
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: "none" | "metadata" | "auto";
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  loading?: "lazy" | "eager";
  priority?: boolean;
  blurDataURL?: string; // For video thumbnail blur placeholder
  onLoadedMetadata?: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onPreviewLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  // Video loading strategy
  usePreviewVideo?: boolean; // Use compressed video for initial playback
  fallbackToOriginal?: boolean; // Fallback to original if preview fails
}

/**
 * MediaImage - Automatically resolves relative paths to full URLs with preview priority
 * Usage: <MediaImage src="images/user123-prompt-abc123.avif" alt="Prompt" />
 *        <MediaImage src="preview/user123abc123456789.webp" alt="Preview" />
 */
export function MediaImage({
  src,
  alt,
  width,
  height,
  fill = false,
  className,
  loading = "lazy",
  sizes,
  priority = false,
  onLoad,
  blurDataURL,
}: MediaImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (!src) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }

    // If src is already a full URL or a blob URL, use it directly
    if (
      src.startsWith("http://") ||
      src.startsWith("https://") ||
      src.startsWith("blob:")
    ) {
      setResolvedUrl(src);
      setIsLoading(false);
      return;
    }

    // Resolve relative path to full URL for all media (including preview paths)
    resolveMediaUrl(src)
      .then((url: string) => {
        // Validate the resolved URL before setting it
        if (url && url.trim() !== "") {
          setResolvedUrl(url);
        } else {
          setError("Invalid resolved URL");
        }
        setIsLoading(false);
      })
      .catch((err: Error) => {
        console.error("Error resolving image URL:", err);
        setError("Failed to load image");
        setIsLoading(false);
      });
  }, [src]);

  if (error) {
    return (
      <div
        className={`bg-muted border-2 border-dashed border-muted-foreground/25 ${className}`}
        style={{ width, height }}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          {error}
        </div>
      </div>
    );
  }

  // Loading state - always show blur image if available, otherwise show loading placeholder
  if (isLoading) {
    // When using fill, ensure proper container styling during loading
    const loadingContainerStyle = fill
      ? {
          width: width || "100%",
          height: height || "100%",
          minHeight: height || "200px",
          position: "relative" as const,
        }
      : { width, height };

    const loadingContainerClassName = fill
      ? `relative overflow-hidden ${className || ""}` +
        (!height && !className?.includes("h-") ? " min-h-[200px]" : "")
      : `relative overflow-hidden ${className || ""}`;

    if (blurDataURL) {
      return (
        <div
          className={loadingContainerClassName}
          style={loadingContainerStyle}
        >
          <Image
            src={blurDataURL}
            alt={alt}
            width={!fill ? width : undefined}
            height={!fill ? height : undefined}
            fill={fill}
            className="object-cover"
            placeholder="blur"
            blurDataURL={blurDataURL}
            loading="eager"
            priority={true}
          />
          {/* Subtle loading indicator overlay */}
          <div className="absolute inset-0 bg-background/10 animate-pulse" />
        </div>
      );
    } else {
      // Fallback loading state when no blur data available
      return (
        <div
          className={`bg-muted animate-pulse ${loadingContainerClassName}`}
          style={loadingContainerStyle}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading...
          </div>
        </div>
      );
    }
  }

  if (!resolvedUrl || resolvedUrl.trim() === "") {
    return (
      <div
        className={`bg-muted border-2 border-dashed border-muted-foreground/25 ${className}`}
        style={{ width, height }}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Image not available
        </div>
      </div>
    );
  }

  // Additional validation to ensure we have a valid URL format
  let validUrl: string;
  try {
    // For blob URLs, relative URLs, and absolute URLs, validate differently
    if (
      resolvedUrl.startsWith("blob:") ||
      resolvedUrl.startsWith("http://") ||
      resolvedUrl.startsWith("https://")
    ) {
      // Test if it's a valid URL
      new URL(resolvedUrl);
      validUrl = resolvedUrl;
    } else if (resolvedUrl.startsWith("/")) {
      // Relative URL starting with /
      validUrl = resolvedUrl;
    } else {
      // Fallback for other relative paths
      validUrl = `/${resolvedUrl}`;
    }

    // Debug logging to understand URL resolution
    // console.log('MediaImage URL resolution:', {
    //   originalSrc: src,
    //   resolvedUrl,
    //   validUrl,
    //   timestamp: new Date().toISOString()
    // });
  } catch (error) {
    console.error("MediaImage URL parsing error:", {
      originalSrc: src,
      resolvedUrl,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    // If URL parsing fails, show error state
    return (
      <div
        className={`bg-muted border-2 border-dashed border-muted-foreground/25 ${className}`}
        style={{ width, height }}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Invalid image URL
        </div>
      </div>
    );
  }

  // Enhanced image loading with proper blur-to-sharp transition
  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    setImageLoaded(true);
    onLoad?.(event);
  };

  // When using fill, ensure the container has proper styling and minimum dimensions
  const containerStyle = fill
    ? {
        width: width || "100%",
        height: height || "100%",
        minHeight: height || "200px", // Ensure minimum height when using fill
        position: "relative" as const,
      }
    : { width, height };

  const containerClassName = fill
    ? `relative overflow-hidden ${className || ""}` +
      // Add min-height class if no explicit height is provided
      (!height && !className?.includes("h-") ? " min-h-[200px]" : "")
    : `relative overflow-hidden ${className || ""}`;

  return (
    <div className={containerClassName} style={containerStyle}>
      {/* Blur placeholder that stays visible until the sharp image loads */}
      {blurDataURL && !imageLoaded && (
        <Image
          src={blurDataURL}
          alt={alt}
          width={!fill ? width : undefined}
          height={!fill ? height : undefined}
          fill={fill}
          className={`absolute inset-0 object-cover transition-opacity duration-300 ${
            imageLoaded ? "opacity-0" : "opacity-100"
          }`}
          placeholder="blur"
          blurDataURL={blurDataURL}
          loading="eager"
          priority={true}
          unoptimized={true}
        />
      )}

      {/* Main image with smooth fade-in */}
      <Image
        src={validUrl}
        alt={alt}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        fill={fill}
        className={`object-cover transition-opacity duration-300 ${
          imageLoaded ? "opacity-100" : "opacity-0"
        }`}
        loading={priority ? "eager" : loading}
        sizes={sizes}
        priority={priority}
        onLoad={handleImageLoad}
        placeholder="empty"
        blurDataURL={undefined}
        unoptimized={
          validUrl.startsWith("/uploads") || validUrl.startsWith("/preview")
        }
      />
    </div>
  );
}

/**
 * MediaVideo - Automatically resolves relative paths to full URLs with preview support
 * Usage: <MediaVideo src="videos/user123-video-xyz789.mp4" previewVideoSrc="preview/user123abc123456789.mp4" controls />
 */
export const MediaVideo = React.forwardRef<HTMLVideoElement, MediaVideoProps>(
  function MediaVideo(
    {
      src,
      previewSrc,
      previewVideoSrc,
      alt,
      className,
      controls = false,
      autoPlay = false,
      loop = false,
      muted = false,
      playsInline = false,
      preload = "metadata",
      fill = false,
      width,
      height,
      blurDataURL,
      onLoadedMetadata,
      onPlay,
      onPause,
      onEnded,
      onPreviewLoad,
      usePreviewVideo = false,
      fallbackToOriginal = false,
    },
    ref
  ) {
    const [currentVideoSrc, setCurrentVideoSrc] = useState<string>("");
    const [isUsingPreview, setIsUsingPreview] = useState(false);
    const [resolvedUrl, setResolvedUrl] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showPreviewImage, setShowPreviewImage] = useState(true);
    const [videoLoaded, setVideoLoaded] = useState(false);
    const [isPlayPending, setIsPlayPending] = useState(false); // Track pending play operations

    // Determine which video source to use
    useEffect(() => {
      console.log(`MediaVideo source determination for post:`, {
        src,
        previewVideoSrc,
        usePreviewVideo,
        hasPreviewVideo: !!previewVideoSrc,
        willUsePreview: usePreviewVideo && !!previewVideoSrc,
      });

      // Priority order: previewVideoSrc → src (only if src is not empty)
      if (usePreviewVideo && previewVideoSrc) {
        console.log(`✅ Using preview video: ${previewVideoSrc}`);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentVideoSrc(previewVideoSrc);
         
        setIsUsingPreview(true);
      } else if (src && src.trim() !== "") {
        console.log(
          `❌ Using original video: ${src} (usePreviewVideo: ${usePreviewVideo}, hasPreviewVideo: ${!!previewVideoSrc})`
        );
         
        setCurrentVideoSrc(src);
         
        setIsUsingPreview(false);
      } else {
        console.log(`❌ No video source available`);
         
        setCurrentVideoSrc("");
         
        setIsUsingPreview(false);
      }
    }, [src, previewVideoSrc, usePreviewVideo]);

    // Resolve video URL
    useEffect(() => {
      console.log(`Resolving video URL for: ${currentVideoSrc}`);

      if (!currentVideoSrc) {
        console.log(`No currentVideoSrc, setting loading to false`);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(false);
        return;
      }

      // If src is already a full URL or a blob URL, use it directly
      if (
        currentVideoSrc.startsWith("http://") ||
        currentVideoSrc.startsWith("https://") ||
        currentVideoSrc.startsWith("blob:")
      ) {
        console.log(`Using direct URL: ${currentVideoSrc}`);
        setResolvedUrl(currentVideoSrc);
        setIsLoading(false);
        return;
      }

      // Resolve relative path to full URL for all media (including preview paths)
      console.log(`Resolving relative path: ${currentVideoSrc}`);
      resolveMediaUrl(currentVideoSrc)
        .then((url: string) => {
          console.log(`Resolved URL: ${url}`);
          if (url && url.trim() !== "") {
            setResolvedUrl(url);
          } else {
            setError("Invalid resolved URL");
          }
          setIsLoading(false);
        })
        .catch((err: Error) => {
          console.error("Error resolving video URL:", err);
          setError("Failed to load video");
          setIsLoading(false);
        });
    }, [currentVideoSrc, usePreviewVideo, previewVideoSrc]);

    // Handle video error - fallback to original or show preview image
    const handleVideoError = () => {
      console.error("Video failed to load:", resolvedUrl);
      setIsPlayPending(false); // Clear pending state on error

      if (isUsingPreview && fallbackToOriginal && src !== currentVideoSrc) {
        console.log("Preview video failed, falling back to original");
        setCurrentVideoSrc(src);
        setIsUsingPreview(false);
        setError(null);
        setIsLoading(true);
      } else {
        console.log("Video failed to load, keeping preview image visible");
        setError("Video not available");
        setShowPreviewImage(true); // Keep preview image visible
        setVideoLoaded(false);
      }
    };

    // Handle video loaded metadata
    const handleVideoLoadedMetadata = (
      event: React.SyntheticEvent<HTMLVideoElement>
    ) => {
      console.log("Video loaded successfully:", resolvedUrl);
      const video = event.currentTarget as HTMLVideoElement;

      setVideoLoaded(true);
      setError(null); // Clear any previous errors

      // Auto-play if this video should be playing (when user clicked play before video was loaded)
      if (autoPlay && !isPlayPending) {
        console.log("Auto-playing video due to autoPlay prop");
        setIsPlayPending(true);
        video
          .play()
          .then(() => {
            console.log("Auto-play succeeded");
            setIsPlayPending(false);
            setShowPreviewImage(false);
          })
          .catch((err) => {
            console.error("Auto-play failed:", err);
            setIsPlayPending(false);
            // Don't set error for autoplay failure, just show preview image with play button
            setShowPreviewImage(true);
            console.log(
              "Auto-play blocked by browser - user needs to click play"
            );
          });
      } else {
        // If not auto-playing, keep preview image visible
        setShowPreviewImage(true);
      }

      onLoadedMetadata?.(event);
    };

    // Handle video play event
    const handleVideoPlay = () => {
      console.log("Video started playing:", resolvedUrl);
      setShowPreviewImage(false); // Hide preview image when video starts playing
      setIsPlayPending(false); // Clear pending state when video actually starts playing
      onPlay?.();
    };

    // Handle video pause event
    const handleVideoPause = () => {
      console.log("Video paused:", resolvedUrl);
      setIsPlayPending(false); // Clear pending state when video is paused
      // Don't show preview image on pause, keep video visible
      onPause?.();
    };

    // Handle preview image load
    const handlePreviewImageLoad = (
      event: React.SyntheticEvent<HTMLImageElement>
    ) => {
      onPreviewLoad?.(event);
    };

    if (isLoading) {
      return (
        <div className={`bg-muted animate-pulse ${className}`}>
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading video...
          </div>
        </div>
      );
    }

    if (error && !previewSrc) {
      return (
        <div
          className={`bg-muted border-2 border-dashed border-muted-foreground/25 ${className}`}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {error}
          </div>
        </div>
      );
    }

    if (!resolvedUrl && !previewSrc) {
      return (
        <div
          className={`bg-muted border-2 border-dashed border-muted-foreground/25 ${className}`}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Video not available
          </div>
        </div>
      );
    }

    // Container styling for fill mode
    const containerStyle = fill
      ? {
          width: width || "100%",
          height: height || "100%",
          minHeight: height || "200px",
          position: "relative" as const,
        }
      : { width, height };

    const containerClassName = fill
      ? `relative overflow-hidden ${className || ""}` +
        (!height && !className?.includes("h-") ? " min-h-[200px]" : "")
      : `relative overflow-hidden ${className || ""}`;

    return (
      <div className={containerClassName} style={containerStyle}>
        {/* Preview image overlay */}
        {previewSrc && showPreviewImage && (
          <MediaImage
            src={previewSrc}
            alt={alt || "Video preview"}
            fill={fill}
            width={!fill ? width : undefined}
            height={!fill ? height : undefined}
            className={`absolute inset-0 object-cover transition-opacity duration-300 ${
              videoLoaded ? "opacity-0" : "opacity-100"
            }`}
            loading="eager"
            priority={true}
            blurDataURL={blurDataURL}
            sizes={
              fill
                ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                : undefined
            }
            onLoad={handlePreviewImageLoad}
          />
        )}

        {/* Error indicator overlay when video fails but preview is available */}
        {error && previewSrc && showPreviewImage && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="bg-red-500/90 text-white px-2 py-1 rounded text-xs">
              {error}
            </div>
          </div>
        )}

        {/* Video element - only render if we have a resolved URL */}
        {resolvedUrl && (
          <video
            ref={ref}
            src={resolvedUrl}
            className={`${fill ? "absolute inset-0 w-full h-full" : ""} ${className || ""}`}
            controls={controls}
            autoPlay={autoPlay}
            loop={loop}
            muted={muted}
            playsInline={playsInline}
            preload={preload}
            onLoadedMetadata={handleVideoLoadedMetadata}
            onPlay={handleVideoPlay}
            onPause={handleVideoPause}
            onEnded={onEnded}
            onError={handleVideoError}
          >
            Your browser does not support the video tag.
          </video>
        )}
      </div>
    );
  }
);
