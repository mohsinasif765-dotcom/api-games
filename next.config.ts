import type { NextConfig } from "next";
import { webpRewrites } from "./webp-rewrites.generated";

const nextConfig: NextConfig = {
  // Old DB / CDN URLs still end in .png|.jpg — serve matching .webp.
  async rewrites() {
    return webpRewrites;
  },
};

export default nextConfig;
