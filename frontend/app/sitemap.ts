import type { MetadataRoute } from "next";

import { apiUrl } from "@/lib/api";
import { getShootingRanges } from "@/lib/shooting-ranges";

export const dynamic = "force-dynamic";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://system-strzelecki.pl"
).replace(/\/+$/, "");

const staticRoutes = [
  {
    path: "/regulamin",
    priority: 0.4,
    changeFrequency: "monthly",
  },
  {
    path: "/polityka-prywatnosci",
    priority: 0.4,
    changeFrequency: "monthly",
  },
  {
    path: "/publikacja-wynikow",
    priority: 0.4,
    changeFrequency: "monthly",
  },
  {
    path: "/historical-results",
    priority: 0.7,
    changeFrequency: "daily",
  },
  {
    path: "/wesprzyj-nas",
    priority: 0.7,
    changeFrequency: "monthly",
  },
  {
    path: "/premium",
    priority: 0.8,
    changeFrequency: "daily",
  },
  {
    path: "/premium/regulamin",
    priority: 0.5,
    changeFrequency: "monthly",
  },
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
    path: "/trainings",
    priority: 0.8,
    changeFrequency: "hourly",
  },
  {
    path: "/shooting-ranges",
    priority: 0.8,
    changeFrequency: "daily",
  },
  {
    path: "/shooting-ranges/map",
    priority: 0.8,
    changeFrequency: "daily",
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
  event_type: "competition" | "training";
};

function absoluteUrl(path: string) {
  return path === "/" ? siteUrl : `${siteUrl}${path}`;
}

function sitemapEntry(
  path: string,
  options: {
    changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority?: number;
  } = {},
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(path),
    // Neither static content nor the event API currently has a reliable date
    // of its last significant change. Omit lastmod until that source exists.
    changeFrequency: options.changeFrequency || "weekly",
    priority: options.priority,
  };
}

async function getEvents(collection: "competitions" | "trainings"): Promise<Competition[]> {
  const path = `/${collection}`;
  const signal = AbortSignal.timeout(5_000);
  let data: unknown;
  try {
    const response = await fetch(apiUrl(path), {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Keep the body read within the same timeout. Only a valid [] means an
    // empty catalog; never publish a partial sitemap on an API failure.
    data = await response.json();
  } catch (cause) {
    throw new Error(`Sitemap API ${signal.aborted ? "timeout" : "failure"}: ${path}`, { cause });
  }

  const eventType = collection === "competitions" ? "competition" : "training";
  if (!Array.isArray(data) || data.some((event) => (
    !event || typeof event !== "object"
    || !Number.isInteger(event.id) || event.id < 1 || event.id > 2_147_483_647
    || typeof event.status !== "string" || event.event_type !== eventType
  ))) {
    throw new Error(`Sitemap API invalid catalog: ${path}`);
  }

  return data as Competition[];
}

async function eventEntries(collection: "competitions" | "trainings") {
  const events = await getEvents(collection);

  return events
    .filter((event) =>
      ["published", "started", "completed"].includes(event.status)
    )
    .sort((first, second) => first.id - second.id)
    .map((event) =>
      sitemapEntry(`/${collection}/${event.id}`, {
        changeFrequency: event.status === "completed" ? "monthly" : "daily",
        priority: collection === "competitions"
          ? event.status === "published" ? 0.8 : 0.7
          : event.status === "published" ? 0.7 : 0.6,
      })
    );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [competitions, trainings, ranges] = await Promise.all([
    eventEntries("competitions"),
    eventEntries("trainings"),
    getShootingRanges(),
  ]);

  return [
    ...staticRoutes.map((route) =>
      sitemapEntry(route.path, {
        changeFrequency: route.changeFrequency,
        priority: route.priority,
      })
    ),
    ...competitions,
    ...trainings,
    ...ranges.sort((a, b) => a.id - b.id).map((range) => sitemapEntry(`/shooting-ranges/${range.id}`)),
  ];
}
