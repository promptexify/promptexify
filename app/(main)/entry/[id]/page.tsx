import { notFound, redirect } from "next/navigation";
import {
  getRelatedPosts,
  getFeaturedPostIds,
} from "@/lib/content";
import { Queries } from "@/lib/query";
import type { PostWithInteractions } from "@/lib/content";
import { PostStandalonePage } from "@/components/post-standalone-page";
import { getCurrentUser } from "@/lib/auth";
import { generatePostMetadata, setMetadata } from "@/config/seo";
import { getBaseUrl } from "@/lib/utils";
import { safeJsonLd } from "@/lib/security/sanitize";
import type { Metadata } from "next";

interface PostPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modal?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await Queries.posts.getById(id);

  if (!post || !post.isPublished) {
    return setMetadata({
      title: "Prompt Not Found",
      robots: { index: false, follow: false },
    });
  }

  return generatePostMetadata({
    id: post.id,
    title: post.title,
    description: post.description,
    content: post.content,
    category: post.category,
    tags: post.tags,
    createdAt: post.createdAt ? new Date(post.createdAt) : null,
    updatedAt: post.updatedAt ? new Date(post.updatedAt) : null,
    author: post.author,
  });
}

export async function generateStaticParams() {
  try {
    const ids = await getFeaturedPostIds(100);
    return ids.map((id) => ({ id }));
  } catch {
    return [];
  }
}

export default async function PostPage({ params, searchParams }: PostPageProps) {
  const { id } = await params;
  const { modal } = await searchParams;
  if (modal === "true") {
    redirect(`/entry/${id}`);
  }

  const currentUser = await getCurrentUser();
  const userId = currentUser?.userData?.id;

  const result = await Queries.posts.getById(id, userId);

  if (!result || !result.isPublished) {
    notFound();
  }

  const processedPost = result as PostWithInteractions;
  const userType = currentUser?.userData?.type || null;
  const relatedPosts = await getRelatedPosts(id, processedPost, userId, 6);

  const baseUrl = getBaseUrl();
  const canonicalUrl = `${baseUrl}/entry/${result.id}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${canonicalUrl}#article`,
    headline: result.title,
    description:
      result.description ||
      result.content?.replace(/[`*_#>\[\]]/g, "").replace(/\n+/g, " ").trim().substring(0, 155),
    url: canonicalUrl,
    datePublished: result.createdAt ? new Date(result.createdAt).toISOString() : undefined,
    dateModified: result.updatedAt ? new Date(result.updatedAt).toISOString() : undefined,
    author: result.author?.name
      ? { "@type": "Person", name: result.author.name }
      : { "@type": "Organization", name: "Promptexify" },
    publisher: {
      "@type": "Organization",
      "@id": `${baseUrl}/#organization`,
      name: "Promptexify",
    },
    isPartOf: { "@id": `${baseUrl}/#website` },
    inLanguage: "en-US",
    keywords: [
      result.category?.name,
      ...(result.tags?.map((t) => t.name) ?? []),
    ]
      .filter(Boolean)
      .join(", "),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }}
      />
      <PostStandalonePage
        post={processedPost}
        relatedPosts={relatedPosts}
        userType={userType}
      />
    </>
  );
}
