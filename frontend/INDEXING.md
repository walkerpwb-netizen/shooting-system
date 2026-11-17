# Indexing and crawler access

Reviewed 17 November 2026 (SEO/GEO topic 06). `app/robots.ts` controls
crawling; server layout metadata controls indexing. Neither grants API access.
Authentication, role checks, field filtering and Premium checks stay in the API.

| Routes | Access and indexing policy | Search crawler rules |
| --- | --- | --- |
| `/`, `/competitions`, `/competitions/map`, `/competitions/[id]`, `/trainings`, `/trainings/map`, `/trainings/[id]`, `/shooting-ranges/map` | Public, indexable published content; event publication filters remain in place | Allow |
| `/kontakt`, `/pobierz-aplikacje`, `/regulamin`, `/polityka-prywatnosci`, `/publikacja-wynikow`, `/wesprzyj-nas`, `/premium`, `/premium/regulamin` | Public, indexable information and offer (not paid data) | Allow |
| `/historical-results` | Public, indexable archive landing page; existing API summary and lock rules | Allow exact landing page; block descendants |
| `/login`, `/register`, `/activate`, `/forgot-password`, `/reset-password` | Public account forms, `noindex, follow`; activation/reset still require valid tokens | Allow HTML to read noindex |
| `/dashboard`, `/profile`, `/profile/statistics`, `/club-members`, `/start-history`, `/achievements` | Private account functions; anonymous HTML is a shell with `noindex, follow`; API authentication and feature restrictions remain | Allow HTML to read noindex |
| `/profile/[participantId]` | Existing public participant fields, private fields filtered by API; `noindex, follow` | Allow HTML to read noindex |
| `/admin`, `/judge` and `/organizer` with HTML descendants | Role restricted functions; anonymous HTML is a shell with `noindex, follow`; API checks remain | Allow HTML to read noindex |
| `/admin/codex-command` | Authenticated non-HTML Route Handler; layout metadata does not apply | Disallow |
| `/premium/zakup` including query variants | Account/payment flow, existing `noindex, nofollow`; purchase permissions unchanged | Allow HTML to read noindex |
| `/live-results` and descendants, `/ranking` | Authenticated Premium results, `noindex, follow` as an additional signal | Existing Disallow remains; noindex is not the exclusion mechanism while blocked |
| `/historical-results/[competitionId]` and category descendants | Existing mixed access: recent results may be public; older results require Premium under the existing three-day API rule. `noindex, follow` as an additional signal | Existing Disallow remains pending topic 17 |
| Missing pages / unpublished event details | Existing 404 and event visibility behavior from topic 04 | Not sitemap entries |
| `/api/*`, static files, icons, manifest, maintenance resources | Existing service/resource access; not HTML landing pages; API permissions unchanged | Existing wildcard behavior unchanged |

“Search crawler” in the final column means the explicit group `Googlebot`,
`bingbot`, `OAI-SearchBot`. Login/register were already allowed and noindex.
All other crawlers retain the **exact previous wildcard rules**, including
blocked account paths and results. For those crawlers, blocked HTML cannot
communicate noindex; Disallow alone does not guarantee deindexing. This limited
search exception allows noindex to be read without silently changing training
access for unspecified crawlers. Extending it to another search agent requires
identifying its purpose and retaining all necessary result/handler restrictions.

No training policy decision is made here. GPTBot, Google-Extended, ClaudeBot,
CCBot and other unmatched tokens keep the existing wildcard policy: public
content is allowed and the existing paths are blocked. Do not add a separate
UA group with only `Allow: /`: specific groups do not inherit wildcard blocks.
The named search group therefore repeats every retained restriction and adds
the authenticated `/admin/codex-command` handler exception to HTML crawling.

OAI-SearchBot controls search discovery, GPTBot concerns potential model
training, and ChatGPT-User performs user-triggered fetches for which robots.txt
may not apply. Google-Extended controls a separate use preference and has no
dedicated HTTP user agent; spoofing its name is not a real infrastructure test.
No UA string provides authentication. Maintenance and all API controls apply
regardless of agent. Crawl permission does not establish indexing or AI citation.

No public archive expansion or paid access change is authorized by this policy.
Topic 17 owns that decision. Topic 07 owns wider metadata/canonical changes.
Sitemap still excludes account, payment and result-detail pages; the indexable
set is unchanged. Follow [tests/README.md](tests/README.md) for future additions.

Sources reviewed:
- [Google: noindex requires crawl access](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [OpenAI: search, training and user-triggered fetches](https://developers.openai.com/api/docs/bots)
- [Google: crawler and use-preference tokens](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)

Implementation follows the installed Next.js 16.2.6 guides for server metadata,
layout inheritance and robots metadata routes. A descendant metadata `robots`
object replaces the inherited object; future account children must retain
noindex. The historical-results layout starts at `[competitionId]` so it cannot
accidentally deindex the public archive landing page.
