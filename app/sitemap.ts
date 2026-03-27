import type { MetadataRoute } from "next";
import { getPostsForSitemap, getAllCategories } from "@/lib/content";
import { getBlogPostForSitemap } from "@/lib/blog-query";
import { getBaseUrl } from "@/lib/utils";

function getChangeFrequency(
  updatedAt: Date
): MetadataRoute.Sitemap[number]["changeFrequency"] {
  const ageMs = Date.now() - updatedAt.getTime();
  const days = ageMs / (1000 * 60 * 60 * 24);
  if (days <= 7) return "daily";
  if (days <= 30) return "weekly";
  if (days <= 90) return "monthly";
  return "yearly";
}

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();

  // Static pages
  const staticUrls: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date("2025-03-01"),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/directory`,
      lastModified: new Date("2025-03-01"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: new Date("2025-01-15"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date("2024-12-29"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: new Date("2025-01-15"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date("2024-12-29"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date("2024-12-29"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date("2024-12-29"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Category pages
  let categoryUrls: MetadataRoute.Sitemap = [];
  try {
    const categories = await getAllCategories();
    categoryUrls = categories.map((category) => ({
      url: `${baseUrl}/directory?category=${encodeURIComponent(category.slug)}`,
      lastModified: new Date(category.updatedAt ?? category.createdAt),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    // Return partial sitemap on DB error
  }

  // Post pages
  let postUrls: MetadataRoute.Sitemap = [];
  try {
    const posts = await getPostsForSitemap();
    postUrls = posts.map((post) => ({
      url: `${baseUrl}/entry/${post.id}`,
      lastModified: post.updatedAt,
      changeFrequency: getChangeFrequency(post.updatedAt),
      priority: 0.7,
    }));
  } catch {
    // Return partial sitemap on DB error
  }

  // Blog post pages
  let blogUrls: MetadataRoute.Sitemap = [];
  try {
    const blogPosts = await getBlogPostForSitemap();
    blogUrls = blogPosts.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: getChangeFrequency(post.updatedAt),
      priority: 0.8,
    }));
  } catch {
    // Return partial sitemap on DB error
  }

  return [...staticUrls, ...categoryUrls, ...postUrls, ...blogUrls];
}
