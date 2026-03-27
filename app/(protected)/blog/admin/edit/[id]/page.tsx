import { notFound } from "next/navigation";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { getBlogPostByIdAdmin } from "@/lib/blog-query";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BlogPostForm } from "@/components/blog/blog-post-form";

export const dynamic = "force-dynamic";

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const currentUser = await getCurrentUser();
  const { id } = await params;
  const post = await getBlogPostByIdAdmin(id);
  if (!post) notFound();

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "200px", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" user={currentUser!} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-6 p-6 w-full">
          <div className="flex items-center gap-4">
            <Link href="/blog/admin">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Blog
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Edit Article</h1>
          </div>
          <BlogPostForm
            mode="edit"
            post={{
              id: post.id,
              title: post.title,
              slug: post.slug,
              excerpt: post.excerpt ?? "",
              content: post.content,
              featuredImageUrl: post.featuredImageUrl ?? "",
              status: post.status,
            }}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
