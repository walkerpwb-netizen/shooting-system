import type { MetadataRoute } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://system-strzelecki.pl"
).replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin/",
        "/achievements",
        "/achievements/",
        "/club-members",
        "/club-members/",
        "/dashboard",
        "/dashboard/",
        "/historical-results",
        "/historical-results/",
        "/judge",
        "/judge/",
        "/live-results",
        "/live-results/",
        "/organizer",
        "/organizer/",
        "/profile",
        "/profile/",
        "/polityka-prywatnosci",
        "/polityka-prywatnosci/",
        "/publikacja-wynikow",
        "/publikacja-wynikow/",
        "/ranking",
        "/ranking/",
        "/regulamin",
        "/regulamin/",
        "/start-history",
        "/start-history/",
        "/activate",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
