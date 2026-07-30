import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/ops/", "/api/", "/chat/", "/match"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
