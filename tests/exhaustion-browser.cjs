const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY ||= "1";

const root = path.resolve(process.env.DAILY_ATLAS_ROOT || path.join(__dirname, ".."));
const mime = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
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
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch (_error) {
    response.writeHead(400).end("Bad request");
    return;
  }
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

async function waitForApp(page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    return cards.length === 5 && cards.every((card) => !card.hasAttribute("aria-busy"));
  });
}

async function installScenario(page, mode) {
  await page.evaluate((scenario) => {
    const type = "city";
    const ids = globalThis.DAILY_ATLAS_CATALOG.cities.map((item) => item.id);
    const date = globalThis.DailyAtlasEngine.localDateKey(new Date());
    let skipped = [];
    let knownIds = [];
    let unsuitableIds = [];

    if (scenario === "today-skipped") skipped = ids.slice();
    if (scenario === "known") knownIds = ids.slice();
    if (scenario === "unsuitable") unsuitableIds = ids.slice();
    if (scenario === "mixed") {
      knownIds = ids.filter((_id, index) => index % 2 === 0);
      unsuitableIds = ids.filter((_id, index) => index % 2 === 1);
    }

    let profile = globalThis.DailyAtlasProfile.emptyProfile();
    for (const [index, id] of unsuitableIds.entries()) {
      profile = globalThis.DailyAtlasProfile.setFeedback(
        profile,
        type,
        id,
        "unsuitable",
        true,
        new Date(Date.UTC(2026, 0, 2, 0, 0, index))
      );
    }
    return DailyAtlasLock.transaction((lease) => {
      const storage = lease.storage;
      storage.clear();
      storage.setItem(`dailyAtlas.state.v3.${type}`, JSON.stringify({
        schemaVersion: 3,
        type,
        date,
        revision: 1,
        version: "1",
        currentId: null,
        sequence: 0,
        skipped,
        knownEntries: knownIds.map((id, index) => ({
          id,
          at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
        }))
      }));
      storage.setItem(globalThis.DailyAtlasProfile.STORAGE_KEY, JSON.stringify(profile));
    });
  }, mode);
}

async function runScenario(browser, origin, mode) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await installScenario(page, mode);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#cityCard.exhausted-card");
    await waitForApp(page);

    const result = await page.evaluate(() => DailyAtlasLock.readStorage((storage) => {
      const state = JSON.parse(storage.getItem("dailyAtlas.state.v3.city"));
      const profile = JSON.parse(storage.getItem("dailyAtlas.profile.v1"));
      const unsuitableCount = Object.values(profile.feedback.city)
        .filter((entry) => entry.unsuitable === true).length;
      return {
        text: document.querySelector("#cityCard").innerText.replace(/\s+/g, " ").trim(),
        skippedCount: state.skipped.length,
        knownCount: state.knownEntries.length,
        unsuitableCount,
        currentId: state.currentId
      };
    }));

    assert.equal(result.currentId, null, `${mode}: exhausted state keeps no current city`);
    assert.deepEqual(runtimeErrors, [], `${mode}: page produces no runtime errors`);
    return result;
  } finally {
    await context.close();
  }
}

(async () => {
  const port = await listen();
  const edgePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(edgePath) ? edgePath : undefined,
    timeout: 15000
  });
  const report = {};

  try {
    const origin = `http://127.0.0.1:${port}`;

    report.todaySkipped = await runScenario(browser, origin, "today-skipped");
    assert.equal(report.todaySkipped.skippedCount, 200, "today-skipped: all 200 cities are excluded only for today");
    assert.equal(report.todaySkipped.knownCount, 0, "today-skipped: no long-term known record is present");
    assert.equal(report.todaySkipped.unsuitableCount, 0, "today-skipped: no unsuitable preference is present");
    assert.match(report.todaySkipped.text, /仅今天跳过的内容会在明天恢复/, "today-skipped: copy explicitly promises next-day restoration");
    assert.doesNotMatch(report.todaySkipped.text, /明天不会自动恢复/, "today-skipped: copy does not claim a permanent exclusion");
    process.stdout.write("PASS today-skipped exhaustion recovers tomorrow\n");

    report.known = await runScenario(browser, origin, "known");
    assert.equal(report.known.skippedCount, 0, "known: no today-only skip is present");
    assert.equal(report.known.knownCount, 200, "known: all 200 cities are long-term records");
    assert.equal(report.known.unsuitableCount, 0, "known: no unsuitable preference is present");
    assert.match(report.known.text, /长期记录/, "known: copy identifies the long-term exclusion source");
    assert.match(report.known.text, /明天不会自动恢复/, "known: copy explicitly says tomorrow does not restore the pool");
    assert.doesNotMatch(report.known.text, /仅今天跳过的内容会在明天恢复/, "known: copy never suggests waiting until tomorrow");
    process.stdout.write("PASS all-known exhaustion stays excluded tomorrow\n");

    report.unsuitable = await runScenario(browser, origin, "unsuitable");
    assert.equal(report.unsuitable.skippedCount, 0, "unsuitable: no today-only skip is present");
    assert.equal(report.unsuitable.knownCount, 0, "unsuitable: no known record is present");
    assert.equal(report.unsuitable.unsuitableCount, 200, "unsuitable: all 200 cities are excluded by preference");
    assert.match(report.unsuitable.text, /标记为不适合/, "unsuitable: copy identifies the unsuitable exclusion source");
    assert.match(report.unsuitable.text, /重置偏好/, "unsuitable: copy tells the user how to restore preference-excluded candidates");
    assert.match(report.unsuitable.text, /明天不会自动恢复/, "unsuitable: copy explicitly says tomorrow does not restore the pool");
    assert.doesNotMatch(report.unsuitable.text, /仅今天跳过的内容会在明天恢复/, "unsuitable: copy never suggests waiting until tomorrow");
    process.stdout.write("PASS all-unsuitable exhaustion explains recovery path\n");

    report.mixed = await runScenario(browser, origin, "mixed");
    assert.equal(report.mixed.skippedCount, 0, "mixed: no today-only skip is present");
    assert.equal(report.mixed.knownCount, 100, "mixed: half the cities are long-term records");
    assert.equal(report.mixed.unsuitableCount, 100, "mixed: half the cities are unsuitable");
    assert.match(report.mixed.text, /长期记录/, "mixed: copy mentions long-term records");
    assert.match(report.mixed.text, /标记为不适合/, "mixed: copy mentions unsuitable preferences");
    assert.match(report.mixed.text, /明天不会自动恢复/, "mixed: copy explicitly says tomorrow does not restore the pool");
    assert.doesNotMatch(report.mixed.text, /仅今天跳过的内容会在明天恢复|明天再来/, "mixed: copy never gives a false wait-until-tomorrow instruction");
    process.stdout.write("PASS mixed long-term exhaustion stays excluded tomorrow\n");

    process.stdout.write(`${JSON.stringify({ status: "PASS", scenarios: report }, null, 2)}\n`);
  } finally {
    await browser.close();
    await closeServer();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
