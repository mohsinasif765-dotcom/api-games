import type { NextConfig } from "next";
import { webpRewrites } from "./webp-rewrites.generated";

const nextConfig: NextConfig = {
  // /public defaults to `max-age=0`, so every WebView open re-validates every
  // image/sound. Cache them for a day and refresh in the background after.
  // (Files are overwritten in place, not fingerprinted, so no `immutable`.)
  async headers() {
    return [
      {
        source: '/:all*\\.(webp|png|jpg|jpeg|gif|svg|mp3|ogg|wav)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
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
