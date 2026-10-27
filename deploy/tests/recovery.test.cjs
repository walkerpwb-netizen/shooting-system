const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const script = readFileSync(join(__dirname, "../maintenance/recovery.js"), "utf8");

async function run(status, { offline = false, hidden = false, pathname = "/profile" } = {}) {
  const calls = { fetch: 0, reload: 0, replace: [], listeners: {} };
  const elements = { retry: { addEventListener: (name, handler) => { calls.listeners[name] = handler; } }, status: {} };
  vm.runInNewContext(script, {
    AbortSignal,
    fetch: async () => {
      calls.fetch++;
      if (offline) throw new Error("offline");
      return { ok: true, json: async () => status };
    },
    document: {
      visibilityState: hidden ? "hidden" : "visible",
      getElementById: (id) => elements[id],
      addEventListener: () => {},
    },
    window: {
      location: { pathname, href: `https://system-strzelecki.pl${pathname}`, reload: () => calls.reload++, replace: (path) => calls.replace.push(path) },
      addEventListener: () => {},
      setInterval: () => {},
    },
  });
  await new Promise(setImmediate);
  return calls;
}

test("stays on maintenance screen while restricted", async () => {
  const result = await run({ restricted: 1 });
  assert.equal(result.reload, 0);
  assert.equal(result.fetch, 1);
});

test("returns automatically to the original page once accessible", async () => {
  assert.deepEqual((await run({ restricted: 0 })).replace, ["https://system-strzelecki.pl/profile"]);
});

test("does not reload on network failure or malformed status", async () => {
  assert.equal((await run({}, { offline: true })).reload, 0);
  assert.equal((await run({})).reload, 0);
});

test("does not poll while the app is hidden", async () => {
  assert.equal((await run({}, { hidden: true })).fetch, 0);
});

test("API documents return to the home page with a GET navigation", async () => {
  const result = await run({ restricted: 0 }, { pathname: "/api/premium/example" });
  assert.deepEqual(result.replace, ["/"]);
  assert.equal(result.reload, 0);
});
