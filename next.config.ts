import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Single canonical host/path shape for Google (avoids sitemap URLs that only redirect)
  trailingSlash: false,
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  async redirects() {
    return [
      // Apex is canonical — www should not be indexed as a separate host
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.banterbird.app" }],
        destination: "https://banterbird.app/:path*",
        permanent: true,
      },
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
