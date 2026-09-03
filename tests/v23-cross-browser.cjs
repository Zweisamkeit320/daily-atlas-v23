"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const splitManifest = require("../catalog-data/manifest.json");
const appVersion = require("../package.json").version;

const root = path.resolve(__dirname, "..");
const reportPath = path.join(root, "test-results", "v24-cross-browser-wcag-report.json");
const serverHits = new Map();
const selectionPath = `/catalog-data/${splitManifest.selectionData.path}`;
const searchPath = `/catalog-data/${splitManifest.search.path}`;
const executableOverrides = Object.freeze({
  Chromium: process.env.DAILY_ATLAS_CHROMIUM_EXECUTABLE || "",
  Firefox: process.env.DAILY_ATLAS_FIREFOX_EXECUTABLE || "",
  WebKit: process.env.DAILY_ATLAS_WEBKIT_EXECUTABLE || ""
});
const requestedEngines = new Set(
  String(process.env.DAILY_ATLAS_ENGINES || "Chromium,Firefox,WebKit")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg"
};

function safeFile(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return null;
  return absolute;
}

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, "http://localhost").pathname;
  serverHits.set(requestPath, (serverHits.get(requestPath) || 0) + 1);
  if (requestPath === "/index.html") {
    response.writeHead(308, {
      Location: "/",
      "Cache-Control": "public, max-age=0, must-revalidate"
    });
    response.end();
    return;
  }
  const file = safeFile(request.url);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  const body = fs.readFileSync(file);
  response.writeHead(200, {
    "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": path.basename(file) === "sw.js" || path.extname(file) === ".html" ? "public, max-age=0, must-revalidate" : "public, max-age=3600",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.weserv.nl https://covers.openlibrary.org https://archive.org https://*.us.archive.org https://images.metahub.space; media-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net https://api.open-meteo.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
  });
  response.end(body);
});

async function waitForReady(page) {
  await page.waitForFunction(() => ["ready", "safe", "degraded"].includes(document.documentElement.dataset.bootState));
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    return cards.length === 5 && cards.every((card) => !card.hasAttribute("aria-busy")) && document.querySelectorAll(".known-button:not([disabled])").length === 5;
  });
}

function importantAxeViolations(result) {
  return result.violations.filter((violation) => ["critical", "serious"].includes(violation.impact));
}

async function runEngine(name, browserType, origin) {
  const selectionHitsBefore = serverHits.get(selectionPath) || 0;
  const searchHitsBefore = serverHits.get(searchPath) || 0;
  const executablePath = executableOverrides[name];
  if (executablePath) assert.ok(fs.existsSync(executablePath), `${name} executable override must exist`);
  const browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  try {
    await context.addInitScript(() => {
    try {
      localStorage.setItem("dailyAtlas.appearance.v1", JSON.stringify({
        schemaVersion: 1,
        color: "paper",
        style: "clean",
        density: "compact",
        dataSaver: false,
        textSize: "default",
        contrast: "default",
        motion: "reduce"
      }));
    } catch (_error) {}
  });
  const visualFixture = fs.readFileSync(path.join(root, "assets", "visuals", "cities", "city-chengdu.webp"));
  await context.route(/^https:\/\/(?:images\.weserv\.nl|covers\.openlibrary\.org|images\.metahub\.space)\//, (route) => route.fulfill({ status: 200, contentType: "image/webp", body: visualFixture }));
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  const requested = [];
  const selectionRequests = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`page:${error.message}`));
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    requested.push(pathname);
    if (/catalog-data\/selection-data\.[a-f0-9]{12}\.json$/.test(pathname)) selectionRequests.push(request.resourceType());
  });

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await waitForReady(page);
  assert.equal(await page.locator(".known-button:not([disabled])").count(), 5, `${name} renders five actionable cards`);
  assert.equal(await page.evaluate(() => globalThis.DAILY_ATLAS_SAFE_MODE), false, `${name} uses normal split mode`);
  assert.equal(await page.evaluate(() => globalThis.DAILY_ATLAS_PUBLIC_CONFIG?.publicReleaseMode), true, `${name} exposes public release policy`);
  assert.equal(await page.evaluate(() => globalThis.DAILY_ATLAS_PUBLIC_CONFIG?.publicSafeMode), false, `${name} keeps progressive original media enabled by default`);
  assert.equal(await page.locator("#originBanner").isVisible(), true, `${name} shows the dual-origin disclosure`);
  assert.equal(await page.locator("#bookCard .cover-image, #movieCard .cover-image").count(), 2, `${name} emits one progressive original image element per media card`);
  await page.waitForFunction(() => document.querySelectorAll("#bookCard [data-visual-status][data-visual-state='loaded'], #movieCard [data-visual-status][data-visual-state='loaded']").length === 2);
  assert.equal(await page.locator("#bookCard .editorial-art, #movieCard .editorial-art").count(), 2,
    `${name} keeps matching local thematic art underneath both original media images`);
  assert.equal(requested.some((pathname) => pathname.endsWith("/catalog.js")), false, `${name} normal startup never downloads legacy catalog.js`);
  assert.ok(requested.some((pathname) => /catalog-data\/selection-data\.[a-f0-9]{12}\.json$/.test(pathname)), `${name} requests the compact selection index`);
  assert.equal(requested.some((pathname) => /catalog-data\/search\.[a-f0-9]{12}\.js$/.test(pathname)), false, `${name} search index is delayed`);
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return;
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("service worker ready timeout")), 20000))
    ]);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForReady(page);
  assert.equal(await page.locator(".known-button:not([disabled])").count(), 5,
    `${name} reloads through an active Service Worker after the host canonicalizes index.html`);
  assert.equal((serverHits.get(selectionPath) || 0) - selectionHitsBefore, 1,
    `${name} page and Service Worker reuse one selection transfer; page request types=${selectionRequests.join(",") || "none"}`);

  await page.locator("#exploreQuery").fill("记忆");
  await page.waitForFunction(() => document.querySelector("#exploreStatus")?.textContent.includes("找到"));
  assert.ok(await page.locator(".explore-card").count(), `${name} returns hydrated search results`);
  assert.ok(requested.some((pathname) => pathname.endsWith("/search-worker.js")), `${name} starts the search Worker`);
  assert.equal((serverHits.get(searchPath) || 0) - searchHitsBefore, 1, `${name} downloads the delayed search index exactly once on demand`);

  const appAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const appViolations = importantAxeViolations(appAxe);

  const diagnostics = await context.newPage();
  diagnostics.setDefaultTimeout(30000);
  const diagnosticErrors = [];
  diagnostics.on("console", (message) => { if (message.type() === "error") diagnosticErrors.push(message.text()); });
  diagnostics.on("pageerror", (error) => diagnosticErrors.push(error.message));
  await diagnostics.goto(`${origin}/diagnostics`, { waitUntil: "domcontentloaded" });
  await diagnostics.waitForFunction(() => {
    const overall = document.querySelector("#overallStatus");
    return Boolean(overall) && overall.dataset.status !== "running";
  });
  assert.notEqual(await diagnostics.locator("#overallStatus").getAttribute("data-status"), "fail", `${name} diagnostics reaches a non-failing result`);
  const environmentText = await diagnostics.locator("#environmentList").innerText();
  assert.match(environmentText, /显式安全模式[\s\S]*未启用/);
  assert.match(environmentText, /公开安全素材模式[\s\S]*未启用/);
  assert.match(environmentText, /公开测试发布[\s\S]*是/);
  assert.match(environmentText, /远程书封／海报[\s\S]*允许/);
  assert.match(environmentText, /同源城市图[\s\S]*允许/);
  const diagnosticAxe = await new AxeBuilder({ page: diagnostics }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const diagnosticViolations = importantAxeViolations(diagnosticAxe);

  const disclosureViolations = [];
  for (const pathName of ["privacy.html", "sources-and-licenses.html", "city-credits.html"]) {
    const disclosure = await context.newPage();
    await disclosure.goto(`${origin}/${pathName}`, { waitUntil: "domcontentloaded" });
    if (pathName !== "city-credits.html") {
      assert.ok((await disclosure.locator("main").innerText()).includes(`v${appVersion}`),
        `${pathName} must disclose current app version v${appVersion}`);
    }
    const disclosureAxe = await new AxeBuilder({ page: disclosure }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    disclosureViolations.push(...importantAxeViolations(disclosureAxe));
    await disclosure.close();
  }

  assert.deepEqual(errors, [], `${name} app has no console/page errors`);
  assert.deepEqual(diagnosticErrors, [], `${name} diagnostics has no console/page errors`);
  const axeSummary = (violations) => violations.map((entry) => ({
    id: entry.id,
    impact: entry.impact,
    nodes: entry.nodes.map((node) => ({ target: node.target, summary: node.failureSummary }))
  }));
  assert.deepEqual(axeSummary(appViolations), [], `${name} app has no serious/critical WCAG A/AA violations`);
  assert.deepEqual(axeSummary(diagnosticViolations), [], `${name} diagnostics has no serious/critical WCAG A/AA violations`);
  assert.deepEqual(axeSummary(disclosureViolations), [], `${name} disclosure pages have no serious/critical WCAG A/AA violations`);

  const result = {
    engine: name,
    binarySource: executablePath ? "explicit-override" : "playwright-managed",
    cards: 5,
    searchResults: await page.locator(".explore-card").count(),
    worker: requested.some((pathname) => pathname.endsWith("/search-worker.js")),
    selectionOriginTransfers: (serverHits.get(selectionPath) || 0) - selectionHitsBefore,
    legacyCatalogRequested: requested.some((pathname) => pathname.endsWith("/catalog.js")),
    appAxeViolations: appViolations.length,
    diagnosticAxeViolations: diagnosticViolations.length,
    disclosureAxeViolations: disclosureViolations.length,
    errors: errors.length + diagnosticErrors.length
  };
    return result;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function runSafeFallback(origin) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    const requested = [];
    await page.route(/catalog-data\/selection-data\.[a-f0-9]{12}\.json$/, (route) => route.abort("failed"));
    page.on("request", (request) => requested.push(new URL(request.url()).pathname));
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    await waitForReady(page);
    assert.equal(await page.evaluate(() => globalThis.DAILY_ATLAS_SAFE_MODE), true, "split failure enters automatic safe mode");
    assert.ok(requested.some((pathname) => pathname.endsWith("/catalog.js")), "safe fallback downloads the same-origin legacy catalog");
    assert.equal(requested.some((pathname) => pathname.endsWith("/pwa.js")), false, "safe fallback does not start optional PWA updates");
    assert.equal(await page.locator(".known-button:not([disabled])").count(), 5, "safe fallback still renders five actionable cards");
    return { automaticSafeFallback: true, cards: 5, pwaLoaded: false };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  try {
    const engineEntries = [["Chromium", chromium], ["Firefox", firefox], ["WebKit", webkit]]
      .filter(([name]) => requestedEngines.has(name));
    assert.ok(engineEntries.length > 0, "DAILY_ATLAS_ENGINES selected no supported engines");
    for (const [name, browserType] of engineEntries) {
      results.push(await runEngine(name, browserType, origin));
      process.stdout.write(`PASS ${name}: cards=5 worker=true axe=0 errors=0\n`);
    }
    const safeFallback = await runSafeFallback(origin);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify({ checkedAt: new Date().toISOString(), results, safeFallback }, null, 2)}\n`);
    process.stdout.write(`PASS v2.4 cross-browser/WCAG gate: ${results.length}/${engineEntries.length} selected engines; safe-fallback=true\n`);
  } finally {
    server.close();
  }
})().catch((error) => {
  server.close();
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
