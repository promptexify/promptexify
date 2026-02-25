"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Share } from "@/components/ui/icons";
import { PostWithInteractions } from "@/lib/content";
import { BookmarkButton } from "@/components/bookmark-button";
import { FavoriteButton } from "@/components/favorite-button";
import { PremiumUpgradeModal } from "@/components/premium-upgrade-modal";

interface PostModalProps {
  post: PostWithInteractions;
  userType?: "FREE" | "PREMIUM" | null;
  onClose?: () => void;
}

export function PostModal({ post, userType, onClose }: PostModalProps) {
  // Check if user should see premium upgrade modal
  const shouldShowUpgradeModal =
    post.isPremium && (userType === "FREE" || userType === null);

  // If user is free and content is premium, show upgrade modal
  if (shouldShowUpgradeModal) {
    return <PremiumUpgradeModal post={post} onClose={onClose} />;
  }

  // Otherwise, render the full content modal
  return <PostContentModal post={post} onClose={onClose} />;
}

// Separate component for the actual post modal content to avoid hooks issues
function PostContentModal({
  post,
  onClose,
}: {
  post: PostWithInteractions;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [isCopied, setIsCopied] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);


  // Use bookmark/favorite status directly from post data
  // (merged into /api/posts/[id] response — no separate /status call needed)
  const [bookmarkStatus, setBookmarkStatus] = useState({
    isBookmarked: post.isBookmarked ?? false,
    isFavorited: post.isFavorited ?? false,
    isLoading: false,
  });

  // Keep status in sync if post prop updates (e.g., after toggle actions)
  useEffect(() => {
    setBookmarkStatus({
      isBookmarked: post.isBookmarked ?? false,
      isFavorited: post.isFavorited ?? false,
      isLoading: false,
    });
  }, [post.isBookmarked, post.isFavorited]);

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

  const copyPostLink = async () => {
    try {
      // Generate the post URL using the current origin and post ID
      const postUrl = `${window.location.origin}/entry/${post.id}`;

      await navigator.clipboard.writeText(postUrl);
      setIsLinkCopied(true);
      toast.success("Sharable link copied.");

      // Reset after 10 seconds
      setTimeout(() => {
        setIsLinkCopied(false);
      }, 10000);
    } catch {
      // Fallback for older browsers or when clipboard API is not available
      const postUrl = `${window.location.origin}/entry/${post.id}`;
      const textArea = document.createElement("textarea");
      textArea.value = postUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setIsLinkCopied(true);
      toast.success("Sharable link copied.");

      // Reset after 10 seconds
      setTimeout(() => {
        setIsLinkCopied(false);
      }, 10000);
    }
  };

  // Prevent body scroll and indicate modal state without DOM manipulation
  useEffect(() => {
    // Calculate scrollbar width to prevent layout shift
    const getScrollbarWidth = () => {
      const scrollDiv = document.createElement("div");
      scrollDiv.style.cssText =
        "width: 100px; height: 100px; overflow: scroll; position: absolute; top: -9999px;";
      document.body.appendChild(scrollDiv);
      const scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;
      document.body.removeChild(scrollDiv);
      return scrollbarWidth;
    };

    // Set scrollbar width CSS variable
    const scrollbarWidth = getScrollbarWidth();
    document.documentElement.style.setProperty(
      "--scrollbar-width",
      `${scrollbarWidth}px`
    );

    // Add body class to prevent scrolling and indicate modal state
    document.body.classList.add("modal-open");

    return () => {
      // Clean up body class and CSS variable
      document.body.classList.remove("modal-open");
      document.documentElement.style.removeProperty("--scrollbar-width");
    };
  }, []);


  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      // Use router.back() for clean navigation history
      router.back();
    }
  };

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-[calc(100%-2rem)] h-[80vh] flex flex-col p-0 gap-0 rounded-xl shadow-2xl sm:max-w-lg lg:max-w-2xl md:max-h-[90vh] lg:max-h-[95vh]">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-lg line-clamp-1 font-bold text-left text-zinc-700 dark:text-zinc-300 mb-2 pr-15">
            <a
              href={`/entry/${post.id}`}
              className="text-zinc-700 dark:text-zinc-300 hover:underline cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {post.title}
            </a>
          </DialogTitle>
          {/* Tags Row - Expandable tags */}
          {post.tags.length > 0 && (
            <div className="flex items-top justify-between gap-2">
              {/* Tags */}
              <div className="flex items-center gap-1 flex-wrap">
                {(showAllTags ? post.tags : post.tags.slice(0, 2)).map(
                  (tag) => (
                    <Badge key={tag.id} variant="outline" className="text-xs">
                      {tag.name}
                    </Badge>
                  )
                )}
                {post.tags.length > 2 && (
                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => setShowAllTags(!showAllTags)}
                  >
                    {showAllTags
                      ? "Show less"
                      : `+${post.tags.length - 2} more`}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 p-4 gap-4">
          {/* Prompt Content - Scrollable Container */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="bg-muted/30 rounded-lg border flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between px-6 py-4 rounded-t-lg shrink-0">
                <h3 className="text-sm font-medium">Prompt:</h3>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={copyToClipboard}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 cursor-pointer"
                    disabled={!post.content}
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </Button>
                  <FavoriteButton
                    postId={post.id}
                    initialFavorited={bookmarkStatus.isFavorited}
                    variant="outline"
                    size="sm"
                  />
                  <BookmarkButton
                    postId={post.id}
                    initialBookmarked={bookmarkStatus.isBookmarked}
                    variant="outline"
                    size="sm"
                  />
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <div className="h-full px-6 pb-6 overflow-y-auto">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
                    {post.content || "No content available for this prompt."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-top justify-between gap-2">
            {/* Tags */}
            <div className="flex items-center gap-1 flex-wrap">
              <DialogDescription className="text-xs text-muted-foreground pr-30">
                Added by {post.author.name}
                <br />
                Add this {post.category.name.toLowerCase()} prompt to bookmark
                for later use.
              </DialogDescription>
            </div>
            {/* Share Buttons */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyPostLink}>
                {isLinkCopied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Link copied
                  </>
                ) : (
                  <>
                    <Share className="h-3 w-3" />
                    Share
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
