import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GridBackground } from "@/components/ui/grid-background";
import { setMetadata } from "@/config/seo";

export const metadata = setMetadata({
  title: "AI Prompt Generator",
  description:
    "AI-powered prompt generator coming soon to Promptexify. Create perfect Cursor rules, MCP configs, and Claude Code skills automatically.",
  robots: { index: false, follow: true },
});

export default function PromptGeneratorPage() {
  return (
    <Container className="min-h-screen bg-background py-16">
      <div className="flex items-center justify-center min-h-[60vh] relative">
        {/* Grid Background */}
        <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
          <GridBackground className="w-full h-full opacity-30" gridSize={60} />
          {/* Gradient Overlays for fade effect */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-background to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-background to-transparent" />
          <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-background to-transparent" />
        </div>

        <div className="text-center max-w-4xl mx-auto px-4 relative z-10">
          {/* Icon */}
          <div className="mb-8 flex justify-center">
            <div className="w-24 h-24 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
          </div>

          {/* Main Content */}
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-b from-zinc-900 to-zinc-600 bg-clip-text text-transparent mb-6 dark:from-zinc-100 dark:to-zinc-400">
            Coming Soon
          </h1>

          <h2 className="text-2xl md:text-3xl font-semibold text-zinc-700 dark:text-zinc-300 mb-6">
            AI Prompt Generator
          </h2>

          <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl mx-auto leading-relaxed">
            We&apos;re working on an intelligent prompt generator that will help
            you create perfect prompts automatically. Get ready to supercharge
            your AI interactions!
          </p>

          {/* Features Preview */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto">
            <div className="p-4 rounded-lg border bg-background/50 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2 mx-auto">
                <svg
                  className="w-4 h-4 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 className="font-medium text-sm">Instant Generation</h3>
            </div>

            <div className="p-4 rounded-lg border bg-background/50 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2 mx-auto">
                <svg
                  className="w-4 h-4 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
                  />
                </svg>
              </div>
              <h3 className="font-medium text-sm">Customizable</h3>
            </div>

            <div className="p-4 rounded-lg border bg-background/50 backdrop-blur-sm sm:col-span-2 lg:col-span-1">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2 mx-auto">
                <svg
                  className="w-4 h-4 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="font-medium text-sm">AI-Powered</h3>
            </div>
          </div>

          {/* Call to Action */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="font-semibold">
              <Link href="/directory">Browse Existing Prompts</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="font-semibold"
            >
              <Link href="/signup">Get Notified When Ready</Link>
            </Button>
          </div>

          {/* Status Badge */}
          <div className="mt-12">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-sm font-medium">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              In Development
            </span>
          </div>
        </div>
      </div>
    </Container>
  );
}
