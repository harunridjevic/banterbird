import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/banterbird-logo.png",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
