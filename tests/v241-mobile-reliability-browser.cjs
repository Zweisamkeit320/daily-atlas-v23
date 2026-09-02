"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const fixtureImage = fs.readFileSync(path.join(root, "assets", "visuals", "cities", "city-chengdu.webp"));
const reportDirectorySetting = String(process.env.DAILY_ATLAS_TEST_REPORT_DIR || "").trim();
const reportPath = /^stdout-only$/i.test(reportDirectorySetting)
  ? null
  : path.join(reportDirectorySetting ? path.resolve(reportDirectorySetting) : path.join(os.tmpdir(), "daily-atlas-test-results"), "v241-mobile-reliability.json");
const engines = Object.freeze([
  Object.freeze({ name: "Chromium", browserType: chromium, executablePath: process.env.DAILY_ATLAS_CHROMIUM_EXECUTABLE || "" }),
  Object.freeze({ name: "Firefox", browserType: firefox, executablePath: process.env.DAILY_ATLAS_FIREFOX_EXECUTABLE || "" }),
  Object.freeze({ name: "WebKit", browserType: webkit, executablePath: process.env.DAILY_ATLAS_WEBKIT_EXECUTABLE || "" })
]);
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

function localFile(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const absolute = path.resolve(root, relative);
  return absolute === root || absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}

const server = http.createServer((request, response) => {
  const file = localFile(request.url);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  const body = fs.readFileSync(file);
  response.writeHead(200, {
    "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": path.basename(file) === "sw.js" || path.extname(file) === ".html"
      ? "no-store"
      : "public, max-age=3600"
  });
  response.end(body);
});

const UAS = Object.freeze({
  Quark: "Mozilla/5.0 (Linux; Android 14; V2303A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Quark/7.4.5.681",
  vivo: "Mozilla/5.0 (Linux; Android 13; V2238A Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36 VivoBrowser/19.6.2.1",
  WeChat: "Mozilla/5.0 (Linux; Android 14; V2303A Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49"
});

async function waitForShell(page) {
  await page.waitForFunction(() => ["ready", "safe", "degraded"].includes(document.documentElement.dataset.bootState));
  await page.waitForFunction(() => document.querySelectorAll("article.recommendation-card .swap-button:not([disabled])").length === 5);
}

async function waitForDetailsAndVisuals(page) {
  await page.waitForFunction(() => document.querySelectorAll(".catalog-detail-placeholder").length === 0, null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const cityImage = document.querySelector("#cityCard .daily-visual-image");
    const remoteBookMovieImages = document.querySelectorAll("#bookCard .daily-visual-image, #movieCard .daily-visual-image");
    return remoteBookMovieImages.length === 0
      && cityImage?.complete === true
      && cityImage.naturalWidth > 0;
  });
}

async function visualIdentity(page) {
  return page.evaluate(() => [
    { type: "book", cardId: "bookCard", collection: "books", titleSelector: ".card-title" },
    { type: "movie", cardId: "movieCard", collection: "movies", titleSelector: ".card-title" },
    { type: "city", cardId: "cityCard", collection: "cities", titleSelector: ".city-heading h3" }
  ].map((definition) => {
    const card = document.querySelector(`#${definition.cardId}`);
    const id = card?.querySelector(".swap-button")?.dataset.itemId || "";
    const item = (globalThis.DAILY_ATLAS_CATALOG?.[definition.collection] || []).find((candidate) => candidate.id === id);
    const image = card?.querySelector(".daily-visual-image");
    const title = card?.querySelector(definition.titleSelector)?.textContent.trim() || "";
    const expectedTitle = definition.type === "city" ? String(item?.cityZh || item?.title || "") : String(item?.title || "");
    const expectedCandidates = [...(globalThis.DailyAtlasVisuals?.resolve(item, definition.type, {
      dataSaver: false,
      safeMode: globalThis.DAILY_ATLAS_SAFE_MODE === true
    })?.candidates || [])].map((candidate) => new URL(candidate, document.baseURI).href);
    let renderedCandidates = [];
    try {
      renderedCandidates = JSON.parse(image?.getAttribute("data-visual-candidates") || "[]")
        .map((candidate) => new URL(candidate, document.baseURI).href);
    } catch (_error) {}
    return {
      type: definition.type,
      id,
      itemFound: Boolean(item),
      title,
      expectedTitle,
      alt: image?.alt || "",
      src: image ? new URL(image.getAttribute("src"), document.baseURI).href : "",
      expectedCandidates,
      renderedCandidates
    };
  }));
}

async function assertVisualIdentity(page, label) {
  const identities = await visualIdentity(page);
  for (const identity of identities) {
    assert.equal(identity.itemFound, true, `${label} ${identity.type} ID must resolve to the selected catalog item`);
    assert.equal(identity.title, identity.expectedTitle, `${label} ${identity.type} title must match its stable ID`);
    assert.deepEqual(identity.renderedCandidates, identity.expectedCandidates,
      `${label} ${identity.type} image candidates must be derived from the same selected ID`);
    if (identity.type === "city") {
      assert.ok(identity.alt.includes(identity.expectedTitle), `${label} city image alt must match its title`);
      assert.ok(identity.renderedCandidates.includes(identity.src), `${label} city image must belong to its selected ID`);
    } else {
      assert.equal(identity.src, "", `${label} ${identity.type} must not create a remote image in the public-safe release`);
      assert.deepEqual(identity.renderedCandidates, [], `${label} ${identity.type} must use its local editorial visual`);
    }
  }
  return identities.map(({ type, id, title, src }) => ({ type, id, title, src }));
}

async function layoutAt(page, width, label) {
  await page.setViewportSize({ width, height: 844 });
  const layout = await page.evaluate(() => {
    document.body.style.fontSize = "20px";
    const rootStyle = getComputedStyle(document.documentElement);
    const copy = [...document.querySelectorAll(".german-copy, .medical-copy")].map((node) => ({
      overflowY: getComputedStyle(node).overflowY,
      clipped: node.scrollHeight > node.clientHeight + 1
    }));
    const visuals = [...document.querySelectorAll("#bookCard .daily-visual-image, #movieCard .daily-visual-image, #cityCard .daily-visual-image")];
    const editorialSurfaces = [...document.querySelectorAll("#bookCard .card-visual, #movieCard .card-visual, #cityCard .city-visual")];
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      supportsTextSizeAdjust: CSS.supports("text-size-adjust", "100%") || CSS.supports("-webkit-text-size-adjust", "100%"),
      textSizeAdjust: rootStyle.webkitTextSizeAdjust || rootStyle.textSizeAdjust,
      copy,
      editorialSurfaceCount: editorialSurfaces.length,
      visualCount: visuals.length,
      decodedVisuals: visuals.filter((image) => image.complete && image.naturalWidth > 0).length,
      quickNavVisible: getComputedStyle(document.querySelector("#quickNav")).position === "fixed"
    };
  });
  assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `${label} ${width}px has horizontal clipping/overflow`);
  if (layout.supportsTextSizeAdjust) {
    assert.match(String(layout.textSizeAdjust), /100%/, `${label} ${width}px needs explicit text autosizing normalization`);
  }
  assert.ok(layout.copy.every((entry) => entry.overflowY !== "hidden" && !entry.clipped), `${label} ${width}px clips German or medical copy`);
  assert.equal(layout.editorialSurfaceCount, 3, `${label} ${width}px renders all three editorial visual surfaces`);
  assert.equal(layout.visualCount, 1, `${label} ${width}px emits only the open-license city image`);
  assert.equal(layout.decodedVisuals, 1, `${label} ${width}px decodes the open-license city image`);
  assert.equal(layout.quickNavVisible, true, `${label} ${width}px keeps the five-item mobile quick navigation`);
  return layout;
}

async function runSlowDetail(browser, origin) {
  const slowContext = await browser.newContext({
    viewport: { width: 360, height: 800 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    userAgent: UAS.Quark,
    serviceWorkers: "block"
  });
  try {
    await slowContext.addInitScript(() => {
      globalThis.__v241RandomCalls = 0;
      const original = Crypto.prototype.getRandomValues;
      Crypto.prototype.getRandomValues = function (array) {
        if (array instanceof Uint32Array && array.length === 1) globalThis.__v241RandomCalls += 1;
        return original.call(this, array);
      };
    });
    let activeDetails = 0;
    let peakDetails = 0;
    let detailRequests = 0;
    await slowContext.route(/\/catalog-data\/details\//, async (route) => {
      detailRequests += 1;
      activeDetails += 1;
      peakDetails = Math.max(peakDetails, activeDetails);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      activeDetails -= 1;
      await route.continue();
    });
    await slowContext.route(/^https:\/\/(?:images\.weserv\.nl|covers\.openlibrary\.org|images\.metahub\.space)\//,
      (route) => route.fulfill({ status: 200, contentType: "image/webp", body: fixtureImage }));
    const page = await slowContext.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
    page.on("pageerror", (error) => errors.push(`page:${error.message}`));
    const started = Date.now();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    const shellReadyMs = Date.now() - started;
    assert.ok(shellReadyMs < 3500, `actionable shell waited for delayed details (${shellReadyMs}ms)`);
    assert.ok(await page.locator(".catalog-detail-placeholder").count() >= 1, "shell becomes actionable while details are still pending");
    assert.equal(await page.locator("#bookCard .detail-preview-visual, #movieCard .detail-preview-visual, #cityCard .detail-preview-visual").count(), 3,
      "compact book, movie and city selections expose immediate editorial visual surfaces");
    assert.equal(await page.locator("#bookCard .daily-visual-image, #movieCard .daily-visual-image").count(), 0,
      "public-safe compact selections do not create remote book or movie images");
    assert.equal(await page.locator("#cityCard .daily-visual-image").count(), 1,
      "compact city selection exposes its same-origin open-license image");

    const before = await page.locator("#bookCard .swap-button").getAttribute("data-item-id");
    const beforeTitle = await page.locator("#bookCard .card-title").textContent();
    const randomCallsBefore = await page.evaluate(() => globalThis.__v241RandomCalls);
    const swapStarted = Date.now();
    await page.locator("#bookCard .swap-button").click();
    await page.waitForFunction((id) => document.querySelector("#bookCard .swap-button")?.dataset.itemId !== id, before);
    const swapMs = Date.now() - swapStarted;
    const after = await page.locator("#bookCard .swap-button").getAttribute("data-item-id");
    const afterTitle = await page.locator("#bookCard .card-title").textContent();
    assert.notEqual(after, before, "manual next changes the stable ID before the detail chunk arrives");
    assert.notEqual(afterTitle, beforeTitle, "manual next changes the local editorial identity immediately");
    assert.equal(await page.locator("#bookCard .daily-visual-image").count(), 0,
      "manual next does not introduce a remote book image");
    assert.ok(swapMs < 1500, `manual next preview took too long (${swapMs}ms)`);
    assert.equal(await page.evaluate(() => globalThis.__v241RandomCalls), randomCallsBefore + 1,
      "one manual next action draws exactly once from Web Crypto inside the committed transaction");
    await waitForDetailsAndVisuals(page);
    assert.ok(detailRequests >= 5, "the test exercised delayed detail hydration");
    assert.ok(peakDetails <= 2, `detail requests exceeded the shared low-bandwidth ceiling (${peakDetails})`);
    assert.deepEqual(errors, [], "Chromium simulated slow mobile scenario emitted console/page errors");
    return { shellReadyMs, swapMs, detailRequests, peakDetails, before, after };
  } finally {
    await slowContext.close().catch(() => {});
  }
}

async function runMobileMatrix(browser, engineName, origin) {
  const results = {};
  for (const [name, userAgent] of Object.entries(UAS)) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      userAgent,
      serviceWorkers: "block"
    });
    try {
      await context.route(/^https:\/\/(?:images\.weserv\.nl|covers\.openlibrary\.org|images\.metahub\.space)\//,
        (route) => route.fulfill({ status: 200, contentType: "image/webp", body: fixtureImage }));
      const mobile = await context.newPage();
      mobile.setDefaultTimeout(30000);
      const errors = [];
      mobile.on("console", (message) => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
      mobile.on("pageerror", (error) => errors.push(`page:${error.message}`));
      await mobile.goto(origin, { waitUntil: "domcontentloaded" });
      await waitForShell(mobile);
      await waitForDetailsAndVisuals(mobile);
      const initialIdentity = await assertVisualIdentity(mobile, `${engineName}/${name}/initial`);
      const viewports = {};
      for (const width of [320, 390]) viewports[width] = await layoutAt(mobile, width, `${engineName}/${name}`);

      for (const cardId of ["bookCard", "movieCard", "cityCard"]) {
        const selector = `#${cardId} .swap-button`;
        const previousId = await mobile.locator(selector).getAttribute("data-item-id");
        await mobile.locator(selector).click();
        await mobile.waitForFunction(({ cardId: target, previous }) =>
          document.querySelector(`#${target} .swap-button`)?.dataset.itemId !== previous, { cardId, previous: previousId });
        await waitForDetailsAndVisuals(mobile);
      }
      const swappedIdentity = await assertVisualIdentity(mobile, `${engineName}/${name}/after-next`);
      assert.deepEqual(errors, [], `${engineName}/${name} emitted console/page errors`);
      results[name] = { viewports, initialIdentity, swappedIdentity, consoleAndPageErrors: errors.length };
    } finally {
      await context.close().catch(() => {});
    }
  }
  return results;
}

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const evidence = {
    origin,
    scope: {
      kind: "Playwright desktop-engine automation with simulated Android mobile user-agent strings and mobile viewports",
      realDevice: false,
      note: "This is not Quark, vivo Browser, or WeChat testing on a physical Android device."
    },
    slowDetail: {},
    engines: {}
  };
  try {
    for (const engine of engines) {
      if (engine.executablePath) assert.ok(fs.existsSync(engine.executablePath), `${engine.name} executable override must exist`);
      const browser = await engine.browserType.launch({
        headless: true,
        timeout: 20000,
        ...(engine.executablePath ? { executablePath: engine.executablePath } : {})
      });
      try {
        if (engine.name === "Chromium") evidence.slowDetail = await runSlowDetail(browser, origin);
        evidence.engines[engine.name] = {
          binarySource: engine.executablePath ? "explicit-override" : "playwright-managed",
          userAgents: await runMobileMatrix(browser, engine.name, origin)
        };
        process.stdout.write(`PASS ${engine.name}: simulated Quark/vivo/WeChat at 320px and 390px; local-book/movie+city-image identity=consistent errors=0\n`);
      } finally {
        await browser.close().catch(() => {});
      }
    }
    if (reportPath) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, `${JSON.stringify(evidence, null, 2)}\n`);
    }
    process.stdout.write("SCOPE: simulated mobile user-agent/browser-engine automation only; NOT real-device Quark/vivo/WeChat evidence.\n");
    process.stdout.write(`REPORT: ${reportPath || "stdout-only"}\n`);
    process.stdout.write(`v2.4.3 compatibility mobile reliability: PASS\n${JSON.stringify(evidence)}\n`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
