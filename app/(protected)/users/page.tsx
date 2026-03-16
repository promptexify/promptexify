import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { UsersTable } from "@/components/dashboard/users-table";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { setMetadata } from "@/config/seo";

export const dynamic = "force-dynamic";

export const metadata = setMetadata({
  title: "Users",
  description: "Manage platform users, roles, and account status",
});

export default async function UsersManagementPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/signin");
  }

  if (user.userData?.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "200px",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="mb-2">
            <h1 className="text-2xl font-bold tracking-tight">
              User Management
            </h1>
            <p className="text-muted-foreground">
              View all users, manage roles, and control account access
            </p>
          </div>
          <UsersTable />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
