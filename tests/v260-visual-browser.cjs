"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const REMOTE_IMAGE_PATTERN = /^https:\/\/(?:images\.weserv\.nl|covers\.openlibrary\.org|images\.metahub\.space)\//;
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg"
});

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
  const body = fs.readFileSync(file);
  const delay = relative.startsWith("catalog-data/details/") ? 420 : 0;
  setTimeout(() => {
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    response.end(body);
  }, delay);
});

async function waitForReady(page) {
  await page.waitForFunction(() => ["ready", "safe", "degraded"].includes(document.documentElement.dataset.bootState));
  await page.waitForFunction(() => document.querySelectorAll("article.recommendation-card .swap-button:not([disabled])").length === 5);
}

async function currentArt(page, type) {
  return page.locator(`#${type}Card`).evaluate((card, mediaType) => {
    const button = card.querySelector(".swap-button");
    const art = card.querySelector(".editorial-art");
    const rect = art?.getBoundingClientRect();
    const id = button?.dataset.itemId || "";
    const expected = globalThis.DailyAtlasVisuals?.editorialArt?.({ id, genres: ["history"] }, mediaType)?.signature || "";
    return {
      id,
      signature: art?.dataset.artSignature || "",
      expected,
      family: art?.dataset.artFamily || "",
      medium: art?.dataset.artMedium || "",
      width: rect?.width || 0,
      height: rect?.height || 0,
      svgCount: card.querySelectorAll(".editorial-art").length,
      remoteImages: card.querySelectorAll("img.cover-image").length,
      imageHidden: card.querySelector("img.cover-image")?.hidden ?? true,
      imageWidth: card.querySelector("img.cover-image")?.naturalWidth || 0,
      imageUrl: card.querySelector("img.cover-image")?.currentSrc || card.querySelector("img.cover-image")?.src || "",
      sourceState: card.querySelector("[data-visual-status]")?.dataset.visualState || "",
      sourceLabel: card.querySelector("[data-visual-status]")?.textContent || ""
    };
  }, type);
}

async function waitForMediaState(page, type, state) {
  await page.waitForFunction(({ mediaType, expected }) =>
    document.querySelector(`#${mediaType}Card [data-visual-status]`)?.dataset.visualState === expected,
  { mediaType: type, expected: state });
}

async function verifyEngine(name, browserType, origin) {
  const executablePath = name === "Firefox" ? process.env.DAILY_ATLAS_FIREFOX_EXECUTABLE
    : name === "WebKit" ? process.env.DAILY_ATLAS_WEBKIT_EXECUTABLE
      : process.env.DAILY_ATLAS_CHROMIUM_EXECUTABLE;
  if (executablePath) assert.ok(fs.existsSync(executablePath), `${name} executable override does not exist`);
  const browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    serviceWorkers: "block"
  });
  const thirdPartyMediaRequests = [];
  await context.route(REMOTE_IMAGE_PATTERN, (route) => {
    thirdPartyMediaRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`page:${error.message}`));
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await Promise.race([
      page.locator("#bookCard .detail-preview-visual .editorial-art").waitFor({ timeout: 5000 }),
      page.locator("#bookCard .card-visual .editorial-art").waitFor({ timeout: 5000 })
    ]);
    await waitForReady(page);
    await page.waitForFunction(() => document.querySelector("#bookCard .card-visual .editorial-art") && document.querySelector("#movieCard .card-visual .editorial-art"));

    const visited = { book: new Map(), movie: new Map() };
    for (const type of ["book", "movie"]) {
      for (let index = 0; index < 11; index += 1) {
        await waitForMediaState(page, type, "loaded");
        const art = await currentArt(page, type);
        assert.equal(art.signature, art.expected, `${name} ${type}:${art.id} visual signature belongs to another item`);
        assert.equal(art.medium, type);
        assert.match(art.family, /^(archive|passage|terrain|labyrinth|threshold|evidence|orbit|signal|horizon)$/);
        assert.equal(art.svgCount, 1, `${name} ${type}:${art.id} must render exactly one local illustration`);
        assert.equal(art.remoteImages, 1, `${name} ${type}:${art.id} must expose one original cover/poster candidate`);
        assert.equal(art.imageHidden, false, `${name} ${type}:${art.id} decoded original image must cover the fallback art`);
        assert.ok(art.imageWidth > 0, `${name} ${type}:${art.id} original image must decode`);
        assert.match(art.imageUrl, REMOTE_IMAGE_PATTERN, `${name} ${type}:${art.id} original image stays on the media allow-list`);
        assert.ok(art.width >= 90 && art.height >= 170, `${name} ${type}:${art.id} illustration has no usable painted area`);
        assert.equal(art.sourceState, "loaded");
        assert.match(art.sourceLabel, type === "book" ? /第三方书封/ : /第三方海报/);
        assert.equal(visited[type].has(art.id), false, `${name} ${type} repeated within a short manual exploration run`);
        visited[type].set(art.id, art.signature);
        if (index === 10) break;
        await page.locator(`#${type}Card .swap-button`).click();
        await page.waitForFunction(({ type, id }) => document.querySelector(`#${type}Card .swap-button`)?.dataset.itemId !== id, { type, id: art.id });
      }
      assert.equal(new Set(visited[type].values()).size, 11, `${name} ${type} visual signatures must change with content`);
    }

    const currentBook = await page.locator("#bookCard").evaluate((card) => ({
      id: card.querySelector(".swap-button")?.dataset.itemId,
      title: card.querySelector(".card-title")?.textContent,
      signature: card.querySelector(".editorial-art")?.dataset.artSignature
    }));
    await page.locator("#exploreQuery").fill(currentBook.title);
    await page.locator("#exploreType").selectOption("book");
    await page.waitForFunction((id) => [...document.querySelectorAll("#exploreResults .explore-book")].some((card) => card.querySelector(".editorial-art")?.dataset.artSignature === DailyAtlasVisuals.editorialArt({ id, genres: ["history"] }, "book").signature), currentBook.id);
    const explored = await page.evaluate((id) => {
      const expected = DailyAtlasVisuals.editorialArt({ id, genres: ["history"] }, "book").signature;
      const card = [...document.querySelectorAll("#exploreResults .explore-book")].find((entry) => entry.querySelector(".editorial-art")?.dataset.artSignature === expected);
      const image = card?.querySelector("img.explore-image");
      return { signature: card?.querySelector(".editorial-art")?.dataset.artSignature || "", candidates: JSON.parse(image?.dataset.visualCandidates || "[]") };
    }, currentBook.id);
    assert.equal(explored.signature, currentBook.signature, `${name} explore result must reuse the current book visual identity`);
    assert.equal(explored.candidates.length, 3, `${name} explore result keeps the current book original-cover routes above its art fallback`);
    assert.match(explored.candidates[0], REMOTE_IMAGE_PATTERN);

    for (const width of [320, 360, 390, 428, 768]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        art: [...document.querySelectorAll("#bookCard .editorial-art, #movieCard .editorial-art")].map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        }),
        medicalInDocument: document.querySelector("#medicalCard")?.getBoundingClientRect().top < document.documentElement.scrollHeight
      }));
      assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `${name} ${width}px has horizontal clipping`);
      assert.ok(layout.art.every((rect) => rect.left >= -0.5 && rect.right <= width + 0.5 && rect.width > 0 && rect.height > 0), `${name} ${width}px clips a local illustration`);
      assert.equal(layout.medicalInDocument, true, `${name} ${width}px medical card leaves the scrollable page`);
    }
    assert.ok(thirdPartyMediaRequests.length >= 22, `${name} must exercise original cover/poster requests across replacements`);
    assert.deepEqual(errors, [], `${name} emitted browser errors`);
    process.stdout.write(`PASS ${name}: original cover/poster priority + local-art underlay + 20 swaps + 320-768px\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function verifyFallback(name, browserType, origin) {
  const executablePath = name === "Firefox" ? process.env.DAILY_ATLAS_FIREFOX_EXECUTABLE
    : name === "WebKit" ? process.env.DAILY_ATLAS_WEBKIT_EXECUTABLE
      : process.env.DAILY_ATLAS_CHROMIUM_EXECUTABLE;
  const browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const requests = [];
  await context.route(REMOTE_IMAGE_PATTERN, (route) => {
    requests.push(route.request().url());
    return route.abort("failed");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForReady(page);
    for (const type of ["book", "movie"]) {
      await waitForMediaState(page, type, "fallback");
      const art = await currentArt(page, type);
      assert.equal(art.svgCount, 1, `${name} ${type} failure keeps one local thematic illustration`);
      assert.equal(art.remoteImages, 1, `${name} ${type} failure keeps one inert image element for diagnostics`);
      assert.equal(art.imageHidden, true, `${name} ${type} failed original image must not obscure the fallback`);
      assert.equal(art.sourceState, "fallback");
      assert.match(art.sourceLabel, /原创主题插画/);
    }
    assert.ok(requests.length >= 2, `${name} fallback scenario must actually attempt remote originals`);
    process.stdout.write(`PASS ${name}: failed original media falls back to the matching local illustration\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  try {
    for (const [name, browserType] of [["Chromium", chromium], ["Firefox", firefox], ["WebKit", webkit]]) {
      await verifyEngine(name, browserType, origin);
      await verifyFallback(name, browserType, origin);
    }
    process.stdout.write("v2.6.0 visual browser gate: PASS (3/3 engines)\n");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  server.close(() => { process.exitCode = 1; });
});
