import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "promptexify.com";
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const baseUrl = `${protocol}://${host}`;

  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap-static.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-posts.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-categories.xml</loc>
  </sitemap>
</sitemapindex>`;

  return new Response(sitemapIndex, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600", // Cache for 1 hour
    },
  });
}
