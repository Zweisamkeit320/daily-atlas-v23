const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { chromium } = require("playwright");
const BackupCrypto = require("../backup-crypto.js");

const root = path.resolve(process.env.DAILY_ATLAS_ROOT || path.join(__dirname, ".."));
const expectedCounts = Object.freeze({ books: 500, movies: 500, cities: 200, german: 500, medical: 500 });
const appearanceKey = "dailyAtlas.appearance.v1";
const appearanceDefaults = Object.freeze({
  schemaVersion: 1,
  color: "paper",
  style: "editorial",
  density: "comfortable",
  dataSaver: false,
  textSize: "default",
  contrast: "default",
  motion: "system"
});
const mime = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp"
});

const server = http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch (_error) { response.writeHead(400).end("Bad request"); return; }
  const relative = pathname.replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (!(file === root || file.startsWith(`${root}${path.sep}`)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });
  fs.createReadStream(file).pipe(response);
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer() {
  return new Promise((resolve) => server.close(resolve));
}

async function seedAppearance(context, origin, overrides) {
  const settings = { ...appearanceDefaults, ...(overrides || {}) };
  await context.addInitScript(({ expectedOrigin, key, value }) => {
    if (location.origin !== expectedOrigin) return;
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {}
  }, { expectedOrigin: origin, key: appearanceKey, value: settings });
}

async function createContext(browser, origin, options) {
  const settings = options || {};
  const context = await browser.newContext({
    viewport: settings.viewport || { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    serviceWorkers: "block"
  });
  await seedAppearance(context, origin, settings.appearance);
  return context;
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    return ["ready", "safe", "degraded"].includes(document.documentElement.dataset.bootState)
      && cards.length === 5
      && cards.every((card) => !card.hasAttribute("aria-busy") && card.querySelector("[data-item-id]"));
  });
}

async function openReadyPage(context, origin) {
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  return page;
}

async function clearApplicationStorage(page) {
  await page.evaluate(() => DailyAtlasLock.transaction((lease) => lease.storage.clear()));
  await page.evaluate(() => DailyAtlasLock.whenIdle());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
}

async function storageSnapshot(page) {
  return page.evaluate(() => DailyAtlasLock.readStorage((storage) => Object.fromEntries(
    [...DailyAtlasBackup.TARGET_KEYS, DailyAtlasBackup.PENDING_KEY]
      .sort()
      .map((key) => [key, storage.getItem(key)])
  )));
}

async function waitForExploreTotal(page, total) {
  try {
    await page.waitForFunction((wanted) => {
      const text = document.querySelector("#exploreStatus")?.textContent || "";
      return text.includes(`找到 ${wanted} 条内容`);
    }, total);
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      status: document.querySelector("#exploreStatus")?.textContent || "",
      busy: document.querySelector("#exploreResults")?.getAttribute("aria-busy"),
      bootState: document.documentElement.dataset.bootState || "",
      bootStage: document.documentElement.dataset.bootStage || "",
      runtimeErrors: globalThis.DailyAtlasRuntimeHealth?.readErrors?.() || []
    }));
    throw new Error(`${error.message}\nExplore diagnostic: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
}

async function expectedExploreTotal(page) {
  return page.evaluate(() => {
    const type = document.querySelector("#exploreType").value;
    const mediaAllowed = type === "all" || type === "book" || type === "movie";
    const filters = {
      q: document.querySelector("#exploreQuery").value,
      type,
      genre: mediaAllowed ? document.querySelector("#exploreGenre").value : "",
      era: mediaAllowed ? document.querySelector("#exploreEra").value : "",
      region: type === "all" || type === "city" ? document.querySelector("#exploreRegion").value : "",
      ratingPercent: mediaAllowed ? document.querySelector("#exploreRating").value : "",
      level: type === "all" || type === "german" ? document.querySelector("#exploreGermanLevel").value : "",
      medicalTopic: type === "all" || type === "medical" ? document.querySelector("#exploreMedicalTopic").value : "",
      sort: document.querySelector("#exploreSort").value,
      page: 1,
      pageSize: 24
    };
    if (globalThis.DailyAtlasCatalogStore?.query) {
      return DailyAtlasCatalogStore.query(filters, { hydrate: false }).then((result) => result.total);
    }
    const index = DailyAtlasExplore.buildIndex(DAILY_ATLAS_CATALOG, DailyAtlasEngine);
    return DailyAtlasExplore.query(index, filters).total;
  });
}

async function resetExplore(page) {
  await page.locator("#exploreReset").click();
  await waitForExploreTotal(page, 2200);
}

async function chooseImportFile(page, file) {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#importBackupButton").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await page.locator("#backupPreviewDialog").waitFor({ state: "visible" });
}

async function readDownload(download, directory) {
  const target = path.join(directory, download.suggestedFilename());
  await download.saveAs(target);
  return { target, text: fs.readFileSync(target, "utf8") };
}

async function assertNoHorizontalOverflow(page, label) {
  const audit = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    rootClientWidth: document.documentElement.clientWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  assert.ok(audit.rootScrollWidth <= audit.rootClientWidth + 1, `${label}: document root has no horizontal overflow`);
  assert.ok(audit.bodyScrollWidth <= audit.innerWidth + 1, `${label}: body has no horizontal overflow`);
}

async function assertBackupTabLoop(page) {
  const ends = await page.locator("#backupPreviewDialog").evaluate((dialog) => {
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")]
      .filter((element) => !element.hidden && element.getClientRects().length);
    focusable[0]?.focus();
    return { first: focusable[0]?.id || null, last: focusable.at(-1)?.id || null };
  });
  assert.ok(ends.first && ends.last, "backup preview exposes keyboard stops");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), ends.last, "Shift+Tab wraps from first to last in backup preview");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), ends.first, "Tab wraps from last to first in backup preview");
}

(async () => {
  const port = await listen();
  const origin = `http://127.0.0.1:${port}`;
  const edgePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(edgePath) ? edgePath : undefined,
    timeout: 20000
  });
  const results = [];
  const failures = [];

  async function scenario(name, callback) {
    const started = Date.now();
    try {
      await callback();
      results.push({ name, status: "PASS", elapsed: Date.now() - started });
      process.stdout.write(`PASS ${name} (${Date.now() - started} ms)\n`);
    } catch (error) {
      const message = String(error?.stack || error);
      results.push({ name, status: "FAIL", elapsed: Date.now() - started, message });
      failures.push({ name, message });
      process.stdout.write(`FAIL ${name} (${Date.now() - started} ms)\n${message}\n`);
    }
  }

  try {
    await scenario("explore UI exposes all 2,200 items, every facet, safe text, and stable pagination", async () => {
      const context = await createContext(browser, origin);
      try {
        const page = await openReadyPage(context, origin);
        await page.locator("#exploreQuery").focus();
        await waitForExploreTotal(page, 2200);
        assert.match(await page.locator("#exploreTitle").textContent(), /2,200/, "visible explore heading states the complete count");
        assert.equal(await page.locator("#exploreResults .explore-card").count(), 24, "first page renders the bounded 24-card page size");
        assert.equal((await page.locator("#explorePageStatus").textContent()).trim(), "第 1 / 92 页");
        const firstPageTitles = await page.locator("#exploreResults h3").allTextContents();
        await page.locator("#exploreNext").click();
        await page.waitForFunction(() => document.querySelector("#explorePageStatus")?.textContent.includes("第 2 / 92 页"));
        const secondPageTitles = await page.locator("#exploreResults h3").allTextContents();
        assert.notDeepEqual(secondPageTitles, firstPageTitles, "next page displays a different stable slice");
        assert.equal(await page.locator("#explorePrevious").isEnabled(), true);

        await resetExplore(page);
        const cityTitle = await page.evaluate(() => DAILY_ATLAS_CATALOG.cities[0].cityZh || DAILY_ATLAS_CATALOG.cities[0].title);
        await page.locator("#exploreQuery").fill(cityTitle);
        const keywordTotal = await expectedExploreTotal(page);
        assert.ok(keywordTotal > 0, "representative catalog title is searchable");
        await waitForExploreTotal(page, keywordTotal);
        assert.ok((await page.locator("#exploreResults h3").allTextContents()).includes(cityTitle), "keyword search displays the matching city");

        await resetExplore(page);
        await page.locator("#exploreType").selectOption("book");
        await page.locator("#exploreGenre").selectOption("history");
        const genreTotal = await expectedExploreTotal(page);
        await waitForExploreTotal(page, genreTotal);
        assert.ok(genreTotal > 0);
        assert.equal(await page.locator("#exploreResults .explore-card:not(.explore-book)").count(), 0, "genre filter stays within books");
        for (const text of await page.locator("#exploreResults .explore-meta").allTextContents()) assert.match(text, /历史/);

        await resetExplore(page);
        await page.locator("#exploreType").selectOption("movie");
        await page.locator("#exploreEra").selectOption("early");
        const eraTotal = await expectedExploreTotal(page);
        await waitForExploreTotal(page, eraTotal);
        assert.ok(eraTotal > 0);
        for (const text of await page.locator("#exploreResults .explore-meta").allTextContents()) {
          const year = Number(text.match(/\b(\d{4})\b/)?.[1]);
          assert.ok(year > 0 && year < 1980, `early-era result has an early year: ${text}`);
        }

        await resetExplore(page);
        await page.locator("#exploreType").selectOption("city");
        const region = await page.locator("#exploreRegion option").nth(1).getAttribute("value");
        assert.ok(region);
        await page.locator("#exploreRegion").selectOption(region);
        const regionTotal = await expectedExploreTotal(page);
        await waitForExploreTotal(page, regionTotal);
        assert.ok(regionTotal > 0);
        for (const text of await page.locator("#exploreResults .explore-meta").allTextContents()) assert.match(text, new RegExp(region.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

        await resetExplore(page);
        await page.locator("#exploreType").selectOption("book");
        await page.locator("#exploreRating").selectOption("0.9");
        const ratingTotal = await expectedExploreTotal(page);
        await waitForExploreTotal(page, ratingTotal);
        assert.ok(ratingTotal > 0);
        for (const text of await page.locator("#exploreResults footer span").allTextContents()) {
          const match = text.match(/([0-9.]+)\s*\/\s*([0-9.]+)/);
          assert.ok(match && Number(match[1]) / Number(match[2]) >= 0.9, `rating threshold is honored: ${text}`);
        }

        await resetExplore(page);
        await page.locator("#exploreType").selectOption("german");
        await page.locator("#exploreGermanLevel").selectOption("B1");
        const levelTotal = await expectedExploreTotal(page);
        await waitForExploreTotal(page, levelTotal);
        assert.ok(levelTotal > 0);
        for (const text of await page.locator("#exploreResults .explore-meta").allTextContents()) assert.match(text, /^B1\b/);

        await resetExplore(page);
        await page.locator("#exploreType").selectOption("medical");
        const medicalTopic = await page.locator("#exploreMedicalTopic option").nth(1).getAttribute("value");
        assert.ok(medicalTopic);
        await page.locator("#exploreMedicalTopic").selectOption(medicalTopic);
        const medicalTotal = await expectedExploreTotal(page);
        await waitForExploreTotal(page, medicalTotal);
        assert.ok(medicalTotal > 0);
        for (const text of await page.locator("#exploreResults .explore-meta").allTextContents()) assert.ok(text.includes(medicalTopic));

        await resetExplore(page);
        const malicious = `<img src=x onerror="window.__v22Xss=true"><script>window.__v22Xss=true</script>`;
        await page.evaluate(() => { window.__v22Xss = false; });
        await page.locator("#exploreQuery").fill(malicious);
        await page.waitForFunction(() => document.querySelector("#exploreStatus")?.textContent.startsWith("找到 "));
        const safety = await page.evaluate(() => ({
          executed: window.__v22Xss,
          injected: Boolean(document.querySelector('#exploreResults script, #exploreResults img[src="x"], #exploreResults [onerror]')),
          query: document.querySelector("#exploreQuery").value
        }));
        assert.equal(safety.executed, false, "malicious query text is never executed");
        assert.equal(safety.injected, false, "malicious query text never becomes result HTML");
        assert.equal(safety.query, malicious, "the text remains inert input data");
      } finally {
        await context.close();
      }
    });

    await scenario("data-saver cold start blocks every remote media request and retains local medical art", async () => {
      const context = await createContext(browser, origin, { appearance: { dataSaver: true } });
      const remoteImages = [];
      const localMedical = [];
      context.on("request", (request) => {
        const url = request.url();
        if (request.resourceType() === "image" && !url.startsWith(origin)) remoteImages.push(url);
        if (url.startsWith(origin) && /\/assets\/medical\/[^/]+\.webp(?:$|\?)/.test(url)) localMedical.push(url);
      });
      await context.route("https://**/*", (route) => route.abort());
      try {
        const page = await openReadyPage(context, origin);
        assert.deepEqual(
          await page.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.appearance.v1"))),
          { ...appearanceDefaults, dataSaver: true }
        );
        assert.equal(await page.locator("#bookCard .cover-image, #movieCard .cover-image").count(), 0, "today's book and movie omit remote img elements");
        await page.locator("#medicalCard").scrollIntoViewIfNeeded();
        await page.locator("#medicalCard img").waitFor({ state: "visible" });
        await page.waitForFunction(() => {
          const image = document.querySelector("#medicalCard img");
          return image?.complete && image.naturalWidth > 0;
        });
        await page.locator("#exploreQuery").focus();
        await waitForExploreTotal(page, 2200);
        await page.locator("#exploreType").selectOption("book");
        await page.waitForFunction(() => document.querySelectorAll("#exploreResults .explore-book").length > 0);
        assert.equal(await page.locator("#exploreResults .explore-book img").count(), 0, "explore book results also use local monograms");
        await page.locator("#exploreType").selectOption("movie");
        await page.waitForFunction(() => document.querySelectorAll("#exploreResults .explore-movie").length > 0);
        assert.equal(await page.locator("#exploreResults .explore-movie img").count(), 0, "explore movie results also use local monograms");
        await page.waitForTimeout(250);
        assert.deepEqual(remoteImages, [], `cold start made no remote image requests: ${remoteImages.join(" | ")}`);
        assert.ok(localMedical.length >= 1, "a bundled medical WebP was requested from the local origin");
        assert.ok(await page.locator("#medicalCard img").evaluate((image) => image.naturalWidth > 0), "the local medical image decodes successfully");
      } finally {
        await context.close();
      }
    });

    await scenario("mobile quick navigation, accessibility settings, and five target widths remain usable", async () => {
      const context = await createContext(browser, origin, { viewport: { width: 390, height: 844 } });
      await context.route("https://**/*", (route) => route.abort());
      try {
        const page = await openReadyPage(context, origin);
        await page.locator("#settingsButton").click();
        await page.locator("#compactModeEnabled").check();
        assert.equal(await page.locator("#dataSaverEnabled").isChecked(), false, "data saver remains an explicit user choice");
        assert.equal(await page.locator("#dataSaverEnabled").isDisabled(), false, "data saver can be enabled for mobile traffic control");
        await page.locator("#dataSaverEnabled").check();
        await page.locator("#textSize").selectOption("large");
        await page.locator("#contrastMode").selectOption("high");
        await page.locator("#motionMode").selectOption("reduce");
        await page.evaluate(() => DailyAtlasAppearance.whenSaved());
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.appearance.v1")));
        assert.deepEqual(stored, {
          schemaVersion: 1,
          color: "paper",
          style: "editorial",
          density: "compact",
          dataSaver: true,
          textSize: "large",
          contrast: "high",
          motion: "reduce"
        });
        await page.locator("#doneSettingsButton").click();
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForAppReady(page);
        assert.deepEqual(await page.evaluate(() => ({
          backgroundColor: document.documentElement.dataset.backgroundColor,
          backgroundStyle: document.documentElement.dataset.backgroundStyle,
          density: document.documentElement.dataset.density,
          dataSaver: document.documentElement.dataset.dataSaver,
          textSize: document.documentElement.dataset.textSize,
          contrast: document.documentElement.dataset.contrast,
          motion: document.documentElement.dataset.motion
        })), {
          backgroundColor: "paper",
          backgroundStyle: "editorial",
          density: "compact",
          dataSaver: "true",
          textSize: "large",
          contrast: "high",
          motion: "reduce"
        });
        await page.locator("#settingsButton").click();
        assert.equal(await page.locator("#compactModeEnabled").isChecked(), true);
        assert.equal(await page.locator("#dataSaverEnabled").isChecked(), true);
        assert.equal(await page.locator("#dataSaverEnabled").isDisabled(), false);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.publicSafeMode), "false");
        assert.equal(await page.evaluate(() => document.documentElement.dataset.remoteBookMovieImages), "true");
        assert.equal(await page.locator("#textSize").inputValue(), "large");
        assert.equal(await page.locator("#contrastMode").inputValue(), "high");
        assert.equal(await page.locator("#motionMode").inputValue(), "reduce");
        await page.locator("#doneSettingsButton").click();

        const widths = [320, 360, 390, 428, 768];
        const targets = ["book", "movie", "city", "german", "medical"];
        for (const width of widths) {
          await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
          await assertNoHorizontalOverflow(page, `${width}px page`);
          if (width > 700) continue;
          assert.equal(await page.locator("#quickNav").isVisible(), true, `${width}px mobile quick navigation is visible`);
          const quickGeometry = await page.locator("#quickNav").evaluate((nav) => ({
            left: nav.getBoundingClientRect().left,
            right: nav.getBoundingClientRect().right,
            width: nav.getBoundingClientRect().width,
            clientWidth: nav.clientWidth,
            scrollWidth: nav.scrollWidth
          }));
          assert.ok(quickGeometry.left >= -0.5 && quickGeometry.right <= width + 0.5, `${width}px quick nav stays in viewport`);
          assert.ok(quickGeometry.scrollWidth <= quickGeometry.clientWidth + 1, `${width}px quick nav has no internal horizontal overflow`);
          for (const type of targets) {
            await page.locator(`[data-quick-jump="${type}"]`).click();
            await page.waitForFunction((card) => document.activeElement === document.querySelector(`#${card}Card h3`), type);
          }
          await assertNoHorizontalOverflow(page, `${width}px after all quick jumps`);
        }
      } finally {
        await context.close();
      }
    });

    await scenario("weekly report is empty or populated from local activity without reads causing writes or network", async () => {
      const context = await createContext(browser, origin, { appearance: { dataSaver: true } });
      await context.route("https://**/*", (route) => route.abort());
      try {
        const page = await openReadyPage(context, origin);
        await clearApplicationStorage(page);
        await page.locator("#settingsButton").click();
        if (!(await page.locator("#dataSaverEnabled").isChecked())) await page.locator("#dataSaverEnabled").check();
        await page.evaluate(() => DailyAtlasAppearance.whenSaved());
        assert.equal(await page.locator("#dataSaverEnabled").isChecked(), true);
        assert.equal(await page.locator("#dataSaverEnabled").isDisabled(), false, "weekly-report privacy uses the same explicit data-saver control");
        await page.locator("#doneSettingsButton").click();
        await page.waitForTimeout(250);
        let observedRequests = [];
        let watchRequests = false;
        page.on("request", (request) => {
          if (watchRequests) observedRequests.push({ url: request.url(), type: request.resourceType() });
        });

        const emptyBefore = await storageSnapshot(page);
        watchRequests = true;
        await page.locator("#recordButton").click();
        await page.locator("#weeklyReport").waitFor({ state: "visible" });
        await page.waitForTimeout(200);
        watchRequests = false;
        assert.match(await page.locator("#weeklyBreakdown").textContent(), /本周还没有可汇总的本机记录/);
        const emptyMetrics = await page.locator("#weeklySummary strong").allTextContents();
        assert.deepEqual(emptyMetrics.map(Number), [0, 0, 0, 0], "empty local profile produces four zero metrics");
        assert.match(await page.locator("#weeklyPrivacyNote").textContent(), /本机|不上传/);
        assert.deepEqual(await storageSnapshot(page), emptyBefore, "opening an empty weekly report does not write local data");
        assert.deepEqual(observedRequests, [], "opening an empty weekly report makes no network request");
        await page.locator("#doneRecordButton").click();

        const bookId = await page.locator('#bookCard [data-action="liked"]').getAttribute("data-item-id");
        await page.locator('#bookCard [data-action="liked"]').click();
        await page.locator(`#bookCard [data-action="favorite"][data-item-id="${bookId}"]`).click();
        await page.locator(`#bookCard [data-action="known"][data-item-id="${bookId}"]`).click();
        await page.evaluate(() => DailyAtlasLock.whenIdle());
        await page.waitForFunction((id) => {
          const raw = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
          return raw?.feedback?.book?.[id]?.liked === true && raw?.feedback?.book?.[id]?.favorite === true;
        }, bookId);
        await page.waitForFunction((id) => {
          const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book") || "null");
          return state?.currentId !== id && state?.knownEntries?.some((entry) => entry.id === id);
        }, bookId);
        await page.evaluate(() => DailyAtlasLock.whenIdle());

        const populatedBefore = await storageSnapshot(page);
        observedRequests = [];
        watchRequests = true;
        await page.locator("#recordButton").click();
        await page.waitForFunction(() => {
          const metrics = [...document.querySelectorAll("#weeklySummary div")]
            .map((node) => [node.querySelector("span")?.textContent, Number(node.querySelector("strong")?.textContent)]);
          const byLabel = Object.fromEntries(metrics);
          return byLabel["本周新记录"] >= 1 && byLabel["本周收藏"] >= 1 && byLabel["本周喜欢"] >= 1;
        });
        await page.waitForTimeout(200);
        watchRequests = false;
        assert.match(await page.locator("#weeklyBreakdown").textContent(), /五类相关项目/);
        assert.match(await page.locator("#weeklyBreakdown").textContent(), /喜欢的书影题材/);
        assert.deepEqual(await storageSnapshot(page), populatedBefore, "rendering a populated weekly report remains read-only");
        assert.deepEqual(observedRequests, [], "rendering a populated weekly report makes no network request");
      } finally {
        await context.close();
      }
    });

    await scenario("all 24 bundled medical illustrations are reachable through catalog search and decode", async () => {
      const context = await createContext(browser, origin);
      await context.route("https://**/*", (route) => route.abort());
      try {
        const page = await openReadyPage(context, origin);
        await page.locator("#exploreQuery").focus();
        await waitForExploreTotal(page, 2200);
        await page.locator("#exploreType").selectOption("medical");
        const representatives = await page.evaluate(async () => {
          const manifest = await (await fetch("./assets/medical/manifest.json", { cache: "no-store" })).json();
          const completeCatalog = globalThis.DailyAtlasCatalogStore?.loadAllDetails
            ? await DailyAtlasCatalogStore.loadAllDetails()
            : DAILY_ATLAS_CATALOG;
          const byImage = new Map();
          for (const item of completeCatalog.medical) {
            const file = String(item.image || "").replace(/^\.\//, "");
            if (!byImage.has(file)) byImage.set(file, { file, src: item.image, title: item.title });
          }
          return {
            manifestFiles: manifest.items.map((item) => item.file),
            items: manifest.items.map((entry) => byImage.get(entry.file) || null),
            uniqueCatalogImages: byImage.size
          };
        });
        assert.equal(representatives.manifestFiles.length, 24, "medical manifest contains exactly 24 illustrations");
        assert.equal(new Set(representatives.manifestFiles).size, 24, "manifest file paths are unique");
        assert.equal(representatives.uniqueCatalogImages, 24, "the 500-item catalog references all 24 illustration paths");
        assert.equal(representatives.items.filter(Boolean).length, 24, "every manifest illustration has a searchable catalog representative");

        for (const representative of representatives.items) {
          await page.locator("#exploreQuery").fill(representative.title);
          await page.waitForFunction(({ title, src }) => {
            const cards = [...document.querySelectorAll("#exploreResults .explore-medical")];
            return cards.some((card) => card.querySelector("h3")?.textContent === title && card.querySelector("img")?.getAttribute("src") === src);
          }, representative);
          const card = page.locator("#exploreResults .explore-medical").filter({ has: page.locator("h3", { hasText: representative.title }) }).first();
          const image = card.locator(`img[src="${representative.src}"]`);
          await image.scrollIntoViewIfNeeded();
          await page.waitForFunction(({ title, src }) => {
            const cards = [...document.querySelectorAll("#exploreResults .explore-medical")];
            const card = cards.find((entry) => entry.querySelector("h3")?.textContent === title);
            const image = card?.querySelector(`img[src="${CSS.escape(src)}"]`);
            return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
          }, representative);
          const dimensions = await image.evaluate((node) => ({ width: node.naturalWidth, height: node.naturalHeight }));
          assert.ok(dimensions.width > 0 && dimensions.height > 0, `${representative.file} decoded through a real HTTP image request`);
        }
      } finally {
        await context.close();
      }
    });

    await scenario("backup UI exports plain and encrypted files, previews safely, and commits after stale-preview refresh", async () => {
      const context = await createContext(browser, origin);
      await context.route("https://**/*", (route) => route.abort());
      const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-atlas-v22-backup-"));
      try {
        const page = await openReadyPage(context, origin);
        await clearApplicationStorage(page);
        await page.locator("#settingsButton").click();

        const plainDownloadPromise = page.waitForEvent("download");
        await page.locator("#exportBackupButton").click();
        const plainDownload = await readDownload(await plainDownloadPromise, temporaryDirectory);
        const plainPayload = JSON.parse(plainDownload.text);
        assert.equal(plainPayload.format, "daily-atlas-backup");
        assert.equal(plainPayload.appVersion, "2.6.0");
        assert.deepEqual(Object.keys(plainPayload.states).sort(), ["book", "city", "german", "medical", "movie"]);
        assert.match(path.basename(plainDownload.target), /^daily-atlas-backup-\d{4}-\d{2}-\d{2}\.json$/);

        const exportPassword = "V22-导出密码-123";
        await page.locator("#encryptBackupEnabled").check();
        await page.locator("#exportBackupPassword").fill(exportPassword);
        await page.locator("#exportBackupPasswordConfirm").fill(exportPassword);
        const encryptedDownloadPromise = page.waitForEvent("download");
        await page.locator("#exportBackupButton").click();
        const encryptedDownload = await readDownload(await encryptedDownloadPromise, temporaryDirectory);
        const encryptedEnvelope = JSON.parse(encryptedDownload.text);
        assert.equal(encryptedEnvelope.format, "daily-atlas-encrypted-backup");
        assert.equal(encryptedDownload.text.includes(exportPassword), false, "encrypted export never contains the password");
        assert.match(path.basename(encryptedDownload.target), /^daily-atlas-backup-encrypted-\d{4}-\d{2}-\d{2}\.json$/);
        const openedExport = await BackupCrypto.decrypt(encryptedDownload.text, exportPassword, { crypto: webcrypto });
        assert.equal(JSON.parse(openedExport.plaintext).format, "daily-atlas-backup", "browser encrypted export decrypts under the documented contract");

        const importPayload = structuredClone(plainPayload);
        importPayload.exportedAt = new Date().toISOString();
        importPayload.optional["dailyAtlas.reminder.v1"] = {
          schemaVersion: 1,
          enabled: false,
          time: "07:17",
          lastNotifiedDate: null
        };
        const importPassword = "V22-导入密码-456";
        const importText = JSON.stringify(importPayload);
        const encryptedImport = await BackupCrypto.encrypt(importText, importPassword, { crypto: webcrypto });
        const encryptedFile = {
          name: "daily-atlas-v22-encrypted-test.json",
          mimeType: "application/json",
          buffer: Buffer.from(encryptedImport, "utf8")
        };

        const beforeCancelledImport = await storageSnapshot(page);
        await chooseImportFile(page, encryptedFile);
        assert.equal(await page.locator("#backupUnlockPanel").isVisible(), true, "encrypted import requires local unlock");
        await page.locator("#importBackupPassword").fill("错误密码-000");
        await page.locator("#unlockBackupButton").click();
        await page.waitForFunction(() => document.querySelector("#backupPreviewStatus")?.textContent.includes("密码不正确"));
        assert.deepEqual(await storageSnapshot(page), beforeCancelledImport, "wrong password performs zero writes");

        await page.locator("#importBackupPassword").fill(importPassword);
        await page.locator("#unlockBackupButton").click();
        await page.waitForFunction(() => !document.querySelector("#backupPreviewPanel")?.hidden && !document.querySelector("#applyBackupButton")?.hidden);
        assert.equal(await page.locator("#backupMergeMode").isChecked(), true);
        assert.match(await page.locator("#backupPreviewStatus").textContent(), /合并会保留本机当前项目和设备设置/);
        assert.equal((await page.locator("#applyBackupButton").textContent()).trim(), "确认合并");
        const mergeMetrics = await page.locator("#backupDiffSummary").innerText();
        assert.match(mergeMetrics, /设备设置变化/);
        await page.locator("#backupReplaceMode").check();
        await page.waitForFunction(() => document.querySelector("#backupPreviewStatus")?.textContent.includes("替换会删除"));
        assert.equal((await page.locator("#applyBackupButton").textContent()).trim(), "确认替换");
        const replaceMetrics = await page.locator("#backupDiffSummary").innerText();
        assert.notEqual(replaceMetrics.length, 0, "replace preview contains an explicit diff summary");
        await page.locator("#backupMergeMode").check();
        await page.waitForFunction(() => document.querySelector("#applyBackupButton")?.textContent.includes("确认合并"));

        await assertBackupTabLoop(page);
        await page.keyboard.press("Escape");
        await page.locator("#backupPreviewDialog").waitFor({ state: "hidden" });
        await page.locator("#settingsDialog").waitFor({ state: "visible" });
        await page.waitForFunction(() => document.activeElement?.id === "importBackupButton");
        assert.deepEqual(await storageSnapshot(page), beforeCancelledImport, "Escape cancels preview with zero writes");
        assert.match(await page.locator("#backupStatus").textContent(), /已取消恢复，没有修改任何数据/);

        await chooseImportFile(page, encryptedFile);
        await page.locator("#importBackupPassword").fill(importPassword);
        await page.locator("#unlockBackupButton").click();
        await page.waitForFunction(() => !document.querySelector("#backupPreviewPanel")?.hidden && !document.querySelector("#applyBackupButton")?.disabled);
        assert.equal(await page.locator("#backupMergeMode").isChecked(), true);

        const peer = await openReadyPage(context, origin);
        const likedId = await peer.locator('#bookCard [data-action="liked"]').getAttribute("data-item-id");
        assert.equal(await peer.locator(`#bookCard [data-action="liked"][data-item-id="${likedId}"]`).getAttribute("aria-pressed"), "false");
        await peer.locator(`#bookCard [data-action="liked"][data-item-id="${likedId}"]`).click();
        await peer.evaluate(() => DailyAtlasLock.whenIdle());
        await peer.waitForFunction((id) => {
          const profile = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
          return profile?.feedback?.book?.[id]?.liked === true;
        }, likedId);

        await page.locator("#applyBackupButton").click();
        await page.waitForFunction(() => document.querySelector("#backupPreviewStatus")?.textContent.includes("预览已刷新"));
        assert.equal(await page.locator("#backupPreviewDialog").isVisible(), true, "stale preview remains open for renewed consent");
        assert.equal(await page.locator("#applyBackupButton").isEnabled(), true, "refreshed preview can be confirmed again");

        const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
        await page.locator("#applyBackupButton").click();
        await navigation;
        await waitForAppReady(page);
        const committed = await page.evaluate((id) => DailyAtlasLock.readStorage((storage) => {
          const reminder = JSON.parse(storage.getItem("dailyAtlas.reminder.v1") || "null");
          const profile = JSON.parse(storage.getItem("dailyAtlas.profile.v1") || "null");
          return {
            reminder,
            liked: profile?.feedback?.book?.[id]?.liked === true,
            pending: storage.getItem("dailyAtlas.import.pending.v1")
          };
        }), likedId);
        assert.equal(committed.reminder?.time, "07:17", "confirmed merge applies imported device data");
        assert.equal(committed.liked, true, "the peer's newer local feedback survives the refreshed merge");
        assert.equal(committed.pending, null, "confirmed import clears the transaction journal");
        await peer.close();
      } finally {
        await context.close();
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    });
  } finally {
    await browser.close();
    await closeServer();
  }

  if (failures.length) {
    process.stderr.write(`v22-browser: FAIL (${failures.length}/${results.length} scenarios failed)\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`v22-browser: PASS (${results.length}/${results.length} scenarios)\n`);
  }
})().catch(async (error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  try { await closeServer(); } catch (_error) {}
  process.exitCode = 1;
});
