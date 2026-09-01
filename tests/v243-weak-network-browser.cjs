"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE_IMAGE = fs.readFileSync(path.join(ROOT, "assets", "visuals", "cities-mobile", "city-chengdu.webp"));
const UA = "Mozilla/5.0 (Linux; Android 14; V2303A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Quark/7.4.5.681";
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg"
});
const requests = [];

function localFile(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const absolute = path.resolve(ROOT, relative);
  return absolute.startsWith(`${ROOT}${path.sep}`) ? absolute : null;
}

const server = http.createServer((request, response) => {
  const file = localFile(request.url);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  const relative = path.relative(ROOT, file).replaceAll("\\", "/");
  requests.push(relative);
  const body = fs.readFileSync(file);
  const delay = relative.startsWith("catalog-data/details/") ? 900
    : relative.startsWith("assets/visuals/cities-mobile/") && relative.endsWith(".webp") ? 450
      : /\.(?:js|json)$/.test(relative) ? 90 : 25;
  setTimeout(() => {
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    response.end(body);
  }, delay);
});

async function waitForShell(page) {
  await page.waitForFunction(() => ["ready", "safe", "degraded"].includes(document.documentElement.dataset.bootState), null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("article.recommendation-card .swap-button:not([disabled])").length === 5);
}

async function run() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, ...(process.env.DAILY_ATLAS_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DAILY_ATLAS_CHROMIUM_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai", userAgent: UA,
      serviceWorkers: "block"
    });
    await context.route(/^https:\/\/(?:images\.weserv\.nl|covers\.openlibrary\.org|images\.metahub\.space)\//, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 450));
      await route.fulfill({ status: 200, contentType: "image/webp", body: FIXTURE_IMAGE });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
    page.on("pageerror", (error) => errors.push(`page:${error.message}`));
    const started = Date.now();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const shellReadyMs = Date.now() - started;
    assert.ok(shellReadyMs < 5000, `controlled weak-network shell took ${shellReadyMs}ms`);

    const startupRequests = requests.slice();
    for (const expected of ["runtime-foundation.js", "runtime-features.js"]) {
      assert.equal(startupRequests.filter((name) => name === expected).length, 1, `${expected} must load exactly once`);
    }
    for (const removed of ["state.js", "profile.js", "lock.js", "backup-crypto.js", "backup.js", "appearance.js", "weekly.js", "music.js", "speech.js", "city-live.js", "reminders.js", "visuals.js", "pwa.js"]) {
      assert.equal(startupRequests.includes(removed), false, `${removed} must not be a separate normal-mode cold-start request`);
    }
    const startupJs = startupRequests.filter((name) => name.endsWith(".js"));
    assert.ok(startupJs.length <= 12, `normal cold start used ${startupJs.length} JavaScript requests: ${startupJs.join(", ")}`);

    const timing = await page.evaluate(() => globalThis.DailyAtlasRuntimeHealth.readStageTimings());
    assert.ok(timing && Number.isSafeInteger(timing.totalMs) && timing.totalMs > 0, "completed startup timing must be available");
    for (const stage of ["routing", "engine", "catalog", "modules", "app"]) assert.ok(Number.isSafeInteger(timing.stages[stage]), `${stage} timing is absent`);

    const cityIds = [];
    for (let index = 0; index < 5; index += 1) {
      const before = await page.locator("#cityCard .swap-button").getAttribute("data-item-id");
      await page.locator("#cityCard .swap-button").click();
      await page.waitForFunction((id) => document.querySelector("#cityCard .swap-button")?.dataset.itemId !== id, before);
      const current = await page.locator("#cityCard .swap-button").getAttribute("data-item-id");
      cityIds.push(current);
      const image = page.locator("#cityCard .daily-visual-image");
      assert.equal(await image.getAttribute("hidden") !== null, true, "new city image remains hidden while bytes decode");
      await page.waitForFunction(() => {
        const image = document.querySelector("#cityCard .daily-visual-image");
        return image && !image.hidden && image.complete && image.naturalWidth > 0;
      });
      const identity = await page.evaluate(() => {
        const card = document.querySelector("#cityCard");
        const id = card.querySelector(".swap-button")?.dataset.itemId;
        const image = card.querySelector(".daily-visual-image");
        const candidates = JSON.parse(image.getAttribute("data-visual-candidates") || "[]").map((value) => new URL(value, document.baseURI).href);
        return { id, src: new URL(image.getAttribute("src"), document.baseURI).href, candidates };
      });
      assert.equal(identity.id, current);
      assert.ok(identity.candidates.includes(identity.src), "decoded city image belongs to the current stable ID");
      assert.match(identity.candidates[0], /\/assets\/visuals\/cities-mobile\//, "mobile city derivative is the first candidate");
    }
    assert.equal(new Set(cityIds).size, 5, "five manual swaps should not repeat within the short exploration run");
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      quickNav: getComputedStyle(document.querySelector("#quickNav")).position,
      medicalTop: document.querySelector("#medicalCard").getBoundingClientRect().top,
      pageHeight: document.documentElement.scrollHeight
    }));
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, "390px weak-network layout has horizontal clipping");
    assert.equal(layout.quickNav, "fixed");
    assert.ok(layout.medicalTop < layout.pageHeight, "medical card remains in the scrollable document");
    assert.ok(requests.some((name) => name.startsWith("assets/visuals/cities-mobile/city-")), "the run transferred mobile city derivatives");
    assert.deepEqual(errors, []);

    const evidence = { shellReadyMs, startupJsRequests: startupJs.length, timing, cityIds, mobileVisualRequests: requests.filter((name) => name.startsWith("assets/visuals/cities-mobile/city-")).length };
    process.stdout.write(`v2.4.3 controlled weak-network gate: PASS\n${JSON.stringify(evidence)}\n`);
    await context.close();
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  server.close(() => process.exitCode = 1);
});
