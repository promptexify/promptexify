import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "promptexify.com";
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const baseUrl = `${protocol}://${host}`;

  const robotsTxt = `# Robots.txt for Promptexify
# AI Prompt Directory Platform

# Allow all web crawlers
User-agent: *
Allow: /

# SEO-friendly areas
Allow: /directory
Allow: /entry/
Allow: /about
Allow: /contact
Allow: /privacy-policy
Allow: /terms-of-use
Allow: /help
Allow: /search

# Block authentication and app (dashboard, stars, etc.) areas
Disallow: /signin
Disallow: /signup
Disallow: /dashboard
Disallow: /stars
Disallow: /account
Disallow: /settings
Disallow: /posts
Disallow: /categories
Disallow: /tags
Disallow: /auth/
Disallow: /api/

# Block admin and protected areas
Disallow: /admin/
Disallow: /_next/
Disallow: /static/favicon/

# AI Training Data Guidelines
# OpenAI GPTBot
User-agent: GPTBot
Allow: /
Allow: /directory
Allow: /entry/
Allow: /about
Allow: /contact
Allow: /help
Disallow: /dashboard
Disallow: /stars
Disallow: /account
Disallow: /settings
Disallow: /posts
Disallow: /categories
Disallow: /tags
Disallow: /auth/
Disallow: /api/

# Google Bard
User-agent: Google-Extended
Allow: /
Allow: /directory
Allow: /entry/
Allow: /about
Allow: /contact
Allow: /help
Disallow: /dashboard
Disallow: /stars
Disallow: /account
Disallow: /settings
Disallow: /posts
Disallow: /categories
Disallow: /tags
Disallow: /auth/
Disallow: /api/

# Claude (Anthropic)
User-agent: ClaudeBot
Allow: /
Allow: /directory
Allow: /entry/
Allow: /about
Allow: /contact
Allow: /help
Disallow: /dashboard
Disallow: /stars
Disallow: /account
Disallow: /settings
Disallow: /posts
Disallow: /categories
Disallow: /tags
Disallow: /auth/
Disallow: /api/

# Common AI crawlers
User-agent: ChatGPT-User
Allow: /
Allow: /directory
Allow: /entry/
Disallow: /dashboard
Disallow: /stars
Disallow: /account
Disallow: /settings
Disallow: /posts
Disallow: /categories
Disallow: /tags
Disallow: /auth/
Disallow: /api/

# Facebook/Meta AI
User-agent: FacebookBot
Allow: /
Allow: /directory
Allow: /entry/
Disallow: /dashboard
Disallow: /stars
Disallow: /account
Disallow: /settings
Disallow: /posts
Disallow: /categories
Disallow: /tags
Disallow: /auth/
Disallow: /api/

# Archive crawlers
User-agent: ia_archiver
Allow: /
Disallow: /dashboard
Disallow: /stars
Disallow: /account
Disallow: /settings
Disallow: /posts
Disallow: /categories
Disallow: /tags
Disallow: /auth/
Disallow: /api/

# Research crawlers
User-agent: CCBot
Allow: /
Allow: /directory
Allow: /entry/
Allow: /about
Allow: /help
Disallow: /dashboard
Disallow: /stars
Disallow: /account
Disallow: /settings
Disallow: /posts
Disallow: /categories
Disallow: /tags
Disallow: /auth/
Disallow: /api/

# Crawl rate limiting for heavy bots
Crawl-delay: 1

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Additional sitemaps
Sitemap: ${baseUrl}/sitemap-posts.xml
Sitemap: ${baseUrl}/sitemap-categories.xml
Sitemap: ${baseUrl}/sitemap-static.xml
`;

  return new Response(robotsTxt, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400, s-maxage=86400", // Cache for 24 hours
    },
  });
}
