"use client";

import { useState, useEffect, useTransition } from "react";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ArrowLeft, Loader2 } from "@/components/ui/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateCategoryAction } from "@/actions";
import { useAuth } from "@/hooks/use-auth";
import { useCSRFForm } from "@/hooks/use-csrf";

interface EditCategoryPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  parent?: Category | null;
  children: Category[];
  _count: {
    posts: number;
  };
}

// Force dynamic rendering for this page
export const dynamic = "force-dynamic";

export default function EditCategoryPage({ params }: EditCategoryPageProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [categoryId, setCategoryId] = useState<string>("");
  const { createFormDataWithCSRF, isReady } = useCSRFForm();

  // Get category ID from params
  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      setCategoryId(resolvedParams.id);
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

  // Fetch category and all categories data
  useEffect(() => {
    async function fetchData() {
      if (!categoryId) return;

      try {
        setDataLoading(true);

        // Fetch current category and all categories in parallel
        const [categoryResponse, categoriesResponse] = await Promise.all([
          fetch(`/api/v1/categories/${categoryId}`),
          fetch("/api/v1/categories"),
        ]);

        if (categoryResponse.ok && categoriesResponse.ok) {
          const [categoryData, allCategories] = await Promise.all([
            categoryResponse.json(),
            categoriesResponse.json(),
          ]);

          setCategory(categoryData);

          // Filter for parent categories (only categories without parents and not the current category)
          const parentCategories = allCategories.filter(
            (cat: Category) => !cat.parent && cat.id !== categoryId
          );
          setCategories(parentCategories);
        } else if (categoryResponse.status === 404) {
          router.push("/404");
        } else {
          toast.error("Failed to load category");
          router.push("/categories");
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load category");
        router.push("/categories");
      } finally {
        setDataLoading(false);
      }
    }

    if (user?.userData?.role === "ADMIN" && categoryId) {
      fetchData();
    }
  }, [user, categoryId, router]);

  // Show loading state
  if (loading || dataLoading || !category) {
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
        // Process form data
        const parentId = formData.get("parentId") as string;
        
        // Create secure form data with CSRF protection
        const secureFormData = createFormDataWithCSRF();
        
        // Add all form data to the secure form data
        for (const [key, value] of formData.entries()) {
          if (key !== "parentId") { // We'll handle parentId separately
            secureFormData.set(key, value);
          }
        }
        
        // Add the category ID and process parentId
        secureFormData.set("id", category.id);
        secureFormData.set("parentId", parentId === "none" ? "" : parentId || "");

        const result = await updateCategoryAction(secureFormData);

        if (result.success) {
          toast.success(result.message || "Category updated successfully");
          router.push("/categories");
        } else {
          toast.error(result.error || "Failed to update category");
        }
      } catch (error) {
        console.error("Error updating category:", error);
        toast.error("Failed to update category");
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
        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex items-center gap-4">
            <Link href="/categories">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Categories
              </Button>
            </Link>
          </div>

          <div className="max-w-2xl">
            <form action={handleSubmit} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Category Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        name="name"
                        defaultValue={category.name}
                        placeholder="Enter category name..."
                        required
                        disabled={isSubmitting || !isReady}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="slug">Slug *</Label>
                      <Input
                        id="slug"
                        name="slug"
                        defaultValue={category.slug}
                        placeholder="Auto-generated from name"
                        required
                        disabled={isSubmitting || !isReady}
                      />
                      <p className="text-xs text-muted-foreground">
                        URL-friendly version of the name (lowercase, no spaces)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      defaultValue={category.description || ""}
                      placeholder="Brief description of the category..."
                      rows={3}
                      disabled={isSubmitting || !isReady}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="parentId">Parent Category (Optional)</Label>
                    <Select
                      name="parentId"
                      defaultValue={category.parentId || "none"}
                      disabled={isSubmitting || !isReady}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select parent category (leave empty for top-level)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          No parent (top-level category)
                        </SelectItem>
                        {categories.map((parentCategory) => (
                          <SelectItem
                            key={parentCategory.id}
                            value={parentCategory.id}
                          >
                            {parentCategory.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose a parent category to create a subcategory, or leave
                      empty for a top-level category
                    </p>
                  </div>

                  {/* Category Statistics */}
                  <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">
                      Category Statistics
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Posts:</span>
                        <span className="ml-2 font-medium">
                          {category._count.posts}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Subcategories:
                        </span>
                        <span className="ml-2 font-medium">
                          {category.children.length}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Updating..." : "Update Category"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/categories">Cancel</Link>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
