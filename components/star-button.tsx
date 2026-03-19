"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { IconStar } from "@/components/ui/icons";
import { toggleStarAction } from "@/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StarButtonProps {
  postId: string;
  initialStarred?: boolean;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showLabel?: boolean;
}

export function StarButton({
  postId,
  initialStarred = false,
  variant = "ghost",
  size = "sm",
  className,
  showLabel = false,
}: StarButtonProps) {
  const [isStarred, setIsStarred] = useState(Boolean(initialStarred));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsStarred(Boolean(initialStarred));
  }, [initialStarred]);

  const handleToggle = async () => {
    const previousState = isStarred;
    setIsStarred(!isStarred);

    startTransition(async () => {
      try {
        const result = await toggleStarAction({ postId });

        if (result.success) {
          setIsStarred(result.starred ?? false);
          toast.success(result.starred ? "Post starred" : "Post unstarred");
        } else {
          setIsStarred(previousState);
          toast.error(result.error || "Failed to update star");
        }
      } catch (error) {
        setIsStarred(previousState);
        console.error("Star toggle error:", error);
        toast.error("Failed to update star");
      }
    });
  };

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    handleToggle();
  };

  return (
    <Button
      className={cn(
        "transition-colors duration-300",
        isStarred &&
          "text-yellow-500 dark:text-yellow-400 hover:text-yellow-400 dark:hover:text-yellow-300 transition-colors duration-300",
        className
      )}
      aria-label={isStarred ? "Unstar post" : "Star post"}
      variant={variant}
      size={size}
      onClick={handleClick}
      onTouchStart={handleClick}
      onTouchEnd={(e) => e.stopPropagation()}
      disabled={isPending}
    >
      <IconStar className={cn("h-4 w-4", isStarred && "fill-current")} />
      {showLabel && (isStarred ? "Unstar" : "Star")}
    </Button>
  );
}
