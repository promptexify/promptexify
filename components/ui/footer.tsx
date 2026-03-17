import Link from "next/link";
import { Github } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { Container } from "@/components/ui/container";
import { DarkModeToggle } from "@/components/ui/toggle-darkmode";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background">
      <Container className="sm:px-6 md:py-16">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 lg:gap-10 xl:gap-13 items-start justify-center">
          {/* Brand and Description */}
          <div className="space-y-4 col-span-1 sm:col-span-2 md:col-span-2 lg:col-span-3">
            <Logo />
            <p className="text-sm text-muted-foreground max-w-md">
              Directory for the new coding era. Rules, MCP, Skills, and prompts
              for Cursor, Claude Code, and more. Better prompts, better code.
            </p>
            <div className="flex items-center space-x-2 mt-5">
              <Link
                href="https://github.com/chhayvoinvy/promptexify"
                className="flex items-center justify-center h-10 w-10 border border-input rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label="GitHub"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-[1.2rem] w-[1.2rem]" />
              </Link>
              <DarkModeToggle />
            </div>
          </div>

          {/* Services (Temporary hidden) - keeps grid spacing so Company stays right */}
          <div className="space-y-3 sm:space-y-4 opacity-0 lg:col-span-2">
            <h3 className="font-semibold text-sm">Services</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/features" className="text-muted-foreground hover:text-foreground transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/prompt-generator"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Prompt Generator
                </Link>
              </li>
            </ul>
          </div>

          {/* Company - keep on the right (same as original layout) */}
          <div className="space-y-3 sm:space-y-4 lg:col-start-6 lg:col-span-2 lg:text-right">
            <h3 className="font-semibold text-sm">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/privacy"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contact Us
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  About Us
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 border-t border-border/40 pt-6 sm:mt-12 sm:pt-8">
          <div className="flex flex-col items-center justify-between space-y-1 text-center md:flex-row md:space-y-0 md:text-left">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Promptexify.
            </p>
            <p className="text-sm text-muted-foreground">
              Prompts can generate inaccurate results. Please process with
              caution.
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
