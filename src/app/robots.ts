import type { MetadataRoute } from "next";

/**
 * /robots.txt -- Next.js App Router auto-generates this from the default
 * export below. Every authenticated app surface (console, vendor portal,
 * API, auth pages) is disallowed -- there's nothing there for a search
 * engine to usefully index, and crawling it wastes crawl budget that
 * should go to the real marketing pages instead.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/console",
        "/vendor",
        "/api",
        "/login",
        "/register",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/update-password",
        "/vendor-application-status",
        "/profile",
      ],
    },
    sitemap: "https://crm.angroup.in/sitemap.xml",
  };
}
