import type { NextConfig } from "next";
import { webpRewrites } from "./webp-rewrites.generated";

const nextConfig: NextConfig = {
  // Old DB / CDN URLs still end in .png|.jpg — serve matching .webp.
  async rewrites() {
    return [
      // Legacy typo folder → current assets
      {
        source: '/gready-king/:path*',
        destination: '/greedy-lion/:path*',
      },
      ...webpRewrites,
    ];
  },
};

export default nextConfig;
