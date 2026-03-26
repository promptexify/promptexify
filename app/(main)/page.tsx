import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getFeaturedPosts } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { Suspense } from "react";
import { PostMasonrySkeleton } from "@/components/post-masonry-skeleton";
import { HeroSection } from "@/components/ui/hero-section";
import { Container } from "@/components/ui/container";
import { getFeaturedPostsLimit } from "@/lib/settings";
import { SafeAsync } from "@/components/ui/safe-async";
import { FeaturedPostsClient } from "@/components/featured-posts-client";
import nextDynamic from "next/dynamic";
import { getMetadata } from "@/config/seo";
import { headers } from "next/headers";
import { getBaseUrl } from "@/lib/utils";
import { safeJsonLd } from "@/lib/security/sanitize";

export const metadata = getMetadata("home");

const BentoGrid = nextDynamic(
  () => import("@/components/ui/bento-grid").then((m) => ({ default: m.BentoGrid })),
);
const CtaSection = nextDynamic(
  () => import("@/components/ui/cta-section").then((m) => ({ default: m.CtaSection })),
);

export const dynamic = "force-dynamic";

async function PostGrid() {
  const headersList = await headers();
  const userId = headersList.get("x-user-id") ?? undefined;

  // Get limit from cache (~1ms), then run auth + posts in parallel
  const featuredPostsLimit = await getFeaturedPostsLimit();
  const [currentUser, featuredPosts] = await Promise.all([
    getCurrentUser().catch(() => null),
    getFeaturedPosts(userId, featuredPostsLimit),
  ]);
  const userType = currentUser?.userData?.type ?? null;

  const baseUrl = getBaseUrl();
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Featured Prompts",
    description: "Hand-picked collection of the best Cursor rules, MCP configs, Claude Code skills, and AI coding prompts.",
    url: baseUrl,
    numberOfItems: featuredPosts.length,
    itemListElement: featuredPosts.map((post, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${baseUrl}/entry/${post.id}`,
      name: post.title,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
      />
      <FeaturedPostsClient posts={featuredPosts} userType={userType} />
    </>
  );
}

export default async function HomePage() {
  return (
    <Container className="min-h-screen bg-background space-y-10 flex flex-col justify-center">
      <HeroSection />

      <section className="pb-12">
        <div className="mb-8 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold mb-2">
            Featured Prompts
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Discover our hand-picked collection of the best prompts, carefully
            curated by our team
          </p>
        </div>

        <Suspense fallback={<PostMasonrySkeleton />}>
          <SafeAsync>
            <PostGrid />
          </SafeAsync>
        </Suspense>

        <div className="text-center mt-12">
          <Link href="/directory">
            <Button size="lg" variant="outline">
              Browse All Prompts
            </Button>
          </Link>
        </div>
      </section>

      <BentoGrid />

      <CtaSection />
    </Container>
  );
}
