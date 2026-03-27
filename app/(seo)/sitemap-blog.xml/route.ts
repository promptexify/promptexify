import { NextRequest } from "next/server";
import { getBlogPostForSitemap } from "@/lib/blog-query";

function getChangeFreq(updatedAt: Date): string {
  const days = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7)  return "daily";
  if (days <= 30) return "weekly";
  if (days <= 90) return "monthly";
  return "yearly";
}

export async function GET(request: NextRequest) {
  const host     = request.headers.get("host") || "promptexify.com";
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const baseUrl  = `${protocol}://${host}`;

  try {
    const posts = await getBlogPostForSitemap();

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${posts.map((p) => `  <url>
    <loc>${baseUrl}/blog/${p.slug}</loc>
    <lastmod>${p.updatedAt.toISOString()}</lastmod>
    <changefreq>${getChangeFreq(p.updatedAt)}</changefreq>
    <priority>0.8</priority>
  </url>`).join("\n")}
</urlset>`;

    return new Response(sitemap, {
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, {
      headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  }
}
