"use server";

import { db } from "@/lib/db";
import { categories as categoriesTable, posts } from "@/lib/db/schema";
import { eq, ne, and, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { revalidateCache, CACHE_TAGS } from "@/lib/cache";
import { redirect } from "next/navigation";
import { withCSRFProtection } from "@/lib/security/csp";

// Category management actions
export const createCategoryAction = withCSRFProtection(
  async (formData: FormData) => {
    try {
      // Get the current user
      const currentUser = await getCurrentUser();
      if (!currentUser?.userData) {
        redirect("/signin");
      }

      // Temporarily disabled for testing - uncomment to re-enable admin protection
      // if (currentUser.userData.role !== "ADMIN") {
      //   throw new Error("Unauthorized: Admin access required");
      // }

      // Extract form data
      const name = formData.get("name") as string;
      const slug =
        (formData.get("slug") as string) ||
        name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "");
      const description = formData.get("description") as string;
      const parentId = formData.get("parentId") as string;

      // Validate required fields
      if (!name) {
        throw new Error("Category name is required");
      }

      const [existingCategory] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.slug, slug))
        .limit(1);

      if (existingCategory) {
        throw new Error("A category with this slug already exists");
      }

      const [newCategory] = await db
        .insert(categoriesTable)
        .values({
          name,
          slug,
          description: description || null,
          parentId: parentId && parentId !== "none" ? parentId : null,
        })
        .returning();

      revalidatePath("/categories");
      await revalidateCache(CACHE_TAGS.CATEGORIES);
      return {
        success: true,
        message: `Category "${newCategory!.name}" created successfully`,
        category: newCategory!,
      };
    } catch (error) {
      console.error("Error creating category:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create category",
      };
    }
  }
);

export const updateCategoryAction = withCSRFProtection(
  async (formData: FormData) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("Authentication required");
      }

      // Temporarily disabled for testing - uncomment to re-enable admin protection
      // if (user.userData?.role !== "ADMIN") {
      //   throw new Error("Admin access required");
      // }

      const id = formData.get("id") as string;
      const name = formData.get("name") as string;
      const slug = formData.get("slug") as string;
      const description = formData.get("description") as string;
      let parentId = formData.get("parentId") as string;

      // Input validation
      if (!id || !name || !slug) {
        throw new Error("ID, name, and slug are required");
      }

      // Handle "none" parent selection
      if (parentId === "none") {
        parentId = "";
      }

      // Prevent circular references
      if (parentId === id) {
        throw new Error("A category cannot be its own parent");
      }

      const [existingCategory] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, id))
        .limit(1);

      if (!existingCategory) {
        throw new Error("Category not found");
      }

      const [slugConflict] = await db
        .select()
        .from(categoriesTable)
        .where(and(eq(categoriesTable.slug, slug), ne(categoriesTable.id, id)))
        .limit(1);

      if (slugConflict) {
        throw new Error("A category with this slug already exists");
      }

      if (parentId) {
        const [parentCategory] = await db
          .select()
          .from(categoriesTable)
          .where(eq(categoriesTable.id, parentId))
          .limit(1);

        if (!parentCategory) {
          throw new Error("Parent category not found");
        }

        if (parentCategory.parentId === id) {
          throw new Error(
            "Cannot create circular reference in category hierarchy"
          );
        }
      }

      const [updatedCategory] = await db
        .update(categoriesTable)
        .set({
          name,
          slug,
          description: description || null,
          parentId: parentId || null,
          updatedAt: new Date(),
        })
        .where(eq(categoriesTable.id, id))
        .returning();

      revalidatePath("/categories");
      await revalidateCache(CACHE_TAGS.CATEGORIES);
      return {
        success: true,
        message: `Category "${updatedCategory!.name}" updated successfully`,
        category: updatedCategory!,
      };
    } catch (error) {
      console.error("Error updating category:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update category",
      };
    }
  }
);

export const deleteCategoryAction = withCSRFProtection(
  async (formData: FormData) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error("Authentication required");
      }

      // Temporarily disabled for testing - uncomment to re-enable admin protection
      // if (user.userData?.role !== "ADMIN") {
      //   throw new Error("Admin access required");
      // }

      const id = formData.get("id") as string;

      // Input validation
      if (!id) {
        throw new Error("Category ID is required");
      }

      const [categoryRow] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, id))
        .limit(1);

      const [postsCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(eq(posts.categoryId, id));
      const [childrenCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(categoriesTable)
        .where(eq(categoriesTable.parentId, id));

      const category = categoryRow
        ? {
            ...categoryRow,
            _count: {
              posts: postsCountRow?.count ?? 0,
              children: childrenCountRow?.count ?? 0,
            },
          }
        : null;

      if (!category) {
        throw new Error("Category not found");
      }

      // Check if category has posts - prevent deletion if it does
      if (category._count.posts > 0) {
        throw new Error(
          `Cannot delete category "${category.name}" because it contains ${category._count.posts} post(s). Please move or delete the posts first.`
        );
      }

      // Check if category has subcategories - prevent deletion if it does
      if (category._count.children > 0) {
        throw new Error(
          `Cannot delete category "${category.name}" because it has ${category._count.children} subcategory(ies). Please move or delete the subcategories first.`
        );
      }

      await db.delete(categoriesTable).where(eq(categoriesTable.id, id));

      revalidatePath("/categories");
      await revalidateCache(CACHE_TAGS.CATEGORIES);
      return {
        success: true,
        message: `Category "${category.name}" deleted successfully`,
      };
    } catch (error) {
      console.error("Error deleting category:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete category",
      };
    }
  }
);
