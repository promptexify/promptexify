import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/utils";

export const seoConfig: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: "Promptexify — Cursor Rules, MCP, Claude Code Prompts Directory",
    template: "%s | Promptexify",
  },
  description:
    "The largest directory of Cursor rules, MCP configs, Claude Code skills, and AI coding prompts. Find, copy, and share ready-to-use rulesets for your AI coding workflow.",
  keywords: [
    "Cursor rules",
    "Claude Code prompts",
    "MCP config",
    "AI coding prompts",
    "cursor rules directory",
    "claude code rules",
    "model context protocol",
    "AI Skills",
    "prompt engineering",
    "AI code editor",
    "prompt library",
    "cursor ai rules",
    "claude rules",
    "AI coding tools",
    "prompt templates",
  ],
  authors: [{ name: "Promptexify Team" }],
  creator: "Promptexify",
  publisher: "Promptexify",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: getBaseUrl(),
    title: "Promptexify — Cursor Rules, MCP, Claude Code Prompts Directory",
    description:
      "The largest directory of Cursor rules, MCP configs, Claude Code skills, and AI coding prompts. Find and share ready-to-use rulesets.",
    siteName: "Promptexify",
    images: [
      {
        url: "/static/og-image.png",
        width: 1200,
        height: 630,
        alt: "Promptexify — Cursor Rules, MCP & Claude Code Prompts Directory",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Promptexify — Cursor Rules, MCP, Claude Code Prompts Directory",
    description:
      "The largest directory of Cursor rules, MCP configs, Claude Code skills, and AI coding prompts. Better prompts, better code.",
    images: ["/static/og-image.png"],
    creator: "@promptexify",
    site: "@promptexify",
  },
  icons: {
    icon: "/static/favicon/favicon.ico",
    shortcut: "/static/favicon/favicon-16x16.png",
    apple: "/static/favicon/apple-touch-icon.png",
  },
  manifest: "/static/favicon/site.webmanifest",
};

// Merge custom metadata with the base config
export function setMetadata(customMetadata: Partial<Metadata> = {}): Metadata {
  return {
    ...seoConfig,
    ...customMetadata,
  };
}

// Per-page SEO configurations
export const pageSEOConfigs = {
  home: {
    title: "Promptexify — Cursor Rules, MCP & Claude Code Prompts Directory",
    description:
      "The largest directory of Cursor rules, MCP configs, Claude Code skills, and AI coding prompts. Find and share ready-to-use rulesets for your AI workflow.",
  },
  directory: {
    title: "Browse Prompts & Rules Directory",
    description:
      "Browse thousands of Cursor rules, MCP configs, Claude Code skills, and AI coding prompts. Filter by category, sort by popularity, and copy in one click.",
  },
  search: {
    title: "Search Prompts & Rules",
    description:
      "Search thousands of AI coding prompts, Cursor rules, MCP configs, and Claude Code skills. Find the perfect ruleset for your workflow.",
  },
  promptGenerator: {
    title: "AI Prompt Generator",
    description:
      "Coming soon: AI-powered prompt generator for Cursor, Claude Code, and other AI coding tools. Create perfect rulesets automatically.",
  },
  features: {
    title: "Features",
    description:
      "Explore Promptexify features: browse and share Cursor rules, MCP configs, Claude Code skills, and AI coding prompts.",
  },
  help: {
    title: "Help Center",
    description:
      "Get help with contributing content, using the directory, and getting the most out of Promptexify.",
  },
  about: {
    title: "About Promptexify",
    description:
      "Promptexify is the community directory for Cursor rules, MCP configs, Claude Code skills, and AI coding prompts. Learn about our mission.",
  },
  contact: {
    title: "Contact Us",
    description:
      "Get in touch with the Promptexify team for support, feedback, or partnership inquiries.",
  },
  privacy: {
    title: "Privacy Policy",
    description:
      "Learn how Promptexify collects, uses, and protects your personal information.",
  },
  terms: {
    title: "Terms of Use",
    description:
      "Terms and conditions for using Promptexify, the directory for Cursor rules, MCP, and AI coding prompts.",
  },
  entry: {
    title: "Rule / Prompt",
    description:
      "Cursor rule, MCP config, Claude Code skill, or AI coding prompt. Copy and use immediately with your AI coding tools.",
  },
} as const;

export function getMetadata(pageType: keyof typeof pageSEOConfigs) {
  return setMetadata(pageSEOConfigs[pageType]);
}

// Dynamic per-post metadata
export function generatePostMetadata(post: {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  category?: { name: string } | null;
  tags?: Array<{ name: string }> | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  author?: { name: string | null } | null;
}) {
  const baseUrl = getBaseUrl();

  const title = post.title;
  const description =
    post.description ||
    (post.content
      ? post.content
          .replace(/```[\s\S]*?```/g, "")   // strip fenced code blocks first
          .replace(/`[^`]+`/g, "")           // strip inline code
          .replace(/^#+\s.+\n\n?/m, "")      // strip leading heading
          .replace(/[*_#>\[\]]/g, "")        // strip remaining markdown symbols
          .replace(/\n+/g, " ")
          .trim()
          .substring(0, 155) + "…"
      : `${post.category?.name || "AI coding"} rule or prompt — copy and use with Cursor, Claude Code, and more.`);

  const keywords = [
    post.category?.name,
    ...(post.tags?.map((t) => t.name) ?? []),
    "Cursor rules",
    "Claude Code",
    "MCP",
    "AI coding prompt",
    "prompt engineering",
  ].filter(Boolean) as string[];

  const canonicalUrl = `${baseUrl}/entry/${post.id}`;
  const ogImage = `${baseUrl}/static/og-image.png`;

  // Cap description at 160 chars to prevent Google from truncating with its own ellipsis
  const cappedDescription =
    description.length > 160 ? description.substring(0, 157) + "…" : description;

  return setMetadata({
    title,
    description: cappedDescription,
    keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description: cappedDescription,
      type: "article",
      locale: "en_US",
      url: canonicalUrl,
      siteName: "Promptexify",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      publishedTime: post.createdAt?.toISOString(),
      modifiedTime: post.updatedAt?.toISOString(),
      authors: post.author?.name ? [post.author.name] : undefined,
      tags: post.tags?.map((t) => t.name),
      section: post.category?.name,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: cappedDescription,
      images: [ogImage],
      site: "@promptexify",
      creator: "@promptexify",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  });
}
