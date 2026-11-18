# Page metadata and share previews

Reviewed 17 November 2026 (SEO/GEO topic 07).

Public pages use `lib/page-metadata.ts:createPageMetadata` in server components.
Supply the full page title, description and canonical path. The helper returns
complete Open Graph and Twitter objects with the same title and description,
`pl_PL`, site name, absolute canonical/share URLs and an image fallback. Next.js
16.2.6 merges nested metadata shallowly: overriding `openGraph` in a child drops
all parent Open Graph fields. Do not add a partial object beside this helper.

Root layout owns application metadata, icons and metadataBase. Page-specific
share metadata belongs to pages, including the home page, so descendants do not
inherit the home page's `og:url`. Account/Premium indexing rules remain in
`INDEXING.md`; metadata never grants access to API or paid data.

## URL policy

- Each current public page has a self-canonical path. The shared event map uses
  `/competitions/map`; `/trainings/map` permanently redirects there with its query.
- List/map `status` values (`upcoming`, `live`, `finished`, `joined`, unsupported
  values) are views of the same resource, canonicalized to the unfiltered path.
  They keep the resource's title, description and previews. Unknown statuses
  continue to use the existing UI fallback. No new indexable filter pages.
- Tracking/query parameters and fragments are excluded from canonical and OG
  URLs, including event details and Premium checkout. Query values never enter
  share metadata. Checkout retains `noindex, nofollow`; other noindex layouts,
  robots.txt and sitemap are unchanged. Invalid identifiers retain real 404s.
- `NEXT_PUBLIC_SITE_URL` supplies the public site origin (default production).
  Image paths beginning with one slash resolve against that origin, never the
  internal `API_URL`. Absolute HTTP(S) image URLs require a DNS host with a dot,
  no credentials and no localhost/local/internal suffix. IP literals and other
  schemes, protocol-relative, malformed or inline URLs are omitted. This is
  syntactic URL validation, not a guarantee that an external host returns an
  image; the helper performs no remote probes during rendering.
- A valid organizer logo goes first, followed by the existing site logo in both
  OG and Twitter. Without a usable logo only the site logo is emitted. A logo
  equal to the fallback is deduplicated. Only the fallback has declared width
  and height. Inline/data logos in page content are unchanged (topic 09).
  Multiple images offer a fallback candidate; an external platform decides
  which one to display and is not guaranteed to retry a broken first image.

Next.js's default streaming behavior is retained. HTML-limited sharing bots
(Twitterbot, facebookexternalhit, Slackbot, Discordbot, bingbot) receive metadata
in head; other agents receive metadata in server-rendered HTML, possibly after
the initial body. No JavaScript is required to read the complete HTTP response.

After `npm run build`, run `npm run test:event-pages`. Its isolated API fixtures
cover both kinds of event with/without public logos, rejected image inputs,
query variants, bot HTML/head metadata, all public information pages, maps,
Premium checkout noindex, and the existing 404/API failure behavior. No fixture
writes production data. `npm run test:sitemap` retains the separate sitemap
regressions. CI runs both suites.

Sources: installed `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md`
and `01-app/03-api-reference/04-functions/generate-metadata.md` (shallow merging,
metadataBase and streaming), plus the installed default HTML-limited bot list.
