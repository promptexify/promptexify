"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ParentCategoryNav } from "@/lib/content";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

export function Navbar({
  parentCategories = [],
}: {
  parentCategories?: ParentCategoryNav[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  const subcategory = searchParams.get("subcategory");

  const isActive = (href: string) => {
    // Handle root path
    if (href === "/" && pathname === "/") {
      return true;
    }

    // Handle directory with category and subcategory
    if (href.includes("?category=") && href.includes("&subcategory=")) {
      const url = new URL(href, "https://promptexify.com");
      const hrefCategory = url.searchParams.get("category");
      const hrefSubcategory = url.searchParams.get("subcategory");
      return (
        pathname === url.pathname &&
        category === hrefCategory &&
        subcategory === hrefSubcategory
      );
    }

    // Handle directory with category only
    if (href.includes("?category=")) {
      const [path, categoryParam] = href.split("?category=");
      return pathname === path && category === categoryParam && !subcategory;
    }

    // Handle directory without category
    if (href === "/directory") {
      return pathname === "/directory" && !category;
    }

    return false;
  };

  return (
    <NavigationMenu viewport={false}>
      <NavigationMenuList className="flex flex-nowrap items-center gap-1">
        {parentCategories.map((cat) => {
          const hasSubcategories = cat.children?.length;
          const isParentActive = category === cat.slug && !subcategory;

          if (hasSubcategories) {
            return (
              <NavigationMenuItem key={cat.id}>
                <NavigationMenuTrigger
                  className={cn(isParentActive && "bg-accent text-accent-foreground")}
                >
                  {cat.name}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[200px] gap-1 p-2 md:w-[250px]">
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href={`/directory?category=${encodeURIComponent(cat.slug)}`}
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm font-medium no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                            isParentActive && "bg-accent text-accent-foreground"
                          )}
                        >
                          All {cat.name}
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    {cat.children!.map((child) => (
                      <li key={child.id}>
                        <NavigationMenuLink asChild>
                          <Link
                            href={`/directory?category=${encodeURIComponent(cat.slug)}&subcategory=${encodeURIComponent(child.slug)}`}
                            className={cn(
                              "block rounded-md px-3 py-2 text-sm no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                              category === cat.slug &&
                                subcategory === child.slug &&
                                "bg-accent text-accent-foreground font-medium"
                            )}
                          >
                            {child.name}
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          }

          return (
            <NavigationMenuItem key={cat.id}>
              <NavigationMenuLink
                asChild
                className={cn(
                  navigationMenuTriggerStyle(),
                  isParentActive && "bg-accent text-accent-foreground"
                )}
              >
                <Link href={`/directory?category=${encodeURIComponent(cat.slug)}`}>
                  {cat.name}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
        <NavigationMenuItem>
          <NavigationMenuLink
            asChild
            className={cn(
              navigationMenuTriggerStyle(),
              isActive("/directory") && !category && "bg-accent text-accent-foreground"
            )}
          >
            <Link href="/directory">Directory</Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
