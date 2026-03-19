"use client";

import { useState, useEffect } from "react";
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
import { ArrowLeft, Info, Loader2 } from "@/components/ui/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MediaUpload } from "@/components/media-upload";
import { TagSelector } from "@/components/tag-selector";
import { createPostAction } from "@/actions";
import { useAuth } from "@/hooks/use-auth";
import { useCSRFForm } from "@/hooks/use-csrf";
import { TurnstileWidget } from "@/components/turnstile-widget";

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


export default function NewPostPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { createFormDataWithCSRF, getHeadersWithCSRF, isReady } = useCSRFForm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadPath, setUploadPath] = useState<string | null>(null);
  const [uploadFileType, setUploadFileType] = useState<"IMAGE" | "VIDEO" | null>(null);
  const [uploadMediaId, setUploadMediaId] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewVideoPath, setPreviewVideoPath] = useState<string | null>(null);
  const [blurData, setBlurData] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [maxTagsPerPost, setMaxTagsPerPost] = useState<number>(15);
  const [allowUserPosts, setAllowUserPosts] = useState<boolean>(true);
  const [allowUserUploads, setAllowUserUploads] = useState<boolean>(true);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);



  // Redirect if not authenticated, not authorized, or user submissions are disabled
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
      // Non-admins are blocked when the kill switch is off
      if (user.userData?.role !== "ADMIN" && !allowUserPosts) {
        router.push("/dashboard");
        return;
      }
    }
  }, [user, loading, router, allowUserPosts]);

  // Fetch categories and tags
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch categories
        const categoriesRes = await fetch("/api/categories", {
          credentials: "same-origin",
        });
        if (categoriesRes.ok) {
          const categoriesData = await categoriesRes.json();
          // Ensure categoriesData is an array
          if (Array.isArray(categoriesData)) {
            setCategories(categoriesData);
          } else {
            console.error("Categories data is not an array:", categoriesData);
            setCategories([]);
          }
        } else {
          console.error("Failed to fetch categories:", categoriesRes.status);
          setCategories([]);
        }

        // Fetch tags
        const tagsRes = await fetch("/api/tags", {
          credentials: "same-origin",
        });
        if (tagsRes.ok) {
          const tagsData = await tagsRes.json();
          // Ensure tagsData is an array
          if (Array.isArray(tagsData)) {
            setTags(tagsData);
          } else {
            console.error("Tags data is not an array:", tagsData);
            setTags([]);
          }
        } else {
          console.error("Failed to fetch tags:", tagsRes.status);
          setTags([]);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        // Ensure states remain as arrays even on error
        setCategories([]);
        setTags([]);
      }
    }

    if (user?.userData?.role === "ADMIN" || user?.userData?.role === "USER") {
      fetchData();
    }
  }, [user]);

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
          if (typeof data.allowUserPosts === "boolean") {
            setAllowUserPosts(data.allowUserPosts);
          }
          if (typeof data.allowUserUploads === "boolean") {
            setAllowUserUploads(data.allowUserUploads);
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

    if (isSubmitting) return;

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
              headers: await getHeadersWithCSRF({
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({
                name: tagName,
                slug: tagName
                  .toLowerCase()
                  .replace(/\s+/g, "-")
                  .replace(/[^a-z0-9-]/g, ""),
              }),
              credentials: "same-origin",
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
      if (uploadMediaId) {
        formData.set("uploadMediaId", uploadMediaId);
        formData.set("uploadPath", uploadPath || "");
        formData.set("uploadFileType", uploadFileType || "");
        formData.set("previewPath", previewPath || "");
        formData.set("previewVideoPath", previewVideoPath || "");
        formData.set("blurData", blurData || "");
      }

      // Add the selected tags to form data
      formData.set("tags", selectedTags.join(", "));

      // Create secure form data with CSRF protection
      const secureFormData = createFormDataWithCSRF();

      // Add all form data to the secure form data
      for (const [key, value] of formData.entries()) {
        secureFormData.set(key, value);
      }
      if (turnstileToken) secureFormData.set("cf-turnstile-response", turnstileToken);
      await createPostAction(secureFormData);
    } catch (error) {
      console.error("Error creating post:", error);

      // Check if this is a Next.js redirect (expected behavior)
      if (error && typeof error === "object" && "digest" in error) {
        const errorDigest = (error as { digest?: string }).digest;
        if (
          typeof errorDigest === "string" &&
          errorDigest.includes("NEXT_REDIRECT")
        ) {
          return;
        }
      }

      if (error instanceof Error) {
        if (error.message.includes("slug") || error.message.includes("unique")) {
          toast.error("A post with this title already exists. Please choose a different title.");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error("Failed to create post. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle successful media upload
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
      setUploadMediaId(result.id);
      setUploadPath(result.relativePath);
      setPreviewPath(result.previewPath || null); // Use preview path from upload response
      setPreviewVideoPath(result.previewVideoPath || null); // Use preview video path from upload response
      setBlurData(result.blurDataUrl || null);
      setUploadFileType(result.mimeType.startsWith("image/") ? "IMAGE" : "VIDEO");
    } else {
      setUploadMediaId(null);
      setUploadPath(null);
      setPreviewPath(null);
      setPreviewVideoPath(null);
      setBlurData(null);
      setUploadFileType(null);
    }
  }

  function handleUploadStateChange(uploading: boolean) {
    setIsUploadingMedia(uploading);
  }

  // Handle tag changes
  function handleTagsChange(newTags: string[]) {
    setSelectedTags(newTags);
  }

  // Handle pending tags changes
  function handlePendingTagsChange(newPendingTags: string[]) {
    setPendingTags(newPendingTags);
  }

  // Auto-generate slug from title
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const title = e.target.value;
    setPostTitle(title);

    // Auto-generate slug
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const slugInput = document.getElementById("slug") as HTMLInputElement;
    if (slugInput) {
      slugInput.value = slug;
    }
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
  if (loading || !user) {
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
        Unauthorized
      </div>
    );
  }

  // Get parent categories for main category selection
  const parentCategories = categories.filter((cat) => !cat.parent);

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
                  ? "Add a new prompt to your directory."
                  : "Submit a new prompt."}
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
                      placeholder="Enter post title..."
                      value={postTitle}
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
                      placeholder="Auto-generated from title"
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
                    className="max-h-[500px] min-h-[200px] overflow-y-auto"
                    id="content"
                    name="content"
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
                {/* Media upload: always shown to admins; shown to users only when allowUserUploads is on */}
                {(user.userData?.role === "ADMIN" || allowUserUploads) ? (
                  <div className="space-y-2">
                    <Label htmlFor="featured-media">Featured Media</Label>
                    <MediaUpload
                      onMediaUploaded={handleMediaUploaded}
                      onUploadStateChange={handleUploadStateChange}
                      currentUploadPath={uploadPath || undefined}
                      currentUploadFileType={uploadFileType || undefined}
                      currentUploadMediaId={uploadMediaId || undefined}
                      currentPreviewPath={previewPath || undefined}
                      title={postTitle || "untitled-post"}
                    />
                    <p className="text-sm text-muted-foreground">
                      Upload an image or video to be featured with your post.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Featured Media</Label>
                    <div className="p-4 rounded-lg border border-dashed text-sm text-muted-foreground">
                      Media uploads are not available for user submissions at this time.
                    </div>
                  </div>
                )}
                <div className="flex gap-4 flex-col col-span-2">
                  <div className="flex gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select
                      name="category"
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
                    <Select name="subcategory" disabled={isSubmitting}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select sub-category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No sub-category</SelectItem>
                        {categories
                          .filter(
                            (cat) => cat.parent?.slug === selectedCategory
                          )
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
                        disabled={isSubmitting}
                      />
                    </div>

                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start space-x-3">
                        <div className="text-blue-600 dark:text-blue-400">
                          <Info className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-medium text-blue-900 dark:text-blue-100">
                            Approval Required
                          </h4>
                          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                            Your post will be submitted for admin approval
                            before being published. You&apos;ll be able to track
                            its status in your posts dashboard. This may take up
                            up to 48 hours.
                          </p>
                        </div>
                      </div>
                    </div>

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
              size="normal"
              className="flex justify-end"
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
                    <span>Creating Post...</span>
                  </>
                ) : (
                  <span>Create Post</span>
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
