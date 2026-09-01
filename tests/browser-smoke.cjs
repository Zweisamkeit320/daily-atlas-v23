const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
// The app declares no downloadable web fonts; capture the already-rendered system-font frame.
// This avoids an intermittent Windows FontFaceSet.ready stall in Playwright screenshots.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY ||= "1";
const { chromium } = require("playwright");

const defaultRoot = path.basename(__dirname).toLowerCase() === "tests"
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "../outputs/daily-duet");
const root = path.resolve(process.env.DAILY_ATLAS_ROOT || defaultRoot);
const screenshotDir = path.resolve(process.env.DAILY_ATLAS_SCREENSHOT_DIR || path.join(root, "test-results"));
fs.mkdirSync(screenshotDir, { recursive: true });
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp"
};

const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

const titleSelectors = {
  book: "#bookCard .card-title",
  movie: "#movieCard .card-title",
  city: "#cityCard .city-heading h3",
  german: "#germanCard .german-phrase",
  medical: "#medicalCard .medical-title"
};

async function titles(page) {
  return Object.fromEntries(await Promise.all(Object.entries(titleSelectors).map(async ([type, selector]) => [
    type,
    (await page.locator(selector).textContent()).trim()
  ])));
}

async function installControlledClock(context, initialNow) {
  await context.addInitScript(({ now }) => {
    const NativeDate = Date;
    const clock = { now };
    class ControlledDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [clock.now]));
      }
      static now() { return clock.now; }
    }
    globalThis.Date = ControlledDate;
    globalThis.__dailyAtlasSetNow = (value) => { clock.now = value; };
  }, { now: initialNow });
}

async function assertDialogActionReachable(page, dialogSelector, actionSelector, label) {
  const geometry = await page.locator(actionSelector).evaluate((button, selector) => {
    const dialog = document.querySelector(selector);
    const dialogRect = dialog.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const x = buttonRect.left + buttonRect.width / 2;
    const y = buttonRect.top + buttonRect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      dialogTop: dialogRect.top,
      dialogBottom: dialogRect.bottom,
      buttonTop: buttonRect.top,
      buttonBottom: buttonRect.bottom,
      hit: Boolean(hit && (hit === button || button.contains(hit)))
    };
  }, dialogSelector);
  assert.ok(geometry.buttonTop >= geometry.dialogTop && geometry.buttonBottom <= geometry.dialogBottom, `${label} stays inside the dialog viewport`);
  assert.equal(geometry.hit, true, `${label} is hit-testable`);
}

async function knownIntent(page, type) {
  return page.locator(`#${type}Card .known-button`).evaluate((button) => ({
    id: button.dataset.itemId,
    date: button.dataset.date
  }));
}

async function assertAllCardDates(page, expectedDate, label) {
  const dates = await page.locator(".known-button").evaluateAll((buttons) => buttons.map((button) => button.dataset.date));
  assert.equal(dates.length, 5, `${label} keeps all five actions rendered`);
  assert.deepEqual([...new Set(dates)], [expectedDate], `${label} gives every visible action the current date`);
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    return cards.length === 5 && cards.every((card) => !card.hasAttribute("aria-busy"));
  });
}

async function assertFooterActionReachableWithToast(page, viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(50);
  const geometry = await page.evaluate(() => {
    const button = document.querySelector("#dataNoteButton");
    const toast = document.querySelector("#toast");
    const buttonRect = button.getBoundingClientRect();
    const toastRect = toast.getBoundingClientRect();
    const overlapWidth = Math.max(0, Math.min(buttonRect.right, toastRect.right) - Math.max(buttonRect.left, toastRect.left));
    const overlapHeight = Math.max(0, Math.min(buttonRect.bottom, toastRect.bottom) - Math.max(buttonRect.top, toastRect.top));
    const hit = document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2);
    return {
      overlapArea: overlapWidth * overlapHeight,
      hit: Boolean(hit && (hit === button || button.contains(hit)))
    };
  });
  assert.equal(geometry.overlapArea, 0, `persistent toast does not overlap the footer action at ${viewport.width}x${viewport.height}`);
  assert.equal(geometry.hit, true, `footer action remains hit-testable at ${viewport.width}x${viewport.height}`);
  await page.locator("#dataNoteButton").click();
  assert.ok(await page.locator("#dataDialog").isVisible(), `footer action opens its dialog at ${viewport.width}x${viewport.height}`);
  await page.locator("#doneDataButton").click();
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const defaultEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const edgePath = process.env.EDGE_PATH || defaultEdge;
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(edgePath) ? edgePath : undefined,
    timeout: 15000
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => DailyAtlasLock.transaction((lease) => lease.storage.clear()));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    for (const selector of Object.values(titleSelectors)) await page.waitForSelector(selector);

    const initial = await titles(page);
    assert.ok(Object.values(initial).every(Boolean), "all five daily cards render");
    assert.equal(await page.locator("article.recommendation-card").count(), 5, "five semantic cards");
    assert.equal(await page.locator(".swap-button").count(), 5, "every card exposes a temporary swap");
    assert.equal(await page.locator(".known-button").count(), 5, "every card exposes a long-term known action");
    assert.equal(await page.locator("h1").count(), 1, "one page heading");
    assert.ok(await page.locator("#medicalCard img").getAttribute("alt"), "medical image has alt text");
    await page.locator("#medicalCard img").waitFor({ state: "visible" });
    assert.ok(await page.locator("#medicalCard img").evaluate((image) => image.naturalWidth > 0), "medical illustration loads locally");
    process.stdout.write("five-cards-and-medical-image-verified\n");

    await page.locator("#bookCard .swap-button").click();
    await page.waitForFunction((title) => document.querySelector("#bookCard .card-title")?.textContent.trim() !== title, initial.book);
    const swapped = await titles(page);
    assert.notEqual(swapped.book, initial.book, "temporary swap changes only the book");
    for (const type of ["movie", "city", "german", "medical"]) assert.equal(swapped[type], initial[type], `${type} remains unchanged`);
    assert.equal(await page.locator("#recordCount").textContent(), "0", "temporary swap does not pollute long-term records");
    assert.equal(await page.locator("#toastCloseButton").isVisible(), true, "a persistent undo notice has an explicit dismiss action");
    for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1100, height: 800 }]) {
      await assertFooterActionReachableWithToast(page, viewport);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#undoButton").click();
    await page.waitForFunction((title) => document.querySelector("#bookCard .card-title")?.textContent.trim() === title, initial.book);
    assert.equal((await page.locator(titleSelectors.book).textContent()).trim(), initial.book, "undo restores the temporary swap");
    const initialCity = (await page.locator(titleSelectors.city).textContent()).trim();
    await page.locator("#cityCard .swap-button").click();
    await page.waitForFunction((title) => document.querySelector("#cityCard .city-heading h3")?.textContent.trim() !== title, initialCity);
    await page.locator("#toastCloseButton").click();
    assert.equal(await page.locator("#toast").isHidden(), true, "the user can dismiss a persistent notice without undoing the action");
    assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("has-toast")), false, "dismissal removes reserved toast space");
    process.stdout.write("temporary-swap-and-undo-verified\n");

    await page.locator("#movieCard .known-button").click();
    await page.waitForFunction((title) => document.querySelector("#movieCard .card-title")?.textContent.trim() !== title, initial.movie);
    const knownMovieReplacement = (await page.locator(titleSelectors.movie).textContent()).trim();
    assert.equal(await page.locator("#recordCount").textContent(), "1", "known action increments long-term record");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    for (const selector of Object.values(titleSelectors)) await page.waitForSelector(selector);
    assert.equal((await page.locator(titleSelectors.movie).textContent()).trim(), knownMovieReplacement, "replacement survives refresh");
    assert.equal(await page.locator("#recordCount").textContent(), "1", "long-term record survives refresh");
    process.stdout.write("known-and-persistence-verified\n");

    await page.locator("#recordButton").click();
    assert.ok(await page.locator("#recordDialog").isVisible(), "record dialog opens");
    assert.equal(await page.locator("#recordList .record-item").count(), 1, "record dialog lists only the known item");
    assert.equal(await page.locator("#recordSummary .record-stat").count(), 5, "record dialog summarizes all content types");
    await page.locator("#doneRecordButton").click();

    await page.locator("#musicToggle").click();
    await page.waitForFunction(() => document.querySelector("#musicToggle")?.getAttribute("aria-pressed") === "true");
    assert.match(await page.locator("#musicStatus").textContent(), /播放中/);
    await page.locator("#musicVolume").evaluate((input) => {
      input.value = "0";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.match(await page.locator("#musicStatus").textContent(), /音量为零/, "zero volume is explicit and immediate");
    await page.locator("#musicVolume").evaluate((input) => {
      input.value = "7";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#musicToggle").click();
    assert.equal(await page.locator("#musicToggle").getAttribute("aria-pressed"), "false", "music can be paused");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    assert.equal(await page.locator("#musicToggle").getAttribute("aria-pressed"), "false", "music never autoplays after reload");
    assert.equal(await page.locator("#musicVolume").inputValue(), "7", "only volume preference is restored");
    await page.evaluate(() => {
      const button = document.querySelector("#musicToggle");
      button.click();
      button.click();
    });
    await page.waitForTimeout(350);
    assert.equal(await page.locator("#musicToggle").getAttribute("aria-pressed"), "false", "rapid play/pause cannot leave a hidden scheduler playing");
    process.stdout.write("music-user-control-verified\n");

    await page.locator("#dataNoteButton").click();
    assert.ok(await page.locator("#dataDialog").isVisible(), "data boundary dialog opens");
    assert.match(await page.locator("#dataDialog").innerText(), /未经书面许可/);
    assert.match(await page.locator("#dataDialog").innerText(), /不抓取、不复制豆瓣分数/);
    await page.locator("#doneDataButton").click();

    await page.screenshot({ path: path.join(screenshotDir, "daily-atlas-desktop.png"), fullPage: true, timeout: 30000 });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator("body").evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "mobile view has no horizontal overflow");
    await page.screenshot({ path: path.join(screenshotDir, "daily-atlas-mobile.png"), fullPage: true, timeout: 30000 });
    for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(viewport);
      await page.locator("#recordButton").click();
      await assertDialogActionReachable(page, "#recordDialog", "#doneRecordButton", `record footer at ${viewport.width}x${viewport.height}`);
      await page.locator("#doneRecordButton").click();
      await page.locator("#dataNoteButton").click();
      await assertDialogActionReachable(page, "#dataDialog", "#doneDataButton", `data footer at ${viewport.width}x${viewport.height}`);
      await page.locator("#doneDataButton").click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    process.stdout.write("responsive-screenshots-captured\n");

    await page.evaluate(() => DailyAtlasLock.transaction((lease) => {
      const storage = lease.storage;
      storage.clear();
      const firstBook = globalThis.DAILY_ATLAS_CATALOG.books[0].id;
      storage.setItem("dailyAtlas.known.v2", "[]");
      storage.setItem("dailyAtlas.daily.v2", "[]");
      storage.setItem("dailyDuet.seen.v1", JSON.stringify({ book: [firstBook], movie: [], order: [{ type: "book", id: firstBook }] }));
    }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    for (const selector of Object.values(titleSelectors)) await page.waitForSelector(selector);
    assert.equal(await page.locator("#recordCount").textContent(), "1", "wrong-shaped v2 does not block a valid v1 migration");
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book") || "null");
      return state?.knownEntries?.length === 1;
    });

    await page.evaluate(() => DailyAtlasLock.transaction((lease) => {
      const storage = lease.storage;
      storage.clear();
      const [firstBook, secondBook] = globalThis.DAILY_ATLAS_CATALOG.books.slice(0, 2).map((item) => item.id);
      storage.setItem("dailyAtlas.known.v2", JSON.stringify({
        schemaVersion: 2,
        book: [firstBook, secondBook],
        movie: [], city: [], german: [], medical: [],
        order: { corrupted: true }
      }));
    }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    assert.equal(await page.locator("#recordCount").textContent(), "2", "inconsistent legacy order is repaired without losing records");
    await page.locator("#recordButton").click();
    assert.equal(await page.locator("#recordList .record-item").count(), 2, "repaired records remain manageable");
    assert.equal(await page.locator("#resetRecordButton").isDisabled(), false, "reset stays available for repaired records");
    await page.locator("#doneRecordButton").click();

    await page.evaluate(() => DailyAtlasLock.transaction((lease) => {
      const storage = lease.storage;
      storage.clear();
      const date = globalThis.DailyAtlasEngine.localDateKey(new Date());
      const [firstBook, secondBook] = globalThis.DAILY_ATLAS_CATALOG.books.slice(0, 2).map((item) => item.id);
      storage.setItem("dailyAtlas.state.v3.book", JSON.stringify({
        schemaVersion: 3, type: "book", date, revision: 1.25,
        currentId: "missing", sequence: -8,
        skipped: ["missing", "missing"],
        knownEntries: [
          { id: firstBook, at: "bad" },
          { id: firstBook, at: "2026-08-11T10:00:00.000Z" },
          { id: secondBook, at: "2026-08-11T09:00:00.000Z" }
        ]
      }));
    }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book") || "null");
      return state?.sequence === 0 && state?.revision === 0 && state?.knownEntries?.length === 2;
    });
    assert.equal(await page.locator("#recordCount").textContent(), "2", "v3 duplicates and unsafe counters are normalized");
    process.stdout.write("storage-recovery-migration-and-repair-verified\n");

    await page.evaluate(() => DailyAtlasLock.transaction((lease) => lease.storage.clear()));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const secondTab = await context.newPage();
    await secondTab.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(secondTab);
    await Promise.all([
      page.locator("#bookCard .known-button").click(),
      secondTab.locator("#movieCard .known-button").click()
    ]);
    await page.waitForFunction(() => document.querySelector("#recordCount")?.textContent === "2");
    await secondTab.waitForFunction(() => document.querySelector("#recordCount")?.textContent === "2");
    const splitState = await page.evaluate(() => ({
      book: JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book")).knownEntries.length,
      movie: JSON.parse(localStorage.getItem("dailyAtlas.state.v3.movie")).knownEntries.length
    }));
    assert.deepEqual(splitState, { book: 1, movie: 1 }, "simultaneous edits to different types both survive");

    const sharedCity = (await page.locator(titleSelectors.city).textContent()).trim();
    await secondTab.waitForFunction((title) => document.querySelector("#cityCard .city-heading h3")?.textContent.trim() === title, sharedCity);
    await Promise.all([
      page.evaluate(() => document.querySelector("#cityCard .known-button").click()),
      secondTab.evaluate(() => document.querySelector("#cityCard .known-button").click())
    ]);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.city"))?.knownEntries?.length === 1);
    await secondTab.waitForFunction(() => document.querySelector("#recordCount")?.textContent === "3");
    const currentCityAfterRace = await page.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.city")).currentId);
    await secondTab.waitForFunction((expectedId) => document.querySelector("#cityCard .known-button")?.dataset.itemId === expectedId, currentCityAfterRace);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.city")).knownEntries.length), 1, "the same stale card is recorded once under a cross-tab lock");

    await page.locator("#germanCard .known-button").click();
    await secondTab.waitForFunction(() => document.querySelector("#recordCount")?.textContent === "4");
    await secondTab.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.german") || "null");
      return state?.version !== "0" && state?.knownEntries?.length === 1;
    });
    const germanBeforePeer = await knownIntent(secondTab, "german");
    const germanVersionBefore = await secondTab.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.german")).version);
    await secondTab.locator("#germanCard .swap-button").click();
    await secondTab.waitForFunction((previousVersion) => {
      const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.german") || "null");
      return state?.version && BigInt(state.version) > BigInt(previousVersion);
    }, germanVersionBefore);
    const latestGerman = await secondTab.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.german")));
    assert.notEqual(latestGerman.currentId, germanBeforePeer.id, "the peer tab actually advances to a different German item");
    await page.waitForFunction((expectedId) => document.querySelector("#germanCard .known-button")?.dataset.itemId === expectedId, latestGerman.currentId);
    const staleUndoUi = await page.evaluate(() => ({
      undoHidden: document.querySelector("#undoButton").hidden,
      toastHidden: document.querySelector("#toast").hidden,
      message: document.querySelector("#toastMessage").textContent,
      buttonId: document.querySelector("#germanCard .known-button")?.dataset.itemId
    }));
    assert.equal(staleUndoUi.undoHidden, true, `a stale undo is hidden after the peer tab's newer version renders: ${JSON.stringify(staleUndoUi)}`);
    const concurrentKnownCounts = await page.evaluate(() => Object.fromEntries(
      ["book", "movie", "city", "german", "medical"].map((type) => [
        type,
        JSON.parse(localStorage.getItem(`dailyAtlas.state.v3.${type}`) || "null")?.knownEntries?.length || 0
      ])
    ));
    assert.deepEqual(concurrentKnownCounts, { book: 1, movie: 1, city: 1, german: 1, medical: 0 }, "multi-tab actions retain exactly the four intended known records");
    assert.equal(await page.locator("#recordCount").textContent(), "4", "a stale undo is invalidated instead of overwriting the newer tab");
    await secondTab.close();
    process.stdout.write("multi-tab-concurrency-and-stale-undo-verified\n");

    const maxVersionContext = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const maxVersionA = await maxVersionContext.newPage();
    const maxVersionB = await maxVersionContext.newPage();
    for (const maxPage of [maxVersionA, maxVersionB]) maxPage.setDefaultTimeout(12000);
    await maxVersionA.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(maxVersionA);
    await maxVersionA.evaluate(() => DailyAtlasLock.transaction((lease) => {
      const storage = lease.storage;
      storage.clear();
      const date = globalThis.DailyAtlasEngine.localDateKey(new Date());
      const currentId = globalThis.DAILY_ATLAS_CATALOG.books[0].id;
      storage.setItem("dailyAtlas.state.v3.book", JSON.stringify({
        schemaVersion: 3,
        type: "book",
        date,
        revision: Number.MAX_SAFE_INTEGER,
        currentId,
        sequence: 0,
        skipped: [],
        knownEntries: []
      }));
    }));
    await maxVersionA.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(maxVersionA);
    await maxVersionB.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(maxVersionB);
    const maxOriginal = await knownIntent(maxVersionA, "book");
    await maxVersionA.locator("#bookCard .known-button").click();
    await maxVersionA.waitForFunction((originalId) =>
      document.querySelector("#bookCard .known-button")?.dataset.itemId !== originalId, maxOriginal.id);
    await maxVersionA.waitForFunction(async () => (await DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book") || "null")?.version)) === "9007199254740992");
    const maxPersisted = await maxVersionA.evaluate(() => DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book"))));
    await maxVersionB.waitForFunction((expectedId) => document.querySelector("#bookCard .known-button")?.dataset.itemId === expectedId, maxPersisted.currentId);
    assert.equal(maxPersisted.revision, Number.MAX_SAFE_INTEGER, "legacy numeric revision saturates safely");
    assert.equal(maxPersisted.knownEntries[0].id, maxOriginal.id, "the visible item is recorded at the numeric revision boundary");
    assert.notEqual((await knownIntent(maxVersionB, "book")).id, maxOriginal.id, "the peer tab accepts the monotonic string version");
    await maxVersionContext.close();
    process.stdout.write("max-safe-revision-cross-tab-version-verified\n");

    const longVersionContext = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const longVersionA = await longVersionContext.newPage();
    const longVersionB = await longVersionContext.newPage();
    const longVersionErrors = [];
    for (const longPage of [longVersionA, longVersionB]) {
      longPage.setDefaultTimeout(12000);
      longPage.on("pageerror", (error) => longVersionErrors.push(error.message));
    }
    const nines128 = "9".repeat(128);
    const digits129 = `1${"0".repeat(128)}`;
    const digits129AfterUndo = `1${"0".repeat(127)}1`;
    await longVersionA.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(longVersionA);
    await longVersionA.evaluate((version) => DailyAtlasLock.transaction((lease) => {
      const storage = lease.storage;
      storage.clear();
      const date = globalThis.DailyAtlasEngine.localDateKey(new Date());
      const currentId = globalThis.DAILY_ATLAS_CATALOG.books[0].id;
      storage.setItem("dailyAtlas.state.v3.book", JSON.stringify({
        schemaVersion: 3,
        type: "book",
        date,
        revision: Number.MAX_SAFE_INTEGER,
        version,
        currentId,
        sequence: 0,
        skipped: [],
        knownEntries: []
      }));
    }), nines128);
    await longVersionA.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(longVersionA);
    await longVersionB.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(longVersionB);
    const longOriginal = await knownIntent(longVersionA, "book");
    await longVersionA.locator("#bookCard .known-button").click();
    await longVersionA.waitForFunction((originalId) =>
      document.querySelector("#bookCard .known-button")?.dataset.itemId !== originalId, longOriginal.id);
    await longVersionA.waitForFunction(async (version) => (await DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book") || "null")?.version)) === version, digits129);
    const longChanged = await longVersionA.evaluate(() => DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book"))));
    await longVersionB.waitForFunction((expectedId) => document.querySelector("#bookCard .known-button")?.dataset.itemId === expectedId, longChanged.currentId);
    assert.equal(longChanged.knownEntries[0].id, longOriginal.id, "a 128-to-129 digit version transition records the visible item");
    assert.notEqual((await knownIntent(longVersionB, "book")).id, longOriginal.id, "the peer accepts a 129-digit version instead of repairing it to zero");
    await longVersionA.locator("#undoButton").click();
    await longVersionA.waitForFunction(async (version) => (await DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book") || "null")?.version)) === version, digits129AfterUndo);
    await longVersionB.waitForFunction((expectedId) => document.querySelector("#bookCard .known-button")?.dataset.itemId === expectedId, longOriginal.id);
    const longRestored = await longVersionB.evaluate(() => DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book"))));
    assert.equal(longRestored.currentId, longOriginal.id, "undo restores the original item after a 129-digit cross-tab update");
    assert.equal(longRestored.knownEntries.length, 0, "undo removes the long-term record after a 129-digit cross-tab update");
    assert.deepEqual(longVersionErrors, [], "long version synchronization and undo raise no page errors");
    await longVersionContext.close();
    process.stdout.write("unbounded-version-cross-tab-and-undo-verified\n");

    const maxSequenceContext = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const maxSequencePage = await maxSequenceContext.newPage();
    const maxSequenceErrors = [];
    maxSequencePage.setDefaultTimeout(12000);
    maxSequencePage.on("pageerror", (error) => maxSequenceErrors.push(error.message));
    await maxSequencePage.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(maxSequencePage);
    await maxSequencePage.evaluate(() => DailyAtlasLock.transaction((lease) => {
      const storage = lease.storage;
      storage.clear();
      const date = globalThis.DailyAtlasEngine.localDateKey(new Date());
      const currentId = globalThis.DAILY_ATLAS_CATALOG.books[0].id;
      storage.setItem("dailyAtlas.state.v3.book", JSON.stringify({
        schemaVersion: 3,
        type: "book",
        date,
        revision: 1,
        version: "1",
        currentId,
        sequence: Number.MAX_SAFE_INTEGER,
        skipped: [],
        knownEntries: []
      }));
    }));
    await maxSequencePage.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(maxSequencePage);
    const maxSequenceOriginal = await knownIntent(maxSequencePage, "book");
    await maxSequencePage.locator("#bookCard .swap-button").click();
    await maxSequencePage.waitForFunction((originalId) =>
      document.querySelector("#bookCard .known-button")?.dataset.itemId !== originalId, maxSequenceOriginal.id);
    await maxSequencePage.waitForFunction(async () => (await DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book") || "null")?.version)) === "2");
    const maxSequenceChanged = await maxSequencePage.evaluate(() => DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book"))));
    assert.equal(maxSequenceChanged.sequence, Number.MAX_SAFE_INTEGER, "a saturated safe sequence does not wrap during replacement");
    assert.notEqual(maxSequenceChanged.currentId, maxSequenceOriginal.id, "replacement still advances at the safe sequence boundary");
    await maxSequencePage.locator("#undoButton").click();
    await maxSequencePage.waitForFunction(async (expectedId) => {
      const state = await DailyAtlasLock.readStorage((storage) => JSON.parse(storage.getItem("dailyAtlas.state.v3.book") || "null"));
      return state?.version === "3" && state?.currentId === expectedId;
    }, maxSequenceOriginal.id);
    const maxSequenceRestored = await maxSequencePage.evaluate(() => DailyAtlasLock.readStorage((storage) =>
      JSON.parse(storage.getItem("dailyAtlas.state.v3.book"))));
    assert.equal(maxSequenceRestored.sequence, Number.MAX_SAFE_INTEGER, "undo restores the exact saturated sequence without subtracting one");
    assert.deepEqual(maxSequenceErrors, [], "safe sequence replacement and undo raise no page errors");
    await maxSequenceContext.close();
    process.stdout.write("max-safe-sequence-and-undo-verified\n");

    await page.evaluate(() => DailyAtlasLock.transaction((lease) => {
      const storage = lease.storage;
      const catalog = globalThis.DAILY_ATLAS_CATALOG;
      storage.clear();
      const date = globalThis.DailyAtlasEngine.localDateKey(new Date());
      storage.setItem("dailyAtlas.state.v3.city", JSON.stringify({
        schemaVersion: 3, type: "city", date, revision: 1,
        currentId: null, sequence: 0, skipped: [],
        knownEntries: catalog.cities.map((item, index) => ({ id: item.id, at: new Date(index).toISOString() }))
      }));
    }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.waitForSelector("#cityCard.exhausted-card");
    assert.match(await page.locator("#cityCard").innerText(), /暂时看完/);
    process.stdout.write("exhaustion-state-verified\n");

    const midnightContext = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      timezoneId: "Asia/Shanghai"
    });
    const beforeMidnight = Date.parse("2026-08-11T15:59:58.000Z");
    const afterMidnight = Date.parse("2026-08-11T16:00:02.000Z");
    await installControlledClock(midnightContext, beforeMidnight);
    const midnightA = await midnightContext.newPage();
    const midnightB = await midnightContext.newPage();
    for (const midnightPage of [midnightA, midnightB]) midnightPage.setDefaultTimeout(12000);
    const midnightErrors = [];
    for (const midnightPage of [midnightA, midnightB]) midnightPage.on("pageerror", (error) => midnightErrors.push(error.message));
    await midnightA.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(midnightA);
    await midnightA.evaluate(() => DailyAtlasLock.transaction((lease) => lease.storage.clear()));
    await midnightA.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(midnightA);
    await midnightB.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(midnightB);
    await midnightA.waitForFunction(() => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book") || "null")?.date === "2026-08-11");
    await Promise.all([midnightA, midnightB].map((midnightPage) => midnightPage.evaluate((value) => globalThis.__dailyAtlasSetNow(value), afterMidnight)));

    await midnightB.locator("#bookCard .known-button").click();
    await midnightB.waitForFunction(() => document.querySelector("#dateDay")?.textContent === "12");
    assert.equal(await midnightB.locator("#recordCount").textContent(), "0", "an old-day card click is not written after midnight");
    await midnightB.locator("#bookCard .known-button").click();
    await midnightB.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book") || "null");
      return state?.date === "2026-08-12" && state?.knownEntries?.length === 1;
    });
    await midnightA.waitForFunction(() => document.querySelector("#dateDay")?.textContent === "12");
    await assertAllCardDates(midnightA, "2026-08-12", "a cross-midnight storage event");
    const visibleMovie = await knownIntent(midnightA, "movie");
    await midnightA.locator("#movieCard .known-button").click();
    await midnightA.waitForFunction((visibleId) => {
      const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.movie") || "null");
      return state?.date === "2026-08-12" && state?.knownEntries?.some((entry) => entry.id === visibleId);
    }, visibleMovie.id);
    assert.deepEqual(midnightErrors, [], "cross-midnight tab synchronization raises no page errors");
    await midnightContext.close();
    process.stdout.write("cross-midnight-storage-and-visible-intent-verified\n");

    const animationContext = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      timezoneId: "Asia/Shanghai"
    });
    await installControlledClock(animationContext, Date.parse("2026-08-11T15:59:59.950Z"));
    const animationPage = await animationContext.newPage();
    animationPage.setDefaultTimeout(12000);
    const animationErrors = [];
    animationPage.on("pageerror", (error) => animationErrors.push(error.message));
    await animationPage.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(animationPage);
    await animationPage.evaluate(() => DailyAtlasLock.transaction((lease) => lease.storage.clear()));
    await animationPage.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(animationPage);
    await animationPage.evaluate((nextNow) => {
      document.querySelector("#bookCard .known-button").click();
      setTimeout(() => globalThis.__dailyAtlasSetNow(nextNow), 30);
    }, afterMidnight);
    await animationPage.waitForFunction(() => document.querySelector("#dateDay")?.textContent === "12");
    await assertAllCardDates(animationPage, "2026-08-12", "an action whose animation crosses midnight");
    assert.equal(await animationPage.locator("#recordCount").textContent(), "0", "the pre-midnight intent is not recorded after its animation delay");
    const animationVisibleMovie = await knownIntent(animationPage, "movie");
    await animationPage.locator("#movieCard .known-button").click();
    await animationPage.waitForFunction((visibleId) => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.movie") || "null")?.knownEntries?.some((entry) => entry.id === visibleId), animationVisibleMovie.id);
    assert.deepEqual(animationErrors, [], "animation-time midnight rollover raises no page errors");
    await animationContext.close();
    process.stdout.write("midnight-during-action-animation-verified\n");

    const undoContext = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      timezoneId: "Asia/Shanghai"
    });
    await installControlledClock(undoContext, beforeMidnight);
    const undoPage = await undoContext.newPage();
    undoPage.setDefaultTimeout(12000);
    const undoErrors = [];
    undoPage.on("pageerror", (error) => undoErrors.push(error.message));
    await undoPage.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(undoPage);
    await undoPage.evaluate(() => DailyAtlasLock.transaction((lease) => lease.storage.clear()));
    await undoPage.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(undoPage);
    await undoPage.locator("#bookCard .swap-button").click();
    await undoPage.waitForFunction(() => document.querySelector("#undoButton")?.hidden === false);
    await undoPage.evaluate((value) => {
      const visibleUndo = document.querySelector("#undoButton");
      globalThis.__dailyAtlasSetNow(value);
      visibleUndo.click();
    }, afterMidnight);
    await undoPage.waitForFunction(() => document.querySelector("#dateDay")?.textContent === "12");
    assert.equal(await undoPage.locator("#undoButton").isHidden(), true, "a prior-day undo is retired after midnight");
    assert.equal(await undoPage.locator("#recordCount").textContent(), "0", "a prior-day temporary swap does not create a long-term record");
    assert.deepEqual(undoErrors, [], "clicking a visible undo immediately after midnight raises no page errors");
    await undoContext.close();
    process.stdout.write("midnight-stale-undo-safety-verified\n");

    const fileContext = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const filePage = await fileContext.newPage();
    await filePage.route(/^https:\/\//, (route) => route.abort());
    await filePage.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "domcontentloaded" });
    await waitForAppReady(filePage);
    for (const selector of Object.values(titleSelectors)) await filePage.waitForSelector(selector);
    assert.equal(await filePage.locator(".swap-button").count(), 5, "double-click/file URL mode remains functional without remote images");
    assert.ok(await filePage.locator("#medicalCard img").evaluate((image) => image.naturalWidth > 0), "local medical art works in file mode");
    await fileContext.close();
    process.stdout.write("file-mode-offline-core-verified\n");

    const actionableErrors = consoleErrors.filter((message) => !/Failed to load resource|ERR_|favicon/i.test(message));
    assert.deepEqual(actionableErrors, [], `no JavaScript console errors: ${actionableErrors.join(" | ")}`);
    process.stdout.write(JSON.stringify({
      initial,
      knownMovieReplacement,
      consoleErrors: actionableErrors.length,
      screenshots: [
        path.relative(process.cwd(), path.join(screenshotDir, "daily-atlas-desktop.png")),
        path.relative(process.cwd(), path.join(screenshotDir, "daily-atlas-mobile.png"))
      ]
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
