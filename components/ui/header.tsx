"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Menu, ChevronDown, ChevronRight } from "@/components/ui/icons";
import { Navbar } from "@/components/ui/navbar";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import type { ParentCategoryNav } from "@/lib/content";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Container } from "@/components/ui/container";

// Mobile Navigation Component — parent categories as menu items, subcategories in collapsibles
function MobileNav({
  parentCategories,
}: {
  parentCategories: ParentCategoryNav[];
}) {
  const { user } = useAuth();
  const [openParentId, setOpenParentId] = useState<string | null>(null);

  return (
    <nav className="flex flex-col space-y-4 px-4">
      <div className="space-y-2">
        <SheetClose asChild>
          <Link
            href="/"
            className="block px-3 py-2 text-sm font-medium text-foreground hover:text-foreground/80 hover:bg-accent rounded-md transition-colors"
          >
            Home
          </Link>
        </SheetClose>
        <SheetClose asChild>
          <Link
            href="/directory"
            className="block px-3 py-2 text-sm font-medium text-foreground hover:text-foreground/80 hover:bg-accent rounded-md transition-colors"
          >
            All Prompts
          </Link>
        </SheetClose>
        {parentCategories.map((cat) => {
          const hasSubcategories = cat.children?.length;
          if (!hasSubcategories) {
            return (
              <SheetClose key={cat.id} asChild>
                <Link
                  href={`/directory?category=${encodeURIComponent(cat.slug)}`}
                  className="block px-3 py-2 text-sm font-medium text-foreground hover:text-foreground/80 hover:bg-accent rounded-md transition-colors"
                >
                  {cat.name}
                </Link>
              </SheetClose>
            );
          }
          const isOpen = openParentId === cat.id;
          return (
            <Collapsible
              key={cat.id}
              open={isOpen}
              onOpenChange={(o) => setOpenParentId(o ? cat.id : null)}
            >
              <div className="flex items-center gap-1">
                <SheetClose asChild>
                  <Link
                    href={`/directory?category=${encodeURIComponent(cat.slug)}`}
                    className="flex-1 px-3 py-2 text-sm font-medium text-foreground hover:text-foreground/80 hover:bg-accent rounded-md transition-colors"
                  >
                    {cat.name}
                  </Link>
                </SheetClose>
                <CollapsibleTrigger
                  className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "Close subcategories" : "Open subcategories"}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-1 pl-2">
                {cat.children!.map((child) => (
                  <SheetClose key={child.id} asChild>
                    <Link
                      href={`/directory?category=${encodeURIComponent(cat.slug)}&subcategory=${encodeURIComponent(child.slug)}`}
                      className="block px-3 py-1.5 pl-4 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      {child.name}
                    </Link>
                  </SheetClose>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Auth Section */}
      <div className="border-t pt-4 mt-6">
        {user ? (
          <div className="space-y-2">
            <SheetClose asChild>
              <Link
                href="/dashboard"
                className="block px-3 py-2 text-sm font-medium text-foreground hover:text-foreground/80 hover:bg-accent rounded-md transition-colors"
              >
                Dashboard
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link
                href="/account"
                className="block px-3 py-2 text-sm font-medium text-foreground hover:text-foreground/80 hover:bg-accent rounded-md transition-colors"
              >
                Account
              </Link>
            </SheetClose>
          </div>
        ) : (
          <div className="space-y-2">
            <SheetClose asChild>
              <Link
                href="/signin"
                className="block w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-primary/90"
              >
                Sign In
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link
                href="/signup"
                className="block w-full text-center border border-border px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent"
              >
                Sign Up
              </Link>
            </SheetClose>
          </div>
        )}
      </div>
    </nav>
  );
}

export function Header({
  parentCategories = [],
}: {
  parentCategories?: ParentCategoryNav[];
}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          // Only update state if there's a meaningful change
          if (Math.abs(currentScrollY - lastScrollY) > 5) {
            // Determine if header background should be shown
            setIsScrolled(currentScrollY > 0);

            // Determine scroll direction and visibility
            if (currentScrollY < lastScrollY || currentScrollY < 10) {
              // Scrolling up or near top - show header
              setIsVisible(true);
            } else if (currentScrollY > lastScrollY && currentScrollY > 80) {
              // Scrolling down and past threshold - hide header
              setIsVisible(false);
            }

            setLastScrollY(currentScrollY);
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    // Set initial state
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ease-in-out transform ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      } ${
        isScrolled
          ? "border-border/40 bg-background/75 backdrop-blur-sm supports-[backdrop-filter]:bg-background/75"
          : "border-transparent bg-transparent"
      }`}
    >
      <Container className="h-14 py-0">
        {/* Desktop Layout */}
        <div className="hidden lg:grid lg:grid-cols-3 h-full items-center">
          <div className="flex items-center justify-self-start">
            <Logo />
          </div>
          <div className="flex items-center justify-center justify-self-center min-w-0 flex-1">
            <nav className="flex items-center justify-center">
              <Suspense fallback={<div className="w-96 h-10" />}>
                <Navbar parentCategories={parentCategories} />
              </Suspense>
            </nav>
          </div>
          <div className="flex items-center space-x-4 justify-self-end">
            {user ? (
              <UserProfileDropdown user={user} />
            ) : (
              <>
                <Link
                  href="/signin"
                  className="inline-flex h-9 items-center justify-center text-sm font-medium text-foreground border border-border rounded-md px-4 py-2 transition-colors hover:text-foreground/80"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="flex lg:hidden items-center justify-between h-full">
          <div className="flex items-center">
            <Logo />
          </div>

          <div className="flex items-center space-x-2">
            {/* User profile dropdown for mobile (if authenticated) */}
            {user && (
              <div className="hidden sm:block">
                <UserProfileDropdown user={user} />
              </div>
            )}

            {/* Mobile menu trigger */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[300px] sm:w-[400px] px-4"
              >
                <SheetHeader>
                  <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                  <SheetDescription>
                    Navigation menu for browsing prompts and accessing account
                    features
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <MobileNav parentCategories={parentCategories} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </Container>
    </header>
  );
}
