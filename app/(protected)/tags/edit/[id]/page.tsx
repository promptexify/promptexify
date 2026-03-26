"use client";

import { useState, useEffect, useTransition } from "react";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ArrowLeft, Loader2 } from "@/components/ui/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateTagAction } from "@/actions";
import { useAuth } from "@/hooks/use-auth";
import { useCSRFForm } from "@/hooks/use-csrf";

interface EditTagPageProps {
  params: Promise<{ id: string }>;
}

interface Tag {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    posts: number;
  };
}

// Force dynamic rendering for this page
export const dynamic = "force-dynamic";

export default function EditTagPage({ params }: EditTagPageProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tag, setTag] = useState<Tag | null>(null);
  const [tagLoading, setTagLoading] = useState(true);
  const [tagId, setTagId] = useState<string>("");
  const { createFormDataWithCSRF, isReady } = useCSRFForm();

  // Get tag ID from params
  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      setTagId(resolvedParams.id);
    }
    getParams();
  }, [params]);

  // Redirect if not authenticated or not authorized
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/signin");
        return;
      }
      if (user.userData?.role !== "ADMIN") {
        router.push("/dashboard");
        return;
      }
    }
  }, [user, loading, router]);

  // Fetch tag data
  useEffect(() => {
    async function fetchTag() {
      if (!tagId) return;

      try {
        setTagLoading(true);
        const response = await fetch(`/api/v1/tags/${tagId}`);
        if (response.ok) {
          const tagData = await response.json();
          setTag(tagData);
        } else if (response.status === 404) {
          router.push("/404");
        } else {
          toast.error("Failed to load tag");
          router.push("/tags");
        }
      } catch (error) {
        console.error("Error fetching tag:", error);
        toast.error("Failed to load tag");
        router.push("/tags");
      } finally {
        setTagLoading(false);
      }
    }

    if (user?.userData?.role === "ADMIN" && tagId) {
      fetchTag();
    }
  }, [user, tagId, router]);

  // Show loading state
  if (loading || tagLoading || !tag) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <p className="text-sm text-muted-foreground mt-2">Loading...</p>
      </div>
    );
  }

  const handleSubmit = async (formData: FormData) => {
    if (isSubmitting || !isReady) {
      if (!isReady) {
        toast.error("Security verification in progress. Please wait.");
      }
      return;
    }

    setIsSubmitting(true);
    startTransition(async () => {
      try {
        // Add CSRF protection to form data
        // Create secure form data with CSRF protection
        const secureFormData = createFormDataWithCSRF();
        
        // Add all form data to the secure form data
        for (const [key, value] of formData.entries()) {
          secureFormData.set(key, value);
        }
        
        // Add the tag ID
        secureFormData.set("id", tag.id);

        await updateTagAction(secureFormData);

        // If we reach here, the action succeeded and will redirect
        toast.success("Tag updated successfully");
      } catch (error) {
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

        console.error("Error updating tag:", error);
        toast.error("Failed to update tag");
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "200px",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user!} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-6 lg:p-6">
          <div className="flex items-center gap-4">
            <Link href="/tags">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <p className="text-muted-foreground">
                Update tag information and settings.
              </p>
            </div>
          </div>

          <div className="grid gap-6 max-w-4xl lg:grid-cols-3">
            {/* Tag Edit Form */}
            <div className="lg:col-span-2">
              <form action={handleSubmit} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Tag Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Tag Name</Label>
                      <Input
                        id="name"
                        name="name"
                        defaultValue={tag.name}
                        placeholder="Enter tag name"
                        required
                        disabled={isSubmitting || !isReady}
                      />
                      <p className="text-sm text-muted-foreground">
                        The display name for this tag
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="slug">Slug</Label>
                      <Input
                        id="slug"
                        name="slug"
                        defaultValue={tag.slug}
                        placeholder="tag-slug"
                        required
                        disabled={isSubmitting || !isReady}
                      />
                      <p className="text-sm text-muted-foreground">
                        URL-friendly version of the name
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-4">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isSubmitting || !isReady}
                  >
                    {isSubmitting
                      ? "Updating..."
                      : isReady
                        ? "Update Tag"
                        : "Initializing..."}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link href="/tags">Cancel</Link>
                  </Button>
                </div>
              </form>
            </div>

            {/* Tag Statistics */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tag Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Current Tag</Label>
                    <Badge variant="outline" className="w-fit">
                      {tag.name}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label>Posts Using This Tag</Label>
                    <Badge variant="secondary" className="w-fit">
                      {tag._count.posts} posts
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label>Slug</Label>
                    <code className="text-sm bg-muted px-2 py-1 rounded block w-fit">
                      {tag.slug}
                    </code>
                  </div>

                  <div className="space-y-2">
                    <Label>Created</Label>
                    <p className="text-sm text-muted-foreground">
                      {new Date(tag.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Last Updated</Label>
                    <p className="text-sm text-muted-foreground">
                      {new Date(tag.updatedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {tag._count.posts > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Warning</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      This tag is currently used by {tag._count.posts} post
                      {tag._count.posts !== 1 ? "s" : ""}. Changing the slug
                      will affect how this tag appears in URLs.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
