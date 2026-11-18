# Sitemap maintenance

`app/sitemap.ts` is the explicit list of public canonical URLs. Every later task
that adds, removes, redirects or changes the indexing of a public page must update
the sitemap and its acceptance tests in the same change.

- Add static public pages to `staticRoutes`. Add record pages through an anonymous
  public catalog with the appropriate publication filter. Exclude drafts,
  cancelled records, account screens, authenticated results, payment flows,
  redirects, query variants and URLs with another canonical or `noindex`.
- Check GET/HEAD 200, self-canonical metadata and compatibility with `robots.txt`.
  The current `/historical-results` entry is the public archive landing page;
  its protected descendants are excluded. The shared event map is listed at
  `/competitions/map`; `/trainings/map` redirects to it. Do not pre-add planned range, city or
  planned pages before they exist and their public scope is settled. Organizer
  pages are listed only after their owner explicitly publishes an approved name
  and description; disabling publication removes them from the catalog.
- Omit `lastmod` unless its source records the last significant change of the
  public page. Currently static pages have no maintained editorial dates, and
  `Competition` (also used for trainings) has no content modification timestamp.
  Event `date`, `registration_deadline` and `completed_at` are not modification
  dates. Premium `terms_version` identifies a contract revision, without tracking
  all changes to the page (including seller data and shared components).
  Neither request/build/deploy time, file mtime nor the latest repository
  commit is a replacement. An arbitrary future `updated_at` field needs verified
  semantics before the sitemap consumes it.
- To add `lastmod` later, document the source and all relevant public-content
  write paths (including child records). Keep unknown historical values null;
  do not backfill with deployment time. Test unchanged content, a significant
  edit, an unrelated write, missing/invalid dates and XML output. Collection
  pages need their own date accounting for additions and removals too.
- A valid API `[]` is an empty catalog and returns XML 200. HTTP errors,
  connection failures, a 5-second timeout (including body read), malformed JSON
  or an invalid catalog fail the whole sitemap with HTTP 500. Do not convert
  these into an empty catalog or successful partial XML. Both catalogs are read
  afresh; a successful later request recovers without persisting an outage.

After `npm run build`, run `npm run test:sitemap` to test the production runtime
with an isolated API fixture. It uses random loopback ports and never writes
production data. CI also runs it. Existing detail-page status tests remain under
`npm run test:event-pages`.

Source: [Google Search Central: build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
(`lastmod` and canonical URL guidance), reviewed 17 November 2026. Runtime behavior
uses the installed Next.js 16.2.6 guides for sitemap metadata routes and fetch.

# Metadata and share previews

See [METADATA.md](../METADATA.md) for page metadata, canonical/filter and image
fallback rules. `npm run test:event-pages` also checks the rendered OG/Twitter
metadata, image URL cases, sharing bots, public pages and query variants. Keep
these assertions when adding public routes or changing a canonical; changing
indexing still requires the sitemap checks above and the policy in INDEXING.md.
