"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function loadInternals() {
  const listeners = new Map();
  const sandbox = {
    AbortController,
    Blob,
    MessageChannel,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    URL,
    clearTimeout,
    console,
    crypto: globalThis.crypto,
    fetch,
    importScripts() {},
    setTimeout,
    caches: {},
    location: { href: "https://example.test/sw.js", origin: "https://example.test" },
    registration: { scope: "https://example.test/" },
    clients: {},
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), sandbox, { filename: "sw.js" });
  return { internals: sandbox.DailyAtlasServiceWorkerInternals, listeners };
}

test("service-worker install queue enforces one global request limit", async () => {
  const { internals } = loadInternals();
  assert.equal(internals.INSTALL_FETCH_CONCURRENCY, 4);
  const queue = internals.createTaskQueue(internals.INSTALL_FETCH_CONCURRENCY);
  let active = 0;
  let peak = 0;
  const values = await Promise.all(Array.from({ length: 31 }, (_, index) => queue.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    active -= 1;
    return index;
  })));
  assert.equal(peak, 4);
  assert.deepEqual(values, Array.from({ length: 31 }, (_, index) => index));
});

test("default install passes the shared queue through every pack loader", () => {
  const source = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const install = source.slice(source.indexOf('self.addEventListener("install"'), source.indexOf('self.addEventListener("activate"'));
  assert.match(install, /createTaskQueue\(INSTALL_FETCH_CONCURRENCY\)/);
  assert.match(install, /installPack\(installQueue\)/);
  assert.match(source, /queue\?\.run\s*\?\s*queue\.run\(task\)\s*:\s*task\(\)/);
});
