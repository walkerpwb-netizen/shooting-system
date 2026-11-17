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
    const [, collection, id] = req.url.split("/");
    res.setHeader("Content-Type", "application/json");
    if (id === "1" || availablePaths.has(req.url)) {
      res.end(JSON.stringify({
        id: Number(id),
        name: `Test ${collection}`,
        description: "Opis szkolenia testowego",
        date: "2026-12-01",
        location: "Testowa lokalizacja",
        latitude: null,
        longitude: null,
        status: "planned",
        organizer_full_name: "Organizator testowy",
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
    assert.match(html, new RegExp(`<title>Test ${collection} \\|`));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://system-strzelecki.pl/${collection}/1"`));
    assert.match(html, /<meta name="description" content="[^"]+"/);
    assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/);
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
