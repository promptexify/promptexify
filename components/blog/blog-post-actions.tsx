"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Eye, Globe, EyeOff, Trash2, ExternalLink } from "lucide-react";
import { toggleBlogPublishAction, deleteBlogPostAction } from "@/actions";

interface BlogPostActionsProps {
  postId: string;
  slug: string;
  status: string;
}

export function BlogPostActions({ postId, slug, status }: BlogPostActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleTogglePublish() {
    startTransition(async () => {
      try {
        const result = await toggleBlogPublishAction(postId);
        toast.success(result.message);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete this article permanently?")) return;
    startTransition(async () => {
      try {
        await deleteBlogPostAction(postId);
        toast.success("Article deleted");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete article");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={isPending} className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/blog/admin/edit/${postId}`}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </DropdownMenuItem>
        {status === "PUBLISHED" && (
          <DropdownMenuItem asChild>
            <Link href={`/blog/${slug}`} target="_blank">
              <ExternalLink className="mr-2 h-4 w-4" />
              View live
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleTogglePublish}>
          {status === "PUBLISHED" ? (
            <><EyeOff className="mr-2 h-4 w-4" />Unpublish</>
          ) : (
            <><Globe className="mr-2 h-4 w-4" />Publish</>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Separate component for the preview button in forms
export function PreviewButton({ slug }: { slug?: string }) {
  if (!slug) return null;
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/blog/${slug}`} target="_blank">
        <Eye className="mr-2 h-4 w-4" />
        Preview
      </Link>
    </Button>
  );
}
