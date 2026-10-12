import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Every production build compiles from source. Railway restores .next/cache between
    // deploys, and a build warmed by that cache shipped the previous deploy's theme in
    // its stylesheet, under the new components (KI-015). A cold build takes seconds longer.
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
