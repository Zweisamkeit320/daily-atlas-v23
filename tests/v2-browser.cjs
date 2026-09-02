const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY ||= "1";

const root = path.resolve(process.env.DAILY_ATLAS_ROOT || path.join(__dirname, ".."));
const expectedCounts = Object.freeze({ books: 500, movies: 500, cities: 200, german: 500, medical: 500 });
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

let serviceWorkerVariant = 1;
const finalNarrationRelative = "assets/audio/german/de-v3-waere-haette-vergangenheit.mp3";
let failedNarrationRequests = 0;
let narrationRequests = 0;
let cityVisualRequests = 0;
let reusablePackRequests = 0;

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
  if (/^assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(relative)) narrationRequests += 1;
  if (/^assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(relative)) cityVisualRequests += 1;
  if (/^catalog-data\/selection\.[a-f0-9]{12}\.js$/.test(relative)
    || /^assets\/medical\//.test(relative)
    || relative === "assets/audio/german/manifest.json"
    || relative === "explore.js"
    || relative === "search-worker.js") reusablePackRequests += 1;
  if (serviceWorkerVariant === 2 && relative === finalNarrationRelative) {
    failedNarrationRequests += 1;
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }).end("Injected final narration failure");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });
  if (relative === "index.html") {
    const marker = serviceWorkerVariant === 1 ? "A" : "B";
    const html = fs.readFileSync(file, "utf8").replace("</head>", `<meta name="test-shell-marker" content="${marker}" /></head>`);
    response.end(html);
    return;
  }
  if (relative === "sw.js" && serviceWorkerVariant !== 1) {
    const suffix = serviceWorkerVariant === 2 ? "test-failed" : "test-update";
    const worker = fs.readFileSync(file, "utf8").replace(
      /const SHELL_VERSION = "([^"]+)";/,
      `const SHELL_VERSION = "$1-${suffix}";`
    );
    response.end(worker);
    return;
  }
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

async function waitForAppReady(page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    return cards.length === 5 && cards.every((card) => !card.hasAttribute("aria-busy") && card.querySelector("[data-item-id]"));
  });
}

async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage)
      .filter((key) => key.startsWith("dailyAtlas."))
      .sort()
      .map((key) => [key, localStorage.getItem(key)])
  ));
}

async function currentId(page, type) {
  return page.locator(`#${type}Card [data-action="favorite"]`).getAttribute("data-item-id");
}

async function assertDialogReachable(page, dialogSelector, actionSelector, scrollBodySelector, label) {
  const dialog = page.locator(dialogSelector);
  const action = page.locator(actionSelector);
  await assert.rejects(
    () => page.locator("body > header button").first().click({ timeout: 250 }),
    undefined,
    `${label}: modal keeps background controls inert`
  ).catch((error) => {
    // Playwright's exact error wording is browser-version-dependent. A completed
    // click is the only failure; a timeout/blocked click is the expected result.
    if (!/Timeout|intercepts pointer events|outside of the viewport|not enabled/i.test(String(error?.message || error))) throw error;
  });
  const geometry = await action.evaluate((button, selector) => {
    const owner = document.querySelector(selector);
    const ownerRect = owner.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      dialogTop: ownerRect.top,
      dialogBottom: ownerRect.bottom,
      buttonTop: buttonRect.top,
      buttonBottom: buttonRect.bottom,
      viewportHeight: window.innerHeight,
      hit: Boolean(hit && (hit === button || button.contains(hit))),
      dialogScrollWidth: owner.scrollWidth,
      dialogClientWidth: owner.clientWidth
    };
  }, dialogSelector);
  assert.ok(geometry.buttonTop >= Math.max(0, geometry.dialogTop), `${label}: footer action starts inside dialog`);
  assert.ok(geometry.buttonBottom <= Math.min(geometry.viewportHeight, geometry.dialogBottom) + 0.5, `${label}: footer action is visible`);
  assert.equal(geometry.hit, true, `${label}: footer action is hit-testable`);
  assert.ok(geometry.dialogScrollWidth <= geometry.dialogClientWidth + 1, `${label}: dialog has no horizontal overflow`);
  const scrollBody = page.locator(scrollBodySelector);
  const scrollAudit = await scrollBody.evaluate((element) => {
    const before = element.scrollTop;
    element.scrollTop = element.scrollHeight;
    const after = element.scrollTop;
    element.scrollTop = before;
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
      after
    };
  });
  if (scrollAudit.scrollHeight > scrollAudit.clientHeight + 1) {
    assert.match(scrollAudit.overflowY, /auto|scroll/, `${label}: long body declares independent vertical scrolling`);
    assert.ok(scrollAudit.after > 0, `${label}: long body can actually scroll to its end`);
  }
}

async function assertDialogKeyboardContract(page, triggerSelector, dialogSelector, label) {
  const trigger = page.locator(triggerSelector);
  await trigger.focus();
  await trigger.click();
  const dialog = page.locator(dialogSelector);
  await dialog.waitFor({ state: "visible" });
  const selectors = `${dialogSelector} button:not([disabled]), ${dialogSelector} a[href], ${dialogSelector} input:not([disabled]):not([hidden]), ${dialogSelector} [tabindex]:not([tabindex='-1'])`;
  const focusable = page.locator(selectors).filter({ visible: true });
  const count = await focusable.count();
  assert.ok(count >= 2, `${label}: dialog exposes at least two keyboard stops`);
  const first = focusable.first();
  const last = focusable.last();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await last.evaluate((element) => document.activeElement === element), true, `${label}: Shift+Tab wraps first to last`);
  await page.keyboard.press("Tab");
  assert.equal(await first.evaluate((element) => document.activeElement === element), true, `${label}: Tab wraps last to first`);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, `${label}: Escape restores focus to the opener`);
}

async function readDownload(download, temporaryDirectory) {
  const target = path.join(temporaryDirectory, download.suggestedFilename());
  await download.saveAs(target);
  return { target, text: fs.readFileSync(target, "utf8") };
}

async function closeOpenDialogs(page) {
  await page.evaluate(() => {
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    document.querySelector("#toastCloseButton:not([hidden])")?.click();
  });
}

async function installBrowserHarnesses(context) {
  await context.addInitScript(() => {
    const voices = [
      { voiceURI: "test-de-local", name: "Test Deutsch", lang: "de-DE", localService: true, default: true },
      { voiceURI: "test-en-local", name: "Test English", lang: "en-US", localService: true, default: false }
    ];
    const speech = {
      utterances: [],
      cancelCalls: 0,
      listeners: new Map(),
      getVoices() { return voices.slice(); },
      addEventListener(type, callback) { this.listeners.set(type, callback); },
      removeEventListener(type) { this.listeners.delete(type); },
      speak(utterance) {
        this.utterances.push(utterance);
        utterance.onstart?.();
      },
      cancel() { this.cancelCalls += 1; },
      finish() {
        const utterance = this.utterances.at(-1);
        utterance?.onend?.();
      }
    };
    class StubUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.voice = null;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      }
    }
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: speech });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: StubUtterance });
    window.__speechHarness = speech;

    let permission = "default";
    const notificationHarness = { requestPermissionCalls: 0, constructed: [] };
    class StubNotification {
      constructor(title, options) {
        notificationHarness.constructed.push({ title, options });
      }
      static get permission() { return permission; }
      static async requestPermission() {
        notificationHarness.requestPermissionCalls += 1;
        permission = "granted";
        return permission;
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", { configurable: true, value: StubNotification });
    window.__notificationHarness = notificationHarness;
  });
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
  const browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    serviceWorkers: "allow"
  });
  await installBrowserHarnesses(context);

  let weatherRequests = 0;
  const weatherUrls = [];
  await context.route("https://api.open-meteo.com/**", async (route) => {
    weatherRequests += 1;
    weatherUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        latitude: 48.86,
        longitude: 2.35,
        generationtime_ms: 0.1,
        utc_offset_seconds: 7200,
        timezone: "Europe/Paris",
        timezone_abbreviation: "CEST",
        elevation: 35,
        current_units: {
          time: "iso8601", interval: "seconds", temperature_2m: "°C", apparent_temperature: "°C",
          precipitation: "mm", weather_code: "wmo code", wind_speed_10m: "km/h"
        },
        current: {
          time: "2026-08-12T09:30",
          interval: 900,
          temperature_2m: 21.4,
          apparent_temperature: 21.1,
          precipitation: 0,
          weather_code: 1,
          wind_speed_10m: 8.2
        }
      })
    });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const consoleErrors = [];
  const expectedOfflineResourceErrors = [];
  const expectedFailedInstallResponses = [];
  const externalResourceFailures = [];
  let offlinePhase = false;
  let failedInstallPhase = false;
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const entry = `console: ${message.text()}`;
    if (/Failed to load resource/i.test(message.text())) {
      if (offlinePhase && /net::ERR_INTERNET_DISCONNECTED/i.test(message.text())) expectedOfflineResourceErrors.push(entry);
      return;
    }
    consoleErrors.push(entry);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      if (failedInstallPhase && response.status() === 503 && new URL(response.url()).pathname.endsWith(`/${finalNarrationRelative}`)) {
        expectedFailedInstallResponses.push(`HTTP 503 ${response.url()}`);
        return;
      }
      consoleErrors.push(`local response: HTTP ${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const entry = `${request.failure()?.errorText || "request failed"}: ${request.url()}`;
    if (request.url().startsWith(origin)) consoleErrors.push(`local request: ${entry}`);
    else externalResourceFailures.push(entry);
  });

  const results = [];
  const failures = [];
  async function scenario(name, callback) {
    const started = Date.now();
    try {
      await callback();
      const elapsed = Date.now() - started;
      results.push({ name, status: "PASS", elapsed });
      process.stdout.write(`PASS ${name} (${elapsed} ms)\n`);
    } catch (error) {
      const elapsed = Date.now() - started;
      const message = String(error?.stack || error);
      results.push({ name, status: "FAIL", elapsed, message });
      failures.push({ name, message });
      process.stdout.write(`FAIL ${name} (${elapsed} ms)\n${message}\n`);
      await closeOpenDialogs(page).catch(() => {});
    }
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-atlas-v2-e2e-"));

  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => DailyAtlasLock.transaction((lease) => lease.storage.clear()));
    await page.evaluate(() => DailyAtlasLock.whenIdle());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await scenario("catalog exact v2 counts and stable ids", async () => {
      const audit = await page.evaluate(() => {
        const catalog = globalThis.DAILY_ATLAS_CATALOG;
        const keys = ["books", "movies", "cities", "german", "medical"];
        return {
          schemaVersion: catalog.schemaVersion,
          appVersion: catalog.appVersion,
          counts: Object.fromEntries(keys.map((key) => [key, catalog[key]?.length ?? -1])),
          idCounts: Object.fromEntries(keys.map((key) => [key, new Set((catalog[key] || []).map((item) => item.id)).size]))
        };
      });
      assert.deepEqual(audit.counts, expectedCounts, "v2 catalog has the agreed exact pool sizes");
      assert.deepEqual(audit.idCounts, expectedCounts, "each pool has unique stable IDs");
      assert.ok(audit.schemaVersion >= 4, "v2 catalog schema is at least 4");
      assert.match(String(audit.appVersion || ""), /^2\./, "catalog declares app v2");
    });

    await scenario("initialized data boundary limits public rating snapshots to books", async () => {
      await page.locator("#dataNoteButton").click();
      await page.locator("#dataDialog").waitFor({ state: "visible" });
      const snapshotNote = await page.locator("#snapshotNote").textContent();
      assert.match(snapshotNote || "", /公开评分快照仅指图书/);
      assert.match(snapshotNote || "", /评分日期见各条图书卡片/);
      assert.equal((snapshotNote || "").includes("评分日期见各条卡片"), false,
        "initialized DOM must not imply that public movie cards carry rating dates");
      await page.locator("#doneDataButton").click();
    });

    await scenario("media editorial floor and unknown-year rendering", async () => {
      const audit = await page.evaluate(() => {
        const dateKey = DailyAtlasEngine.localDateKey(new Date());
        const themeId = DailyAtlasEngine.dailyTheme(dateKey).id;
        const book = DailyAtlasEngine.chooseInitial(DAILY_ATLAS_CATALOG.books, {
          dateKey,
          type: "book",
          themeId,
          exploration: true
        });
        const movie = DailyAtlasEngine.chooseInitial(DAILY_ATLAS_CATALOG.movies, {
          dateKey,
          type: "movie",
          themeId,
          exploration: true
        });
        const unknown = DAILY_ATLAS_CATALOG.books.find((item) => item.year === 0);
        return {
          bookLevel: book?.curationLevel,
          movieLevel: movie?.curationLevel,
          unknownId: unknown?.id,
          unknownYear: unknown?.year,
          catalogHasScreenedBooks: DAILY_ATLAS_CATALOG.books.some((item) => item.curationLevel === "source-screened"),
          reviewedBooks: DAILY_ATLAS_CATALOG.books.filter((item) => item.curationLevel === "editorial-reviewed").length,
          reviewedMovies: DAILY_ATLAS_CATALOG.movies.filter((item) => item.curationLevel === "editorial-reviewed").length,
          anatomyYear: DAILY_ATLAS_CATALOG.movies.find((item) => item.id === "tt17009710")?.year,
          unknownEra: DailyAtlasProfile.eraOf(unknown)
        };
      });
      assert.ok(["editorial-curated", "editorial-reviewed"].includes(audit.bookLevel), "book selection remains editorially qualified");
      assert.ok(["editorial-curated", "editorial-reviewed"].includes(audit.movieLevel), "movie selection remains editorially qualified");
      assert.equal(audit.catalogHasScreenedBooks, false, "the published book pool contains no source-screened reserve");
      assert.equal(audit.reviewedBooks, 150, "all 150 added books received item-level editorial review");
      assert.equal(audit.reviewedMovies, 150, "all 150 added movies received item-level editorial review");
      assert.ok(audit.unknownId && audit.unknownYear === 0, "the catalog contains a deliberately withheld ambiguous year");
      assert.equal(audit.unknownEra, "", "an unknown year contributes no era signal to personalization");
      assert.equal(audit.anatomyYear, 2023, "Anatomy of a Fall displays its 2023 work year rather than a later regional release year");
      await page.evaluate((id) => DailyAtlasLock.transaction((lease) => {
        const date = DailyAtlasEngine.localDateKey(new Date());
        lease.storage.setItem("dailyAtlas.state.v3.book", JSON.stringify({
          schemaVersion: 3,
          type: "book",
          date,
          version: "1",
          revision: 1,
          currentId: id,
          sequence: 0,
          skipped: [],
          knownEntries: []
        }));
      }), audit.unknownId);
      await page.evaluate(() => DailyAtlasLock.whenIdle());
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      const mediaText = await page.locator("#bookCard .meta-row").innerText();
      const fallbackText = await page.locator("#bookCard .visual-fallback small").innerText();
      assert.match(mediaText, /年份待核/, "ambiguous year renders as a label in the visible metadata row");
      assert.match(fallbackText, /年份待核/, "ambiguous year renders as a label in the visual fallback");
      assert.doesNotMatch(mediaText, /(^|\D)0($|\D)/, "ambiguous year never renders as the numeral zero");
      const unknownTitle = (await page.locator("#bookCard .card-title").textContent()).trim();
      await page.locator('#bookCard [data-action="favorite"]').click();
      await page.locator('#bookCard [data-action="known"]').click();
      await page.waitForFunction((id) => document.querySelector('#bookCard [data-action="favorite"]')?.dataset.itemId !== id, audit.unknownId);
      await page.locator("#recordButton").click();
      const unknownRecords = page.locator("#recordList .record-item", { hasText: unknownTitle });
      assert.equal(await unknownRecords.count(), 2, "the unknown-year item appears in both the known and favorite sections");
      for (const text of await unknownRecords.allInnerTexts()) {
        assert.match(text, /年份待核/, "known/favorite records reuse the honest unknown-year label");
        assert.doesNotMatch(text, /(?:^|[\s·])0(?:$|[\s·])/, "known/favorite records never expose a naked zero year");
      }
      await page.locator("#doneRecordButton").click();
      await page.evaluate(() => DailyAtlasLock.transaction((lease) => lease.storage.clear()));
      await page.evaluate(() => DailyAtlasLock.whenIdle());
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
    });

    await scenario("daily theme banner and honest five-card theme labels", async () => {
      await page.waitForFunction(() => ["book", "movie", "city", "german", "medical"]
        .every((type) => document.querySelector(`#${type}Card [data-action="favorite"][data-item-id]`)));
      const audit = await page.evaluate(() => {
        const typeToCollection = { book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" };
        const dateKey = DailyAtlasEngine.localDateKey(new Date());
        const theme = DailyAtlasEngine.dailyTheme(dateKey);
        const cards = Object.entries(typeToCollection).map(([type, collection]) => {
          const card = document.querySelector(`#${type}Card`);
          const id = card.querySelector('[data-action="favorite"]')?.dataset.itemId || null;
          const item = DAILY_ATLAS_CATALOG[collection].find((entry) => entry.id === id);
          const themes = DailyAtlasEngine.itemThemes(item);
          const themedCandidateCount = DAILY_ATLAS_CATALOG[collection]
            .filter((candidate) => DailyAtlasEngine.isQualified(candidate) && DailyAtlasEngine.itemThemes(candidate).includes(theme.id))
            .length;
          return {
            type,
            id,
            themes,
            matches: themes.includes(theme.id),
            themedCandidateCount,
            label: card.querySelector(".feedback-actions .theme-mode")?.textContent.trim() || ""
          };
        });
        return {
          dateKey,
          theme,
          banner: document.querySelector("#themeLabel")?.textContent.trim(),
          summary: document.querySelector("#themeSummary")?.textContent.trim(),
          cards
        };
      });
      assert.match(audit.banner, new RegExp(audit.theme.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "banner names today's deterministic theme");
      assert.equal(audit.summary, audit.theme.summary, "banner uses the cataloged theme summary");
      assert.equal(audit.cards.length, 5, "all five card types are audited");
      for (const entry of audit.cards) {
        assert.ok(entry.id, `${entry.type} exposes the current stable ID`);
        if (entry.themedCandidateCount > 0) {
          assert.equal(entry.matches, true, `${entry.type} uses a direct theme match when its qualified pool contains one`);
        } else {
          assert.equal(entry.matches, false, `${entry.type} falls back only because its qualified pool has no direct match`);
        }
        assert.equal(
          entry.label,
          entry.matches ? "呼应今日主题" : "主题外延推荐",
          `${entry.type} never claims a theme match when its tags do not match`
        );
      }
    });

    await scenario("like, favorite, unsuitable and undo semantics", async () => {
      const bookId = await currentId(page, "book");
      const bookTitle = (await page.locator("#bookCard .card-title").textContent()).trim();
      await page.locator('#bookCard [data-action="liked"]').click();
      await page.locator('#bookCard [data-action="favorite"]').click();
      await page.waitForFunction((id) => {
        const saved = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
        const feedback = saved?.feedback?.book?.[id];
        return feedback?.liked === true && feedback?.favorite === true &&
          document.querySelector('#bookCard [data-action="liked"]')?.getAttribute("aria-pressed") === "true" &&
          document.querySelector('#bookCard [data-action="favorite"]')?.getAttribute("aria-pressed") === "true";
      }, bookId);
      assert.equal(await page.locator('#bookCard [data-action="liked"]').getAttribute("aria-pressed"), "true", "like is reflected on the card");
      assert.equal(await page.locator('#bookCard [data-action="favorite"]').getAttribute("aria-pressed"), "true", "favorite is reflected on the card");
      const bookFeedback = await page.evaluate((id) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).feedback.book[id], bookId);
      assert.equal(bookFeedback.liked, true, "like is persisted");
      assert.equal(bookFeedback.favorite, true, "favorite is persisted independently");

      const movieId = await currentId(page, "movie");
      const movieTitle = (await page.locator("#movieCard .card-title").textContent()).trim();
      await page.locator('#movieCard [data-action="unsuitable"]').click();
      await page.waitForFunction((id) => document.querySelector('#movieCard [data-action="favorite"]')?.dataset.itemId !== id, movieId);
      assert.notEqual((await page.locator("#movieCard .card-title").textContent()).trim(), movieTitle, "unsuitable immediately replaces the current movie");
      assert.equal(
        await page.evaluate((id) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).feedback.movie[id]?.unsuitable, movieId),
        true,
        "unsuitable is persisted"
      );
      assert.equal(await page.locator("#undoButton").isVisible(), true, "unsuitable replacement exposes undo");
      await page.locator("#undoButton").click();
      await page.locator("#toast").waitFor({ state: "hidden" });
      assert.equal(await currentId(page, "movie"), movieId, "undo restores the original stable item ID");
      assert.equal((await page.locator("#movieCard .card-title").textContent()).trim(), movieTitle, "undo restores the original item");
      assert.equal(
        await page.evaluate((id) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).feedback.movie[id]?.unsuitable, movieId),
        false,
        "undo also restores the prior unsuitable preference"
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      assert.equal(await currentId(page, "book"), bookId, "favorited book stays current after reload");
      assert.equal((await page.locator("#bookCard .card-title").textContent()).trim(), bookTitle, "book title stays stable after reload");
      assert.equal(await page.locator('#bookCard [data-action="liked"]').getAttribute("aria-pressed"), "true", "like survives reload");
      assert.equal(await page.locator('#bookCard [data-action="favorite"]').getAttribute("aria-pressed"), "true", "favorite survives reload");
      await page.locator("#recordButton").click();
      assert.match(await page.locator("#recordList").innerText(), new RegExp(bookTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "favorites appear in the exploration dialog");
      await page.locator("#doneRecordButton").click();
    });

    await scenario("explicit preferences and favorites persist together", async () => {
      const favoriteId = await currentId(page, "book");
      await page.locator("#settingsButton").click();
      const preference = page.locator('input[data-pref-type="book"][data-pref-field="genres"][value="scifi"]');
      await preference.check();
      await page.evaluate(async () => {
        await DailyAtlasPreferencePersistence.whenIdle();
        await DailyAtlasLock.whenIdle();
      });
      await page.locator("#doneSettingsButton").click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")));
      assert.ok(saved.explicit.book.genres.includes("scifi"), "chosen genre is stored");
      assert.equal(saved.feedback.book[favoriteId]?.favorite, true, "saving preferences does not erase favorites");
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      await page.locator("#settingsButton").click();
      assert.equal(await preference.isChecked(), true, "chosen genre is restored in settings");
      await page.locator("#doneSettingsButton").click();
      assert.equal(await page.locator(`#bookCard [data-action="favorite"][data-item-id="${favoriteId}"]`).getAttribute("aria-pressed"), "true", "favorite remains visible after preference reload");
    });

    await scenario("personalized background applies immediately and persists across reload", async () => {
      await page.locator("#settingsButton").click();
      await page.locator("#backgroundColor").selectOption("lavender");
      await page.locator("#backgroundStyle").selectOption("aurora");
      await page.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem("dailyAtlas.appearance.v1") || "null");
        return saved?.color === "lavender" && saved?.style === "aurora";
      });
      const applied = await page.evaluate(() => ({
        color: document.documentElement.dataset.backgroundColor,
        style: document.documentElement.dataset.backgroundStyle,
        themeColor: document.querySelector('meta[name="theme-color"]')?.content,
        saved: JSON.parse(localStorage.getItem("dailyAtlas.appearance.v1"))
      }));
      assert.deepEqual(applied.saved, {
        schemaVersion: 1,
        color: "lavender",
        style: "aurora",
        density: "comfortable",
        dataSaver: false,
        textSize: "default",
        contrast: "default",
        motion: "system"
      }, "appearance storage contains only its schema fields");
      assert.equal(applied.color, "lavender", "selected background color applies without reload");
      assert.equal(applied.style, "aurora", "selected background style applies without reload");
      assert.equal(applied.themeColor, "#f0ebf5", "browser theme color follows the selected palette");
      await page.locator("#doneSettingsButton").click();
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.backgroundColor), "lavender", "background color survives reload");
      assert.equal(await page.evaluate(() => document.documentElement.dataset.backgroundStyle), "aurora", "background style survives reload");
      await page.locator("#settingsButton").click();
      assert.equal(await page.locator("#backgroundColor").inputValue(), "lavender", "color selector restores the saved value");
      assert.equal(await page.locator("#backgroundStyle").inputValue(), "aurora", "style selector restores the saved value");
      await page.locator("#doneSettingsButton").click();
    });

    await scenario("JSON export download and invalid import zero-write", async () => {
      await page.locator("#settingsButton").click();
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#exportBackupButton").click();
      const exported = await readDownload(await downloadPromise, temporaryDirectory);
      assert.match(path.basename(exported.target), /^daily-atlas-backup-\d{4}-\d{2}-\d{2}\.json$/, "backup filename contains the local date");
      const payload = JSON.parse(exported.text);
      assert.equal(payload.format, "daily-atlas-backup", "backup format marker is explicit");
      assert.equal(payload.schemaVersion, 1, "backup schema is versioned");
      assert.match(payload.appVersion, /^2\./, "backup records app v2");
      assert.ok(payload.states.book && payload.states.movie && payload.states.city && payload.states.german && payload.states.medical, "backup contains all five state records");
      assert.equal(payload.optional["dailyAtlas.profile.v1"].feedback.book[await currentId(page, "book")].favorite, true, "backup contains the favorite profile");
      assert.deepEqual(
        Object.keys(payload.optional).sort(),
        Object.keys(payload.optional).filter((key) => [
          "dailyAtlas.profile.v1", "dailyAtlas.appearance.v1", "dailyAtlas.audio.v1", "dailyAtlas.audio.v2", "dailyAtlas.speech.v1", "dailyAtlas.reminder.v1"
        ].includes(key)).sort(),
        "backup optional data is allowlisted"
      );

      const before = await storageSnapshot(page);
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("#importBackupButton").click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: "invalid-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"format":"wrong","schemaVersion":99}', "utf8")
      });
      await page.waitForFunction(() => document.querySelector("#backupStatus")?.textContent.includes("没有修改任何数据"));
      assert.deepEqual(await storageSnapshot(page), before, "invalid import performs no localStorage writes");
      await page.locator("#doneSettingsButton").click();
    });

    await scenario("bundled German female narration plays the current example and ducks music", async () => {
      const expected = (await page.locator("#germanCard .german-example strong[lang='de']").textContent()).trim();
      const spokenBefore = await page.evaluate(() => window.__speechHarness.utterances.length);
      const currentId = await page.locator("#germanCard [data-german-speak]").getAttribute("data-item-id");
      const expectedAudio = `./assets/audio/german/${currentId}.mp3`;
      assert.equal(await page.locator("#germanCard [data-german-speak]").getAttribute("data-speech-audio"), expectedAudio, "visible lesson points to its own bundled audio");
      assert.equal(await page.evaluate(() => DailyAtlasMusic.getState().ducked), false, "music starts unducked");
      await page.locator("#germanCard [data-german-speak]").click();
      await page.waitForFunction(() => {
        const state = DailyAtlasSpeech.getState();
        return state.playbackMode === "bundled-female" && state.speaking;
      });
      const speaking = await page.evaluate(() => ({
        utterances: window.__speechHarness.utterances.map((entry) => ({ text: entry.text, lang: entry.lang, voiceURI: entry.voice?.voiceURI || null })),
        speech: DailyAtlasSpeech.getState(),
        music: DailyAtlasMusic.getState(),
        ariaPressed: document.querySelector("#germanCard [data-german-speak]")?.getAttribute("aria-pressed")
      }));
      assert.equal(speaking.utterances.length, spokenBefore, "bundled narration does not invoke the device speech fallback");
      assert.equal(speaking.speech.text, expected, "narration is associated with exactly the visible example");
      assert.equal(speaking.speech.itemId, currentId, "narration state is associated with the visible lesson ID");
      assert.equal(speaking.speech.audioUrl, expectedAudio, "narration state exposes the bundled file used");
      assert.equal(speaking.speech.playbackMode, "bundled-female", "the fixed female narration path is active");
      assert.equal(speaking.music.ducked, true, "background music is ducked while speaking");
      assert.equal(speaking.ariaPressed, "true", "the active narration button exposes pressed state");
      await page.evaluate(() => DailyAtlasSpeech.stop("test finished"));
      await page.waitForFunction(() => !DailyAtlasMusic.getState().ducked && DailyAtlasSpeech.getState().status === "stopped");
      assert.equal(await page.locator("#germanCard [data-german-speak]").getAttribute("aria-pressed"), "false", "button returns to idle after speech ends");
    });

    await scenario("failed bundled narration with no device speech clears active semantics", async () => {
      const failureContext = await browser.newContext({
        viewport: { width: 1000, height: 760 },
        reducedMotion: "reduce",
        serviceWorkers: "block"
      });
      await failureContext.addInitScript(() => {
        class BrokenAudio {
          constructor(src) {
            this.src = src;
            this.preload = "";
            this.onplay = null;
            this.onended = null;
            this.onerror = null;
          }
          play() { return Promise.reject(new Error("injected bundled MP3 failure")); }
          pause() {}
          removeAttribute() {}
          load() {}
        }
        Object.defineProperty(window, "Audio", { configurable: true, value: BrokenAudio });
        Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
        Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
      });
      const failurePage = await failureContext.newPage();
      failurePage.setDefaultTimeout(15000);
      const failureErrors = [];
      failurePage.on("pageerror", (error) => failureErrors.push(error.message));
      try {
        await failurePage.goto(origin, { waitUntil: "domcontentloaded" });
        await waitForAppReady(failurePage);
        await failurePage.locator("#germanCard [data-german-speak]").click();
        await failurePage.waitForFunction(() => DailyAtlasSpeech.getState().status === "error");
        const audit = await failurePage.evaluate(() => ({
          speech: DailyAtlasSpeech.getState(),
          buttonPressed: document.querySelector("#germanCard [data-german-speak]")?.getAttribute("aria-pressed"),
          buttonText: document.querySelector("#germanCard [data-german-speak]")?.textContent.trim(),
          statusText: document.querySelector("#germanCard .speech-status-inline")?.textContent.trim(),
          ducked: DailyAtlasMusic.getState().ducked
        }));
        assert.equal(audit.speech.status, "error", "the controller reports a terminal error");
        assert.equal(audit.speech.speaking, false, "failed narration is not marked speaking");
        assert.equal(audit.speech.pending, false, "failed narration is not left pending");
        assert.equal(audit.speech.text, "", "failed narration clears its active text");
        assert.equal(audit.speech.itemId, null, "failed narration clears its active item ID");
        assert.equal(audit.speech.activeVoiceURI, null, "failed narration clears its active voice");
        assert.equal(audit.speech.playbackMode, null, "failed narration clears its playback mode");
        assert.equal(audit.speech.audioUrl, null, "failed narration clears its active audio URL");
        assert.equal(audit.buttonPressed, "false", "the failed button exposes an inactive pressed state");
        assert.match(audit.buttonText, /女声朗读例句/, "the button returns to its retry action");
        assert.match(audit.statusText, /朗读失败.*均不可用/, "the card honestly explains that both bundled and device paths failed");
        assert.equal(audit.ducked, false, "music is unducked after terminal narration failure");
        assert.deepEqual(failureErrors, [], `speech failure is handled without uncaught errors: ${failureErrors.join(" | ")}`);
      } finally {
        await failureContext.close();
      }
    });

    await scenario("100-track selection persists without autoplay", async () => {
      assert.equal(await page.locator("#musicTrack option").count(), 100, "track selector contains exactly 100 light-music presets");
      assert.equal(await page.locator("#musicToggle").getAttribute("aria-pressed"), "false", "music is initially paused");
      assert.equal(await page.evaluate(() => DailyAtlasMusic.getState().playing), false, "audio scheduler is not playing before a gesture");
      const values = await page.locator("#musicTrack option").evaluateAll((options) => options.map((option) => option.value));
      assert.equal(new Set(values).size, 100, "all music options have unique IDs");
      assert.equal(await page.locator('#musicTrack option[value="pd-beethoven-fur-elise"]').textContent(), "贝多芬《致爱丽丝》｜公版·本项目合成", "public-domain arrangements are clearly labeled as project synthesis");
      await page.locator("#settingsButton").click();
      assert.equal(await page.locator("#musicTrackSettings option").count(), 100, "settings exposes the full music library when the compact mobile header hides its selector");
      await page.locator("#musicTrackSettings").selectOption("pd-beethoven-fur-elise");
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("dailyAtlas.audio.v2") || "null")?.trackId === "pd-beethoven-fur-elise");
      assert.equal(await page.locator("#musicTrack").inputValue(), "pd-beethoven-fur-elise", "settings and header music selectors stay synchronized");
      await page.locator("#doneSettingsButton").click();
      const selected = values.at(-1);
      await page.locator("#musicTrack").selectOption(selected);
      await page.waitForFunction((trackId) => {
        const saved = JSON.parse(localStorage.getItem("dailyAtlas.audio.v2") || "null");
        return saved?.trackId === trackId;
      }, selected);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.audio.v2")).trackId), selected, "selected track is persisted");
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      assert.equal(await page.locator("#musicTrack").inputValue(), selected, "selected track is restored");
      assert.equal(await page.locator("#musicToggle").getAttribute("aria-pressed"), "false", "reload never autoplays music");
      assert.equal(await page.evaluate(() => DailyAtlasMusic.getState().playing), false, "reload leaves the music engine stopped");
    });

    await scenario("weather is opt-in and displays retrieval time", async () => {
      assert.equal(weatherRequests, 0, "opening and using the static page does not request weather");
      assert.match(await page.locator("#cityCard .weather-result").textContent(), /按需联网/, "city card explains the opt-in boundary before request");
      await page.locator("#cityCard [data-action='weather']").click();
      await page.waitForFunction(() => /获取于|暂不可用/.test(document.querySelector("#cityCard .weather-result")?.textContent || ""));
      assert.match(await page.locator("#cityCard .weather-result").textContent(), /获取于/, "valid city coordinates yield a timestamped weather result");
      assert.equal(weatherRequests, 1, "one explicit user click performs one weather request");
      assert.match(weatherUrls[0], /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/, "request is sent only to the declared weather endpoint");
      assert.match(weatherUrls[0], /latitude=/, "request includes the selected city's latitude");
      assert.match(weatherUrls[0], /longitude=/, "request includes the selected city's longitude");
      const text = await page.locator("#cityCard .weather-result").textContent();
      assert.match(text, /大致晴朗/, "weather result renders the returned condition");
      assert.match(text, /获取于\s*\d{2}[\/-]\d{2}/, "weather result visibly timestamps retrieval");
    });

    await scenario("reminder permission is gesture-bound and ICS is complete", async () => {
      assert.equal(await page.evaluate(() => window.__notificationHarness.requestPermissionCalls), 0, "page load never asks for notification permission");
      await page.locator("#settingsButton").click();
      assert.equal(await page.evaluate(() => window.__notificationHarness.requestPermissionCalls), 0, "opening settings still does not ask permission");
      await page.locator("#reminderTime").fill("09:15");
      await page.locator("#enableReminderButton").click();
      await page.waitForFunction(() => window.__notificationHarness.requestPermissionCalls === 1);
      await page.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem("dailyAtlas.reminder.v1") || "null");
        return saved?.enabled === true && saved?.time === "09:15";
      });
      assert.equal(await page.evaluate(() => window.__notificationHarness.requestPermissionCalls), 1, "permission is requested exactly once after the enable click");
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.reminder.v1")));
      assert.deepEqual({ enabled: saved.enabled, time: saved.time }, { enabled: true, time: "09:15" }, "enabled reminder time is persisted");

      const downloadPromise = page.waitForEvent("download");
      await page.locator("#calendarReminderButton").click();
      const ics = await readDownload(await downloadPromise, temporaryDirectory);
      assert.equal(path.basename(ics.target), "daily-atlas-reminder.ics", "calendar export uses a stable filename");
      assert.match(ics.text, /BEGIN:VCALENDAR\r?\n/, "ICS is a calendar document");
      assert.match(ics.text, /RRULE:FREQ=DAILY/, "ICS repeats daily");
      assert.match(ics.text, /DTSTART:\d{8}T091500/, "ICS preserves the chosen local time");
      assert.match(ics.text, /BEGIN:VALARM[\s\S]*TRIGGER:PT0M[\s\S]*END:VALARM/, "ICS includes an explicit alarm");
      assert.equal(await page.evaluate(() => window.__notificationHarness.requestPermissionCalls), 1, "ICS export does not request notification permission again");
      await page.locator("#doneSettingsButton").click();
    });

    await scenario("unsupported notification and PWA capabilities degrade honestly", async () => {
      const unsupportedContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
        serviceWorkers: "block"
      });
      await unsupportedContext.addInitScript(() => {
        Object.defineProperty(window, "Notification", { configurable: true, value: undefined });
        try {
          Object.defineProperty(Navigator.prototype, "serviceWorker", { configurable: true, get: () => undefined });
        } catch (_error) {}
      });
      const unsupportedPage = await unsupportedContext.newPage();
      unsupportedPage.setDefaultTimeout(15000);
      try {
        await unsupportedPage.goto(origin, { waitUntil: "domcontentloaded" });
        await waitForAppReady(unsupportedPage);
        await unsupportedPage.locator("#settingsButton").click();
        assert.equal(await unsupportedPage.locator("#enableReminderButton").isDisabled(), true, "unsupported browsers cannot request a nonexistent notification API");
        assert.match(await unsupportedPage.locator("#reminderStatus").textContent(), /不支持网页通知.*ICS/, "reminder copy points to the still-available calendar path");
        assert.equal(await unsupportedPage.locator("#calendarReminderButton").isEnabled(), true, "ICS export remains available without Notification API");
        assert.match(await unsupportedPage.locator("#offlineStatus").textContent(), /未提供或已禁用离线应用能力.*核心页面仍可使用/, "PWA copy names the missing capability without claiming the core page failed");
        assert.match(await unsupportedPage.locator("#offlineTitle").locator("xpath=..").textContent(), /添加到桌面／主屏幕.*Safari/, "manual home-screen guidance remains visible when no install prompt exists");
        assert.equal(await unsupportedPage.locator("#compatibilityNotice").isHidden(), true, "the modern browser does not show the legacy-engine warning");
      } finally {
        await unsupportedContext.close();
      }
    });

    await scenario("large record collections render in mobile-sized pages", async () => {
      const paginationContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
        serviceWorkers: "block"
      });
      const paginationPage = await paginationContext.newPage();
      paginationPage.setDefaultTimeout(15000);
      try {
        await paginationPage.goto(origin, { waitUntil: "domcontentloaded" });
        await waitForAppReady(paginationPage);
        await paginationPage.evaluate(() => DailyAtlasLock.transaction((lease) => {
          let profile = DailyAtlasProfile.emptyProfile();
          DAILY_ATLAS_CATALOG.books.slice(0, 500).forEach((item, index) => {
            profile = DailyAtlasProfile.setFeedback(profile, "book", item.id, "favorite", true, new Date(Date.UTC(2026, 7, 24, 0, 0, index)));
          });
          lease.storage.setItem(DailyAtlasProfile.STORAGE_KEY, JSON.stringify(profile));
        }));
        await paginationPage.evaluate(() => DailyAtlasLock.whenIdle());
        await paginationPage.reload({ waitUntil: "domcontentloaded" });
        await waitForAppReady(paginationPage);
        await paginationPage.locator("#recordButton").click();
        assert.equal(await paginationPage.locator("#recordList .record-item").count(), 100, "the first render is capped at one mobile-sized page");
        assert.match(await paginationPage.locator('[data-record-more="favorite"]').textContent(), /已显示 100\/500/, "the continuation button discloses shown and total counts");
        for (const expected of [200, 300, 400, 500]) {
          await paginationPage.locator('[data-record-more="favorite"]').click();
          assert.equal(await paginationPage.locator("#recordList .record-item").count(), expected,
            `a user gesture reveals record page ${expected / 100} without rendering the rest early`);
        }
        assert.equal(await paginationPage.locator('[data-record-more="favorite"]').count(), 0, "the continuation control disappears after the full section is visible");
      } finally {
        await paginationContext.close();
      }
    });

    await scenario("320/360/390/428/768 responsive layouts and three usable dialogs", async () => {
      const viewports = [
        { width: 320, height: 568 },
        { width: 360, height: 640 },
        { width: 390, height: 844 },
        { width: 428, height: 926 },
        { width: 768, height: 1024 }
      ];
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await closeOpenDialogs(page);
        await assert.doesNotReject(() => page.getByRole("button", { name: "打开偏好、外观与备份设置", exact: true }).waitFor(), `${viewport.width}px: settings button has a stable accessible name`);
        await assert.doesNotReject(() => page.getByRole("button", { name: /^打开探索记录，共\d+项$/ }).waitFor(), `${viewport.width}px: record button includes its purpose and count`);
        await assert.doesNotReject(() => page.getByRole("slider", { name: "背景轻音乐音量", exact: true }).waitFor(), `${viewport.width}px: volume slider has a stable accessible name`);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          innerWidth: window.innerWidth
        }));
        assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, `${viewport.width}px: document has no horizontal overflow`);
        assert.ok(overflow.bodyScrollWidth <= overflow.innerWidth + 1, `${viewport.width}px: body has no horizontal overflow`);
        assert.ok(await page.locator("#musicVolume").evaluate((element) => element.getBoundingClientRect().height >= 44), `${viewport.width}px: the music volume target is at least 44px high`);

        await page.locator("#recordButton").click();
        await assertDialogReachable(page, "#recordDialog", "#doneRecordButton", "#recordList", `${viewport.width}px record dialog`);
        await page.locator("#doneRecordButton").click();

        await page.locator("#settingsButton").click();
        await assertDialogReachable(page, "#settingsDialog", "#doneSettingsButton", "#settingsDialog .settings-copy", `${viewport.width}px settings dialog`);
        const importInputContract = await page.locator("#importBackupFile").evaluate((input) => ({
          hidden: input.hidden,
          tabIndex: input.tabIndex,
          ariaHidden: input.getAttribute("aria-hidden"),
          active: document.activeElement === input
        }));
        assert.deepEqual(importInputContract, {
          hidden: true,
          tabIndex: -1,
          ariaHidden: "true",
          active: false
        }, `${viewport.width}px: programmatic file input stays out of the visible keyboard sequence`);
        await page.locator("#musicTrackSettings").scrollIntoViewIfNeeded();
        assert.equal(await page.locator("#musicTrackSettings").isVisible(), true, `${viewport.width}px: all 100 music choices remain reachable from mobile settings`);
        assert.equal(await page.locator("#musicTrackSettings option").count(), 100, `${viewport.width}px: mobile settings contains the complete music library`);
        await page.locator("#doneSettingsButton").click();

        await page.evaluate(() => document.querySelector("#dataNoteButton").click());
        await assertDialogReachable(page, "#dataDialog", "#doneDataButton", "#dataDialog .data-copy", `${viewport.width}px data dialog`);
        await page.locator("#doneDataButton").click();
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await assertDialogKeyboardContract(page, "#recordButton", "#recordDialog", "record dialog");
      await assertDialogKeyboardContract(page, "#settingsButton", "#settingsDialog", "settings dialog");
      await assertDialogKeyboardContract(page, "#dataNoteButton", "#dataDialog", "data-boundary dialog");
    });

    await scenario("PWA keeps lightweight updates atomic and downloads the full media pack only on request", async () => {
      const registration = await page.evaluate(async () => {
        if (!("serviceWorker" in navigator)) return { supported: false };
        const ready = await navigator.serviceWorker.ready;
        return { supported: true, scope: ready.scope, controlled: Boolean(navigator.serviceWorker.controller) };
      });
      assert.equal(registration.supported, true, "Edge exposes service workers on localhost");
      assert.match(registration.scope, new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`), "service worker owns the application scope");
      if (!registration.controlled) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForAppReady(page);
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      }
      assert.equal(await page.evaluate(() => DailyAtlasPWA.getState().registered), true, "PWA module reports a successful registration");
      assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true, "page is controlled before the offline check");

      const initialShell = await page.evaluate(async () => {
        const names = (await caches.keys()).filter((name) => name.startsWith("daily-atlas-shell-"));
        const cache = names.length === 1 ? await caches.open(names[0]) : null;
        const html = cache ? await (await cache.match("./index.html"))?.text() : "";
        const keys = cache ? await cache.keys() : [];
        return {
          names,
          marker: html.match(/name="test-shell-marker" content="([^"]+)"/)?.[1] || null,
          narrations: keys.filter((request) => /\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(new URL(request.url).pathname)).length
        };
      });
      assert.equal(initialShell.names.length, 1, "the initial A shell has exactly one complete cache");
      assert.equal(initialShell.marker, "A", "the initial cache contains the real A shell marker");
      assert.equal(initialShell.narrations, 0, "the default application shell does not prefetch 500 narrations");
      await page.waitForFunction(() => {
        const state = DailyAtlasPWA.getState();
        return state.offlineMode === "light" && state.offlinePhase === "ready" && state.offlineCachedCount === 1;
      });
      const lightAudio = await page.evaluate(async () => {
        const current = document.querySelector("#germanCard [data-german-speak]")?.getAttribute("data-speech-audio");
        const name = (await caches.keys()).find((entry) => entry.startsWith("daily-atlas-audio-light-"));
        const keys = name ? await (await caches.open(name)).keys() : [];
        return {
          current: current ? new URL(current, location.href).href : null,
          urls: keys.map((request) => request.url)
        };
      });
      assert.equal(lightAudio.urls.length, 1, "lightweight mode keeps exactly the current German narration");
      assert.equal(lightAudio.urls[0], lightAudio.current, "the on-demand lightweight narration matches the visible German card");

      const activeWorker = context.serviceWorkers().find((worker) => worker.url().endsWith("/sw.js"));
      assert.ok(activeWorker, "the active Service Worker is available for storage fault injection");
      const quotaOverride = await activeWorker.evaluate(async () => {
        globalThis.__dailyAtlasOriginalEstimate = navigator.storage.estimate.bind(navigator.storage);
        navigator.storage.estimate = async () => ({ usage: 990, quota: 1000 });
        return navigator.storage.estimate();
      });
      assert.deepEqual(quotaOverride, { usage: 990, quota: 1000 });
      const requestsBeforeQuota = narrationRequests;
      const quotaFailure = await page.evaluate(() => DailyAtlasPWA.setOfflineMode("full"));
      assert.equal(quotaFailure.ok, false, "insufficient quota fails before the optional download starts");
      assert.equal(quotaFailure.errorCode, "QUOTA");
      assert.ok(quotaFailure.requiredBytes > quotaFailure.availableBytes);
      assert.equal(narrationRequests, requestsBeforeQuota, "quota preflight does not spend network traffic");
      await activeWorker.evaluate(() => {
        navigator.storage.estimate = globalThis.__dailyAtlasOriginalEstimate;
        delete globalThis.__dailyAtlasOriginalEstimate;
      });
      await activeWorker.evaluate(() => {
        globalThis.__dailyAtlasOriginalCachePut = Cache.prototype.put;
        globalThis.__dailyAtlasQuotaInjected = false;
        Cache.prototype.put = function (request, response) {
          const url = typeof request === "string" ? request : request?.url || "";
          if (!globalThis.__dailyAtlasQuotaInjected && /\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(url)) {
            globalThis.__dailyAtlasQuotaInjected = true;
            throw new DOMException("injected-cache-quota", "QuotaExceededError");
          }
          return globalThis.__dailyAtlasOriginalCachePut.call(this, request, response);
        };
      });
      const quotaWriteFailure = await page.evaluate(() => DailyAtlasPWA.setOfflineMode("full"));
      assert.equal(quotaWriteFailure.ok, false, "a Cache.put quota failure is reported without a false ready marker");
      assert.equal(quotaWriteFailure.errorCode, "QUOTA");
      assert.equal(quotaWriteFailure.contentReady, true, "already verified content remains committed when audio storage fills");
      await activeWorker.evaluate(() => {
        Cache.prototype.put = globalThis.__dailyAtlasOriginalCachePut;
        delete globalThis.__dailyAtlasOriginalCachePut;
        delete globalThis.__dailyAtlasQuotaInjected;
      });
      assert.equal((await page.evaluate(() => DailyAtlasPWA.setOfflineMode("light"))).mode, "light");

      const reusableBeforeUpdate = reusablePackRequests;
      serviceWorkerVariant = 2;
      const lightweightWorker = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration.update();
        const worker = registration.installing;
        if (!worker) return { state: "missing", waiting: Boolean(registration.waiting) };
        await new Promise((resolve) => {
          const finished = () => {
            if (["installed", "redundant"].includes(worker.state)) resolve();
          };
          worker.addEventListener("statechange", finished);
          finished();
        });
        return { state: worker.state, waiting: Boolean(registration.waiting) };
      });
      assert.equal(lightweightWorker.state, "installed", "the lightweight B shell installs without requesting the 500 narration files");
      assert.equal(lightweightWorker.waiting, true, "the complete lightweight B shell is offered as an update");
      assert.equal(failedNarrationRequests, 0, "installing a lightweight shell never reaches the injected narration failure");
      assert.equal(reusablePackRequests, reusableBeforeUpdate, "a shell-only update reuses unchanged content, medical, search and audio-metadata packs without network requests");
      await page.waitForFunction(() => DailyAtlasPWA.getState().updateAvailable === true);
      await page.locator("#settingsButton").click();
      await page.locator("#updateAppButton").waitFor({ state: "visible" });
      const updateButtonRecovery = await page.evaluate(() => {
        const current = DailyAtlasPWA.getState();
        const emit = (patch) => window.dispatchEvent(new CustomEvent("dailyatlaspwastate", {
          detail: { ...current, ...patch }
        }));
        emit({ updateAvailable: false, updateApplying: true });
        const applying = {
          hidden: document.querySelector("#updateAppButton").hidden,
          disabled: document.querySelector("#updateAppButton").disabled,
          text: document.querySelector("#updateAppButton").textContent
        };
        emit({ updateAvailable: true, updateApplying: false });
        const recovered = {
          hidden: document.querySelector("#updateAppButton").hidden,
          disabled: document.querySelector("#updateAppButton").disabled,
          text: document.querySelector("#updateAppButton").textContent
        };
        return { applying, recovered };
      });
      assert.deepEqual(updateButtonRecovery.applying, {
        hidden: false,
        disabled: true,
        text: "正在切换版本…"
      }, "the update button exposes the bounded activation state");
      assert.deepEqual(updateButtonRecovery.recovered, {
        hidden: false,
        disabled: false,
        text: "应用更新并重新载入"
      }, "an activation timeout restores the same-page update control for retry");
      let navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
      await page.locator("#updateAppButton").click();
      await navigation;
      await waitForAppReady(page);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller) && DailyAtlasPWA.getState().registered);

      failedInstallPhase = true;
      const failedFullPack = await page.evaluate(() => DailyAtlasPWA.setOfflineMode("full"));
      failedInstallPhase = false;
      assert.equal(failedFullPack.ok, false, "a failed full-pack request reports failure");
      assert.equal(failedFullPack.mode, "light", "a failed full-pack request leaves lightweight mode active");
      assert.equal(failedFullPack.errorCode, "NETWORK", "the injected HTTP failure is classified as a network failure");
      assert.equal(failedNarrationRequests, 1, "the explicit full-pack download reaches the injected final narration exactly once");
      const afterFailedFullPack = await page.evaluate(async () => {
        const names = await caches.keys();
        const shells = names.filter((name) => name.startsWith("daily-atlas-shell-"));
        const shell = shells.length === 1 ? await caches.open(shells[0]) : null;
        const html = shell ? await (await shell.match("./index.html"))?.text() : "";
        const fullCaches = names.filter((name) => name.startsWith("daily-atlas-audio-pack-"));
        const fullKeys = fullCaches.length ? await (await caches.open(fullCaches[0])).keys() : [];
        const visualCaches = names.filter((name) => name.startsWith("daily-atlas-visual-pack-"));
        const visualKeys = visualCaches.length ? await (await caches.open(visualCaches[0])).keys() : [];
        return {
          shells,
          marker: html.match(/name="test-shell-marker" content="([^"]+)"/)?.[1] || null,
          fullNarrations: fullKeys.filter((request) => /\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(new URL(request.url).pathname)).length,
          fullComplete: fullKeys.some((request) => request.url.includes("__daily-atlas-full-audio-complete__")),
          fullVisuals: visualKeys.filter((request) => /\/assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(new URL(request.url).pathname)).length,
          visualComplete: visualKeys.some((request) => request.url.includes("__daily-atlas-full-visual-complete__"))
        };
      });
      assert.equal(afterFailedFullPack.shells.length, 1, "the failed optional download preserves one complete B shell");
      assert.equal(afterFailedFullPack.marker, "B", "the failed optional download preserves the active B marker");
      assert.ok(afterFailedFullPack.fullNarrations >= 490 && afterFailedFullPack.fullNarrations < 500, "verified staging files survive failure for a later resume");
      assert.equal(afterFailedFullPack.fullVisuals, 200, "all verified city visuals survive a later narration failure");
      assert.equal(afterFailedFullPack.fullComplete, false, "a failed full pack never receives the completion marker");
      assert.equal(afterFailedFullPack.visualComplete, false, "a failed full pack never receives a visual completion marker");

      serviceWorkerVariant = 3;
      assert.equal(await page.evaluate(() => DailyAtlasPWA.checkForUpdate()), true, "an explicit update check completes");
      await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
      await page.waitForFunction(() => DailyAtlasPWA.getState().updateAvailable === true);
      await page.locator("#settingsButton").click();
      await page.locator("#updateAppButton").waitFor({ state: "visible" });
      navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
      await page.locator("#updateAppButton").click();
      await navigation;
      await waitForAppReady(page);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller) && DailyAtlasPWA.getState().registered);
      const cacheNames = await page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith("daily-atlas-shell-")));
      assert.equal(cacheNames.length, 1, "activation removes the previous shell cache");
      assert.match(cacheNames[0], /-test-update$/, "the active cache belongs to the explicitly accepted update");
      const recoveredStage = await page.evaluate(() => DailyAtlasPWA.getOfflineStatus());
      assert.equal(recoveredStage.phase, "paused", "a replacement Worker reconstructs the staging phase from Cache API contents");
      assert.equal(recoveredStage.stagedCount, afterFailedFullPack.fullNarrations + afterFailedFullPack.fullVisuals, "restart recovery counts the actual verified audio and city-visual files");
      const requestsBeforeResume = narrationRequests;
      const visualRequestsBeforeResume = cityVisualRequests;
      const resumed = await page.evaluate(() => DailyAtlasPWA.resumeOfflineDownload());
      assert.equal(resumed.ok, true);
      assert.equal(resumed.mode, "full");
      assert.equal(resumed.cachedCount, 700);
      assert.equal(narrationRequests - requestsBeforeResume, 500 - afterFailedFullPack.fullNarrations, "resume fetches only the missing narration files");
      assert.equal(cityVisualRequests - visualRequestsBeforeResume, 0, "resume reuses all 200 verified city visuals");
      const lightAgain = await page.evaluate(() => DailyAtlasPWA.setOfflineMode("light"));
      assert.equal(lightAgain.mode, "light", "returning to light mode removes the completed optional pack");
      await page.evaluate(() => { globalThis.__dailyAtlasPauseProbe = DailyAtlasPWA.setOfflineMode("full"); });
      await page.waitForFunction(() => {
        const state = DailyAtlasPWA.getState();
        return state.offlinePhase === "downloading" && state.offlineStagedCount >= 4;
      });
      const paused = await page.evaluate(() => DailyAtlasPWA.pauseOfflineDownload());
      assert.equal(paused.ok, true);
      assert.equal(paused.phase, "paused");
      assert.ok(paused.stagedCount >= 4 && paused.stagedCount < 700, "pause keeps already verified audio and city-visual staging files");
      const pausedVisuals = paused.visualCachedCount || 0;
      const pausedNarrations = paused.stagedCount - pausedVisuals;
      const requestsBeforePausedResume = narrationRequests;
      const visualRequestsBeforePausedResume = cityVisualRequests;
      const resumedAfterPause = await page.evaluate(() => DailyAtlasPWA.resumeOfflineDownload());
      assert.equal(resumedAfterPause.mode, "full");
      assert.equal(resumedAfterPause.cachedCount, 700);
      assert.equal(narrationRequests - requestsBeforePausedResume, 500 - pausedNarrations, "resume after an explicit pause fetches only missing narration files");
      assert.equal(cityVisualRequests - visualRequestsBeforePausedResume, 200 - pausedVisuals, "resume after an explicit pause fetches only missing city visuals");
      assert.equal((await page.evaluate(() => DailyAtlasPWA.setOfflineMode("light"))).mode, "light");
      await page.locator("#settingsButton").click();
      await page.locator("#offlineFullMode").check();
      await page.locator("#cancelOfflineButton").waitFor({ state: "visible" });
      await page.locator("#cancelOfflineButton").click();
      await page.waitForFunction(() => {
        const state = DailyAtlasPWA.getState();
        return state.offlineMode === "light" && state.offlinePhase === "cancelled";
      });
      assert.match(await page.locator("#offlineStatus").textContent(), /下载已取消.*轻量离线/, "the cancel control confirms lightweight mode without damaging the shell");
      const cancelledCaches = await page.evaluate(async () => {
        const names = await caches.keys();
        const fullNames = names.filter((name) => name.startsWith("daily-atlas-audio-pack-"));
        const fullVisualNames = names.filter((name) => name.startsWith("daily-atlas-visual-pack-"));
        const optionalTextNames = names.filter((name) => name.startsWith("daily-atlas-content-runtime-") || name.startsWith("daily-atlas-search-data-"));
        const keys = fullNames.length ? await (await caches.open(fullNames[0])).keys() : [];
        return { fullNames, fullVisualNames, optionalTextNames, keyCount: keys.length };
      });
      assert.equal(cancelledCaches.fullNames.length, 0, "cancelling removes the partial full-pack cache");
      assert.equal(cancelledCaches.fullVisualNames.length, 0, "cancelling removes the partial city-visual cache");
      assert.equal(cancelledCaches.optionalTextNames.length, 0, "cancelling removes partial optional detail/search packs");
      assert.equal(cancelledCaches.keyCount, 0, "no partial narration or marker remains readable after cancellation");
      await page.locator("#offlineFullMode").check();
      await page.waitForFunction(() => {
        const state = DailyAtlasPWA.getState();
        return state.offlineMode === "full" && state.offlinePhase === "ready" && state.offlineCachedCount === 700;
      }, null, { timeout: 120000 });
      assert.match(await page.locator("#offlineStatus").textContent(), /完整离线已启用.*500 条德语朗读与 200 张开放许可城市图/, "the UI confirms the completed full pack");
      const acceptedCaches = await page.evaluate(async (cacheName) => {
        const shell = await caches.open(cacheName);
        const shellKeys = await shell.keys();
        const html = await (await shell.match("./index.html"))?.text();
        const fullName = (await caches.keys()).find((name) => name.startsWith("daily-atlas-audio-pack-"));
        const fullKeys = fullName ? await (await caches.open(fullName)).keys() : [];
        const visualName = (await caches.keys()).find((name) => name.startsWith("daily-atlas-visual-pack-"));
        const visualKeys = visualName ? await (await caches.open(visualName)).keys() : [];
        const contentName = (await caches.keys()).find((name) => name.startsWith("daily-atlas-content-runtime-"));
        const searchName = (await caches.keys()).find((name) => name.startsWith("daily-atlas-search-data-"));
        const contentKeys = contentName ? await (await caches.open(contentName)).keys() : [];
        const searchKeys = searchName ? await (await caches.open(searchName)).keys() : [];
        return {
          shellNarrations: shellKeys.filter((request) => /\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(new URL(request.url).pathname)).length,
          fullNarrations: fullKeys.filter((request) => /\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(new URL(request.url).pathname)).length,
          fullComplete: fullKeys.some((request) => request.url.includes("__daily-atlas-full-audio-complete__")),
          fullVisuals: visualKeys.filter((request) => /\/assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(new URL(request.url).pathname)).length,
          visualComplete: visualKeys.some((request) => request.url.includes("__daily-atlas-full-visual-complete__")),
          contentChunks: contentKeys.filter((request) => /\/catalog-data\/details\/.+\.js$/.test(new URL(request.url).pathname)).length,
          contentComplete: contentKeys.some((request) => request.url.includes("__daily-atlas-full-content-complete__")),
          searchIndexes: searchKeys.filter((request) => /\/catalog-data\/search\.[a-f0-9]{12}\.js$/.test(new URL(request.url).pathname)).length,
          searchComplete: searchKeys.some((request) => request.url.includes("__daily-atlas-full-search-complete__")),
          marker: html?.match(/name="test-shell-marker" content="([^"]+)"/)?.[1] || null
        };
      }, cacheNames[0]);
      assert.equal(acceptedCaches.shellNarrations, 0, "the lightweight shell stays small after a full-pack download");
      assert.equal(acceptedCaches.fullNarrations, 500, "the separate complete cache contains every fixed German narration");
      assert.equal(acceptedCaches.fullComplete, true, "the complete cache has its activation marker");
      assert.equal(acceptedCaches.fullVisuals, 200, "the separate visual cache contains every reviewed city image");
      assert.equal(acceptedCaches.visualComplete, true, "the complete city-visual cache has its activation marker");
      assert.equal(acceptedCaches.contentChunks, 44, "full mode contains all 44 verified detail chunks");
      assert.equal(acceptedCaches.contentComplete, true, "the complete detail cache has its activation marker");
      assert.equal(acceptedCaches.searchIndexes, 1, "full mode contains the delayed search index");
      assert.equal(acceptedCaches.searchComplete, true, "the complete search cache has its activation marker");
      assert.equal(acceptedCaches.marker, "B", "the accepted cache contains the real B shell marker");
      const removedNarrationUrl = await page.evaluate(async () => {
        const fullName = (await caches.keys()).find((name) => name.startsWith("daily-atlas-audio-pack-"));
        const cache = await caches.open(fullName);
        const narration = (await cache.keys()).find((request) => /\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(new URL(request.url).pathname));
        await cache.delete(narration);
        return narration.url;
      });
      const recoveredMissingNarration = await page.evaluate(async (url) => {
        const response = await fetch(url);
        return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
      }, removedNarrationUrl);
      assert.equal(recoveredMissingNarration.ok, true, "a missing complete-pack narration can still use the verified network fallback");
      assert.ok(recoveredMissingNarration.bytes > 1000, "the network fallback returns a complete narration");
      const damagedStatus = await page.evaluate(() => DailyAtlasPWA.getOfflineStatus());
      assert.equal(damagedStatus.mode, "light", "serving a missing complete-pack response invalidates the ready marker and trust memo");
      assert.equal(damagedStatus.stagedCount, 699);
      const repaired = await page.evaluate(() => DailyAtlasPWA.repairCaches());
      assert.equal(repaired.repaired, true);
      assert.equal(repaired.phase, "paused", "cache repair removes an invalid ready marker but preserves 699 valid media files");
      const requestsBeforeRepairResume = narrationRequests;
      const repairedResume = await page.evaluate(() => DailyAtlasPWA.resumeOfflineDownload());
      assert.equal(repairedResume.mode, "full");
      assert.equal(repairedResume.cachedCount, 700);
      assert.equal(narrationRequests - requestsBeforeRepairResume, 1, "repair recovery downloads exactly the one missing response");
      await page.locator("#doneSettingsButton").click();

      offlinePhase = true;
      await context.setOffline(true);
      try {
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForAppReady(page);
        assert.equal(await page.locator('meta[name="test-shell-marker"]').getAttribute("content"), "B", "offline navigation is served from the B shell rather than a mixed A/B cache");
        assert.equal(await page.locator("article.recommendation-card").count(), 5, "all five cards render from the offline app shell");
        assert.deepEqual(
          await page.evaluate(() => Object.fromEntries(["books", "movies", "cities", "german", "medical"].map((key) => [key, DAILY_ATLAS_CATALOG[key].length]))),
          expectedCounts,
          "offline shell contains the complete v2 catalog"
        );
        const offlineCatalog = await page.evaluate(async () => {
          const [search, complete] = await Promise.all([
            DailyAtlasCatalogStore.loadSearchIndex(),
            DailyAtlasCatalogStore.loadAllDetails()
          ]);
          return {
            search: search.count,
            counts: Object.fromEntries(["books", "movies", "cities", "german", "medical"].map((key) => [key, complete[key].length]))
          };
        });
        assert.equal(offlineCatalog.search, 2200, "the delayed search index is available from the complete offline pack");
        assert.deepEqual(offlineCatalog.counts, expectedCounts, "all 44 detail chunks reconstruct 2,200 complete records while offline");
        const offlineNarration = await page.locator("#germanCard [data-german-speak]").getAttribute("data-speech-audio");
        const offlineNarrationResponse = await page.evaluate(async (url) => {
          const response = await fetch(url);
          return { ok: response.ok, status: response.status, bytes: (await response.arrayBuffer()).byteLength };
        }, offlineNarration);
        assert.equal(offlineNarrationResponse.ok, true, "the current fixed narration is fetchable while the network is offline");
        assert.equal(offlineNarrationResponse.status, 200, "the offline narration response is complete");
        assert.ok(offlineNarrationResponse.bytes > 1000, "the offline narration is a non-empty MP3 asset");
        const finalNarration = await page.evaluate(async (url) => {
          const response = await fetch(url);
          return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
        }, `./${finalNarrationRelative}`);
        assert.equal(finalNarration.ok, true, "the last bundled narration is available from the full cache while offline");
        assert.ok(finalNarration.bytes > 1000, "the last bundled narration is complete while offline");
      } finally {
        await context.setOffline(false);
        offlinePhase = false;
      }
    });

    await scenario("no uncaught application errors", async () => {
      assert.deepEqual(consoleErrors, [], `no console/page errors; observed: ${consoleErrors.join(" | ")}`);
    });
  } finally {
    await context.setOffline(false).catch(() => {});
    const reportPath = path.join(root, "test-results", "v2-browser-report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      browser: `Microsoft Edge via Playwright (${browserVersion})`,
      origin,
      expectedCounts,
      weatherRequests,
      results,
      failures,
      expectedOfflineResourceErrors,
      expectedFailedInstallResponses,
      failedNarrationRequests,
      externalResourceFailures
    }, null, 2)}\n`, "utf8");
    process.stdout.write(`REPORT ${reportPath}\n`);
    await browser.close();
    await closeServer();
  }

  if (failures.length) {
    process.stderr.write(`v2-browser: FAIL (${failures.length}/${results.length} scenarios failed)\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`v2-browser: PASS (${results.length}/${results.length} scenarios, weatherRequests=${weatherRequests})\n`);
  }
})().catch(async (error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  try { await closeServer(); } catch (_error) {}
  process.exitCode = 1;
});
