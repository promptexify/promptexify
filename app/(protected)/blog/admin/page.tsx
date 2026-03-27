import { requireAdmin } from "@/lib/auth";
import { getAllBlogPostsAdmin } from "@/lib/blog-query";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { BlogPostActions } from "@/components/blog/blog-post-actions";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  await requireAdmin();
  const currentUser = await getCurrentUser();
  const { posts, pagination } = await getAllBlogPostsAdmin(1, 50);

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "200px", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" user={currentUser!} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Blog Articles</h1>
              <p className="text-sm text-muted-foreground">{pagination.totalCount} total articles</p>
            </div>
            <div className="flex gap-2">
              <Link href="/blog/admin/import">
                <Button variant="outline" size="sm">Import</Button>
              </Link>
              <Link href="/blog/admin/new">
                <Button size="sm">+ New Article</Button>
              </Link>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Articles</CardTitle>
              <CardDescription>Manage your blog articles — draft and published.</CardDescription>
            </CardHeader>
            <CardContent>
              {posts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No articles yet.{" "}
                  <Link href="/blog/admin/new" className="underline">
                    Write your first article →
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reading time</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell className="font-medium max-w-[300px]">
                          <div className="truncate">{post.title}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate">/blog/{post.slug}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={post.status === "PUBLISHED" ? "default" : "secondary"}>
                            {post.status === "PUBLISHED" ? "Published" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {post.readingTime ? `${post.readingTime} min` : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(post.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <BlogPostActions postId={post.id} slug={post.slug} status={post.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
