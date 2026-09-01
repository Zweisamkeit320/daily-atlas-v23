const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
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
  let relative;
  try {
    relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  } catch (_error) {
    response.writeHead(400).end("Bad request");
    return;
  }
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

async function waitForAppReady(page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    return cards.length === 5 && cards.every((card) => !card.hasAttribute("aria-busy") && card.querySelector("[data-item-id]"));
  });
  await page.evaluate(async () => {
    await globalThis.DailyAtlasPreferencePersistence?.whenIdle?.();
    await globalThis.DailyAtlasLock?.whenIdle?.();
  });
}

async function createContext(browser, noWebLocks) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  await context.addInitScript(() => {
    const voices = [
      { voiceURI: "barrier-voice-a", name: "Barrier A", lang: "de-DE", localService: true, default: true },
      { voiceURI: "barrier-voice-b", name: "Barrier B", lang: "de-DE", localService: true, default: false }
    ];
    const synth = {
      getVoices: () => voices.slice(),
      addEventListener() {},
      removeEventListener() {},
      speak(utterance) { utterance.onstart?.(); },
      cancel() {}
    };
    class Utterance {
      constructor(text) { this.text = text; this.lang = ""; this.voice = null; }
    }
    class FakeNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";
      constructor() {}
      close() {}
    }
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    Object.defineProperty(window, "Notification", { configurable: true, value: FakeNotification });
  });
  if (noWebLocks) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    });
  }
  return context;
}

function observePage(page, errors) {
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|ERR_|favicon|service worker/i.test(message.text())) errors.push(message.text());
  });
}

async function preparePair(context, origin) {
  const errors = [];
  const owner = await context.newPage();
  const peer = await context.newPage();
  observePage(owner, errors);
  observePage(peer, errors);
  await owner.goto(origin, { waitUntil: "domcontentloaded" });
  await waitForAppReady(owner);
  await owner.evaluate(() => localStorage.clear());
  await owner.reload({ waitUntil: "domcontentloaded" });
  await waitForAppReady(owner);
  await peer.goto(origin, { waitUntil: "domcontentloaded" });
  await waitForAppReady(peer);
  return { owner, peer, errors };
}

async function holdPeerJournal(owner) {
  await owner.evaluate(() => {
    window.__releasePeerJournal = false;
    window.__peerJournalHeld = false;
    window.__peerJournalDone = false;
    window.__peerJournalError = null;
    if (typeof navigator.locks?.request === "function") {
      void navigator.locks.request("daily-atlas:transaction", async () => {
        localStorage.setItem(DailyAtlasBackup.PENDING_KEY, JSON.stringify({ schemaVersion: 2, testOnly: true }));
        window.__peerJournalHeld = true;
        await new Promise((resolve) => { window.__releasePeerJournal = resolve; });
        localStorage.removeItem(DailyAtlasBackup.PENDING_KEY);
      }).catch((error) => { window.__peerJournalError = error?.message || String(error); })
        .finally(() => { window.__peerJournalDone = true; });
      return;
    }
    const open = indexedDB.open("daily-atlas-coordination", 1);
    open.onerror = () => { window.__peerJournalError = open.error?.message || "IndexedDB open failed"; };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("mutex", "readwrite");
      const store = tx.objectStore("mutex");
      const keepAlive = () => {
        const request = store.get("daily-atlas:transaction");
        request.onerror = () => { window.__peerJournalError = request.error?.message || "IndexedDB gate failed"; };
        request.onsuccess = () => {
          if (!window.__peerJournalHeld) {
            localStorage.setItem(DailyAtlasBackup.PENDING_KEY, JSON.stringify({ schemaVersion: 2, testOnly: true }));
            window.__peerJournalHeld = true;
          }
          if (window.__releasePeerJournal === true) {
            localStorage.removeItem(DailyAtlasBackup.PENDING_KEY);
            store.put({ name: "daily-atlas:transaction", sequence: request.result?.sequence || 0, committedAt: new Date().toISOString() });
          } else keepAlive();
        };
      };
      tx.oncomplete = () => { window.__peerJournalDone = true; db.close(); };
      tx.onabort = () => {
        window.__peerJournalError = tx.error?.message || "IndexedDB test gate aborted";
        window.__peerJournalDone = true;
        db.close();
      };
      keepAlive();
    };
  });
  await owner.waitForFunction(() => window.__peerJournalHeld || window.__peerJournalError);
  assert.equal(await owner.evaluate(() => window.__peerJournalError), null, "test owner acquires the production transaction lock");
}

async function releasePeerJournal(owner) {
  await owner.evaluate(() => {
    if (typeof window.__releasePeerJournal === "function") window.__releasePeerJournal();
    else if (window.__peerJournalHeld) window.__releasePeerJournal = true;
    else throw new Error("peer journal gate is not held");
  });
  await owner.waitForFunction(() => window.__peerJournalDone || window.__peerJournalError);
}

async function waitForPeerJournal(peer) {
  await peer.waitForFunction(() => document.querySelector("#backupStatus")?.textContent.includes("另一标签页正在更新本地数据"));
}

async function waitForContenders(page, minimumPending) {
  await page.waitForFunction(({ minimumPending }) => DailyAtlasLock.status().pending >= minimumPending, { minimumPending });
}

async function queueSlowPageTransaction(peer) {
  await peer.evaluate(() => {
    window.__slowTransactionDone = false;
    window.__slowTransactionError = null;
    window.__slowTransactionQueued = false;
    window.__slowTransactionStarted = false;
    if (typeof navigator.locks?.request === "function") {
      const operation = navigator.locks.request("daily-atlas:transaction", async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      }).catch((error) => { window.__slowTransactionError = error?.message || String(error); })
        .finally(() => { window.__slowTransactionDone = true; });
      window.__slowTransactionQueued = Boolean(operation);
      return;
    }
    const open = indexedDB.open("daily-atlas-coordination", 1);
    open.onerror = () => { window.__slowTransactionError = open.error?.message || "IndexedDB open failed"; };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("mutex", "readwrite");
      const store = tx.objectStore("mutex");
      window.__slowTransactionQueued = true;
      let release = false;
      const keepAlive = () => {
        const request = store.get("daily-atlas:transaction");
        request.onerror = () => { window.__slowTransactionError = request.error?.message || "IndexedDB gate failed"; };
        request.onsuccess = () => {
          if (!window.__slowTransactionStarted) {
            window.__slowTransactionStarted = true;
            setTimeout(() => { release = true; }, 450);
          }
          if (release) store.put({ name: "daily-atlas:transaction", sequence: request.result?.sequence || 0, committedAt: new Date().toISOString() });
          else keepAlive();
        };
      };
      tx.oncomplete = () => { window.__slowTransactionDone = true; db.close(); };
      tx.onabort = () => {
        window.__slowTransactionError = tx.error?.message || "IndexedDB slow gate aborted";
        window.__slowTransactionDone = true;
        db.close();
      };
      keepAlive();
    };
  });
  await peer.waitForFunction(() => window.__slowTransactionQueued || window.__slowTransactionError);
  assert.equal(await peer.evaluate(() => window.__slowTransactionError), null, "slow test gate is queued before optional intents");
}

async function optionalIntentScenario(browser, origin, noWebLocks) {
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  const context = await createContext(browser, noWebLocks);
  try {
    const { owner, peer, errors } = await preparePair(context, origin);
    await holdPeerJournal(owner);
    await waitForPeerJournal(peer);
    await queueSlowPageTransaction(peer);

    await peer.locator("#musicVolume").fill("73");
    await peer.locator("#settingsButton").click();
    await peer.locator("#backgroundColor").selectOption("sky");
    await peer.locator("#backgroundStyle").selectOption("botanical");
    await peer.locator("#speechVoiceSelect").selectOption("barrier-voice-b");
    await peer.locator("#reminderTime").fill("07:37");
    await peer.locator("#enableReminderButton").click();
    await waitForContenders(peer, 5);

    const navigation = peer.waitForNavigation({ waitUntil: "domcontentloaded" });
    await releasePeerJournal(owner);
    await navigation;
    await waitForAppReady(peer);
    const persisted = await peer.evaluate(() => ({
      audioV1: JSON.parse(localStorage.getItem("dailyAtlas.audio.v1") || "null"),
      audioV2: JSON.parse(localStorage.getItem("dailyAtlas.audio.v2") || "null"),
      appearance: JSON.parse(localStorage.getItem("dailyAtlas.appearance.v1") || "null"),
      speech: JSON.parse(localStorage.getItem("dailyAtlas.speech.v1") || "null"),
      reminder: JSON.parse(localStorage.getItem("dailyAtlas.reminder.v1") || "null"),
      journal: localStorage.getItem("dailyAtlas.import.pending.v1"),
      lockStatus: typeof DailyAtlasLock.status === "function" ? DailyAtlasLock.status() : null,
      appearanceState: DailyAtlasAppearance.getState(),
      documentAppearance: {
        color: document.documentElement.dataset.backgroundColor,
        style: document.documentElement.dataset.backgroundStyle
      }
    }));
    assert.deepEqual(persisted.audioV1, { volume: 0.73 }, `${mode}: queued music v1 intent survives deferred reload`);
    assert.equal(persisted.audioV2?.volume, 0.73, `${mode}: queued music v2 intent survives deferred reload`);
    assert.deepEqual(persisted.appearance, {
      schemaVersion: 1,
      color: "sky",
      style: "botanical",
      density: "comfortable",
      dataSaver: false,
      textSize: "default",
      contrast: "default",
      motion: "system"
    }, `${mode}: queued appearance intents survive deferred reload`);
    assert.equal(persisted.appearanceState.color, "sky", `${mode}: appearance module reloads the saved color`);
    assert.equal(persisted.appearanceState.style, "botanical", `${mode}: appearance module reloads the saved style`);
    assert.deepEqual(persisted.documentAppearance, { color: "sky", style: "botanical" }, `${mode}: document receives the saved appearance after reload`);
    assert.deepEqual(persisted.speech, { voiceURI: "barrier-voice-b" }, `${mode}: queued speech intent survives deferred reload`);
    assert.equal(persisted.reminder?.enabled, true, `${mode}: queued reminder intent survives deferred reload`);
    assert.equal(persisted.reminder?.time, "07:37", `${mode}: queued reminder time survives deferred reload`);
    assert.equal(persisted.journal, null, `${mode}: peer journal is cleared`);
    assert.deepEqual(errors, [], `${mode}: optional intent scenario has no uncaught browser errors: ${errors.join(" | ")}`);
    return { mode, optional: "pass" };
  } finally {
    await context.close();
  }
}

async function realCancelScenario(browser, origin, noWebLocks) {
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  const context = await createContext(browser, noWebLocks);
  try {
    const { owner, peer, errors } = await preparePair(context, origin);
    await holdPeerJournal(owner);
    await waitForPeerJournal(peer);
    await peer.locator("#settingsButton").click();

    const session = await context.newCDPSession(peer);
    await peer.evaluate(() => {
      const input = document.querySelector("#importBackupFile");
      input.click = () => { window.__stubbedChooserIntent = true; };
    });
    let navigations = 0;
    peer.on("framenavigated", (frame) => { if (frame === peer.mainFrame()) navigations += 1; });
    await peer.locator("#importBackupButton").click();
    await peer.waitForFunction(() => window.__stubbedChooserIntent === true);

    await releasePeerJournal(owner);
    await peer.waitForTimeout(220);
    assert.equal(navigations, 0, `${mode}: a peer commit defers reload while the file chooser intent remains active`);

    await peer.evaluate(() => {
      const input = document.querySelector("#importBackupFile");
      delete input.click;
      window.__fileChooserCancelled = false;
      input.addEventListener("cancel", () => { window.__fileChooserCancelled = true; }, { once: true });
    });
    await session.send("Page.setInterceptFileChooserDialog", { enabled: true, cancel: true });
    const navigation = peer.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 3000 });
    await peer.locator("#importBackupButton").click({ noWaitAfter: true });
    await navigation;
    await waitForAppReady(peer);
    assert.equal(navigations, 1, `${mode}: the browser's real file chooser cancel executes the deferred reload exactly once`);
    assert.deepEqual(errors, [], `${mode}: real cancel scenario has no uncaught browser errors: ${errors.join(" | ")}`);
    return { mode, cancel: "pass" };
  } finally {
    await context.close();
  }
}

async function appearanceConvergenceScenario(browser, origin, noWebLocks) {
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  const context = await createContext(browser, noWebLocks);
  try {
    const { owner, peer, errors } = await preparePair(context, origin);
    await Promise.all([
      owner.locator("#settingsButton").click(),
      peer.locator("#settingsButton").click()
    ]);
    const colors = ["paper", "sage", "sky", "peach", "lavender", "sand"];
    const styles = ["editorial", "clean", "botanical", "aurora"];

    for (let round = 0; round < 50; round += 1) {
      const baseline = {
        schemaVersion: 1,
        color: colors[round % colors.length],
        style: styles[round % styles.length]
      };
      const expected = {
        schemaVersion: 1,
        color: colors[(round + 1) % colors.length],
        style: styles[(round + 1) % styles.length],
        density: "comfortable",
        dataSaver: false,
        textSize: "default",
        contrast: "default",
        motion: "system"
      };
      await owner.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
        key: "dailyAtlas.appearance.v1",
        value: baseline
      });
      await Promise.all([owner, peer].map((page) => page.evaluate(() => DailyAtlasAppearance.initialize())));

      await Promise.all([
        owner.locator("#backgroundColor").selectOption(expected.color),
        peer.locator("#backgroundStyle").selectOption(expected.style)
      ]);
      await Promise.all([owner, peer].map((page) => page.evaluate(async () => {
        await DailyAtlasAppearance.whenSaved();
        await DailyAtlasLock.whenIdle();
      })));
      await Promise.all([owner, peer].map((page) => page.waitForFunction((wanted) => {
        const stored = JSON.parse(localStorage.getItem("dailyAtlas.appearance.v1") || "null");
        const state = DailyAtlasAppearance.getState();
        return stored?.color === wanted.color && stored?.style === wanted.style
          && state.color === wanted.color && state.style === wanted.style;
      }, expected)));
      await owner.waitForTimeout(40);

      const snapshots = await Promise.all([owner, peer].map((page) => page.evaluate(() => ({
        stored: JSON.parse(localStorage.getItem("dailyAtlas.appearance.v1") || "null"),
        state: DailyAtlasAppearance.getState(),
        document: {
          color: document.documentElement.dataset.backgroundColor,
          style: document.documentElement.dataset.backgroundStyle
        }
      }))));
      for (const snapshot of snapshots) {
        assert.deepEqual(snapshot.stored, expected, `${mode} round ${round + 1}: canonical appearance keeps both fields`);
        assert.equal(snapshot.state.color, expected.color, `${mode} round ${round + 1}: page color converges`);
        assert.equal(snapshot.state.style, expected.style, `${mode} round ${round + 1}: page style converges`);
        assert.deepEqual(snapshot.document, { color: expected.color, style: expected.style },
          `${mode} round ${round + 1}: document appearance converges`);
      }
    }

    assert.deepEqual(errors, [], `${mode}: appearance convergence has no uncaught browser errors: ${errors.join(" | ")}`);
    return { mode, appearance: "50/50 pass" };
  } finally {
    await context.close();
  }
}

async function optionalFieldMergeScenario(browser, origin, noWebLocks) {
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  const context = await createContext(browser, noWebLocks);
  try {
    const { owner, peer, errors } = await preparePair(context, origin);
    const trackIds = await owner.evaluate(() => DailyAtlasMusic.TRACKS.slice(0, 60).map((track) => track.id));

    for (let round = 0; round < 50; round += 1) {
      const volume = (11 + (round * 13) % 78) / 100;
      const trackId = trackIds[(round + 1) % trackIds.length];
      const enabled = round % 2 === 0;
      const hour = String(6 + round % 17).padStart(2, "0");
      const minute = String((round * 7) % 60).padStart(2, "0");
      const time = `${hour}:${minute}`;

      await Promise.all([
        owner.evaluate((nextVolume) => DailyAtlasMusic.setVolume(nextVolume), volume),
        peer.evaluate((nextTrackId) => DailyAtlasMusic.setTrack(nextTrackId), trackId),
        owner.evaluate((nextTime) => DailyAtlasReminders.configure({ time: nextTime }), time),
        peer.evaluate((nextEnabled) => DailyAtlasReminders.configure({ enabled: nextEnabled }), enabled)
      ]);
      await Promise.all([owner, peer].map((page) => page.evaluate(() => DailyAtlasLock.whenIdle())));

      const canonical = await owner.evaluate(() => DailyAtlasLock.readStorage((storage) => ({
        audioV1: JSON.parse(storage.getItem("dailyAtlas.audio.v1") || "null"),
        audioV2: JSON.parse(storage.getItem("dailyAtlas.audio.v2") || "null"),
        reminder: JSON.parse(storage.getItem("dailyAtlas.reminder.v1") || "null")
      })));
      assert.deepEqual(canonical.audioV1, { volume }, `${mode} round ${round + 1}: audio v1 follows the committed volume patch`);
      assert.deepEqual(canonical.audioV2, { volume, trackId }, `${mode} round ${round + 1}: concurrent volume and track patches both survive`);
      assert.equal(canonical.reminder?.enabled, enabled, `${mode} round ${round + 1}: reminder enabled patch survives`);
      assert.equal(canonical.reminder?.time, time, `${mode} round ${round + 1}: concurrent reminder time patch survives`);
    }

    assert.deepEqual(errors, [], `${mode}: optional field merges have no uncaught browser errors: ${errors.join(" | ")}`);
    return { mode, optionalFields: "50/50 pass" };
  } finally {
    await context.close();
  }
}

(async () => {
  const port = await listen();
  const origin = `http://127.0.0.1:${port}`;
  const edgePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const executablePath = fs.existsSync(edgePath) ? edgePath : undefined;
  const browser = await chromium.launch({ headless: true, executablePath, timeout: 20000 });
  const report = {
    browser: executablePath ? `Microsoft Edge ${browser.version()}` : `Playwright Chromium ${browser.version()}`,
    origin,
    scenarios: []
  };
  const failures = [];
  try {
    for (const noWebLocks of [false, true]) {
      for (const scenario of [optionalIntentScenario, realCancelScenario, appearanceConvergenceScenario, optionalFieldMergeScenario]) {
        try {
          const result = await scenario(browser, origin, noWebLocks);
          report.scenarios.push(result);
          process.stdout.write(`PASS ${Object.values(result).join(" · ")}\n`);
        } catch (error) {
          failures.push(error);
          process.stderr.write(`FAIL ${noWebLocks ? "IndexedDB fallback" : "Web Locks"} · ${scenario.name}: ${error.message}\n`);
        }
      }
    }
    report.failures = failures.map((error) => error.message);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (failures.length) throw new AggregateError(failures, `${failures.length} optional transaction barrier scenario(s) failed`);
  } finally {
    await browser.close();
    await closeServer();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
