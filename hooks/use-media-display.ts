import { useState, useEffect } from "react";

// Import dynamic media URL resolution
async function resolveMediaUrl(path: string): Promise<string> {
  if (!path) return "";

  // If it's already a full URL, return it as-is
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) {
    return path;
  }

  try {
    const response = await fetch("/api/media/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [path] }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.url || path;
  } catch (error) {
    console.error("Error resolving media URL:", error);
    return path;
  }
}

interface MediaDisplayOptions {
  preferPreview?: boolean;
  fallbackToOriginal?: boolean;
}

interface MediaDisplayResult {
  displayUrl: string;
  isPreview: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for handling media display with preview path prioritization
 * @param originalPath - Original media path (e.g., "images/file.jpg")
 * @param previewPath - Preview path (e.g., "preview/file.webp")
 * @param options - Display options
 * @returns MediaDisplayResult with resolved URL and metadata
 */
export function useMediaDisplay(
  originalPath: string | null | undefined,
  previewPath: string | null | undefined,
  options: MediaDisplayOptions = {}
): MediaDisplayResult {
  const { preferPreview = true, fallbackToOriginal = false } = options;
  const [displayUrl, setDisplayUrl] = useState<string>("");
  const [isPreview, setIsPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!previewPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayUrl("");
      setIsLoading(false);
      setError("No preview path available");
      return;
    }

    // Always use preview path if available
    const pathToUse = previewPath;
    const shouldUsePreview = true;

    // If it's already a full URL, use it directly
    if (
      pathToUse.startsWith("http://") ||
      pathToUse.startsWith("https://") ||
      pathToUse.startsWith("blob:")
    ) {
      setDisplayUrl(pathToUse);
      setIsPreview(shouldUsePreview);
      setIsLoading(false);
      setError(null);
      return;
    }

    // For all media paths (including previews), use dynamic resolution
    // This will resolve based on current storage configuration
    setIsLoading(true);
    setError(null);
    
    resolveMediaUrl(pathToUse)
      .then((resolvedUrl) => {
        setDisplayUrl(resolvedUrl);
        setIsPreview(shouldUsePreview);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error resolving media URL in hook:", error);
        setDisplayUrl(pathToUse); // Fallback to original path
        setIsPreview(shouldUsePreview);
        setIsLoading(false);
        setError("Failed to resolve media URL");
      });
  }, [previewPath, preferPreview, fallbackToOriginal]);

  return {
    displayUrl,
    isPreview,
    isLoading,
    error,
  };
}

/**
 * Hook for image-specific media display
 */
export function useImageDisplay(
  originalPath: string | null | undefined,
  previewPath: string | null | undefined,
  options: MediaDisplayOptions = {}
): MediaDisplayResult {
  return useMediaDisplay(originalPath, previewPath, options);
}

/**
 * Hook for video-specific media display with preview video support
 */
export function useVideoDisplay(
  originalPath: string | null | undefined,
  previewPath: string | null | undefined,
  previewVideoPath: string | null | undefined,
  options: MediaDisplayOptions & {
    usePreviewVideo?: boolean;
  } = {}
): MediaDisplayResult & {
  previewVideoUrl: string | null;
} {
  const { usePreviewVideo = true, ...mediaOptions } = options;
  
  // For videos, use preview video for playback if available
  const videoPath = usePreviewVideo && previewVideoPath ? previewVideoPath : previewPath;
  
  const result = useMediaDisplay(originalPath, videoPath, mediaOptions);
  
  // For preview video URL, we'll need to resolve it dynamically too
  // For now, we'll return the relative path and let the component handle resolution
  return {
    ...result,
    previewVideoUrl: previewVideoPath || null,
  };
} 