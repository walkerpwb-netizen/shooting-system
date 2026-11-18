import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

let api;
let app;
let origin;
let logs = "";
const requests = [];
const availablePaths = new Set();
const mapCatalogs = { competitions: [], trainings: [] };
let historicalUnavailable = false;
const fallbackImage = "https://system-strzelecki.pl/icons/system-strzelecki-logo-20260623.png";
const imageCases = [
  [20, "data:image/png;base64,AAAA", null],
  [21, "/icons/organizer.png", "https://system-strzelecki.pl/icons/organizer.png"],
  [22, "https://images.example.com/logo.png", "https://images.example.com/logo.png"],
  [23, "http://images.example.com/logo.png", "http://images.example.com/logo.png"],
  [24, "blob:https://system-strzelecki.pl/123", null],
  [25, "http://127.0.0.1:8000/logo.png", null],
  [26, "//images.example.com/logo.png", null],
  [27, "https://", null],
  [28, fallbackImage, fallbackImage],
  [29, "http://localhost:8000/logo.png", null],
  [30, "https://user:password@images.example.com/logo.png", null],
  [31, "http://10.0.0.1/logo.png", null],
  [32, "javascript:alert(1)", null],
  [33, "https://[::1]/logo.png", null],
  [34, "http://api.internal/logo.png", null],
  [35, "  /icons/organizer.png#preview  ", "https://system-strzelecki.pl/icons/organizer.png"],
];

function assertMetadata(html, path, expectedImage = fallbackImage) {
  const tags = new Map();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/g)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const key = attrs.name || attrs.property;
    if (key) tags.set(key, [...(tags.get(key) || []), attrs.content]);
  }
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title);
  assert.equal(tags.get("description")?.length, 1);
  assert.ok(tags.get("description")[0]);
  assert.deepEqual(tags.get("og:title"), [title]);
  assert.deepEqual(tags.get("twitter:title"), [title]);
  assert.deepEqual(tags.get("og:description"), tags.get("description"));
  assert.deepEqual(tags.get("twitter:description"), tags.get("description"));
  const canonicalUrl = `https://system-strzelecki.pl${path === "/" ? "" : path}`;
  assert.deepEqual(tags.get("og:url"), [canonicalUrl]);
  const canonical = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(canonical, [canonicalUrl]);
  const images = expectedImage === fallbackImage ? [fallbackImage] : [expectedImage, fallbackImage];
  assert.deepEqual(tags.get("og:image"), images);
  assert.deepEqual(tags.get("twitter:image"), images);
  assert.deepEqual(tags.get("og:locale"), ["pl_PL"]);
  assert.deepEqual(tags.get("og:site_name"), ["System Strzelecki"]);
  assert.deepEqual(tags.get("twitter:card"), ["summary_large_image"]);
  return tags;
}

function visibleHtml(html) {
  // The RSC payload also contains unused not-found fallbacks. Only assert on
  // rendered markup when checking which message the server actually displays.
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

before(async () => {
  api = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === "/historical-results/competitions") {
      if (historicalUnavailable) return res.writeHead(503).end();
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify([{ id: 42, name: "Zawody testowe", date: "2026-10-01", location: "Miasto testowe", organizer_full_name: "Klub testowy", shooters_count: 12, status: "completed", completed_at: "", premium_locked: true, description: "NIEPUBLIKOWANY_OPIS", participants: [{ name: "NIEPUBLIKOWANY_UCZESTNIK" }] }]));
    }
    if (req.url === "/shooting-ranges") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify([{ id: 1, name: "Strzelnica testowa", address: "Miasto testowe", phone: "123", website: "", latitude: 52, longitude: 21 }]));
    }
    const [, collection, id] = req.url.split("/");
    res.setHeader("Content-Type", "application/json");
    if (!id && ["competitions", "trainings"].includes(collection)) {
      res.end(JSON.stringify(mapCatalogs[collection]));
      return;
    }
    const imageCase = imageCases.find(([caseId]) => String(caseId) === id);
    if (id === "1" || id === "50" || imageCase || availablePaths.has(req.url)) {
      res.end(JSON.stringify({
        id: Number(id),
        name: `Test ${collection}`,
        description: id === "50" ? "</script><script>atak</script>" : "Opis szkolenia testowego",
        date: id === "50" ? "31.02.2026" : "2026-12-01",
        location: "Testowa lokalizacja",
        latitude: null,
        longitude: null,
        status: "planned",
        organizer_full_name: "Organizator testowy",
        public_organizer_id: id === "1" ? 7 : null,
        organizer_logo: imageCase?.[1],
        disciplines: [],
        participants: [],
      }));
    } else if (id === "3") {
      res.writeHead(503).end('{"detail":"Unavailable"}');
    } else if (id === "4") {
      req.socket.destroy();
    } else if (id === "5") {
      // Leave this request open to exercise the real fetch timeout.
    } else if (id === "6") {
      res.end("invalid JSON");
    } else if (id === "7") {
      res.writeHead(403).end("{}");
    } else if (id === "8") {
      res.writeHead(422).end("{}");
    } else if (id === "9") {
      res.writeHead(200);
      res.write('{"id":'); // Timeout after headers, while reading the body.
    } else if (id === "10") {
      res.end("null");
    } else if (id === "11") {
      res.end("false");
    } else if (id === "12") {
      res.end('{"id":999}');
    } else {
      setTimeout(() => res.writeHead(404).end('{"detail":"Not found"}'), 100);
    }
  });
  const apiPort = await listen(api);
  const reservation = http.createServer();
  const appPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  origin = `http://127.0.0.1:${appPort}`;
  app = spawn(process.execPath, [fileURLToPath(import.meta.resolve("next/dist/bin/next")), "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    cwd: process.cwd(),
    env: { ...process.env, API_URL: `http://127.0.0.1:${apiPort}`, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => { logs += chunk; });
  app.stderr.on("data", (chunk) => { logs += chunk; });
  const deadline = Date.now() + 30_000;
  while (!logs.includes("Ready in")) {
    if (app.exitCode !== null || Date.now() > deadline) {
      throw new Error(`Test runtime failed to start: ${logs}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

test("historical archive: public summaries are in HTML, with Premium link and no participant data", async () => {
  const response = await fetch(origin + "/historical-results");
  const html = await response.text();
  const visible = visibleHtml(html);
  assert.equal(response.status, 200);
  assertMetadata(visible, "/historical-results");
  assert.match(visible, /Zawody testowe/);
  assert.match(visible, /Miasto testowe/);
  assert.match(visible, /Klub testowy/);
  assert.match(visible.replace(/<!--.*?-->/g, ""), /12 zawodników/);
  assert.match(visible, /href="\/premium"/);
  assert.doesNotMatch(html, /NIEPUBLIKOWANY_OPIS|NIEPUBLIKOWANY_UCZESTNIK/);
  historicalUnavailable = true;
  try {
    const unavailable = await fetch(origin + "/historical-results");
    assert.equal(unavailable.status, 500);
  } finally {
    historicalUnavailable = false;
  }
});

after(async () => {
  if (app && app.exitCode === null) {
    const exited = once(app, "exit");
    app.kill("SIGTERM");
    await exited;
  }
  if (api) {
    api.closeAllConnections();
    await new Promise((resolve) => api.close(resolve));
  }
});

for (const collection of ["competitions", "trainings"]) {
  test(`${collection}: existing record, HTML metadata and one API request per render`, async () => {
    const path = `/${collection}/1`;
    const countBefore = requests.filter((url) => url === path).length;
    const response = await fetch(origin + path);
    const html = visibleHtml(await response.text());
    assert.equal(response.status, 200);
    assertMetadata(html, path);
    assert.match(html, new RegExp(`<title>Test ${collection} \\|`));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://system-strzelecki.pl/${collection}/1"`));
    assert.match(html, /<meta name="description" content="[^"]+"/);
    assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/);
    assert.match(html, /href="\/organizatorzy\/7"/);
    assert.equal(requests.filter((url) => url === path).length - countBefore, 1);
  });

  test(`${collection}: real HTTP 404 for browsers and bots, including HEAD`, async () => {
    for (const agent of ["Mozilla/5.0", "curl/8.0", "Googlebot", "bingbot", "Twitterbot", "GPTBot"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(`${origin}/${collection}/2`, { method, headers: { "User-Agent": agent } });
        const html = await response.text();
        assert.equal(response.status, 404, `${method} ${agent}: ${logs.slice(-2500)}`);
        if (method === "GET") {
          assert.match(html, /<meta name="robots" content="[^"]*noindex/);
          // Next may serialize this fallback for hydration instead of rendering
          // it in the initial body. HTTP status and noindex must hold either way.
          assert.match(html, collection === "competitions" ? /Nie znaleziono zawodów/ : /Nie znaleziono szkolenia/);
        }
      }
    }
  });

  test(`${collection}: a missing record is not cached across requests`, async () => {
    const path = `/${collection}/2`;
    const missing = await fetch(origin + path);
    await missing.text();
    assert.equal(missing.status, 404);
    availablePaths.add(path);
    try {
      const available = await fetch(origin + path);
      await available.text();
      assert.equal(available.status, 200);
    } finally {
      availablePaths.delete(path);
    }
  });

  test(`${collection}: invalid identifiers return 404 without calling API`, async () => {
    const countBefore = requests.length;
    for (const id of ["abc", "0", "-1", "1.5", "1%3Fadmin=true", "2147483648", "999999999999999999999999"]) {
      const response = await fetch(`${origin}/${collection}/${id}`);
      await response.text();
      assert.equal(response.status, 404, id);
    }
    assert.equal(requests.length, countBefore);
  });

  test(`${collection}: API failures return 500, never a missing-record response; recover on next request`, async () => {
    for (const id of ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]) {
      const path = `/${collection}/${id}`;
      const started = Date.now();
      let response;
      let html;
      try {
        response = await fetch(origin + path, { signal: AbortSignal.timeout(20_000) });
        html = visibleHtml(await response.text());
      } catch (cause) {
        throw new Error(`Request failed for ${path} after ${Date.now() - started}ms (status ${response?.status}): ${logs.slice(-3500)}`, { cause });
      }
      assert.equal(response.status, 500, `failure id=${id}: ${logs.slice(-2500)}`);
      assert.doesNotMatch(html, /Nie znaleziono (zawodów|szkolenia)|NEXT_HTTP_ERROR_FALLBACK;404/);
      if (id === "5" || id === "9") {
        assert.ok(Date.now() - started < 15_000, "API timeout should bound the response time");
      }
      availablePaths.add(path);
      try {
        const recovered = await fetch(origin + path);
        assert.equal(recovered.status, 200, `recovery id=${id}`);
        await recovered.text();
      } finally {
        availablePaths.delete(path);
      }
    }
    assert.match(logs, /Public event API HTTP 503/);
    assert.match(logs, /Public event API connection failure/);
    assert.match(logs, /Public event API timeout/);
  });
}


for (const collection of ["competitions", "trainings"]) {
  test(`${collection}: safe public logo URLs keep a fallback; inline, malformed and internal URLs use fallback`, async () => {
    for (const [id, , expectedImage] of imageCases) {
      const path = `/${collection}/${id}`;
      const response = await fetch(origin + path, { headers: { "User-Agent": "Twitterbot" } });
      const html = visibleHtml(await response.text());
      assert.equal(response.status, 200);
      const tags = assertMetadata(html, path, expectedImage || fallbackImage);
      assert.deepEqual(tags.get("og:type"), ["article"]);
      assert.ok(html.indexOf('property="og:image"') < html.indexOf("</head>"));
    }
  });

  test(`${collection}: search and sharing bots receive metadata without executing JS; query keeps canonical`, async () => {
    for (const agent of ["Mozilla/5.0", "Googlebot", "bingbot", "Twitterbot", "facebookexternalhit", "Slackbot", "Discordbot", "OAI-SearchBot"]) {
      const path = `/${collection}/1`;
      const response = await fetch(origin + path + "?utm_source=test", { headers: { "User-Agent": agent } });
      const html = visibleHtml(await response.text());
      assert.equal(response.status, 200);
      assertMetadata(html, path);
      if (["bingbot", "Twitterbot", "facebookexternalhit", "Slackbot", "Discordbot"].includes(agent)) {
        assert.ok(html.indexOf('property="og:image"') < html.indexOf("</head>"), agent);
      }
    }
  });
}

test("public information, Premium, support, archive and maps have complete page-specific previews", async () => {
  for (const path of ["/", "/kontakt", "/pobierz-aplikacje", "/regulamin", "/polityka-prywatnosci", "/publikacja-wynikow", "/premium", "/premium/regulamin", "/wesprzyj-nas", "/historical-results", "/shooting-ranges/map", "/premium/zakup"]) {
    const response = await fetch(origin + path + "?utm_source=test", { headers: { "User-Agent": "Twitterbot" } });
    const html = visibleHtml(await response.text());
    assert.equal(response.status, 200, path);
    const tags = assertMetadata(html, path);
    assert.equal(tags.get("robots")?.join().includes("noindex") || false, path === "/premium/zakup");
    if (path === "/premium/zakup") assert.match(tags.get("robots").join(), /nofollow/);
  }
});

test("list and map filter variants retain the unfiltered canonical and complete previews", async () => {
  for (const path of ["/competitions", "/trainings", "/competitions/map"]) {
    for (const status of ["upcoming", "live", "finished", "joined", "invalid"]) {
      const response = await fetch(origin + path + `?status=${status}&utm_source=test`, { headers: { "User-Agent": "Twitterbot" } });
      const html = visibleHtml(await response.text());
      assert.equal(response.status, 200);
      const tags = assertMetadata(html, path);
      assert.doesNotMatch(tags.get("robots")?.join() || "", /noindex/);
    }
  }
});

test("training map redirects permanently to the shared map and preserves filters", async () => {
  for (const method of ["GET", "HEAD"]) {
    for (const query of ["", "?status=finished&utm_source=test", "?status=live"]) {
      const response = await fetch(origin + "/trainings/map" + query, { method, redirect: "manual" });
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), "/competitions/map" + query);
      const destination = await fetch(new URL(response.headers.get("location"), origin), { method, redirect: "manual" });
      assert.equal(destination.status, 200);
    }
  }
});

test("shared map links to both event lists with the selected status", async () => {
  for (const status of ["upcoming", "live", "finished"]) {
    const response = await fetch(origin + "/competitions/map?status=" + status);
    const html = visibleHtml(await response.text());
    assert.equal(response.status, 200);
    for (const collection of ["competitions", "trainings"]) {
      assert.match(html, new RegExp(`href="/${collection}\\?status=${status}"`));
    }
  }
});

test("shared map receives both event types and filters them by status", async () => {
  for (const [collection, type] of [["competitions", "competition"], ["trainings", "training"]]) {
    mapCatalogs[collection] = [
      { id: type === "competition" ? 101 : 201, name: `${type}-live-test`, event_type: type, status: "started", latitude: 52, longitude: 20, date: "2026-12-01", location: "Test" },
      { id: type === "competition" ? 102 : 202, name: `${type}-finished-test`, event_type: type, status: "completed", latitude: 52, longitude: 20, date: "2026-12-01", location: "Test" },
    ];
  }
  try {
    for (const [status, included, excluded] of [["live", "live-test", "finished-test"], ["finished", "finished-test", "live-test"]]) {
      const response = await fetch(origin + "/competitions/map?status=" + status);
      const html = await response.text();
      assert.equal(response.status, 200);
      for (const type of ["competition", "training"]) {
        assert.ok(html.includes(`${type}-${included}`));
        assert.ok(!html.includes(`${type}-${excluded}`));
      }
    }
  } finally {
    mapCatalogs.competitions = [];
    mapCatalogs.trainings = [];
  }
});

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

test("structured data describes public pages and escapes untrusted content", async () => {
  const home = await (await fetch(origin + "/")).text();
  const graph = jsonLd(home)[0]["@graph"];
  assert.deepEqual(graph.map((item) => item["@type"]), ["Person", "WebSite", "WebApplication"]);
  assert.equal(graph[0].name, "Piotr Bronny");
  for (const collection of ["competitions", "trainings"]) {
    const html = await (await fetch(`${origin}/${collection}/1`)).text();
    const event = jsonLd(html)[0];
    assert.equal(event.url, `https://system-strzelecki.pl/${collection}/1`);
    assert.equal(event.startDate, "2026-12-01");
    assert.equal(event.location, "Testowa lokalizacja");
    assert.equal(event.organizer, undefined);
    assert.equal(event.participants, undefined);
    const unsafe = await (await fetch(`${origin}/${collection}/50`)).text();
    assert.ok(!unsafe.includes("</script><script>atak</script>"));
    const parsed = jsonLd(unsafe)[0];
    assert.equal(parsed.description, "</script><script>atak</script>");
    assert.equal(parsed.startDate, undefined);
  }
  const range = jsonLd(await (await fetch(origin + "/shooting-ranges/1")).text())[0];
  assert.equal(range["@type"], "Place");
  assert.equal(range.url, "https://system-strzelecki.pl/shooting-ranges/1");
  assert.equal(range.address, "Miasto testowe");
  assert.equal(range.telephone, "123");
  assert.equal(range.sameAs, undefined);
});

test("breadcrumbs match visible HTML and link to public parent pages", async () => {
  for (const [path, parent, label] of [
    ["/competitions/1", "/competitions", "Zawody"],
    ["/trainings/1", "/trainings", "Szkolenia"],
    ["/shooting-ranges/1", "/shooting-ranges", "Katalog strzelnic"],
    ["/premium/regulamin", "/premium", "Pakiety i cennik Premium"],
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const nav = html.match(/<nav aria-label="Okruszki nawigacji"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, path);
    assert.ok(nav.includes(`href="${parent}"`));
    assert.ok(nav.includes(label));
    assert.match(nav, /aria-current="page"/);
    const crumbs = jsonLd(html).find((data) => data["@type"] === "BreadcrumbList").itemListElement;
    assert.deepEqual(crumbs.map((item) => item.item), ["https://system-strzelecki.pl/", `https://system-strzelecki.pl${parent}`, `https://system-strzelecki.pl${path}`]);
    assert.equal(crumbs[1].name, label);
    assert.equal((await fetch(origin + parent)).status, 200);
  }
});
