import { notFound, redirect } from "next/navigation";
import {
  getRelatedPosts,
  getFeaturedPostIds,
} from "@/lib/content";
import { Queries } from "@/lib/query";
import type { PostWithInteractions } from "@/lib/content";
import { PostStandalonePage } from "@/components/post-standalone-page";
import { getCurrentUser } from "@/lib/auth";
import { Crown } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { setMetadata } from "@/config/seo";

interface PostPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    modal?: string;
  }>;
}

export const dynamic = "force-dynamic";

// Use static metadata with template title
export const metadata = setMetadata({
  title: "AI Prompt", // This will use the template: "AI Prompt | Promptexify"
  description:
    "Discover high-quality AI prompts for ChatGPT, Claude, Gemini, and more. Browse our comprehensive collection of tested prompts for creative writing, business, design, and more.",
  openGraph: {
    type: "article",
    title: "AI Prompt - Promptexify",
    description:
      "Discover high-quality AI prompts for ChatGPT, Claude, Gemini, and more.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Prompt - Promptexify",
    description:
      "Discover high-quality AI prompts for ChatGPT, Claude, Gemini, and more.",
  },
});

export async function generateStaticParams() {
  try {
    const ids = await getFeaturedPostIds(100);
    return ids.map((id) => ({ id }));
  } catch (error) {
    console.error("Error in generateStaticParams:", error);
    return [];
  }
}

export default async function PostPage({
  params,
  searchParams,
}: PostPageProps) {
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

  // Check premium access control
  const userType = currentUser?.userData?.type || null;
  const userRole = currentUser?.userData?.role || null;

  // If this is premium content, check user access
  if (processedPost.isPremium) {
    const isUserFree = userType === "FREE" || userType === null;
    const isAdmin = userRole === "ADMIN";

    // Only allow access for premium users and admins
    if (isUserFree && !isAdmin) {
      redirect("/pricing");
    }
  }

  const relatedPosts = await getRelatedPosts(id, processedPost, userId, 6);

  return (
    <>
      {processedPost.isPremium && (userType === "FREE" || userType === null) ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <Crown className="w-12 h-12 text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Premium Content</h1>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            This content requires a Premium subscription to access. Upgrade now
            to unlock exclusive AI prompts and advanced features.
          </p>
          <Link href="/pricing">
            <Button
              size="lg"
              className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
            >
              <Crown className="w-4 h-4 mr-2" />
              Upgrade to Premium
            </Button>
          </Link>
        </div>
      ) : (
        <PostStandalonePage
          post={processedPost}
          relatedPosts={relatedPosts}
          userType={userType}
        />
      )}
    </>
  );
}
