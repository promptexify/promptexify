import { GeistMono } from "geist/font/mono";
import "./globals.css";

import { ThemeProvider } from "@/components/ui/theme";
import { Toaster } from "@/components/ui/sonner";
import { headers } from "next/headers";
import { seoConfig } from "@/config/seo";
import dynamic from "next/dynamic";

const GoogleOneTap = dynamic(
  () => import("@/components/google-one-tap").then((m) => ({ default: m.GoogleOneTap })),
);
const GoogleAnalytics = dynamic(
  () => import("@/components/google-analytics").then((m) => ({ default: m.GoogleAnalytics })),
);

export const metadata = seoConfig;

export default async function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  // Get CSP nonce for inline scripts/styles
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || "";
  const isProduction = process.env.NODE_ENV === "production";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* All security headers are now handled by middleware */}
        {/* Only keep favicon and theme-related meta tags */}
        <link
          rel="icon"
          type="image/x-icon"
          href="/static/favicon/favicon.ico"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/static/favicon/favicon-16x16.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/static/favicon/favicon-32x32.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/static/favicon/apple-touch-icon.png"
        />
        <link rel="manifest" href="/static/favicon/site.webmanifest" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="msapplication-TileColor" content="#ffffff" />

        {/* CSP nonce handling - always set nonce if available */}
        {nonce && (
          <script
            nonce={nonce}
            suppressHydrationWarning={true}
            dangerouslySetInnerHTML={{
              __html: `window.__CSP_NONCE__ = "${nonce}";`,
            }}
          />
        )}
        {/* Fallback for development when no nonce is available */}
        {!nonce && !isProduction && (
          <script
            suppressHydrationWarning={true}
            dangerouslySetInnerHTML={{
              __html: `window.__CSP_NONCE__ = null; // Development mode - no CSP nonces`,
            }}
          />
        )}
      </head>
      <body className={GeistMono.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          {modal}
          <GoogleOneTap />
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID || ""} />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
