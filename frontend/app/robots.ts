import type { MetadataRoute } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://system-strzelecki.pl"
).replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    // Keep the wildcard policy unchanged, including training crawlers. Named
    // search crawlers may read noindex on account/checkout shells; this grants
    // no API permissions. Specific groups do not inherit wildcard restrictions.
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: [
        "/premium/zakup",
        "/admin",
        "/admin/",
        "/achievements",
        "/achievements/",
        "/club-members",
        "/club-members/",
        "/dashboard",
        "/dashboard/",
        "/historical-results/",
        "/judge",
        "/judge/",
        "/live-results",
        "/live-results/",
        "/organizer",
        "/organizer/",
        "/profile",
        "/profile/",
        "/ranking",
        "/ranking/",
        "/start-history",
        "/start-history/",
        "/activate",
        "/forgot-password",
        "/reset-password",
      ],
    }, {
      userAgent: ["Googlebot", "bingbot", "OAI-SearchBot"],
      allow: "/",
      disallow: [
        // This is an authenticated Route Handler, not an HTML account shell.
        "/admin/codex-command",
        // Result access and the Premium/public archive boundary stay unchanged
        // pending the separate product decision in topic 17.
        "/historical-results/",
        "/live-results",
        "/live-results/",
        "/ranking",
        "/ranking/",
      ],
    }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
