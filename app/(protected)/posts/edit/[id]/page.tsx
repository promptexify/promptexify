"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ArrowLeft, Check, Info, Loader2 } from "@/components/ui/icons";
import Link from "next/link";
import { TagSelector } from "@/components/tag-selector";
import { MediaUpload } from "@/components/media-upload";
import { useAuth } from "@/hooks/use-auth";
import { useCSRFForm } from "@/hooks/use-csrf";
import { updatePostAction } from "@/actions";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { toast } from "sonner";

// Force dynamic rendering for this page
export const dynamic = "force-dynamic";

interface Category {
  id: string;
  name: string;
  slug: string;
  parent?: {
    id: string;
    name: string;
    slug: string;
  };
}

interface Tag {
  id: string;
  name: string;
  slug: string;
}


interface Post {
  id: string;
  title: string;
  slug: string;
  description?: string;
  content: string;
  uploadPath?: string;
  uploadFileType?: "IMAGE" | "VIDEO";
  isPublished: boolean;
  isPremium: boolean;
  media: { id: string; mimeType: string; relativePath: string; url: string }[];
  category: {
    id: string;
    name: string;
    slug: string;
    parent?: {
      id: string;
      name: string;
      slug: string;
    };
  };
  tags: Tag[];
}

export default function EditPostPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { createFormDataWithCSRF, isReady } = useCSRFForm();
  const params = useParams();
  const postId = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [uploadPath, setUploadPath] = useState<string | null>(null);
  const [uploadFileType, setUploadFileType] = useState<"IMAGE" | "VIDEO" | null>(null);
  const [uploadMediaId, setUploadMediaId] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewVideoPath, setPreviewVideoPath] = useState<string | null>(null);
  const [blurData, setBlurData] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [maxTagsPerPost, setMaxTagsPerPost] = useState<number>(15);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Redirect if not authenticated or not authorized
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/signin");
        return;
      }
      if (user.userData?.role !== "ADMIN" && user.userData?.role !== "USER") {
        router.push("/dashboard");
        return;
      }
    }
  }, [user, loading, router]);

  // Fetch post data, categories, and tags
  useEffect(() => {
    async function fetchData() {
      if (
        !postId ||
        !user?.userData?.role ||
        (user.userData.role !== "ADMIN" && user.userData.role !== "USER")
      )
        return;

      try {
        setIsLoading(true);
        setError(null);

        const [postRes, categoriesRes, tagsRes] = await Promise.all([
          fetch(`/api/posts/${postId}`),
          fetch("/api/categories"),
          fetch("/api/tags"),
        ]);

        if (!postRes.ok) {
          if (postRes.status === 404) {
            router.push("/posts");
            return;
          }
          throw new Error("Failed to fetch post");
        }

        const postData = await postRes.json();

        // Handle categories response
        let categoriesData = [];
        if (categoriesRes.ok) {
          const categoryResponse = await categoriesRes.json();
          categoriesData = Array.isArray(categoryResponse)
            ? categoryResponse
            : [];
        } else {
          console.error("Failed to fetch categories:", categoriesRes.status);
        }

        // Handle tags response
        let tagsData = [];
        if (tagsRes.ok) {
          const tagResponse = await tagsRes.json();
          tagsData = Array.isArray(tagResponse) ? tagResponse : [];
        } else {
          console.error("Failed to fetch tags:", tagsRes.status);
        }

        setPost(postData);
        setCategories(categoriesData);
        setTags(tagsData);
        setSelectedTags(postData.tags.map((tag: Tag) => tag.name));

        if (postData.media && postData.media.length > 0) {
          const image = postData.media.find(
            (m: { mimeType: string; url?: string }) =>
              m.mimeType.startsWith("image/")
          );
          const video = postData.media.find(
            (m: { mimeType: string; url?: string }) =>
              m.mimeType.startsWith("video/")
          );

          if (image) {
            setUploadPath(image.relativePath);
            setUploadFileType("IMAGE");
            setUploadMediaId(image.id);
            setPreviewPath(postData.previewPath || null);
            setPreviewVideoPath(postData.previewVideoPath || null);
            setBlurData(image.blurDataUrl || null);
          }
          if (video) {
            setUploadPath(video.relativePath);
            setUploadFileType("VIDEO");
            setUploadMediaId(video.id);
            setPreviewPath(postData.previewPath || null);
            setPreviewVideoPath(postData.previewVideoPath || null);
            setBlurData(null); // Videos don't have blurDataUrl
          }
        }

        setPostTitle(postData.title || "");
        // Set the selected category (parent category if current is child, or current if parent)
        setSelectedCategory(
          postData.category.parent?.slug || postData.category.slug
        );
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to load post data");
        // Ensure states remain as arrays even on error
        setCategories([]);
        setTags([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (user?.userData?.role === "ADMIN" || user?.userData?.role === "USER") {
      fetchData();
    }
  }, [postId, user, router]);

  // Fetch content configuration (max tags per post)
  useEffect(() => {
    async function fetchContentConfig() {
      try {
        const res = await fetch("/api/settings/content-config", {
          credentials: "same-origin",
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.maxTagsPerPost === "number") {
            setMaxTagsPerPost(data.maxTagsPerPost);
          }
        }
      } catch (err) {
        console.error("Failed to fetch content config", err);
      }
    }

    fetchContentConfig();
  }, []);

  // Handle form submission
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (isSubmitting || !post) return;

    if (!isReady) {
      toast.error("Security verification in progress. Please wait.");
      return;
    }

    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error("Please complete the CAPTCHA verification.");
      return;
    }

    if (isUploadingMedia) {
      toast.error("Please wait for the media to finish uploading.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      // First, create any pending tags
      const createdTags: Tag[] = [];
      const failedTags: string[] = [];

      if (pendingTags.length > 0) {
        // Remove duplicates from pending tags
        const uniquePendingTags = [...new Set(pendingTags)];

        for (const tagName of uniquePendingTags) {
          try {
            const response = await fetch("/api/tags", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: tagName,
                slug: tagName
                  .toLowerCase()
                  .replace(/\s+/g, "-")
                  .replace(/[^a-z0-9-]/g, ""),
              }),
            });

            if (response.ok) {
              const newTag = await response.json();
              createdTags.push(newTag);
            } else {
              const errorData = await response.json().catch(() => ({}));

              // If tag already exists (409 conflict), that's okay - just log it
              if (response.status === 409) {
                console.log(
                  `Tag "${tagName}" already exists, skipping creation`
                );

                // Try to find the existing tag in our available tags
                const existingTag = tags.find(
                  (t) => t.name.toLowerCase() === tagName.toLowerCase()
                );
                if (existingTag) {
                  createdTags.push(existingTag);
                }
              } else {
                console.error(`Failed to create tag "${tagName}":`, errorData);
                failedTags.push(tagName);
              }
            }
          } catch (error) {
            console.error(`Error creating tag "${tagName}":`, error);
            failedTags.push(tagName);
          }
        }

        // Update the tags list with newly created tags
        if (createdTags.length > 0) {
          setTags((prevTags) => {
            const existingTagNames = prevTags.map((t) => t.name.toLowerCase());
            const newTags = createdTags.filter(
              (tag) => !existingTagNames.includes(tag.name.toLowerCase())
            );
            return [...prevTags, ...newTags];
          });
        }

        // If there were failed tags, show a warning but still continue
        if (failedTags.length > 0) {
          console.warn(
            `Some tags could not be created: ${failedTags.join(", ")}`
          );
          toast.warning(
            `Some tags could not be created: ${failedTags.join(", ")}`
          );
        }
      }

              // Add the featured media URLs to form data
        if (uploadPath) {
          formData.set("uploadMediaId", uploadMediaId || "");
          formData.set("uploadPath", uploadPath);
          formData.set("uploadFileType", uploadFileType || "");
          formData.set("previewPath", previewPath || "");
          formData.set("blurData", blurData || "");
        }

      // Add the selected tags to form data
      formData.set("tags", selectedTags.join(","));
      formData.set("id", post.id);

      // Create secure form data with CSRF protection
      const secureFormData = createFormDataWithCSRF();

      // Add all form data to the secure form data
      for (const [key, value] of formData.entries()) {
        secureFormData.set(key, value);
      }
      if (turnstileToken) secureFormData.set("cf-turnstile-response", turnstileToken);

      // Update the post first
      await updatePostAction(secureFormData);

      // Show success message - redirect is handled by server action
      toast.success("Post updated successfully!");

      // Redirect is handled by server action - no need for client-side redirect
    } catch (error) {
      console.error("Error updating post:", error);

      // Check if this is a Next.js redirect (expected behavior)
      if (error && typeof error === "object" && "digest" in error) {
        const errorDigest = (error as { digest?: string }).digest;
        if (
          typeof errorDigest === "string" &&
          errorDigest.includes("NEXT_REDIRECT")
        ) {
          // This is a redirect - don't show error, redirect is working as expected
          return;
        }
      }

      // Show user-friendly error message for actual errors
      setError("Failed to update post");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle tag changes
  function handleTagsChange(newTags: string[]) {
    setSelectedTags(newTags);
  }

  // Handle pending tags changes
  function handlePendingTagsChange(newPendingTags: string[]) {
    setPendingTags(newPendingTags);
  }

  // Handle media upload
  function handleMediaUploaded(
    result: {
      id: string;
      url: string;
      relativePath: string;
      mimeType: string;
      blurDataUrl?: string;
      previewPath?: string;
      previewVideoPath?: string;
    } | null
  ) {
    if (result) {
      if (result.mimeType.startsWith("image/")) {
        setUploadPath(result.relativePath);
        setUploadFileType("IMAGE");
        setUploadMediaId(result.id);
        setPreviewPath(result.previewPath || null);
        setPreviewVideoPath(null);
        setBlurData(result.blurDataUrl || null);
      } else if (result.mimeType.startsWith("video/")) {
        setUploadPath(result.relativePath);
        setUploadFileType("VIDEO");
        setUploadMediaId(result.id);
        setPreviewPath(result.previewPath || null);
        setPreviewVideoPath(result.previewVideoPath || null);
        setBlurData(null); // Videos don't have blurDataUrl
      }
    } else {
      setUploadPath(null);
      setUploadFileType(null);
      setUploadMediaId(null);
      setPreviewPath(null);
      setPreviewVideoPath(null);
      setBlurData(null);
    }
  }

  function handleUploadStateChange(uploading: boolean) {
    setIsUploadingMedia(uploading);
  }

  // Handle title change for image filename
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPostTitle(e.target.value);
  }

  function handleCategoryChange(categorySlug: string) {
    setSelectedCategory(categorySlug);
    // Reset subcategory when parent category changes
    const subcategorySelect = document.querySelector(
      '[name="subcategory"]'
    ) as HTMLSelectElement;
    if (subcategorySelect) {
      subcategorySelect.value = "none";
    }
  }

  // Show loading state
  if (loading || isLoading || !user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        <p className="text-sm text-muted-foreground">
          This may take a few seconds.
        </p>
      </div>
    );
  }

  // Show unauthorized if not admin or user
  if (user.userData?.role !== "ADMIN" && user.userData?.role !== "USER") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">Unauthorized</p>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2 text-destructive">Error</p>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  // Show not found if no post
  if (!post) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">Post Not Found</p>
          <p className="text-muted-foreground mb-4">
            The post you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link href="/posts">
            <Button>
              {user.userData?.role === "ADMIN"
                ? "Back to Posts"
                : "Back to Submissions"}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get parent categories for main category selection
  const parentCategories = categories.filter((cat) => !cat.parent);
  const currentParentCategory =
    post.category.parent?.slug || post.category.slug;

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "200px",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-6 lg:p-6">
          <div className="flex items-center gap-4">
            <Link href="/posts">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {user.userData?.role === "ADMIN"
                  ? "Back to Posts"
                  : "Back to Submissions"}
              </Button>
            </Link>
            <div>
              <p className="text-muted-foreground">
                {user.userData?.role === "ADMIN"
                  ? "Edit your existing prompt."
                  : "Edit your submission."}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Post Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      name="title"
                      defaultValue={post.title}
                      placeholder="Enter post title..."
                      onChange={handleTitleChange}
                      required
                      maxLength={200}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug *</Label>
                    <Input
                      id="slug"
                      name="slug"
                      defaultValue={post.slug}
                      placeholder="Auto-generated from title"
                      required
                      maxLength={200}
                      pattern="^[a-z0-9\-]*$"
                      title="Lowercase letters, numbers, and hyphens only"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Content *</Label>
                  <Textarea
                    id="content"
                    name="content"
                    defaultValue={post.content}
                    placeholder="Enter the prompt content here..."
                    rows={8}
                    required
                    maxLength={50000}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    defaultValue={post.description || ""}
                    placeholder="Brief description or instructions for the prompt..."
                    maxLength={500}
                    disabled={isSubmitting}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Media & Categorization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <Label htmlFor="featured-media">Featured Media</Label>
                  <MediaUpload
                    onMediaUploaded={handleMediaUploaded}
                    onUploadStateChange={handleUploadStateChange}
                    currentUploadPath={uploadPath || undefined}
                    currentUploadFileType={uploadFileType || undefined}
                    currentUploadMediaId={uploadMediaId || undefined}
                    currentPreviewPath={previewPath || undefined}
                    currentPreviewVideoPath={previewVideoPath || undefined}
                    title={postTitle || "untitled-post"}
                  />
                  <p className="text-sm text-muted-foreground">
                    Upload an image or video for this post.
                  </p>
                </div>
                <div className="flex gap-4 flex-col col-span-2">
                  <div className="flex gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Category *</Label>
                      <Select
                        name="category"
                        defaultValue={post.category.parent ? currentParentCategory : post.category.slug}
                        required
                        disabled={isSubmitting}
                        onValueChange={handleCategoryChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {parentCategories.map((category) => (
                            <SelectItem key={category.id} value={category.slug}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subcategory">Sub-category</Label>
                      <Select
                        name="subcategory"
                        defaultValue={post.category.parent ? post.category.slug : "none"}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select sub-category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No sub-category</SelectItem>
                          {categories
                            .filter((cat) => cat.parent?.slug === selectedCategory)
                            .map((category) => (
                              <SelectItem key={category.id} value={category.slug}>
                                {category.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <TagSelector
                    availableTags={tags}
                    selectedTags={selectedTags}
                    onTagsChange={handleTagsChange}
                    onPendingTagsChange={handlePendingTagsChange}
                    pendingTags={pendingTags}
                    maxTags={maxTagsPerPost}
                    disabled={isSubmitting}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Publishing Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {user.userData?.role === "ADMIN" ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="isPublished">Published</Label>
                        <p className="text-sm text-muted-foreground">
                          Make this post visible to users
                        </p>
                      </div>
                      <Switch
                        id="isPublished"
                        name="isPublished"
                        defaultChecked={post.isPublished}
                        disabled={isSubmitting}
                      />
                    </div>

                  </>
                ) : (
                  <div className="space-y-4">
                    {post.isPublished ? (
                      <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-start space-x-3">
                          <div className="text-green-600 dark:text-green-400">
                            <Check className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="font-medium text-green-900 dark:text-green-100">
                              Post Published
                            </h4>
                            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                              This post has been approved and is now live. You
                              cannot edit published posts.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-start space-x-3">
                          <div className="text-blue-600 dark:text-blue-400">
                            <Info className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="font-medium text-blue-900 dark:text-blue-100">
                              Pending Approval
                            </h4>
                            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                              Your changes will be submitted for admin approval.
                              The post will remain unpublished until approved.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hidden form fields for media data */}
            <input type="hidden" name="uploadPath" value={uploadPath || ""} />
            <input type="hidden" name="uploadFileType" value={uploadFileType || ""} />
            <input type="hidden" name="uploadMediaId" value={uploadMediaId || ""} />
            <input type="hidden" name="previewPath" value={previewPath || ""} />
            <input type="hidden" name="previewVideoPath" value={previewVideoPath || ""} />
            <input type="hidden" name="blurData" value={blurData || ""} />

            <TurnstileWidget
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
              size="invisible"
            />

            <div className="flex justify-end gap-4">
              <Button
                type="submit"
                className="w-full md:w-auto"
                disabled={isSubmitting || isUploadingMedia}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Updating Post...</span>
                  </>
                ) : (
                  <span>Update Post</span>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                asChild
                disabled={isSubmitting || isUploadingMedia}
              >
                <Link href="/posts">Cancel</Link>
              </Button>
            </div>
          </form>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
