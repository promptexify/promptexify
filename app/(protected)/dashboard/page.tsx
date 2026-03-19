import { AppSidebar } from "@/components/dashboard/admin-sidebar";
// import { ChartAreaInteractive } from "@/components/dashboard/user-chart";
import {
  SectionCards,
  // EngagementCards,
  // PopularCategoriesCard,
} from "@/components/dashboard/section-cards";
import { SiteHeader } from "@/components/dashboard/site-header";
import { UserStatsCards } from "@/components/dashboard/user-stats-cards";
import { SecurityDashboard } from "@/components/dashboard/security-dashboard";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireAuth } from "@/lib/auth";
import {
  getUserDashboardStatsAction,
  getAdminDashboardStatsAction,
} from "@/actions/users";
import { Shield, BarChart3 } from "@/components/ui/icons";
import { setMetadata } from "@/config/seo";


export const metadata = setMetadata({
  title: "Dashboard",
  description: "Overview of your activity and saved content",
});

export default async function DashboardPage() {
  // Enforce authentication using standardized requireAuth function
  // This provides consistent security across all dashboard pages
  const user = await requireAuth();

  // If user is a regular USER, show user dashboard
  if (user.userData?.role === "USER") {
    // Fetch user dashboard statistics
    const dashboardStats = await getUserDashboardStatsAction();

    if (!dashboardStats.success || !dashboardStats.data) {
      // Handle error gracefully
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
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">
                  Unable to load dashboard
                </h2>
                <p className="text-muted-foreground">
                  Please try refreshing the page or contact support if the
                  problem persists.
                </p>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      );
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
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-4 p-4 md:p-6">
                {/* Welcome Message */}
                <div className="mb-6">
                  <p className="text-muted-foreground">
                    Here&apos;s an overview of your activity and saved content.
                  </p>
                </div>

                {/* User Statistics */}
                <UserStatsCards
                  totalStars={dashboardStats.data.totalStars}
                  joinedDate={dashboardStats.data.joinedDate}
                  recentStars={dashboardStats.data.recentStars}
                />
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // For ADMIN role, show the admin dashboard with tabs
  // Fetch admin dashboard statistics
  const adminDashboardStats = await getAdminDashboardStatsAction();

  // Handle admin dashboard stats error
  if (!adminDashboardStats.success) {
    console.error(
      "Failed to load admin dashboard stats:",
      adminDashboardStats.error
    );
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
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {/* Admin Dashboard Header */}
              <div className="px-4 lg:px-6">
                <div className="flex items-center gap-4 mb-6">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                      Admin Dashboard
                    </h1>
                    <p className="text-muted-foreground">
                      Monitor your platform&apos;s performance, security, and
                      content management
                    </p>
                  </div>
                </div>
              </div>

              {/* Admin Dashboard Tabs */}
              <div className="px-4 lg:px-6">
                <Tabs defaultValue="overview" className="space-y-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger
                      value="overview"
                      className="flex items-center gap-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      Overview
                    </TabsTrigger>
                    <TabsTrigger
                      value="security"
                      className="flex items-center gap-2"
                    >
                      <Shield className="h-4 w-4" />
                      Security
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-3">
                    {/* Main Dashboard Statistics Cards */}
                    {adminDashboardStats.success ? (
                      <SectionCards
                        dashboardStats={adminDashboardStats.data}
                        isLoading={false}
                      />
                    ) : (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                        <p className="text-sm text-destructive">
                          <strong>Error loading dashboard statistics:</strong>{" "}
                          {adminDashboardStats.error}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Please refresh the page to try again.
                        </p>
                      </div>
                    )}

                    {/* Engagement Statistics Cards */}
                    {/* <div>
                      <EngagementCards
                        dashboardStats={
                          adminDashboardStats.success
                            ? adminDashboardStats.data
                            : undefined
                        }
                        isLoading={!adminDashboardStats.success}
                      />
                    </div> */}

                    {/* Popular Categories and Insights */}
                    {/* <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
                      <PopularCategoriesCard
                        dashboardStats={
                          adminDashboardStats.success
                            ? adminDashboardStats.data
                            : undefined
                        }
                        isLoading={!adminDashboardStats.success}
                      />
                    </div> */}

                    {/* <ChartAreaInteractive /> */}
                  </TabsContent>

                  <TabsContent value="security" className="space-y-6">
                    <SecurityDashboard />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
