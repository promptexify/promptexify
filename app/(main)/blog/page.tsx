import { Suspense } from "react";
import Link from "next/link";
import { getPublishedBlogPosts } from "@/lib/blog-query";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { setMetadata } from "@/config/seo";
import { getBaseUrl } from "@/lib/utils";
import { safeJsonLd } from "@/lib/security/sanitize";
import { Clock, Calendar } from "lucide-react";

export const metadata = setMetadata({
  title: "Blog",
  description: "Articles, guides, and insights on Cursor rules, MCP configs, Claude Code, and AI-powered development workflows.",
  alternates: { canonical: `${getBaseUrl()}/blog` },
});

export const dynamic = "force-dynamic";

async function BlogList() {
  const { posts, pagination } = await getPublishedBlogPosts(1, 20);

  if (posts.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <p className="text-lg font-medium">No articles yet</p>
        <p className="text-sm mt-1">Check back soon for guides and insights.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <article key={post.id} className="group flex flex-col">
            {post.featuredImageUrl && (
              <Link href={`/blog/${post.slug}`} className="block mb-4 overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.featuredImageUrl}
                  alt={post.title}
                  className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </Link>
            )}
            <div className="flex flex-col flex-1">
              <Link href={`/blog/${post.slug}`} className="block group-hover:underline">
                <h2 className="font-semibold text-lg leading-snug mb-2">{post.title}</h2>
              </Link>
              {post.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-3 mb-3 flex-1">{post.excerpt}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                {post.readingTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {post.readingTime} min read
                  </span>
                )}
                {post.publishedAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                {post.author?.name && <Badge variant="outline" className="text-xs">{post.author.name}</Badge>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">{pagination.totalCount} article{pagination.totalCount !== 1 ? "s" : ""}</p>
    </>
  );
}

export default function BlogPage() {
  const baseUrl = getBaseUrl();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",  item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Blog",  item: `${baseUrl}/blog` },
    ],
  };

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${baseUrl}/blog#blog`,
    name: "Promptexify Blog",
    description: "Articles, guides, and insights on AI-powered development workflows.",
    url: `${baseUrl}/blog`,
    publisher: { "@id": `${baseUrl}/#organization` },
    inLanguage: "en-US",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }} />
      <Container className="py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Blog</h1>
          <p className="text-muted-foreground">Guides and insights on AI-powered development.</p>
        </div>
        <Suspense fallback={<div className="py-12 text-center text-muted-foreground text-sm">Loading articles…</div>}>
          <BlogList />
        </Suspense>
      </Container>
    </>
  );
}
