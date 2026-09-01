"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(ROOT, "test-results", "v24-dual-origin-browser-report.json");
const TINY_PNG = fs.readFileSync(path.join(ROOT, "assets", "icons", "icon-192.png"));
const CITY_VISUAL_ROOT = path.join(ROOT, "assets", "visuals", "cities");
const CITY_VISUAL_MANIFEST_BYTES = fs.readFileSync(path.join(CITY_VISUAL_ROOT, "manifest.json"));
const CITY_VISUAL_MANIFEST = JSON.parse(CITY_VISUAL_MANIFEST_BYTES.toString("utf8"));
const SW_SOURCE = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const VISUAL_VERSION = SW_SOURCE.match(/const VISUAL_VERSION = "([^"]+)";/)?.[1];
assert.ok(VISUAL_VERSION, "sw.js exposes a visual pack version");
const FULL_VISUAL_CACHE = `daily-atlas-visual-pack-${VISUAL_VERSION}`;
const FULL_VISUAL_MARKER = "./__daily-atlas-full-visual-complete__";
const CITY_MANIFEST_SHA256 = crypto.createHash("sha256").update(CITY_VISUAL_MANIFEST_BYTES).digest("hex").toUpperCase();
const DECODEABLE_CITY_WEBPS = fs.readdirSync(CITY_VISUAL_ROOT)
  .filter((name) => /^city-[a-z0-9-]+\.webp$/.test(name))
  .map((name) => ({ name, body: fs.readFileSync(path.join(CITY_VISUAL_ROOT, name)) }));
assert.ok(DECODEABLE_CITY_WEBPS.length >= 2, "city-cache regression needs two distinct decodable WebP fixtures");
const REMOTE_IMAGE_HOSTS = Object.freeze([
  "images.weserv.nl",
  "covers.openlibrary.org",
  "images.metahub.space"
]);
const DEPLOYMENT_MODES = Object.freeze([
  Object.freeze({ id: "cloudflare-root", basePath: "/" }),
  Object.freeze({ id: "github-subpath", basePath: "/daily-atlas-v23/" })
]);
const ENGINES = Object.freeze([
  Object.freeze({ name: "Chromium", browserType: chromium, executable: process.env.DAILY_ATLAS_CHROMIUM_EXECUTABLE || "" }),
  Object.freeze({ name: "Firefox", browserType: firefox, executable: process.env.DAILY_ATLAS_FIREFOX_EXECUTABLE || "" }),
  Object.freeze({ name: "WebKit", browserType: webkit, executable: process.env.DAILY_ATLAS_WEBKIT_EXECUTABLE || "" })
]);
const IMAGE_FAILURES = Object.freeze(["http-404", "timeout", "decode"]);
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg"
});
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://images.weserv.nl https://covers.openlibrary.org https://archive.org https://*.us.archive.org https://images.metahub.space",
  "media-src 'self' https://cdn.jsdelivr.net",
  "connect-src 'self' https://cdn.jsdelivr.net https://api.open-meteo.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

const serverState = {
  mode: DEPLOYMENT_MODES[0],
  hits: new Map(),
  escapes: [],
  offline: false,
  offlineAttempts: [],
  corruptCityResponsesRemaining: 0
};

function hit(pathname) {
  serverState.hits.set(pathname, (serverState.hits.get(pathname) || 0) + 1);
}

function insideRoot(relative) {
  const absolute = path.resolve(ROOT, relative);
  return absolute === ROOT || absolute.startsWith(`${ROOT}${path.sep}`) ? absolute : null;
}

function requestedFile(pathname) {
  const { basePath } = serverState.mode;
  if (basePath !== "/" && !pathname.startsWith(basePath)) return { escaped: true };
  let relative = basePath === "/" ? pathname.replace(/^\/+/, "") : pathname.slice(basePath.length);
  if (!relative) relative = "index.html";
  if (relative === "diagnostics") relative = "diagnostics.html";
  if (relative === "privacy") relative = "privacy.html";
  if (relative === "sources-and-licenses") relative = "sources-and-licenses.html";
  if (relative === "city-credits") relative = "city-credits.html";
  const absolute = insideRoot(relative);
  return { absolute, relative };
}

function serviceWorkerImageFixture(source) {
  const hosts = JSON.stringify(REMOTE_IMAGE_HOSTS);
  const bytes = JSON.stringify(TINY_PNG.toString("base64"));
  return `/* v2.4 browser-gate only: keep allowlisted image requests off the public Internet. */\n` +
    `const __V24_IMAGE_HOSTS = new Set(${hosts});\n` +
    `const __V24_IMAGE_BYTES = Uint8Array.from(atob(${bytes}), (value) => value.charCodeAt(0));\n` +
    `let __V24_IMAGE_FETCH_COUNT = 0;\n` +
    `let __V24_CITY_CACHE_MATCH_COUNT = 0;\n` +
    `const __V24_ORIGINAL_CACHE_MATCH = Cache.prototype.match;\n` +
    `Cache.prototype.match = function(request, options) { const value = typeof request === "string" ? request : request?.url || ""; if (/\\/assets\\/visuals\\/cities\\/city-[a-z0-9-]+\\.webp(?:[?#]|$)/.test(value)) __V24_CITY_CACHE_MATCH_COUNT += 1; return __V24_ORIGINAL_CACHE_MATCH.call(this, request, options); };\n` +
    `self.addEventListener("fetch", (event) => {\n` +
    `  const url = new URL(event.request.url);\n` +
    `  if (__V24_IMAGE_HOSTS.has(url.hostname)) { __V24_IMAGE_FETCH_COUNT += 1; event.respondWith(Promise.resolve(new Response(__V24_IMAGE_BYTES, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } }))); }\n` +
    `});\n` +
    `self.addEventListener("message", (event) => { if (event.data?.type === "V24_IMAGE_COUNT") event.ports?.[0]?.postMessage({ count: __V24_IMAGE_FETCH_COUNT }); if (event.data?.type === "V24_CITY_CACHE_MATCH_COUNT") event.ports?.[0]?.postMessage({ count: __V24_CITY_CACHE_MATCH_COUNT }); });\n` + source;
}

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch (_error) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("bad request");
    return;
  }
  if (serverState.offline) {
    serverState.offlineAttempts.push({ mode: serverState.mode.id, pathname });
    request.socket.destroy();
    return;
  }
  hit(pathname);
  const canonicalIndex = `${serverState.mode.basePath}index.html`;
  if (pathname === canonicalIndex) {
    response.writeHead(308, {
      Location: serverState.mode.basePath,
      "Cache-Control": "public, max-age=0, must-revalidate"
    });
    response.end();
    return;
  }
  const result = requestedFile(pathname);
  if (result.escaped) {
    serverState.escapes.push({ mode: serverState.mode.id, pathname });
    response.writeHead(421, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("asset escaped deployment base path");
    return;
  }
  if (!result.absolute || !fs.existsSync(result.absolute) || !fs.statSync(result.absolute).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  let body = fs.readFileSync(result.absolute);
  const isCityVisual = /^assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(result.relative);
  if (isCityVisual && serverState.corruptCityResponsesRemaining > 0) {
    serverState.corruptCityResponsesRemaining -= 1;
    const stale = DECODEABLE_CITY_WEBPS.find((candidate) => candidate.name !== path.basename(result.absolute));
    body = stale.body;
  }
  if (result.relative === "sw.js") body = Buffer.from(serviceWorkerImageFixture(body.toString("utf8")), "utf8");
  response.writeHead(200, {
    "Content-Type": MIME[path.extname(result.absolute).toLowerCase()] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": isCityVisual
      ? "no-store"
      : path.basename(result.absolute) === "sw.js" || path.extname(result.absolute) === ".html"
      ? "public, max-age=0, must-revalidate"
      : "public, max-age=3600",
    "Content-Security-Policy": CSP,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
  });
  if (request.method === "HEAD") response.end();
  else response.end(body);
});

function isMissingBrowser(error) {
  return /Executable doesn't exist|Please run the following command to download new browsers|Host system is missing dependencies|error while loading shared libraries|browserType\.launch: Failed to launch|spawn (?:UNKNOWN|ENOENT|EACCES)|side-by-side configuration/i.test(String(error?.stack || error));
}

async function launchEngine(engine) {
  if (engine.executable && !fs.existsSync(engine.executable)) {
    return { blocked: true, reason: `configured executable does not exist: ${engine.executable}` };
  }
  try {
    const browser = await engine.browserType.launch({
      headless: true,
      timeout: 20000,
      ...(engine.executable ? { executablePath: engine.executable } : {})
    });
    return { browser };
  } catch (error) {
    if (isMissingBrowser(error)) return { blocked: true, reason: String(error.message || error).split("\n")[0] };
    throw error;
  }
}

function pageUrl(origin, mode, relative = "") {
  return new URL(relative, `${origin}${mode.basePath}`).href;
}

function remoteImageCount(counts) {
  return REMOTE_IMAGE_HOSTS.reduce((sum, host) => sum + (counts.get(host) || 0), 0);
}

async function installImageFixtures(context, origin, mode, fault = "success") {
  const counts = new Map();
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const remote = REMOTE_IMAGE_HOSTS.includes(requestUrl.hostname);
    const localCity = requestUrl.origin === origin
      && requestUrl.pathname.startsWith(`${mode.basePath}assets/visuals/cities/`)
      && requestUrl.pathname.endsWith(".webp");
    if (!remote && !(localCity && fault !== "success")) {
      await route.continue();
      return;
    }
    const key = remote ? requestUrl.hostname : "local-city";
    counts.set(key, (counts.get(key) || 0) + 1);
    if (fault === "success") {
      await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
      return;
    }
    if (fault === "http-404") {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "missing fixture" });
      return;
    }
    if (fault === "timeout") {
      await route.abort("timedout");
      return;
    }
    await route.fulfill({ status: 200, contentType: "image/webp", body: Buffer.from("not-a-decodable-image") });
  });
  return counts;
}

async function waitForReady(page) {
  await page.waitForFunction(() => ["ready", "safe", "degraded"].includes(document.documentElement.dataset.bootState));
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    return cards.length === 5
      && cards.every((card) => !card.hasAttribute("aria-busy"))
      && document.querySelectorAll(".known-button:not([disabled])").length === 5;
  });
}

async function assertFiveCards(page, label) {
  assert.equal(await page.locator("article.recommendation-card").count(), 5, `${label}: exactly five recommendation cards render`);
  assert.equal(await page.locator(".swap-button:not([disabled])").count(), 5, `${label}: all five replacement actions are enabled`);
  assert.equal(await page.locator(".known-button:not([disabled])").count(), 5, `${label}: all five known actions are enabled`);
}

async function assertVisualSuccess(page, label) {
  const selectors = [
    ["#bookCard img.cover-image[data-visual-candidates]", "#bookCard .card-visual"],
    ["#movieCard img.cover-image[data-visual-candidates]", "#movieCard .card-visual"],
    ["#cityCard img.city-image[data-visual-candidates]", "#cityCard .city-visual"]
  ];
  for (const [selector, visualSelector] of selectors) {
    const image = page.locator(selector);
    assert.equal(await image.count(), 1, `${label}: ${selector} exists`);
    await page.locator(visualSelector).scrollIntoViewIfNeeded();
    await image.evaluate((node) => { node.loading = "eager"; });
    try {
      await page.waitForFunction((candidate) => {
        const node = document.querySelector(candidate);
        return Boolean(node && node.complete && node.naturalWidth > 0 && !node.hidden);
      }, selector);
    } catch (error) {
      const state = await image.evaluate((node) => ({
        src: node.src,
        complete: node.complete,
        naturalWidth: node.naturalWidth,
        hidden: node.hidden,
        index: node.dataset.visualIndex,
        candidates: node.dataset.visualCandidates,
        visualClass: node.closest(".card-visual, .city-visual")?.className || ""
      }));
      throw new Error(`${label}: ${selector} did not decode: ${JSON.stringify(state)}; ${error.message}`);
    }
    assert.ok((await image.getAttribute("alt") || "").trim(), `${label}: ${selector} has useful alternative text`);
  }
}

async function manifestSnapshot(page) {
  return page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const manifestUrl = new URL(link.href);
    const response = await fetch(manifestUrl, { cache: "no-store" });
    const manifest = await response.json();
    const resolved = Object.fromEntries(["id", "start_url", "scope"].map((key) => [key, new URL(manifest[key], manifestUrl).href]));
    return { manifestUrl: manifestUrl.href, ...resolved };
  });
}

function assertUrlInsideBase(value, origin, mode, label) {
  const url = new URL(value);
  assert.equal(url.origin, origin, `${label}: stays same-origin`);
  assert.ok(url.pathname.startsWith(mode.basePath), `${label}: ${url.pathname} stays under ${mode.basePath}`);
}

async function assertManifestBoundary(page, origin, mode, label) {
  const manifest = await manifestSnapshot(page);
  assert.ok(manifest, `${label}: Web App Manifest link exists`);
  assertUrlInsideBase(manifest.manifestUrl, origin, mode, `${label} manifest URL`);
  for (const field of ["id", "start_url", "scope"]) {
    assertUrlInsideBase(manifest[field], origin, mode, `${label} manifest ${field}`);
    assert.equal(new URL(manifest[field]).pathname, mode.basePath, `${label}: manifest ${field} resolves to the deployment base`);
  }
}

async function assertServiceWorkerScope(page, origin, mode, label) {
  const state = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return { supported: false };
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("service-worker-ready-timeout")), 25000))
    ]);
    return { supported: true, scope: registration.scope, controlled: Boolean(navigator.serviceWorker.controller) };
  });
  assert.equal(state.supported, true, `${label}: Service Worker API is available`);
  assertUrlInsideBase(state.scope, origin, mode, `${label} Service Worker scope`);
  assert.equal(new URL(state.scope).pathname, mode.basePath, `${label}: Service Worker scope equals the deployment base`);
  return state;
}

async function assertExtensionlessPages(context, origin, mode, label) {
  const checks = [
    ["diagnostics", "#diagnosticResults"],
    ["privacy", "main"],
    ["sources-and-licenses", "main"],
    ["city-credits", "#cityCreditList"]
  ];
  for (const [route, selector] of checks) {
    const page = await context.newPage();
    try {
      const response = await page.goto(pageUrl(origin, mode, route), { waitUntil: "domcontentloaded" });
      assert.ok(response === null || response.ok(), `${label}: /${route} is served successfully`);
      await page.locator(selector).waitFor({ state: "attached" });
      assert.equal(await page.locator(selector).count(), 1, `${label}: /${route} returns its unique page marker instead of an app-shell fallback`);
      assert.equal(new URL(page.url()).pathname, `${mode.basePath}${route}`, `${label}: /${route} remains extensionless`);
    } finally {
      await page.close();
    }
  }
}

async function assertDualEntryDisclosure(page, label) {
  const disclosure = await page.evaluate(() => ({
    origins: (globalThis.DAILY_ATLAS_PUBLIC_CONFIG?.origins || []).map((entry) => ({ id: entry.id, url: entry.url })),
    alternate: document.querySelector("#originAlternate")?.href || "",
    privacy: document.querySelector('#originBanner a[href*="privacy"]')?.href || ""
  }));
  assert.deepEqual(disclosure.origins, [
    { id: "github", url: "https://zweisamkeit320.github.io/daily-atlas-v23/" },
    { id: "cloudflare", url: "https://daily-atlas-mobile-cn.pages.dev/" }
  ], `${label}: the static public configuration declares both HTTPS entry points`);
  assert.ok(disclosure.origins.some((entry) => entry.url === disclosure.alternate), `${label}: the visible alternate-entry link is one declared endpoint`);
  assert.match(disclosure.privacy, /privacy\.html#origin-storage$/, `${label}: the cross-Origin storage explanation is linked`);
}

async function serviceWorkerRemoteImageCount(page) {
  return page.evaluate(() => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker || typeof MessageChannel !== "function") return 0;
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error("V24_IMAGE_COUNT response timed out")), 3000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(Number(event.data?.count) || 0);
      };
      worker.postMessage({ type: "V24_IMAGE_COUNT" }, [channel.port2]);
    });
  });
}

async function serviceWorkerMessage(page, data, timeout = 30000) {
  return page.evaluate(({ payload, waitMs }) => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker || typeof MessageChannel !== "function") throw new Error("controlled Service Worker and MessageChannel are required");
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error(`${payload.type} response timed out`)), waitMs);
      channel.port1.onmessage = (event) => {
        if (event.data?.final === false) return;
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };
      worker.postMessage(payload, [channel.port2]);
    });
  }, { payload: data, waitMs: timeout });
}

async function setDataSaverAndAssert(page, remoteCounts, label) {
  await page.waitForTimeout(200);
  const before = remoteImageCount(remoteCounts) + await serviceWorkerRemoteImageCount(page);
  await page.locator("#settingsButton").click();
  await page.locator("#settingsDialog").waitFor({ state: "visible" });
  await page.locator("#dataSaverEnabled").check();
  await page.waitForFunction(() => document.documentElement.dataset.dataSaver === "true");
  await page.waitForFunction(() => document.querySelectorAll("#bookCard img[data-visual-candidates], #movieCard img[data-visual-candidates], #cityCard img[data-visual-candidates]").length === 0);
  await page.locator("#doneSettingsButton").click();
  for (const type of ["book", "movie", "city"]) {
    const selector = `#${type}Card .swap-button`;
    const original = await page.locator(selector).getAttribute("data-item-id");
    await page.locator(selector).click();
    await page.waitForFunction(({ selector: candidate, originalId }) => {
      const button = document.querySelector(candidate);
      return Boolean(button && !button.disabled && button.dataset.itemId !== originalId);
    }, { selector, originalId: original });
  }
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#bookCard img[data-visual-candidates], #movieCard img[data-visual-candidates], #cityCard img[data-visual-candidates]").count(), 0,
    `${label}: data saver removes nonessential book, movie and city images even after replacement`);
  const after = remoteImageCount(remoteCounts) + await serviceWorkerRemoteImageCount(page);
  assert.equal(after, before, `${label}: data saver triggers zero new remote image requests across page routing and Service Worker fetches`);
}

async function assertOfflineReopen(context, page, origin, mode, label) {
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);
  }
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), true, `${label}: page is controlled before offline reopen`);
  await page.close();
  const offlineAttemptsBefore = serverState.offlineAttempts.length;
  const probePath = `${mode.basePath}__origin-unavailable-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
  const probeUrl = new URL(probePath, origin).href;
  serverState.offline = true;
  const offlinePage = await context.newPage();
  offlinePage.setDefaultTimeout(30000);
  try {
    await assert.rejects(
      context.request.get(probeUrl, { failOnStatusCode: false, timeout: 5000 }),
      `${label}: the unique uncached same-origin probe fails while the Origin is unavailable`
    );
    assert.ok(
      serverState.offlineAttempts.slice(offlineAttemptsBefore).some((attempt) => attempt.mode === mode.id && attempt.pathname === probePath),
      `${label}: the Origin server observed the unique uncached outage probe`
    );
    await offlinePage.goto(pageUrl(origin, mode), { waitUntil: "domcontentloaded" });
    await waitForReady(offlinePage);
    await assertFiveCards(offlinePage, `${label} offline reopen`);
    assert.equal(await offlinePage.evaluate(() => Boolean(navigator.serviceWorker?.controller)), true, `${label}: reopened page remains Service Worker controlled offline`);
  } finally {
    serverState.offline = false;
  }
  return offlinePage;
}

async function runSuccessScenario(browser, engine, origin, mode) {
  serverState.mode = mode;
  const label = `${engine.name}/${mode.id}`;
  const escapesBefore = serverState.escapes.length;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    serviceWorkers: "allow"
  });
  const remoteCounts = await installImageFixtures(context, origin, mode, "success");
  let page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto(pageUrl(origin, mode, "index.html"), { waitUntil: "domcontentloaded" });
    assert.equal(new URL(page.url()).pathname, mode.basePath, `${label}: index.html canonicalizes to the deployment base`);
    await waitForReady(page);
    await assertFiveCards(page, label);
    await assertVisualSuccess(page, label);
    await assertManifestBoundary(page, origin, mode, label);
    await assertDualEntryDisclosure(page, label);
    await assertServiceWorkerScope(page, origin, mode, label);
    await assertExtensionlessPages(context, origin, mode, label);

    for (let reload = 1; reload <= 3; reload += 1) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForReady(page);
      await assertFiveCards(page, `${label} reload ${reload}/3`);
      assert.equal(new URL(page.url()).pathname, mode.basePath, `${label}: reload ${reload}/3 stays on the canonical base`);
    }
    await assertServiceWorkerScope(page, origin, mode, `${label} after three reloads`);
    page = await assertOfflineReopen(context, page, origin, mode, label);
    await setDataSaverAndAssert(page, remoteCounts, label);

    assert.equal(serverState.escapes.length, escapesBefore, `${label}: no same-origin request escapes ${mode.basePath}`);
    return {
      mode: mode.id,
      cards: 5,
      reloads: 3,
      offlineReopen: true,
      serviceWorkerScope: pageUrl(origin, mode),
      manifestBoundary: true,
      extensionlessPages: ["diagnostics", "privacy", "sources-and-licenses", "city-credits"],
      visualNaturalWidth: true,
      dataSaverNoRemoteRequests: true,
      remoteFixtureRequests: Object.fromEntries(remoteCounts)
    };
  } finally {
    await page?.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function runFailureScenario(browser, engine, origin, mode, fault) {
  serverState.mode = mode;
  const label = `${engine.name}/${mode.id}/${fault}`;
  const escapesBefore = serverState.escapes.length;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    serviceWorkers: "block"
  });
  const counts = await installImageFixtures(context, origin, mode, fault);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto(pageUrl(origin, mode), { waitUntil: "domcontentloaded" });
    await waitForReady(page);
    for (const [selector, visualSelector] of [
      ["#bookCard img.cover-image", "#bookCard .card-visual"],
      ["#movieCard img.cover-image", "#movieCard .card-visual"],
      ["#cityCard img.city-image", "#cityCard .city-visual"]
    ]) {
      const image = page.locator(selector);
      assert.equal(await image.count(), 1, `${label}: fault target ${selector} is emitted before fallback`);
      await page.locator(visualSelector).scrollIntoViewIfNeeded();
      await page.waitForFunction((candidate) => {
        const node = document.querySelector(candidate);
        return Boolean(node && node.hidden && node.closest(".card-visual, .city-visual")?.classList.contains("visual-image-failed"));
      }, selector);
    }
    assert.ok((await page.locator("#bookCard .visual-fallback strong").innerText()).trim(), `${label}: book fallback keeps title text`);
    assert.ok((await page.locator("#movieCard .visual-fallback strong").innerText()).trim(), `${label}: movie fallback keeps title text`);
    assert.ok((await page.locator("#cityCard .city-heading h3").innerText()).trim(), `${label}: city fallback keeps city text`);
    await assertFiveCards(page, `${label} fallback`);
    const original = await page.locator("#bookCard .swap-button").getAttribute("data-item-id");
    await page.locator("#bookCard .swap-button").click();
    await page.waitForFunction((originalId) => document.querySelector("#bookCard .swap-button")?.dataset.itemId !== originalId, original);
    await waitForReady(page);
    assert.equal(await page.locator("#bookCard .swap-button:not([disabled])").count(), 1, `${label}: fallback replacement button remains usable`);
    for (const host of REMOTE_IMAGE_HOSTS) assert.ok((counts.get(host) || 0) > 0, `${label}: ${host} was intercepted instead of reaching the Internet`);
    assert.ok((counts.get("local-city") || 0) > 0, `${label}: local city image fault was injected`);
    assert.equal(serverState.escapes.length, escapesBefore, `${label}: fallback makes no same-origin base-path escape`);
    return { mode: mode.id, fault, fallback: true, buttonsUsable: true, fixtureRequests: Object.fromEntries(counts) };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function runCityCacheRecovery(browser, origin, mode) {
  serverState.mode = mode;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", serviceWorkers: "allow" });
  await installImageFixtures(context, origin, mode, "success");
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto(pageUrl(origin, mode), { waitUntil: "domcontentloaded" });
    await waitForReady(page);
    await assertServiceWorkerScope(page, origin, mode, "Chromium/city-cache-recovery initial");
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForReady(page);
    }
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("daily-atlas-visual-") && !name.startsWith("daily-atlas-visual-pack-")) await caches.delete(name);
      }
    });
    const corruptionBudget = 10;
    serverState.corruptCityResponsesRemaining = corruptionBudget;
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);
    await page.locator("#cityCard .city-visual").scrollIntoViewIfNeeded();
    await page.locator("#cityCard img.city-image").evaluate((node) => { node.loading = "eager"; });
    await page.waitForFunction(() => {
      const image = document.querySelector("#cityCard img.city-image");
      return Boolean(image?.hidden && image.closest(".city-visual")?.classList.contains("visual-image-failed"));
    });
    assert.ok(serverState.corruptCityResponsesRemaining < corruptionBudget, "corrupt same-origin WebP response was exercised");
    serverState.corruptCityResponsesRemaining = 0;
    assert.equal(await page.evaluate(async () => {
      let count = 0;
      for (const name of await caches.keys()) {
        if (!name.startsWith("daily-atlas-visual-") || name.startsWith("daily-atlas-visual-pack-")) continue;
        count += (await (await caches.open(name)).keys()).filter((request) => /\/assets\/visuals\/cities\//.test(request.url)).length;
      }
      return count;
    }), 0, "stale but decodable 200 image/webp body is not persisted");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);
    await page.locator("#cityCard .city-visual").scrollIntoViewIfNeeded();
    await page.locator("#cityCard img.city-image").evaluate((node) => { node.loading = "eager"; });
    await page.waitForFunction(() => {
      const image = document.querySelector("#cityCard img.city-image");
      return Boolean(image && image.complete && image.naturalWidth > 0 && !image.hidden);
    });
    assert.ok(await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith("daily-atlas-visual-") || name.startsWith("daily-atlas-visual-pack-")) continue;
        if ((await (await caches.open(name)).keys()).some((request) => /\/assets\/visuals\/cities\//.test(request.url))) return true;
      }
      return false;
    }), "healthy retry is verified and cached after the corrupt response disappears");
    return { staleDecodableWebpNotCached: true, nextHealthyReloadRecovered: true };
  } finally {
    serverState.corruptCityResponsesRemaining = 0;
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function runFullVisualIntegrity(browser, origin, mode) {
  serverState.mode = mode;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", serviceWorkers: "allow" });
  await installImageFixtures(context, origin, mode, "success");
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const entries = CITY_VISUAL_MANIFEST.items.map(({ id, path: itemPath }) => ({ id, path: itemPath.replace(/^\.\//, "") }));
  const bad = entries[0];
  const stale = entries[1];
  const marker = {
    visualVersion: VISUAL_VERSION,
    manifestSha256: CITY_MANIFEST_SHA256,
    count: CITY_VISUAL_MANIFEST.count,
    totalBytes: CITY_VISUAL_MANIFEST.items.reduce((sum, entry) => sum + entry.bytes, 0)
  };
  try {
    await page.goto(pageUrl(origin, mode), { waitUntil: "domcontentloaded" });
    await waitForReady(page);
    await assertServiceWorkerScope(page, origin, mode, "Chromium/full-visual-integrity initial");
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForReady(page);
    }

    await page.evaluate(async ({ cacheName, markerPath, markerValue, visualEntries, badPath, stalePath }) => {
      await caches.delete(cacheName);
      const cache = await caches.open(cacheName);
      const fetchOne = async (entry) => {
        const response = await fetch(new URL(entry.path, location.href), { cache: "reload" });
        if (!response.ok) throw new Error(`fixture fetch failed: ${entry.path}`);
        await cache.put(new URL(entry.path, location.href), response);
      };
      for (let offset = 0; offset < visualEntries.length; offset += 8) {
        await Promise.all(visualEntries.slice(offset, offset + 8).map(fetchOne));
      }
      const staleResponse = await cache.match(new URL(stalePath, location.href));
      await cache.put(new URL(badPath, location.href), new Response(await staleResponse.clone().arrayBuffer(), {
        status: 200,
        headers: { "Content-Type": "image/webp", "Cache-Control": "no-store" }
      }));
      await cache.put(new URL(markerPath, location.href), new Response(JSON.stringify(markerValue), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    }, {
      cacheName: FULL_VISUAL_CACHE,
      markerPath: FULL_VISUAL_MARKER,
      markerValue: marker,
      visualEntries: entries,
      badPath: bad.path,
      stalePath: stale.path
    });

    const rejected = await serviceWorkerMessage(page, { type: "OFFLINE_GET_STATUS", requestId: "v24-corrupt-full-visual" }, 120000);
    assert.equal(rejected.visualReady, false, "marker plus 200 URLs is not ready when one decodable body belongs to another city");
    const rejectedCache = await page.evaluate(async ({ cacheName, markerPath, badPath }) => {
      const cache = await caches.open(cacheName);
      return {
        marker: Boolean(await cache.match(new URL(markerPath, location.href))),
        bad: Boolean(await cache.match(new URL(badPath, location.href)))
      };
    }, { cacheName: FULL_VISUAL_CACHE, markerPath: FULL_VISUAL_MARKER, badPath: bad.path });
    assert.deepEqual(rejectedCache, { marker: false, bad: false }, "failed full-pack validation removes both the ready marker and mismatched body");

    serverState.offline = true;
    const badDisplay = await page.evaluate((badPath) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ loaded: true, naturalWidth: image.naturalWidth });
      image.onerror = () => resolve({ loaded: false, naturalWidth: image.naturalWidth });
      image.src = new URL(badPath, location.href).href;
      document.body.append(image);
    }), bad.path);
    serverState.offline = false;
    assert.deepEqual(badDisplay, { loaded: false, naturalWidth: 0 }, "the rejected body is not displayed while its healthy network source is unavailable");

    await page.evaluate(async ({ cacheName, markerPath, markerValue, badPath }) => {
      const cache = await caches.open(cacheName);
      const response = await fetch(new URL(badPath, location.href), { cache: "reload" });
      if (!response.ok) throw new Error("healthy city retry failed");
      await cache.put(new URL(badPath, location.href), response);
      await cache.put(new URL(markerPath, location.href), new Response(JSON.stringify(markerValue), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    }, { cacheName: FULL_VISUAL_CACHE, markerPath: FULL_VISUAL_MARKER, markerValue: marker, badPath: bad.path });

    const beforeHealthy = await serviceWorkerMessage(page, { type: "V24_CITY_CACHE_MATCH_COUNT" });
    const healthy = await serviceWorkerMessage(page, { type: "OFFLINE_GET_STATUS", requestId: "v24-healthy-full-visual-1" }, 120000);
    const afterHealthy = await serviceWorkerMessage(page, { type: "V24_CITY_CACHE_MATCH_COUNT" });
    assert.equal(healthy.visualReady, true, "healthy 200-item city pack restores visual ready status");
    assert.ok(afterHealthy.count - beforeHealthy.count >= CITY_VISUAL_MANIFEST.count, "first healthy status performs the required complete body scan");

    const healthyAgain = await serviceWorkerMessage(page, { type: "OFFLINE_GET_STATUS", requestId: "v24-healthy-full-visual-2" }, 120000);
    const afterHealthyAgain = await serviceWorkerMessage(page, { type: "V24_CITY_CACHE_MATCH_COUNT" });
    assert.equal(healthyAgain.visualReady, true, "second status in the same worker lifecycle stays visually ready");
    assert.equal(afterHealthyAgain.count, afterHealthy.count, "memoized ready status does not repeat the 200-body city cache scan");

    const recoveredDisplay = await page.evaluate((badPath) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ loaded: true, naturalWidth: image.naturalWidth });
      image.onerror = () => resolve({ loaded: false, naturalWidth: image.naturalWidth });
      image.src = new URL(badPath, location.href).href;
      document.body.append(image);
    }), bad.path);
    assert.equal(recoveredDisplay.loaded, true, "healthy full-pack retry restores the correct city image");
    assert.ok(recoveredDisplay.naturalWidth > 0, "restored city image decodes");

    const credits = await context.newPage();
    try {
      await credits.goto(pageUrl(origin, mode, "city-credits"), { waitUntil: "domcontentloaded" });
      await credits.waitForFunction((id) => document.querySelector("#cityCreditList")?.textContent.includes(id), bad.id);
      assert.match(await credits.locator("#cityCreditSummary").innerText(), /200 张同源 WebP/,
        "the recovered image remains paired with the complete 200-item credit manifest");
    } finally {
      await credits.close();
    }
    return {
      corruptFullPackRejected: true,
      markerAndBadBodyRemoved: true,
      badBodyNotDisplayed: true,
      healthyPackRecovered: true,
      repeatedStatusBodyScans: afterHealthyAgain.count - afterHealthy.count
    };
  } finally {
    serverState.offline = false;
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function runEngine(engine, origin) {
  const launched = await launchEngine(engine);
  if (launched.blocked) return { engine: engine.name, status: "blocked", reason: launched.reason };
  const browser = launched.browser;
  try {
    const modes = [];
    for (const mode of DEPLOYMENT_MODES) {
      const success = await runSuccessScenario(browser, engine, origin, mode);
      const failures = [];
      for (const fault of IMAGE_FAILURES) failures.push(await runFailureScenario(browser, engine, origin, mode, fault));
      modes.push({ ...success, failures });
      process.stdout.write(`PASS ${engine.name}/${mode.id}: cards=5 reloads=3 offline=true visual=true faults=${IMAGE_FAILURES.join(",")}\n`);
    }
    const cityCacheRecovery = engine.name === "Chromium"
      ? await runCityCacheRecovery(browser, origin, DEPLOYMENT_MODES[0])
      : null;
    const fullVisualIntegrity = engine.name === "Chromium"
      ? await runFullVisualIntegrity(browser, origin, DEPLOYMENT_MODES[0])
      : null;
    return {
      engine: engine.name,
      status: "passed",
      binarySource: engine.executable ? "explicit-override" : "playwright-managed",
      modes,
      cityCacheRecovery,
      fullVisualIntegrity
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  try {
    for (const engine of ENGINES) results.push(await runEngine(engine, origin));
    const blocked = results.filter((result) => result.status === "blocked");
    const passed = results.filter((result) => result.status === "passed");
    const observedFaults = new Set(passed.flatMap((result) => result.modes.flatMap((mode) => mode.failures.map((failure) => failure.fault))));
    assert.deepEqual(serverState.escapes, [], "no GitHub-subpath resource request escaped /daily-atlas-v23/");
    if (passed.length) assert.deepEqual([...observedFaults].sort(), ["decode", "http-404", "timeout"], "404, timeout and decode failures are all exercised even when another browser is blocked");

    const report = {
      schemaVersion: 1,
      checkedAt: new Date().toISOString(),
      productionNetworkUsed: false,
      deployments: DEPLOYMENT_MODES.map(({ id, basePath }) => ({ id, basePath })),
      imageFixtures: { remoteHosts: REMOTE_IMAGE_HOSTS, validResponse: "in-memory PNG", faults: ["http-404", "timeout", "decode"] },
      notificationScopeCoverage: "unit: tests/platform-modules.test.cjs plus sw.js same-scope destination guard",
      results,
      summary: { passed: passed.length, blocked: blocked.length, failed: 0 }
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    if (blocked.length) {
      for (const result of blocked) process.stderr.write(`BLOCKED ${result.engine}: ${result.reason}\n`);
      process.stderr.write(`BLOCKED v2.4 dual-origin browser gate: ${passed.length}/3 engines passed; ${blocked.length} browser binaries unavailable. This is not a PASS.\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write("PASS v2.4 dual-origin browser gate: 3/3 engines, 2/2 deployment bases, 3 reloads each, offline reopen, manifest/SW scope, visuals/fallback/data saver, corrupt-city-cache recovery.\n");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch(async (error) => {
  try { await new Promise((resolve) => server.close(resolve)); } catch (_error) {}
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
