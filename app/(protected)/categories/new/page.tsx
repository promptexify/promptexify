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
import { createCategoryAction } from "@/actions";
import { useAuth } from "@/hooks/use-auth";
import { useCSRFForm } from "@/hooks/use-csrf";

interface Category {
  id: string;
  name: string;
  slug: string;
  parent?: string;
}

// Force dynamic rendering for this page
export const dynamic = "force-dynamic";

export default function NewCategoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const { createFormDataWithCSRF, isReady } = useCSRFForm();

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

  // Fetch categories for parent selection
  useEffect(() => {
    async function fetchCategories() {
      try {
        setCategoriesLoading(true);
        const response = await fetch("/api/v1/categories");
        if (response.ok) {
          const data = await response.json();
          // Filter for parent categories (only categories without parents)
          const parentCategories = data.filter((cat: Category) => !cat.parent);
          setCategories(parentCategories);
        } else {
          console.error("Failed to fetch categories");
          toast.error("Failed to load categories");
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        toast.error("Failed to load categories");
      } finally {
        setCategoriesLoading(false);
      }
    }

    if (user?.userData?.role === "ADMIN") {
      fetchCategories();
    }
  }, [user]);

  // Show loading state while checking auth
  if (loading || categoriesLoading) {
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
        
        // Process parentId
        secureFormData.set("parentId", parentId === "none" ? "" : parentId || "");

        const result = await createCategoryAction(secureFormData);

        if (result.success) {
          toast.success(result.message || "Category created successfully");
          router.push("/categories");
        } else {
          toast.error(result.error || "Failed to create category");
        }
      } catch (error) {
        console.error("Error creating category:", error);
        toast.error("An unexpected error occurred");
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
            <div>
              <p className="text-muted-foreground">
                Add a new category to organize your content.
              </p>
            </div>
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
                        placeholder="Enter category name..."
                        required
                        disabled={isSubmitting || !isReady}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="slug">Slug</Label>
                      <Input
                        id="slug"
                        name="slug"
                        placeholder="Auto-generated from name"
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
                      placeholder="Brief description of the category..."
                      rows={3}
                      disabled={isSubmitting || !isReady}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="parentId">Parent Category (Optional)</Label>
                    <Select name="parentId" disabled={isSubmitting || !isReady}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select parent category (leave empty for top-level)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          No parent (top-level category)
                        </SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose a parent category to create a subcategory, or leave
                      empty for a top-level category
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
                    ? "Creating..."
                    : isReady
                      ? "Create Category"
                      : "Initializing..."}
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
