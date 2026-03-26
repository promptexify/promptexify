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
import { TagSelector } from "@/components/tag-selector";
import { PostJsonImport } from "@/components/post-json-import";
import { createPostAction } from "@/actions";
import { useAuth } from "@/hooks/use-auth";
import { useCSRFForm } from "@/hooks/use-csrf";
import { TurnstileWidget } from "@/components/turnstile-widget";
import type { PostImportData } from "@/lib/schemas";

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

export default function NewPostPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { createFormDataWithCSRF, getHeadersWithCSRF, isReady } = useCSRFForm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postSlug, setPostSlug] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postDescription, setPostDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [maxTagsPerPost, setMaxTagsPerPost] = useState<number>(15);
  const [allowUserPosts, setAllowUserPosts] = useState<boolean>(true);
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

  // Fetch categories
  useEffect(() => {
    async function fetchCategories() {
      try {
        const categoriesRes = await fetch("/api/v1/categories", {
          credentials: "same-origin",
        });
        if (categoriesRes.ok) {
          const categoriesData = await categoriesRes.json();
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
      } catch (error) {
        console.error("Error fetching categories:", error);
        setCategories([]);
      }
    }

    if (user?.userData?.role === "ADMIN" || user?.userData?.role === "USER") {
      fetchCategories();
    }
  }, [user]);

  // Fetch content configuration (max tags per post)
  useEffect(() => {
    async function fetchContentConfig() {
      try {
        const res = await fetch("/api/v1/settings/content", {
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

    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      // First, create any pending tags
      const failedTags: string[] = [];

      if (pendingTags.length > 0) {
        // Remove duplicates from pending tags
        const uniquePendingTags = [...new Set(pendingTags)];

        for (const tagName of uniquePendingTags) {
          try {
            const response = await fetch("/api/v1/tags", {
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
              // Tag created successfully
            } else {
              const errorData = await response.json().catch(() => ({}));

              // If tag already exists (409 conflict), that's okay - just log it
              if (response.status === 409) {
                console.log(
                  `Tag "${tagName}" already exists, skipping creation`
                );

                // Tag already exists — no action needed
                console.log(`Tag "${tagName}" already exists, skipping creation`);
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

  // Handle tag changes
  function handleTagsChange(newTags: string[]) {
    setSelectedTags(newTags);
  }

  // Handle pending tags changes
  function handlePendingTagsChange(newPendingTags: string[]) {
    setPendingTags(newPendingTags);
  }

  // Populate form from JSON import
  function handleImport(data: PostImportData) {
    setPostTitle(data.title);
    setPostContent(data.content);
    setPostDescription(data.description ?? "");

    const slug =
      data.slug ||
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    setPostSlug(slug);

    if (data.tags && data.tags.length > 0) {
      setSelectedTags(data.tags);
    }
  }

  // Auto-generate slug from title (manual typing path)
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const title = e.target.value;
    setPostTitle(title);
    setPostSlug(
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    );
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
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/posts">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {user.userData?.role === "ADMIN"
                    ? "Back to Posts"
                    : "Back to Submissions"}
                </Button>
              </Link>
              <p className="text-muted-foreground">
                {user.userData?.role === "ADMIN"
                  ? "Add a new prompt to your directory."
                  : "Submit a new prompt."}
              </p>
            </div>
            <PostJsonImport onImport={handleImport} disabled={isSubmitting} />
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
                      value={postSlug}
                      onChange={(e) => setPostSlug(e.target.value)}
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
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
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
                    value={postDescription}
                    onChange={(e) => setPostDescription(e.target.value)}
                    maxLength={500}
                    disabled={isSubmitting}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Categorization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  availableTags={[]}
                  searchable
                  selectedTags={selectedTags}
                  onTagsChange={handleTagsChange}
                  onPendingTagsChange={handlePendingTagsChange}
                  pendingTags={pendingTags}
                  maxTags={maxTagsPerPost}
                  disabled={isSubmitting}
                />
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

            <div className="flex justify-end">
              <TurnstileWidget
                size="normal"
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
              />
            </div>

            <div className="flex justify-end gap-4">
              <Button
                type="submit"
                className="w-full md:w-auto"
                disabled={isSubmitting || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken)}
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
                disabled={isSubmitting}
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
