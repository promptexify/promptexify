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
      config.devtool = "hidden-source-map";
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
        source: "/uploads/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; img-src 'self'; media-src 'self';",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            // Never fall back to "*" — that allows any site to read API responses.
            // Set NEXT_PUBLIC_CORS_ALLOWED_ORIGIN to the allowed origin in production.
            // "null" tells browsers to deny all cross-origin requests by default.
            value: process.env.NEXT_PUBLIC_CORS_ALLOWED_ORIGIN || "null",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-CSRF-Token",
          },
          {
            key: "Access-Control-Max-Age",
            value: "86400",
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
