const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg"
};

const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

async function waitForAppReady(page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    const lock = globalThis.DailyAtlasLock?.status?.();
    return cards.length === 5 && cards.every((card) => !card.hasAttribute("aria-busy")) &&
      lock?.backend === "indexeddb" && lock.pending === 0;
  });
}

async function runProbeRound(pages, round) {
  return Promise.all(pages.map((page, index) => page.evaluate(({ round, index }) =>
    DailyAtlasLock.transaction((lease) => {
      const owner = `${round}:${index}:${Math.random().toString(36).slice(2)}`;
      const start = performance.timeOrigin + performance.now();
      const deadline = performance.now() + 2 + ((round + index) % 3);
      while (performance.now() < deadline) {
        // Intentional synchronous work: an IndexedDB readwrite transaction must
        // keep every other same-store writer outside this critical section.
      }
      return { owner, sequence: lease.sequence, start, end: performance.timeOrigin + performance.now() };
    }), { round, index })));
}

function assertNoOverlap(intervals, label) {
  const ordered = intervals.slice().sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(
      ordered[index - 1].end <= ordered[index].start + 0.5,
      `${label}: critical sections overlap: ${JSON.stringify([ordered[index - 1], ordered[index]])}`
    );
  }
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const defaultEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const edgePath = process.env.EDGE_PATH || defaultEdge;
  const executablePath = fs.existsSync(edgePath) ? edgePath : undefined;
  const browser = await chromium.launch({ headless: true, executablePath, timeout: 15000 });
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  });
  const pages = await Promise.all(Array.from({ length: 4 }, () => context.newPage()));
  const [first, second] = pages;
  const errors = [];
  for (const page of pages) {
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/Failed to load resource|ERR_|favicon/i.test(message.text())) errors.push(message.text());
    });
  }

  try {
    await first.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(first);
    await first.evaluate(() => {
      localStorage.clear();
    });
    await first.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(first);
    for (const page of pages.slice(1)) {
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
    }

    assert.deepEqual(
      await Promise.all(pages.map((page) => page.evaluate(() => ({
        webLocks: typeof navigator.locks,
        indexedDB: typeof indexedDB?.open,
        backend: DailyAtlasLock.status().backend,
        legacyLocalStorageMutex: typeof DailyAtlasLock.createController
      })))),
      Array.from({ length: 4 }, () => ({
        webLocks: "undefined",
        indexedDB: "function",
        backend: "indexeddb",
        legacyLocalStorageMutex: "undefined"
      })),
      "all real browser pages use IndexedDB rather than the removed localStorage lease"
    );

    const probeSections = [];
    let twoPageSections = 0;
    for (let round = 0; round < 500; round += 1) {
      const intervals = await runProbeRound(pages.slice(0, 2), round);
      assertNoOverlap(intervals, `two-page round ${round + 1}`);
      probeSections.push(...intervals);
      twoPageSections += intervals.length;
    }
    let fourPageSections = 0;
    for (let round = 0; round < 100; round += 1) {
      const intervals = await runProbeRound(pages, 500 + round);
      assertNoOverlap(intervals, `four-page round ${round + 1}`);
      probeSections.push(...intervals);
      fourPageSections += intervals.length;
    }

    // Real localStorage is only a post-commit mirror and can be stale for a
    // moment in another renderer. Prove exclusion through the canonical IDB
    // lease instead: intervals cannot overlap and committed sequences must be
    // unique and gap-free across every accepted probe transaction.
    const probeSequences = probeSections.map((section) => section.sequence).sort((left, right) => left - right);
    assert.ok(probeSequences.every(Number.isSafeInteger), "every probe returns a safe IndexedDB lease sequence");
    assert.equal(new Set(probeSequences).size, probeSections.length, "every probe owns a unique IndexedDB lease sequence");
    for (let index = 1; index < probeSequences.length; index += 1) {
      assert.equal(probeSequences[index], probeSequences[index - 1] + 1, "probe lease sequences are gap-free");
    }

    const mutexRecord = await first.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("daily-atlas-coordination", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("mutex", "readonly");
        const read = tx.objectStore("mutex").get("daily-atlas:transaction");
        read.onerror = () => reject(read.error);
        read.onsuccess = () => resolve(read.result || null);
        tx.oncomplete = () => db.close();
      };
    }));
    assert.equal(
      mutexRecord?.sequence,
      probeSequences.at(-1),
      "the IndexedDB mutex ends at the final committed probe sequence"
    );
    assert.equal(probeSections.length, twoPageSections + fourPageSections, "every requested critical section returns evidence");

    const before = await first.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book")));
    assert.ok(before?.currentId, "the initial persisted book exists");
    await Promise.all([first, second].map((page) => page.waitForFunction((id) =>
      document.querySelector("#bookCard .known-button")?.dataset.itemId === id,
    before.currentId)));

    const knownAction = first.evaluate(() => document.querySelector("#bookCard .known-button").click());
    const swapAction = second.evaluate(() => document.querySelector("#bookCard .swap-button").click());
    await Promise.all([knownAction, swapAction]);

    await first.waitForFunction(({ oldId, oldVersion }) => {
      const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book") || "null");
      return state?.currentId !== oldId && BigInt(state?.version || "0") > BigInt(oldVersion);
    }, { oldId: before.currentId, oldVersion: before.version });
    await Promise.all([first, second].map((page) => page.evaluate(() => DailyAtlasLock.whenIdle())));
    const after = await first.evaluate(() => JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book")));
    await Promise.all([first, second].map((page) => page.waitForFunction((id) =>
      document.querySelector("#bookCard .known-button")?.dataset.itemId === id &&
      !document.querySelector("#bookCard .known-button").disabled,
    after.currentId)));

    const messages = await Promise.all([first, second].map((page) => page.locator("#toastMessage").textContent()));
    const successful = messages.filter((message) => /已标记为读过了|已仅在今天跳过/.test(message));
    const stale = messages.filter((message) => /另一标签页/.test(message));
    assert.equal(successful.length, 1, `exactly one old-card intent reports success: ${JSON.stringify(messages)}`);
    assert.equal(stale.length, 1, `the losing old-card intent is explicitly reported stale: ${JSON.stringify(messages)}`);
    assert.equal(BigInt(after.version), BigInt(before.version) + 1n, "the old card is committed exactly once");
    assert.equal(after.revision, before.revision + 1, "the numeric revision advances exactly once");
    assert.equal(after.skipped.filter((id) => id === before.currentId).length, 1, "the old card is skipped exactly once");

    const knownSuccess = /已标记为读过了/.test(messages[0]);
    assert.equal(
      after.knownEntries.filter((entry) => entry.id === before.currentId).length,
      knownSuccess ? 1 : 0,
      "the committed intent alone determines whether the old card enters long-term known records"
    );
    assert.deepEqual(
      await Promise.all([first, second].map((page) => page.locator("#bookCard .known-button").getAttribute("data-item-id"))),
      [after.currentId, after.currentId],
      "both tabs converge on the committed replacement"
    );
    assert.equal(
      await first.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("dailyAtlas.lock.v1.")).length),
      0,
      "the retired localStorage mutex creates no records"
    );
    assert.deepEqual(errors, [], `IndexedDB fallback race raises no JavaScript errors: ${errors.join(" | ")}`);

    process.stdout.write(`${JSON.stringify({
      browser: executablePath ? "Microsoft Edge" : "Playwright Chromium",
      webLocks: false,
      fallbackBackend: "indexeddb",
      directMutex: {
        twoPageRounds: 500,
        twoPageCriticalSections: twoPageSections,
        fourPageRounds: 100,
        fourPageCriticalSections: fourPageSections,
        overlapViolations: 0,
        mutexSequence: mutexRecord.sequence
      },
      oldBookId: before.currentId,
      committedBookId: after.currentId,
      versionBefore: before.version,
      versionAfter: after.version,
      winningIntent: knownSuccess ? "known" : "today-only-swap",
      messages,
      remainingLegacyLockRecords: 0,
      errors: errors.length
    }, null, 2)}\n`);
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
