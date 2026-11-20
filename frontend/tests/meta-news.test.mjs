import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

let api, app, origin, logs = "";
const post = (id, text) => ({ id, source: "instagram", text, published_at: "2026-11-20T10:00:00+00:00", permalink: `https://www.instagram.com/p/${id}/`, media: [] });

async function listen(server) { server.listen(0, "127.0.0.1"); await once(server, "listening"); return server.address().port; }
function visible(html) { return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""); }

before(async () => {
  api = http.createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/meta-news?page=1") response.end(JSON.stringify({ posts: [post(1, "Pierwsza unikalna aktualność")], has_more: true }));
    else if (request.url === "/meta-news?page=2") response.end(JSON.stringify({ posts: [post(2, "Starsza unikalna aktualność")], has_more: false }));
    else response.writeHead(404).end("{}");
  });
  const apiPort = await listen(api);
  const reserved = http.createServer(); const port = await listen(reserved); await new Promise((resolve) => reserved.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, [fileURLToPath(import.meta.resolve("next/dist/bin/next")), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(), env: { ...process.env, API_URL: `http://127.0.0.1:${apiPort}`, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => { logs += chunk; }); app.stderr.on("data", (chunk) => { logs += chunk; });
  const deadline = Date.now() + 30000;
  while (!logs.includes("Ready in")) {
    if (app.exitCode !== null || Date.now() > deadline) throw new Error(`Test server failed: ${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

after(async () => {
  if (app && app.exitCode === null) { const exited = once(app, "exit"); app.kill("SIGTERM"); await exited; }
  if (api) { api.closeAllConnections(); await new Promise((resolve) => api.close(resolve)); }
});

test("home and archive expose news and crawlable pagination without scripts", async () => {
  let response = await fetch(origin + "/"); assert.equal(response.status, 200);
  let html = visible(await response.text());
  assert.match(html, /Pierwsza unikalna aktualność/);
  assert.match(html, /href="\/aktualnosci\?strona=2"/);
  assert.match(html, /href="https:\/\/www.instagram.com\/p\/1\/"/);
  response = await fetch(origin + "/aktualnosci?strona=2"); assert.equal(response.status, 200);
  html = visible(await response.text());
  assert.match(html, /Starsza unikalna aktualność/);
  assert.match(html, /rel="canonical" href="https:\/\/system-strzelecki.pl\/aktualnosci\?strona=2"/);
});
