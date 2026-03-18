"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  IconDashboard,
  IconSearch,
  IconSettings,
  IconEdit,
  IconTags,
  IconCategory,
  IconBookmark,
  IconHeart,
  IconRobot,
  IconUserCircle,
  type Icon,
} from "@/components/ui/icons";
import Link from "next/link";

import { NavDocuments } from "@/components/dashboard/nav-documents";
import { NavMain } from "@/components/dashboard/nav-main";
import { NavSecondary } from "@/components/dashboard/nav-secondary";
import { NavUser } from "@/components/dashboard/admin-nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LogoType } from "@/components/ui/logo";

// Types Interfaces
// ------------------------------------------------------------
interface UserData {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
  type: "FREE" | "PREMIUM" | null;
  role: "USER" | "ADMIN" | null;
  oauth: "GOOGLE" | "EMAIL";
}

interface User {
  email?: string;
  userData?: UserData | null;
}

interface NavigationItem {
  title: string;
  url: string;
  icon: Icon;
  adminOnly?: boolean;
  allowUser?: boolean;
}

// Navigation Data
// ------------------------------------------------------------
const navigationData: {
  navMain: NavigationItem[];
  navSecondary: NavigationItem[];
  contentManagement: NavigationItem[];
} = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
      title: "Bookmarks",
      url: "/bookmarks",
      icon: IconBookmark,
    },
    {
      title: "Favorites",
      url: "/favorites",
      icon: IconHeart,
    },
  ],

  navSecondary: [
    {
      title: "Search",
      url: "/directory",
      icon: IconSearch,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
      adminOnly: true, // Admin only
    },
  ],

  contentManagement: [
    {
      title: "Posts",
      url: "/posts",
      icon: IconEdit,
      // adminOnly: true, // Admin only
      allowUser: true, // Allow both USER and ADMIN roles (Temporary disabled)
    },
    {
      title: "Categories",
      url: "/categories",
      icon: IconCategory,
      adminOnly: true, // Admin only
    },
    {
      title: "Tags",
      url: "/tags",
      icon: IconTags,
      adminOnly: true, // Admin only
    },
    {
      title: "Automation",
      url: "/automation",
      icon: IconRobot,
      adminOnly: true,
    },
    {
      title: "Users",
      url: "/users",
      icon: IconUserCircle,
      adminOnly: true,
    },
  ],
};

// App Sidebar
// ------------------------------------------------------------
interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: User;
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const isAdmin = user.userData?.role === "ADMIN";
  const isUser = user.userData?.role === "USER";

  const [allowUserPosts, setAllowUserPosts] = useState(true);

  useEffect(() => {
    if (!isUser) return; // admins always see everything; no need to fetch
    fetch("/api/settings/content-config", { credentials: "same-origin" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data.allowUserPosts === "boolean") {
          setAllowUserPosts(data.allowUserPosts);
        }
      })
      .catch(() => {}); // fail silently — defaults to true
  }, [isUser]);

  const filteredNavMain = navigationData.navMain.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const filteredNavSecondary = navigationData.navSecondary.filter(
    (item) => !item.adminOnly || isAdmin
  );

  // Filter content management items based on user role
  const filteredContentManagement = navigationData.contentManagement
    .filter((item) => {
      if (item.adminOnly) return isAdmin;
      if (item.allowUser) return isAdmin || isUser;
      return isAdmin; // Default to admin only
    })
    .map((item) => {
      // Change "Posts" to "Contribute" for users
      if (item.title === "Posts" && isUser) {
        return {
          ...item,
          title: "Contribute",
        };
      }
      return item;
    });

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="mb-2">
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!px-2 data-[slot=sidebar-menu-button]:!py-5"
            >
              <Link href="/dashboard" className="flex items-center">
                <div className="max-w-[120px]">
                  <LogoType href={null} />
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={filteredNavMain} />

        {/* Show content management section for admins always; for users only when allowUserPosts is on */}
        {(isAdmin || (isUser && allowUserPosts)) && filteredContentManagement.length > 0 && (
          <NavDocuments
            items={filteredContentManagement.map((item) => ({
              name: item.title,
              url: item.url,
              icon: item.icon,
            }))}
          />
        )}
        <NavSecondary items={filteredNavSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
