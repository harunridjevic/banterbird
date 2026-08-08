import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://banterbird.app";

  // Use fixed dates rather than new Date() — dynamic lastModified causes
  // Googlebot to see a "changed" sitemap on every crawl and wastes crawl budget.
  return [
    {
      url: baseUrl,
      lastModified: "2026-07-30",
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: "2026-07-30",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: "2026-07-30",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: "2026-07-30",
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/terms`,
      lastModified: "2026-07-30",
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/cookies`,
      lastModified: "2026-07-30",
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/community`,
      lastModified: "2026-07-30",
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/refund`,
      lastModified: "2026-08-08",
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
