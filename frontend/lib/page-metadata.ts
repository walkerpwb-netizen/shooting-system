import type { Metadata } from "next";
import { isIP } from "node:net";

export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL || "https://system-strzelecki.pl",
).origin;

export const homeTitle = "System Strzelecki | Organizacja zawodów strzeleckich";
export const homeDescription =
  "System Strzelecki pomaga organizować zawody strzeleckie: publikacja zawodów, zapisy zawodników, obsługa sędziów, wyniki na żywo i historia startów.";

const fallbackImage = {
  url: new URL("/icons/system-strzelecki-logo-20260623.png", siteUrl).href,
  width: 1560,
  height: 1008,
  alt: "System Strzelecki",
};

// Share previews need fetchable URLs, not data/blob URLs or internal API hosts.
// Uploaded inline logos remain available in the page, outside these metadata.
function publicImageUrl(value?: string) {
  if (!value) return undefined;
  const candidate = value.trim();
  if (!/^(https?:\/\/|\/(?!\/))/i.test(candidate)) return undefined;
  try {
    const url = new URL(candidate, siteUrl);
    const host = url.hostname;
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || !host.includes('.') || isIP(host) || host.startsWith('[')
      || /\.(localhost|local|internal)$/i.test(host)) return undefined;
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

type PageMetadataOptions = {
  path: `/${string}`;
  title: string;
  description: string;
  type?: "website" | "article";
  image?: { url?: string; alt: string };
  robots?: Metadata["robots"];
};

export function createPageMetadata({
  path, title, description, type = "website", image, robots,
}: PageMetadataOptions): Metadata {
  // Paths identify the resource. Filters, tracking parameters and fragments do
  // not create new canonical pages or share URLs.
  const canonical = new URL(path, siteUrl);
  canonical.search = "";
  canonical.hash = "";
  const imageUrl = publicImageUrl(image?.url);
  const images = imageUrl && imageUrl !== fallbackImage.url
    ? [{ url: imageUrl, alt: image!.alt }, fallbackImage]
    : [fallbackImage];

  // Next merges nested metadata shallowly: always return complete OG/Twitter
  // objects here instead of relying on images or titles from a parent layout.
  return {
    title,
    description,
    alternates: { canonical: canonical.href },
    openGraph: {
      type,
      locale: "pl_PL",
      siteName: "System Strzelecki",
      title,
      description,
      url: canonical.href,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map(({ url, alt }) => ({ url, alt })),
    },
    ...(robots ? { robots } : {}),
  };
}
