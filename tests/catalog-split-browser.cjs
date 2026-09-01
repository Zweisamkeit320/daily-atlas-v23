"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = Object.freeze({ ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" });
const shell = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>split catalog smoke</title></head><body>
<script src="./engine.js"></script><script src="./profile.js"></script><script src="./catalog-loader.js"></script>
<script>globalThis.catalogStore = DailyAtlasCatalogData.createStore({ baseUrl: document.baseURI, requestTimeoutMs: 5000 });</script>
</body></html>`;

const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
  if (!relative || relative === "catalog-split-test.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(shell);
    return;
  }
  if (relative === "favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const edgePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(edgePath) ? edgePath : undefined, timeout: 15000 });
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const requested = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requested.push(new URL(request.url()).pathname));

    const { port } = server.address();
    await page.goto(`http://127.0.0.1:${port}/catalog-split-test.html`, { waitUntil: "domcontentloaded" });
    const selection = await page.evaluate(async () => {
      const compact = await catalogStore.loadSelection();
      const collections = { book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" };
      const picks = Object.keys(collections).map((type) => DailyAtlasEngine.chooseInitial(compact[collections[type]], {
        dateKey: "2026-08-28", type, themeId: DailyAtlasEngine.dailyTheme("2026-08-28").id
      }));
      globalThis.catalogPicks = picks;
      return { counts: Object.fromEntries(Object.entries(collections).map(([type, key]) => [type, compact[key].length])), ids: picks.map((item) => item.id) };
    });
    assert.deepEqual(selection.counts, { book: 500, movie: 500, city: 200, german: 500, medical: 500 });
    assert.equal(new Set(selection.ids).size, 5);
    assert.equal(requested.some((name) => name.includes("/details/")), false, "selection phase fetched details");
    assert.equal(requested.some((name) => /\/search\.[a-f0-9]+\.js$/.test(name)), false, "selection phase fetched search index");

    const details = await page.evaluate(async () => (await catalogStore.loadDetails(catalogPicks)).map((item) => ({ id: item.id, type: item.type, title: item.title })));
    assert.equal(details.length, 5);
    assert.ok(details.every((item) => item.id && item.type && item.title));
    assert.equal(new Set(requested.filter((name) => name.includes("/catalog-data/details/"))).size, 5);

    const search = await page.evaluate(async () => {
      const result = await catalogStore.query({ q: "Berlin", pageSize: 5 });
      return {
        total: result.total,
        items: result.items.map((entry) => ({ id: entry.id, hydratedId: entry.item.id, title: entry.item.title })),
        mainThreadIndex: Boolean(globalThis.DAILY_ATLAS_SEARCH_INDEX)
      };
    });
    assert.ok(search.total > 0 && search.items.length > 0);
    assert.ok(search.items.every((entry) => entry.id === entry.hydratedId && entry.title));
    assert.equal(search.mainThreadIndex, false, "HTTP search unexpectedly parsed its index on the main thread");
    assert.ok(requested.some((name) => name.endsWith("/search-worker.js")), "search Worker was not requested");
    assert.ok(requested.some((name) => /\/catalog-data\/search\.[a-f0-9]+\.js$/.test(name)), "Worker did not request delayed search index");
    assert.deepEqual(errors, []);

    const filePage = await browser.newPage();
    filePage.setDefaultTimeout(15000);
    const fileErrors = [];
    filePage.on("console", (message) => { if (message.type() === "error") fileErrors.push(message.text()); });
    filePage.on("pageerror", (error) => fileErrors.push(error.message));
    await filePage.goto(pathToFileURL(path.join(ROOT, "tests", "fixtures", "catalog-split-file.html")).href, { waitUntil: "domcontentloaded" });
    const fileResult = await filePage.evaluate(() => catalogFileResult);
    assert.equal(fileResult.count, 2200);
    assert.ok(fileResult.detail.id && fileResult.detail.title && !fileResult.detail.selectionOnly);
    assert.ok(fileResult.search.total > 0 && fileResult.search.count > 0);
    assert.equal(fileResult.search.mainThread, true, "file mode did not use its main-thread search fallback");
    assert.deepEqual(fileErrors, []);
    await filePage.close();
    process.stdout.write(`PASS: split catalog browser selection=5 search=${search.total} worker=true file=true errors=0\n`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
