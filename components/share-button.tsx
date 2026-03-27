"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";

export interface ShareButtonProps extends ButtonProps {
  title: string;
  text?: string;
  url?: string;
}

export function ShareButton({ title, text, url, className, variant = "outline", ...props }: ShareButtonProps) {
  const [isShared, setIsShared] = useState(false);

  const shareItem = async () => {
    const shareUrl = url || window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: text || `Check out ${title}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard if share fails
      }
    }

    // Fallback: copy URL to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsShared(true);
      toast.success("Link copied to clipboard!");

      setTimeout(() => {
        setIsShared(false);
      }, 3000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <Button
      onClick={shareItem}
      variant={variant}
      className={className}
      {...props}
    >
      {isShared ? (
        <>
          <Check className="h-4 w-4 mr-2" />
          Copied!
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </>
      )}
    </Button>
  );
}
