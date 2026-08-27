import type { MetadataRoute } from "next";

/**
 * /sitemap.xml -- Next.js App Router auto-generates this from the default
 * export below. Lists only the real, public, indexable marketing pages;
 * every authenticated app route (/console, /vendor, /api) is deliberately
 * excluded, same boundary robots.ts draws. Needed before Search Console
 * submission actually helps ranking -- a site with no sitemap leaves
 * Google to discover pages by crawling links alone, slower and less
 * complete than a submitted sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://crm.angroup.in";
  const now = new Date();

  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
    { path: "/partner-signup", priority: 0.8, changeFrequency: "monthly" },
    { path: "/track-workorder", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/refund-policy", priority: 0.3, changeFrequency: "yearly" },
  ];

  return pages.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
