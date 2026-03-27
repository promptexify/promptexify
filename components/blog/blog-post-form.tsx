"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Globe } from "lucide-react";
import { TiptapEditor } from "./tiptap-editor";
import { createBlogPostAction, updateBlogPostAction } from "@/actions";
import { useCSRFForm } from "@/hooks/use-csrf";

interface BlogPostFormProps {
  mode: "create" | "edit";
  post?: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    featuredImageUrl: string;
    status: string;
  };
}

export function BlogPostForm({ mode, post }: BlogPostFormProps) {
  const router = useRouter();
  const { createFormDataWithCSRF, isReady } = useCSRFForm();

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [featuredImageUrl, setFeaturedImageUrl] = useState(post?.featuredImageUrl ?? "");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">((post?.status as "DRAFT" | "PUBLISHED") ?? "DRAFT");
  const [isSaving, setIsSaving] = useState(false);
  const slugTouched = useRef(!!post?.slug);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched.current) {
      setSlug(
        value
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "")
          .replace(/--+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isReady) {
      toast.error("Security verification in progress. Please wait.");
      return;
    }
    if (!content.trim() || content === "<p></p>") {
      toast.error("Article content cannot be empty.");
      return;
    }

    setIsSaving(true);
    try {
      const fd = createFormDataWithCSRF();
      fd.set("title", title);
      fd.set("slug", slug);
      fd.set("excerpt", excerpt);
      fd.set("content", content);
      fd.set("featuredImageUrl", featuredImageUrl);
      fd.set("status", status);
      if (mode === "edit" && post) fd.set("id", post.id);

      if (mode === "create") {
        await createBlogPostAction(fd);
      } else {
        await updateBlogPostAction(fd);
      }

      toast.success(mode === "create" ? "Article created" : "Article saved");
      router.push("/blog/admin");
    } catch (err) {
      // Next.js redirects throw; re-throw them
      if (err && typeof err === "object" && "digest" in err) throw err;
      toast.error(err instanceof Error ? err.message : "Failed to save article");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      {/* Main content */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Article Content</CardTitle>
            <CardDescription>Write your article using the rich text editor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Article title"
                required
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Short summary shown in article cards and SEO description…"
                rows={2}
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Content <span className="text-destructive">*</span></Label>
              <TiptapEditor
                value={content}
                onChange={setContent}
                placeholder="Start writing your article…"
                minHeight="500px"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-1 space-y-6 sticky top-10 self-start">
        {/* Sidebar settings */}
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="slug">URL slug</Label>
              <div className="flex items-center">
                <span className="text-sm text-muted-foreground mr-1">/blog/</span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    slugTouched.current = true;
                    setSlug(e.target.value.toLowerCase().replace(/[^\w-]/g, ""));
                  }}
                  placeholder="my-article-slug"
                  maxLength={200}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="featuredImageUrl">Featured image URL</Label>
              <Input
                id="featuredImageUrl"
                type="url"
                value={featuredImageUrl}
                onChange={(e) => setFeaturedImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              {featuredImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featuredImageUrl}
                  alt="Featured image preview"
                  className="mt-2 rounded-md max-h-40 w-full object-cover border border-border"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "DRAFT" | "PUBLISHED")}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
          <Button
            type="submit"
            name="status"
            value="DRAFT"
            variant="outline"
            disabled={isSaving || !isReady}
            onClick={() => setStatus("DRAFT")}
            className="w-full"
          >
            {isSaving && status === "DRAFT" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save draft
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !isReady}
            onClick={() => setStatus("PUBLISHED")}
            className="w-full"
          >
            {isSaving && status === "PUBLISHED" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
            {mode === "create" ? "Publish" : "Save & publish"}
          </Button>
        </div>
      </div>
    </form>
  );
}
