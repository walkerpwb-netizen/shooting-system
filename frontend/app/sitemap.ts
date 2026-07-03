import type { MetadataRoute } from "next";

import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://system-strzelecki.pl"
).replace(/\/+$/, "");

const staticRoutes = [
  {
    path: "/",
    priority: 1,
    changeFrequency: "daily",
  },
  {
    path: "/competitions",
    priority: 0.9,
    changeFrequency: "hourly",
  },
  {
    path: "/competitions/map",
    priority: 0.8,
    changeFrequency: "hourly",
  },
  {
    path: "/kontakt",
    priority: 0.6,
    changeFrequency: "monthly",
  },
  {
    path: "/pobierz-aplikacje",
    priority: 0.6,
    changeFrequency: "monthly",
  },
] satisfies Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}>;

type Competition = {
  id: number;
  status: string;
};

function absoluteUrl(path: string) {
  return `${siteUrl}${path}`;
}

function sitemapEntry(
  path: string,
  options: {
    lastModified?: string | Date;
    changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority?: number;
  } = {},
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(path),
    lastModified: options.lastModified || new Date(),
    changeFrequency: options.changeFrequency || "weekly",
    priority: options.priority,
  };
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(apiUrl(path), {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json() as T;
  } catch (error) {
    console.error(`Sitemap fetch failed for ${path}`, error);
    return null;
  }
}

async function competitionEntries() {
  const competitions = await getJson<Competition[]>("/competitions");

  if (!competitions) {
    return [];
  }

  return competitions
    .filter((competition) =>
      ["published", "started", "completed"].includes(competition.status)
    )
    .map((competition) =>
      sitemapEntry(`/competitions/${competition.id}`, {
        changeFrequency: competition.status === "completed" ? "monthly" : "daily",
        priority: competition.status === "published" ? 0.8 : 0.7,
      })
    );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const competitions = await competitionEntries();

  return [
    ...staticRoutes.map((route) =>
      sitemapEntry(route.path, {
        changeFrequency: route.changeFrequency,
        priority: route.priority,
      })
    ),
    ...competitions,
  ];
}
