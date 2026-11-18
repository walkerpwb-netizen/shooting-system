import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";

let api;
let app;
let origin;
let logs = "";
const catalogs = {};
const failures = {};
const requests = [];
const siteUrl = "https://system-strzelecki.pl";
const staticPaths = ["", "/o-projekcie", "/lista-kontrolna-organizacji-zawodow", "/instrukcja-sedziowania", "/jak-sie-zapisac", "/dla-organizatorow", "/regulamin", "/polityka-prywatnosci", "/publikacja-wynikow",
  "/historical-results", "/wesprzyj-nas", "/premium", "/premium/regulamin",
  "/competitions", "/competitions/map", "/trainings",
  "/shooting-ranges", "/shooting-ranges/map", "/kontakt", "/pobierz-aplikacje"];

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

before(async () => {
  api = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader("Content-Type", "application/json");
    const failure = failures[req.url];
    if (typeof failure === "number") res.writeHead(failure).end("{}");
    else if (failure === "disconnect") req.socket.destroy();
    else if (failure === "timeout") { /* Wait for the real fetch timeout. */ }
    else if (failure === "body-timeout") res.write("[");
    else if (failure === "json") res.end("not JSON");
    else res.end(JSON.stringify(catalogs[req.url]));
  });
  const apiPort = await listen(api);
  const reservation = http.createServer();
  const appPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  origin = `http://127.0.0.1:${appPort}`;
  app = spawn(process.execPath, [fileURLToPath(import.meta.resolve("next/dist/bin/next")),
    "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    cwd: process.cwd(),
    env: { ...process.env, API_URL: `http://127.0.0.1:${apiPort}`,
      NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
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

beforeEach(() => {
  for (const path of ["/competitions", "/trainings", "/shooting-ranges", "/public-organizers"]) {
    catalogs[path] = [];
    delete failures[path];
  }
  requests.length = 0;
});

async function sitemap(method = "GET") {
  const response = await fetch(origin + "/sitemap.xml", { method });
  const body = await response.text();
  return { response, body, urls: [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]) };
}

function assertXml(result, paths = staticPaths) {
  assert.equal(result.response.status, 200, logs.slice(-2500));
  assert.match(result.response.headers.get("content-type"), /application\/xml/);
  assert.match(result.body, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.doesNotMatch(result.body, /<lastmod>/);
  assert.deepEqual([...result.urls].sort(), paths.map((path) => siteUrl + path).sort());
  assert.equal(result.urls.length, new Set(result.urls).size);
}

function event(id, status, eventType) {
  return { id, status, event_type: eventType, name: "Test", date: "2026-12-01", completed_at: null };
}

test("empty catalogs are a valid sitemap; GET and HEAD return 200", async () => {
  assertXml(await sitemap());
  assert.equal((await sitemap("HEAD")).response.status, 200);
});

test("only public event statuses use their proper canonical collection", async () => {
  for (const [path, type] of [["/competitions", "competition"], ["/trainings", "training"]]) {
    catalogs[path] = ["published", "started", "completed", "draft", "planned", "cancelled"]
      .map((status, index) => event(index + 1, status, type));
  }
  assertXml(await sitemap(), [...staticPaths, "/competitions/1", "/competitions/2", "/competitions/3",
    "/trainings/1", "/trainings/2", "/trainings/3"]);
});

test("repeated requests and changed ordering/content never invent lastmod", async () => {
  catalogs["/competitions"] = [event(2, "published", "competition"), event(1, "completed", "competition")];
  const first = await sitemap();
  assertXml(first, [...staticPaths, "/competitions/1", "/competitions/2"]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await sitemap()).body, first.body);
  catalogs["/competitions"].reverse();
  Object.assign(catalogs["/competitions"][0], {
    name: "Changed main content", date: "2026-12-12", completed_at: "2026-11-17T12:00:00Z",
    // An unverified field must not silently become a trusted timestamp.
    updated_at: "2026-11-17T12:00:00Z",
  });
  assert.equal((await sitemap()).body, first.body);
  assert.equal(requests.filter((path) => path === "/competitions").length, 3);
  assert.equal(requests.filter((path) => path === "/trainings").length, 3);
});

for (const path of ["/competitions", "/trainings"]) {
  test(`${path}: HTTP failures are 500, never a partial XML; recovery is immediate`, async () => {
    for (const status of [403, 404, 422, 503]) {
      failures[path] = status;
      const result = await sitemap();
      assert.equal(result.response.status, 500, `${path} HTTP ${status}`);
      assert.doesNotMatch(result.body, /<urlset/);
    }
    delete failures[path];
    assertXml(await sitemap());
  });

  test(`${path}: invalid JSON and malformed catalogs fail instead of appearing empty`, async () => {
    failures[path] = "json";
    assert.equal((await sitemap()).response.status, 500);
    delete failures[path];
    const type = path === "/competitions" ? "competition" : "training";
    for (const invalid of [null, {}, false, [null], [{}], [event("1", "published", type)],
      [event(0, "published", type)], [event(2_147_483_648, "published", type)],
      [event(1, null, type)], [event(1, "published", "wrong")]]) {
      catalogs[path] = invalid;
      const result = await sitemap();
      assert.equal(result.response.status, 500, JSON.stringify(invalid));
      assert.doesNotMatch(result.body, /<urlset/);
    }
    catalogs[path] = [];
    assertXml(await sitemap());
  });

  test(`${path}: connection failures and both timeout phases are bounded and recoverable`, async () => {
    for (const failure of ["disconnect", "timeout", "body-timeout"]) {
      failures[path] = failure;
      const start = Date.now();
      const result = await sitemap();
      assert.equal(result.response.status, 500, `${path} ${failure}`);
      assert.doesNotMatch(result.body, /<urlset/);
      assert.ok(Date.now() - start < 8_000, "5s API timeout must include reading the body");
    }
    delete failures[path];
    assertXml(await sitemap());
  });
}

test("publishing and removing an event updates the same sitemap URL without a cache", async () => {
  assertXml(await sitemap());
  catalogs["/trainings"] = [event(50, "published", "training")];
  assertXml(await sitemap(), [...staticPaths, "/trainings/50"]);
  catalogs["/trainings"][0].status = "cancelled";
  assertXml(await sitemap());
});

test("range directory renders public data and navigation in HTML, handles empty and failed API", async () => {
  const path = "/shooting-ranges";
  catalogs[path] = [
    { id: 2, name: "Żubr", address: "Łódź", phone: "+48123", website: "https://example.com", latitude: 52, longitude: 19 },
    { id: 1, name: "Alfa", address: "Warszawa", phone: "", website: "", latitude: 52, longitude: 19 },
  ];
  let response = await fetch(origin + path);
  let html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.equal(response.status, 200);
  for (const value of ["Alfa", "Żubr", "Łódź", "+48123", 'href="https://example.com/"', 'href="#litera-41"', 'href="/shooting-ranges/map"', 'href="https://system-strzelecki.pl/shooting-ranges"']) assert.ok(html.includes(value), value);
  assert.ok(html.indexOf("Alfa") < html.indexOf("Żubr"));
  catalogs[path] = [];
  response = await fetch(origin + path);
  html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Obecnie w katalogu nie ma strzelnic/);
  failures[path] = 503;
  response = await fetch(origin + path);
  assert.equal(response.status, 500);
  delete failures[path];
  catalogs[path] = [{ id: 1, name: "Alfa", address: "", phone: "", website: "", latitude: 52, longitude: 19 }];
  assert.equal((await fetch(origin + path)).status, 200);
});


test("range pages, sitemap and removal use stable IDs and honest HTML", async () => {
  const path = "/shooting-ranges";
  catalogs[path] = [{ id: 23, name: "Strzelnica Alfa", address: "Łódź", phone: "+48123", website: "https://example.com", latitude: 52, longitude: 19 }];
  assertXml(await sitemap(), [...staticPaths, "/shooting-ranges/23"]);
  let response = await fetch(origin + "/shooting-ranges/23");
  let html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.equal(response.status, 200);
  for (const value of ["Strzelnica Alfa", "Łódź", "+48123", "Data weryfikacji nie jest dostępna", "katalog Systemu Strzeleckiego", "destination=52%2C19", 'href="https://system-strzelecki.pl/shooting-ranges/23"']) assert.ok(html.includes(value), value);
  response = await fetch(origin + path);
  assert.match(await response.text(), /href="\/shooting-ranges\/23"/);
  catalogs[path][0].name = "Nowa nazwa";
  assert.match(await (await fetch(origin + "/shooting-ranges/23")).text(), /Nowa nazwa/);
  for (const id of ["999", "023", "abc"]) assert.equal((await fetch(origin + "/shooting-ranges/" + id)).status, 404);
  Object.assign(catalogs[path][0], { address: "", phone: "", website: "" });
  html = (await (await fetch(origin + "/shooting-ranges/23")).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  for (const absent of ["Lokalizacja:", "Telefon:", "Strona internetowa strzelnicy", "Godziny", "Cena", "Opinie"]) assert.ok(!html.includes(absent), absent);
  catalogs[path] = [];
  assert.equal((await fetch(origin + "/shooting-ranges/23")).status, 404);
  assertXml(await sitemap());
  failures[path] = 503;
  assert.equal((await fetch(origin + "/shooting-ranges/23")).status, 500);
  assert.equal((await sitemap()).response.status, 500);
});

test("city pilot only includes reviewed addresses and removes stale assignments from HTML and sitemap", async () => {
  const path = "/shooting-ranges";
  catalogs[path] = [
    { id: 75, name: "Warszawa A", address: "ul. Krakowiaków 80A, 02-255 Warszawa", phone: "", website: "", latitude: 52.1915002, longitude: 20.9357887 },
    { id: 169, name: "Operator Warszawa", address: "ul. Myśliwska 6, 05-555 Suchodół", phone: "", website: "", latitude: 52, longitude: 21 },
    { id: 1, name: "Wrocław A", address: "ul. Sztabowa 32, Wrocław", phone: "", website: "", latitude: 51.08951016666667, longitude: 17.011930638888888 },
  ];
  let response = await fetch(origin + "/shooting-ranges/miasta/warszawa");
  let html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.equal(response.status, 200);
  for (const value of ["Warszawa A", "ul. Krakowiaków 80A", 'href="/shooting-ranges/75"', 'href="https://system-strzelecki.pl/shooting-ranges/miasta/warszawa"']) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /Operator Warszawa|Suchodół/);
  let urls = (await sitemap()).urls;
  assert.ok(urls.includes(siteUrl + "/shooting-ranges/miasta/warszawa"));
  assert.ok(urls.includes(siteUrl + "/shooting-ranges/miasta/wroclaw"));
  assert.ok(!urls.includes(siteUrl + "/shooting-ranges/miasta/krakow"));
  response = await fetch(origin + path);
  assert.match(await response.text(), /href="\/shooting-ranges\/miasta\/warszawa"/);
  catalogs[path][0].address = "Nowy adres, Suchodół";
  response = await fetch(origin + "/shooting-ranges/miasta/warszawa");
  html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.match(html, /Obecnie nie mamy obiektów przypisanych/);
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /Warszawa A|Nowy adres/);
  urls = (await sitemap()).urls;
  assert.ok(!urls.includes(siteUrl + "/shooting-ranges/miasta/warszawa"));
  catalogs[path][0].address = "ul. Krakowiaków 80A, 02-255 Warszawa";
  catalogs[path][0].latitude = 50;
  assert.ok(!(await sitemap()).urls.includes(siteUrl + "/shooting-ranges/miasta/warszawa"));
  assert.equal((await fetch(origin + "/shooting-ranges/miasta/nieznane")).status, 404);
  failures[path] = 503;
  assert.equal((await fetch(origin + "/shooting-ranges/miasta/warszawa")).status, 500);
});


test("published organizer pages are canonical, contain approved HTML and disappear when unpublished", async () => {
  catalogs["/public-organizers"] = [{id: 7}];
  catalogs["/public-organizers/7"] = {id: 7, name: "Klub Alfa", description: "Zatwierdzony opis klubu.", events: [
    {id: 12, name: "Zawody aktualne", date: "2026-12-01", location: "Warszawa", status: "published", event_type: "competition"},
    {id: 13, name: "Szkolenie zakończone", date: "2026-01-01", location: "Kraków", status: "completed", event_type: "training"},
  ]};
  assertXml(await sitemap(), [...staticPaths, "/organizatorzy/7"]);
  let response = await fetch(origin + "/organizatorzy/7");
  assert.equal(response.status, 200);
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  for (const value of ["Klub Alfa", "Zatwierdzony opis klubu.", "Aktualne wydarzenia", "Zakończone wydarzenia", 'href="/competitions/12"', 'href="/trainings/13"', 'href="https://system-strzelecki.pl/organizatorzy/7"']) assert.ok(html.includes(value), value);
  assert.equal((await fetch(origin + "/organizatorzy/07")).status, 404);
  failures["/public-organizers/7"] = 404;
  catalogs["/public-organizers"] = [];
  assert.equal((await fetch(origin + "/organizatorzy/7")).status, 404);
  assertXml(await sitemap());
  failures["/public-organizers"] = 500;
  assert.equal((await sitemap()).response.status, 500);
});
