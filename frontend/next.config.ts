import type { NextConfig } from "next";

// Where the FastAPI backend lives.
// - Local dev:              http://127.0.0.1:8000 (default)
// - Yegara cPanel (prod):   https://api.<your-domain>  (set BACKEND_URL before `npm run build:cpanel`)
// Rewrites are baked in at build time, so BACKEND_URL must be set when building.
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone/server.js) for cPanel "Setup Node.js App"
  output: "standalone",
  // Avoid shipping the native `sharp` binary to shared hosting; images are already WebP-optimised by the backend.
  images: { unoptimized: true },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/static/:path*",
        destination: `${BACKEND_URL}/static/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
