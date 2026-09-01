"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const Assets = require("../asset-routing.js");
const ROOT = path.resolve(__dirname, "..");
const DEPLOYED = Object.freeze({ hostname: "zweisamkeit320.github.io", pathname: "/daily-atlas-v23/" });

test("the complete catalog is same-origin only while verification metadata matches the local release", () => {
  const catalog = fs.readFileSync(path.join(ROOT, "catalog.js"));
  const integrity = `sha384-${crypto.createHash("sha384").update(catalog).digest("base64")}`;
  const sha256 = crypto.createHash("sha256").update(catalog).digest("hex").toUpperCase();
  assert.equal(Assets.CATALOG_BYTES, catalog.length);
  assert.equal(Assets.CATALOG_INTEGRITY, integrity);
  assert.equal(Assets.CATALOG_SHA256, sha256);
  assert.equal(Assets.catalogUrl(DEPLOYED, false), "./catalog.js");
  assert.throws(() => Assets.cdnUrl("catalog.js"), /not eligible/);
  assert.match(Assets.DEPLOYMENT_REVISION, /^[a-f0-9]{40}$/);
  assert.equal(Assets.CDN_BASE, `https://cdn.jsdelivr.net/gh/Zweisamkeit320/daily-atlas-v23@${Assets.DEPLOYMENT_REVISION}/`);
});

test("a controlled or non-target deployment always returns to same-origin catalog", () => {
  assert.equal(Assets.catalogUrl(DEPLOYED, true), "./catalog.js");
  assert.equal(Assets.catalogUrl({ hostname: "localhost", pathname: "/" }, false), "./catalog.js");
  assert.equal(Assets.catalogUrl({ hostname: "zweisamkeit320.github.io.example", pathname: "/daily-atlas-v23/" }, false), "./catalog.js");
  assert.equal(Assets.catalogUrl({ hostname: "zweisamkeit320.github.io", pathname: "/another-app/" }, false), "./catalog.js");
});

test("only allowlisted hashed assets and German narration paths can use the pinned CDN", () => {
  const audio = "./assets/audio/german/de-v3-waere-haette-vergangenheit.mp3";
  assert.equal(Assets.networkUrl(audio, DEPLOYED), `${Assets.CDN_BASE}${audio.slice(2)}`);
  assert.equal(Assets.networkUrl(audio, { hostname: "localhost", pathname: "/" }), audio);
  assert.throws(() => Assets.networkUrl("../catalog.js", DEPLOYED), /not eligible/);
  assert.throws(() => Assets.networkUrl("index.html", DEPLOYED), /not eligible/);
  assert.throws(() => Assets.networkUrl("assets/audio/german/manifest.json", DEPLOYED), /not eligible/);
});

test("content-hashed split catalog records receive a pinned CDN URL and explicit same-origin fallback", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog-data/manifest.json"), "utf8"));
  const request = Assets.catalogAssetRequest(manifest.selection, "selection", {
    ...DEPLOYED,
    href: "https://zweisamkeit320.github.io/daily-atlas-v23/"
  });
  assert.equal(request.url, `https://zweisamkeit320.github.io/daily-atlas-v23/catalog-data/${manifest.selection.path}`);
  assert.equal(request.fallbackUrl, `${Assets.CDN_BASE}catalog-data/${manifest.selection.path}`);
  assert.equal(request.bytes, manifest.selection.bytes);
  assert.equal(request.sha256, manifest.selection.sha256);
  assert.equal(request.integrity, manifest.selection.integrity);
  assert.equal(Assets.candidateUrls(`catalog-data/${manifest.selection.path}`, DEPLOYED)[1].cache, "force-cache");
  assert.equal(Assets.candidateUrls(`catalog-data/${manifest.selection.path}`, { hostname: "localhost", pathname: "/", href: "http://localhost/" })[0].cache, "force-cache");
  assert.throws(() => Assets.catalogAssetRequest({ ...manifest.selection, path: "../secret.js" }, "selection", DEPLOYED), /not eligible/);
});

test("verified routing falls back from same-origin failures to a byte-and-hash checked pinned CDN response", async () => {
  const body = Buffer.from("verified narration");
  const sha256 = crypto.createHash("sha256").update(body).digest("hex").toUpperCase();
  const calls = [];
  const result = await Assets.fetchVerifiedAsset("./assets/audio/german/de-example.mp3", {
    location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/sw.js" },
    bytes: body.length,
    sha256,
    crypto: crypto.webcrypto,
    fetchImpl: async (url, options) => {
      calls.push({ url, cache: options.cache });
      return calls.length === 1 ? new Response("unavailable", { status: 503 }) : new Response(body);
    }
  });
  assert.equal(result.source, "cdn");
  assert.equal(result.bytes, body.length);
  assert.equal(result.sha256, sha256);
  assert.deepEqual(calls.map((call) => call.cache), ["reload", "force-cache"]);
  assert.equal(result.attempts[0].status, 503);
});

test("a blocked same-origin connection also falls back to the pinned CDN copy", async () => {
  const body = Buffer.from("same-origin survives");
  let calls = 0;
  const result = await Assets.fetchVerifiedAsset("./assets/audio/german/de-network.mp3", {
    location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/sw.js" },
    bytes: body.length,
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    crypto: crypto.webcrypto,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("ERR_CONNECTION_CLOSED");
      return new Response(body);
    }
  });
  assert.equal(result.source, "cdn");
  assert.equal(result.attempts[0].code, "NETWORK");
  assert.equal(calls, 2);
});

test("verification rejects bad bytes on every route and external cancellation never falls through", async () => {
  const expected = Buffer.from("expected");
  await assert.rejects(
    Assets.fetchVerifiedAsset("assets/audio/german/de-tampered.mp3", {
      location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/" },
      bytes: expected.length,
      sha256: crypto.createHash("sha256").update(expected).digest("hex"),
      crypto: crypto.webcrypto,
      fetchImpl: async () => new Response("tampered")
    }),
    (error) => error.code === "INVALID_ASSET" && error.attempts.length === 2
  );

  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    Assets.fetchVerifiedAsset("assets/audio/german/de-cancelled.mp3", {
      location: DEPLOYED,
      signal: controller.signal,
      fetchImpl: async () => { called = true; return new Response(expected); }
    }),
    (error) => error.code === "CANCELLED"
  );
  assert.equal(called, false);
});

test("the complete catalog cannot enter a pinned CDN or transfer-cache route", async () => {
  await assert.rejects(Assets.assetResolver("catalog.js", {}), /not eligible/);
  assert.throws(() => Assets.transferCacheName("catalog.js"), /not eligible/);
});

test("immutable selection data can be handed from the page to the Service Worker without a second transfer", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog-data/manifest.json"), "utf8"));
  const relative = `catalog-data/${manifest.selectionData.path}`;
  const body = fs.readFileSync(path.join(ROOT, "catalog-data", manifest.selectionData.path));
  const stores = new Map();
  const cacheStorage = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(key) { return entries.get(String(key))?.clone() || null; },
        async put(key, response) { entries.set(String(key), response.clone()); },
        async delete(key) { return entries.delete(String(key)); }
      };
    },
    async delete(name) { return stores.delete(name); }
  };
  let transfers = 0;
  const settings = {
    location: { hostname: "localhost", pathname: "/", href: "http://localhost/" },
    bytes: manifest.selectionData.bytes,
    sha256: manifest.selectionData.sha256,
    integrity: manifest.selectionData.integrity,
    crypto: crypto.webcrypto,
    cacheStorage,
    fetchImpl: async () => { transfers += 1; return new Response(body); }
  };
  const page = await Assets.assetResolver(relative, { ...settings, preferTransfer: false });
  const worker = await Assets.assetResolver(relative, { ...settings, shareTransfer: false });
  assert.equal(page.source, "same-origin");
  assert.equal(worker.source, "transfer");
  assert.equal(transfers, 1);
  assert.match(Assets.transferCacheName(relative), /^daily-atlas-transfer-selection-[a-f0-9]{12}$/);
});

test("each route has an independent timeout before the verified fallback is exhausted", async () => {
  await assert.rejects(
    Assets.fetchVerifiedAsset("assets/audio/german/de-timeout.mp3", {
      location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/" },
      timeoutMs: 5,
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      })
    }),
    (error) => error.code === "TIMEOUT" && error.attempts.length === 2
  );
});

test("a missing AbortController cannot leave the same-origin primary route hanging forever", async () => {
  const body = Buffer.from("legacy WebView fallback");
  const sha256 = crypto.createHash("sha256").update(body).digest("hex").toUpperCase();
  let calls = 0;
  const result = await Assets.fetchVerifiedAsset("./assets/audio/german/de-legacy-webview.mp3", {
    location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/sw.js" },
    AbortController: {},
    timeoutMs: 100,
    bytes: body.length,
    sha256,
    crypto: crypto.webcrypto,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return new Response(body);
    }
  });
  assert.equal(result.source, "cdn");
  assert.equal(result.attempts[0].code, "TIMEOUT");
  assert.equal(calls, 2);
});

test("a successful same-origin route never waits for or requests the CDN", async () => {
  const body = Buffer.from("same-origin primary");
  let calls = 0;
  const result = await Assets.fetchVerifiedAsset("assets/audio/german/de-primary.mp3", {
    location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/sw.js" },
    bytes: body.length,
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    crypto: crypto.webcrypto,
    fetchImpl: async () => { calls += 1; return new Response(body); }
  });
  assert.equal(result.source, "same-origin");
  assert.equal(calls, 1);
});

test("a fast immutable same-origin catalog chunk suppresses the delayed CDN hedge", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog-data/manifest.json"), "utf8"));
  const record = manifest.selectionData;
  const body = fs.readFileSync(path.join(ROOT, "catalog-data", record.path));
  const calls = [];
  const result = await Assets.fetchVerifiedAsset(`catalog-data/${record.path}`, {
    location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/" },
    bytes: record.bytes,
    sha256: record.sha256,
    crypto: crypto.webcrypto,
    hedgeDelayMs: 10,
    fetchImpl: async (url) => { calls.push(url); return new Response(body); }
  });
  assert.equal(result.source, "same-origin");
  assert.equal(calls.length, 1);
});

test("a stalled immutable same-origin chunk is hedged and the verified CDN winner aborts the loser", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog-data/manifest.json"), "utf8"));
  const record = manifest.selectionData;
  const body = fs.readFileSync(path.join(ROOT, "catalog-data", record.path));
  const calls = [];
  let primaryAborted = false;
  const result = await Assets.fetchVerifiedAsset(`catalog-data/${record.path}`, {
    location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/" },
    bytes: record.bytes,
    sha256: record.sha256,
    crypto: crypto.webcrypto,
    hedgeDelayMs: 5,
    fetchImpl: (url, options) => {
      calls.push(url);
      if (!String(url).startsWith(Assets.CDN_BASE)) {
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
          primaryAborted = true;
          reject(new Error("aborted loser"));
        }, { once: true }));
      }
      return Promise.resolve(new Response(body));
    }
  });
  await Promise.resolve();
  assert.equal(result.source, "cdn");
  assert.equal(calls.length, 2);
  assert.equal(primaryAborted, true);
});

test("an invalid immutable primary starts the verified fallback immediately", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog-data/manifest.json"), "utf8"));
  const record = manifest.selectionData;
  const body = fs.readFileSync(path.join(ROOT, "catalog-data", record.path));
  let calls = 0;
  const result = await Assets.fetchVerifiedAsset(`catalog-data/${record.path}`, {
    location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/" },
    bytes: record.bytes,
    sha256: record.sha256,
    crypto: crypto.webcrypto,
    hedgeDelayMs: 100,
    fetchImpl: async () => (++calls === 1 ? new Response("bad") : new Response(body))
  });
  assert.equal(result.source, "cdn");
  assert.equal(result.attempts[0].code, "INVALID_ASSET");
  assert.equal(calls, 2);
});

test("external cancellation terminates both sides of an active immutable hedge", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "catalog-data/manifest.json"), "utf8"));
  const record = manifest.selectionData;
  const controller = new AbortController();
  let calls = 0;
  const task = Assets.fetchVerifiedAsset(`catalog-data/${record.path}`, {
    location: { ...DEPLOYED, href: "https://zweisamkeit320.github.io/daily-atlas-v23/" },
    bytes: record.bytes,
    sha256: record.sha256,
    crypto: crypto.webcrypto,
    hedgeDelayMs: 0,
    signal: controller.signal,
    fetchImpl: (_url, options) => {
      calls += 1;
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    }
  });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(task, (error) => error.code === "CANCELLED");
  assert.equal(calls, 2);
});

test("the staged bootstrap and Service Worker share the verified routing module", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const bootstrap = fs.readFileSync(path.join(ROOT, "bootstrap.js"), "utf8");
  const worker = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  assert.match(html, /<script src="\.\/bootstrap\.js"><\/script>/);
  assert.match(bootstrap, /loadScript\("\.\/asset-routing\.js"\)/);
  assert.match(bootstrap, /loadScript\("\.\/catalog-loader\.js"\)/);
  assert.match(bootstrap, /assets\?\.catalogAssetRequest/);
  assert.match(bootstrap, /loadScript\("\.\/catalog\.js", 30000\)/, "same-origin legacy safe mode remains explicit");
  assert.match(worker, /importScripts\("\.\/asset-routing\.js"\)/);
  assert.match(worker, /fetchVerifiedNarration/);
  assert.match(worker, /DailyAtlasAssets\.assetResolver/);
  assert.match(worker, /matchOrFetchSplitCatalog/);
  assert.match(worker, /verifyCachedNarration/);
});
