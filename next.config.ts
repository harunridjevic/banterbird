import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Single canonical path shape for Google (avoids sitemap URLs that only redirect)
  trailingSlash: false,
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  async redirects() {
    return [
      // Do NOT redirect www↔apex here — Vercel/DNS already handles the primary domain.
      // Doing both causes ERR_TOO_MANY_REDIRECTS on www.banterbird.app.
      // Legacy /match lobby → homepage (do not keep /match in sitemap)
      {
        source: "/match",
        destination: "/",
        permanent: true,
      },
      {
        source: "/match/",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
