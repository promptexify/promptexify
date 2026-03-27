import { notFound } from "next/navigation";
import { getBlogPostBySlug } from "@/lib/blog-query";
import { Container } from "@/components/ui/container";
import { ArticleContent } from "@/components/blog/article-content";
import { ShareButton } from "@/components/share-button";
import { setMetadata } from "@/config/seo";
import { getBaseUrl, cn } from "@/lib/utils";
import { safeJsonLd } from "@/lib/security/sanitize";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return setMetadata({ title: "Article Not Found", robots: { index: false, follow: false } });

  const baseUrl = getBaseUrl();
  const canonicalUrl = `${baseUrl}/blog/${post.slug}`;
  const description = post.excerpt ?? post.title;

  return setMetadata({
    title: post.title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: post.title,
      description,
      type: "article",
      url: canonicalUrl,
      locale: "en_US",
      siteName: "Promptexify",
      publishedTime: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
      modifiedTime: new Date(post.updatedAt).toISOString(),
      authors: post.author?.name ? [post.author.name] : undefined,
      ...(post.featuredImageUrl && {
        images: [
          {
            url: post.featuredImageUrl,
            width: 1200,
            height: 630,
            alt: post.title,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      site: "@promptexify",
      creator: "@promptexify",
      ...(post.featuredImageUrl && { images: [post.featuredImageUrl] }),
    },
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  const baseUrl = getBaseUrl();
  const canonicalUrl = `${baseUrl}/blog/${post.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${canonicalUrl}#article`,
    headline: post.title,
    description: post.excerpt ?? post.title,
    url: canonicalUrl,
    datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
    dateModified: new Date(post.updatedAt).toISOString(),
    author: post.author?.name
      ? { "@type": "Person", name: post.author.name }
      : { "@type": "Organization", name: "Promptexify" },
    publisher: { "@id": `${baseUrl}/#organization` },
    isPartOf: { "@id": `${baseUrl}/blog#blog` },
    inLanguage: "en-US",
    ...(post.featuredImageUrl && {
      image: { "@type": "ImageObject", url: post.featuredImageUrl },
    }),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${baseUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      <Container className="py-10 max-w-3xl">
        {/* Back */}
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Link>

        {/* Featured image */}
        {post.featuredImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featuredImageUrl}
            alt={post.title}
            className="w-full rounded-xl mb-8 max-h-80 object-cover shadow-sm"
          />
        )}

        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight leading-tight mb-4">{post.title}</h1>
          {post.excerpt && <p className={cn("text-lg text-muted-foreground mb-4 leading-relaxed", GeistSans.className)}>{post.excerpt}</p>}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              {post.author?.name && <Badge variant="outline">{post.author.name}</Badge>}
              {post.publishedAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              )}
              {post.readingTime && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {post.readingTime} min read
                </span>
              )}
            </div>
            <ShareButton title={post.title} url={canonicalUrl} variant="outline" size="sm" />
          </div>
        </header>

        {/* Article body */}
        <ArticleContent html={post.content} />
      </Container>
    </>
  );
}
