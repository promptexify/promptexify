import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getFeaturedPosts } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { Suspense } from "react";
import { PostMasonrySkeleton } from "@/components/post-masonry-skeleton";
import { HeroSection } from "@/components/ui/hero-section";
import { Container } from "@/components/ui/container";
import { getSettingsAction } from "@/actions/settings";
import { SafeAsync } from "@/components/ui/safe-async";
import { FeaturedPostsClient } from "@/components/featured-posts-client";
import nextDynamic from "next/dynamic";

const BentoGrid = nextDynamic(
  () => import("@/components/ui/bento-grid").then((m) => ({ default: m.BentoGrid })),
);
const CtaSection = nextDynamic(
  () => import("@/components/ui/cta-section").then((m) => ({ default: m.CtaSection })),
);

export const dynamic = "force-dynamic";

async function PostGrid() {
  const [userResult, settingsResult] = await Promise.allSettled([
    getCurrentUser(),
    getSettingsAction(),
  ]);

  const currentUser =
    userResult.status === "fulfilled" ? userResult.value : null;
  const userId = currentUser?.userData?.id;
  const userType = currentUser?.userData?.type || null;

  let featuredPostsLimit = 12;
  if (settingsResult.status === "fulfilled") {
    const s = settingsResult.value;
    if (s?.success && s.data?.featuredPostsLimit) {
      featuredPostsLimit = s.data.featuredPostsLimit;
    }
  }

  const featuredPosts = await getFeaturedPosts(userId, featuredPostsLimit);

  return <FeaturedPostsClient posts={featuredPosts} userType={userType} />;
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
