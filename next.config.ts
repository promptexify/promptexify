import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },

  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        bufferutil: "bufferutil",
        "utf-8-validate": "utf-8-validate",
        "supports-color": "supports-color",
      });
    }

    if (!dev && !isServer) {
      // Do not emit source maps in production — they expose full TypeScript
      // source to anyone who requests *.js.map from the CDN/server.
      // Upload maps to your error-monitoring tool (e.g. Sentry) during CI
      // instead of shipping them with the public bundle.
      config.devtool = false;
    }

    config.ignoreWarnings = [
      { module: /node_modules\/@supabase\/realtime-js/ },
      { module: /node_modules\/node-gyp-build/ },
      { module: /node_modules\/bufferutil/ },
      { module: /node_modules\/utf-8-validate/ },
      { message: /Critical dependency: the request of a dependency is an expression/ },
    ];

    return config;
  },

  serverExternalPackages: [
    "@supabase/realtime-js",
    "bufferutil",
    "utf-8-validate",
    "ioredis",
  ],

  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "localprompt.s3.us-west-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "**.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },

  // CSP and security headers are handled dynamically by middleware (with nonces).
  // Do NOT add a static Content-Security-Policy here — it would create a
  // duplicate header that conflicts with the middleware's nonce-based CSP.
  async headers() {
    return [
      {
        source: "/api/v1/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            // Never fall back to "*" — that allows any site to read API responses.
            // "null" tells browsers to deny all cross-origin requests by default.
            value: process.env.NEXT_PUBLIC_BASE_URL || "null",
          },
          {
            key: "Access-Control-Allow-Methods",
            // Restrict to only the methods the API actually uses cross-origin.
            // Mutating methods (PUT, PATCH, DELETE) are protected by CSRF and
            // are not needed by external callers.
            value: "GET,POST,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-CSRF-Token",
            // Access-Control-Allow-Credentials intentionally omitted.
            // The web frontend is same-origin (no cross-origin cookie requests).
            // iOS clients use Bearer tokens, not cookies. If a credentialed
            // cross-origin client is ever added, add Allow-Credentials: true
            // and update the origin allowlist accordingly.
          },
          {
            key: "Access-Control-Max-Age",
            value: "86400",
          },
          {
            key: "Vary",
            // Required when ACAO is a specific origin (not "*") so CDNs/proxies
            // do not serve a cached response carrying the wrong origin's CORS headers.
            value: "Origin",
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/auth",
        destination: "/signin",
        permanent: true,
      },
      {
        source: "/login",
        destination: "/signin",
        permanent: true,
      },
      {
        source: "/register",
        destination: "/signup",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
