import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "promptexify.com";
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const baseUrl = `${protocol}://${host}`;

  // Static pages included in sitemap.
  // lastModified: use the actual date content was last meaningfully changed,
  // not new Date() — volatile timestamps waste crawl budget by signalling
  // constant change to Googlebot.
  const staticPages = [
    {
      url: "",
      lastModified: new Date("2025-03-01").toISOString(),
      changeFreq: "daily",
      priority: "1.0",
    },
    {
      url: "/directory",
      lastModified: new Date("2025-03-01").toISOString(),
      changeFreq: "daily",
      priority: "0.9",
    },
    {
      url: "/features",
      lastModified: new Date("2025-01-15").toISOString(),
      changeFreq: "monthly",
      priority: "0.8",
    },
    {
      url: "/about",
      lastModified: new Date("2024-12-29").toISOString(),
      changeFreq: "monthly",
      priority: "0.7",
    },
    {
      url: "/help",
      lastModified: new Date("2025-01-15").toISOString(),
      changeFreq: "monthly",
      priority: "0.6",
    },
    {
      url: "/contact",
      lastModified: new Date("2024-12-29").toISOString(),
      changeFreq: "monthly",
      priority: "0.5",
    },
    {
      url: "/privacy",
      lastModified: new Date("2024-12-29").toISOString(),
      changeFreq: "yearly",
      priority: "0.3",
    },
    {
      url: "/terms",
      lastModified: new Date("2024-12-29").toISOString(),
      changeFreq: "yearly",
      priority: "0.3",
    },
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${page.lastModified}</lastmod>
    <changefreq>${page.changeFreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400", // 24 hours — content rarely changes
    },
  });
}
