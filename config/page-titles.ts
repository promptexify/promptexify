export const PAGE_TITLES = {
  "/dashboard": {
    title: "Dashboard",
    description: "Overview of your activity and saved content",
  },
  "/stars": {
    title: "Your Stars",
    description: "Your starred prompts and saved content",
  },
  "/account": {
    title: "Account Settings",
    description: "Manage your account information and preferences",
  },
  "/posts": {
    title: "Posts Management",
    description: "Manage and organize your posts",
  },
  "/posts/new": {
    title: "Create New Post",
    description: "Add a new post to your collection",
  },
  "/categories": {
    title: "Categories Management",
    description: "Organize your content with categories",
  },
  "/categories/new": {
    title: "Create New Category",
    description: "Add a new category to organize your content",
  },
  "/tags": {
    title: "Tags Management",
    description: "Manage tags for better content organization",
  },
  "/tags/new": {
    title: "Create New Tag",
    description: "Add a new tag for content organization",
  },
  "/settings": {
    title: "Settings",
    description: "Configure your account and application preferences",
  },
} as const;

// Helper function to get title for a pathname
export function getPageTitle(pathname: string) {
  // Handle dynamic routes (edit pages)
  if (pathname.startsWith("/posts/edit/")) {
    return {
      title: "Edit Post",
      description: "Update your post details",
    };
  }
  
  if (pathname.startsWith("/categories/edit/")) {
    return {
      title: "Edit Category",
      description: "Update category details",
    };
  }
  
  if (pathname.startsWith("/tags/edit/")) {
    return {
      title: "Edit Tag",
      description: "Update tag details",
    };
  }

  // Return exact match or default
  return PAGE_TITLES[pathname as keyof typeof PAGE_TITLES] || PAGE_TITLES["/dashboard"];
} 