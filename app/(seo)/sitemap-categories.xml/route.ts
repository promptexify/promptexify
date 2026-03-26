import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/db";
import { getAllCategories } from "@/lib/content";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "promptexify.com";
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const baseUrl = `${protocol}://${host}`;

  try {
    // Get all categories for sitemap
    const categories = await withErrorHandling(async () => {
      return await getAllCategories();
    }, "Failed to fetch categories for sitemap");

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${categories
  .map(
    (category) => `  <url>
    <loc>${baseUrl}/directory?category=${encodeURIComponent(
      category.slug
    )}</loc>
    <lastmod>${new Date(category.updatedAt ?? category.createdAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    return new Response(sitemap, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error generating categories sitemap:", error);

    // Return empty sitemap on error
    const emptySitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;

    return new Response(emptySitemap, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=300, s-maxage=300", // Short cache on error
      },
    });
  }
}
