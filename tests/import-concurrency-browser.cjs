const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const rounds = Math.max(10, Number.parseInt(process.env.IMPORT_RACE_ROUNDS || "10", 10) || 10);
const transactionRounds = Math.max(10, Number.parseInt(process.env.TRANSACTION_RACE_ROUNDS || "10", 10) || 10);
const types = Object.freeze(["book", "movie", "city", "german", "medical"]);
const targetKeys = Object.freeze([
  "dailyAtlas.profile.v1",
  ...types.map((type) => `dailyAtlas.state.v3.${type}`),
  "dailyAtlas.appearance.v1",
  "dailyAtlas.audio.v1",
  "dailyAtlas.audio.v2",
  "dailyAtlas.speech.v1",
  "dailyAtlas.reminder.v1"
]);
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
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll("article.recommendation-card")];
      return cards.length === 5 && cards.every((card) => !card.hasAttribute("aria-busy") && card.querySelector("[data-item-id]"));
    });
    await page.evaluate(async () => {
      await globalThis.DailyAtlasPreferencePersistence?.whenIdle?.();
      await globalThis.DailyAtlasLock?.whenIdle?.();
    });
    const loadToken = await page.evaluate(() => performance.timeOrigin);
    await page.waitForTimeout(180);
    const stable = await page.evaluate((token) => {
      const cards = [...document.querySelectorAll("article.recommendation-card")];
      return performance.timeOrigin === token && cards.length === 5 &&
        cards.every((card) => !card.hasAttribute("aria-busy") && card.querySelector("[data-item-id]"));
    }, loadToken).catch(() => false);
    if (stable) return;
  }
  throw new Error("Application did not reach a navigation-stable ready state");
}

async function installVoiceHarness(context) {
  await context.addInitScript(() => {
    const voices = [
      { voiceURI: "race-voice-a", name: "Race A", lang: "de-DE", localService: true, default: true },
      { voiceURI: "race-voice-b", name: "Race B", lang: "de-DE", localService: true, default: false },
      { voiceURI: "journal-voice", name: "Journal", lang: "de-DE", localService: true, default: false }
    ];
    const synth = {
      getVoices: () => voices.slice(),
      addEventListener() {},
      removeEventListener() {},
      speak(utterance) { utterance.onstart?.(); },
      cancel() {}
    };
    class Utterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.voice = null;
      }
    }
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
  });
}

async function createContext(browser, noWebLocks) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
    acceptDownloads: true
  });
  await installVoiceHarness(context);
  if (noWebLocks) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    });
  }
  return context;
}

function observePage(page, errors) {
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|ERR_|favicon|service worker/i.test(message.text())) errors.push(message.text());
  });
}

async function preparePair(context, origin) {
  const errors = [];
  const first = await context.newPage();
  const second = await context.newPage();
  observePage(first, errors);
  observePage(second, errors);
  await first.goto(origin, { waitUntil: "domcontentloaded" });
  await waitForAppReady(first);
  await first.evaluate(() => localStorage.clear());
  await first.reload({ waitUntil: "domcontentloaded" });
  await waitForAppReady(first);
  await second.goto(origin, { waitUntil: "domcontentloaded" });
  await waitForAppReady(second);
  return { first, second, errors };
}

async function buildCompetingBackups(page, round) {
  return page.evaluate(({ round, types }) => {
    const collections = { book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" };
    const variants = [
      {
        name: "A",
        index: 11 + (round % 20),
        region: "亚洲",
        trackId: "morning-harbor",
        volume: 0.21,
        voiceURI: "race-voice-a",
        reminderTime: "06:11",
        backgroundColor: "sage",
        backgroundStyle: "botanical",
        germanLevel: "A1"
      },
      {
        name: "B",
        index: 41 + (round % 20),
        region: "欧洲",
        trackId: "sea-salt-breeze",
        volume: 0.79,
        voiceURI: "race-voice-b",
        reminderTime: "21:49",
        backgroundColor: "lavender",
        backgroundStyle: "aurora",
        germanLevel: "B2"
      }
    ];
    const date = DailyAtlasEngine.localDateKey(new Date());
    return variants.map((variant, variantIndex) => {
      const ids = Object.fromEntries(types.map((type) => {
        const collection = DAILY_ATLAS_CATALOG[collections[type]];
        return [type, collection[(variant.index + variantIndex) % collection.length].id];
      }));
      let profile = DailyAtlasProfile.emptyProfile();
      const timestamp = new Date(`2026-08-12T${variantIndex ? "10" : "09"}:00:${String(round % 60).padStart(2, "0")}Z`);
      profile = DailyAtlasProfile.setFeedback(profile, "book", ids.book, "favorite", true, timestamp);
      profile = DailyAtlasProfile.setExplicit(profile, "city", "regions", [variant.region], timestamp);
      profile = DailyAtlasProfile.setExplicit(profile, "german", "levels", [variant.germanLevel], timestamp);
      const payload = {
        format: "daily-atlas-backup",
        schemaVersion: 1,
        appVersion: "2.0.0",
        catalogSnapshot: DAILY_ATLAS_CATALOG.snapshotDate,
        exportedAt: timestamp.toISOString(),
        states: Object.fromEntries(types.map((type) => [type, {
          schemaVersion: 3,
          type,
          date,
          revision: 0,
          version: "0",
          currentId: ids[type],
          sequence: round * 10 + variantIndex + 1,
          skipped: [],
          knownEntries: []
        }])),
        optional: {
          "dailyAtlas.profile.v1": profile,
          "dailyAtlas.appearance.v1": { schemaVersion: 1, color: variant.backgroundColor, style: variant.backgroundStyle },
          "dailyAtlas.audio.v1": { volume: variant.volume },
          "dailyAtlas.audio.v2": { volume: variant.volume, trackId: variant.trackId },
          "dailyAtlas.speech.v1": { voiceURI: variant.voiceURI },
          "dailyAtlas.reminder.v1": { schemaVersion: 1, enabled: false, time: variant.reminderTime, lastNotifiedDate: null }
        }
      };
      const checked = DailyAtlasBackup.validate(payload, Object.fromEntries(types.map((type) => [
        type,
        new Set(DAILY_ATLAS_CATALOG[collections[type]].map((item) => item.id))
      ])));
      if (!checked.ok) throw new Error(`test backup ${variant.name} was invalid: ${checked.errors.join(" ")}`);
      return {
        name: variant.name,
        text: JSON.stringify(payload),
        marker: {
          ids,
          region: variant.region,
          trackId: variant.trackId,
          volume: variant.volume,
          voiceURI: variant.voiceURI,
          reminderTime: variant.reminderTime,
          backgroundColor: variant.backgroundColor,
          backgroundStyle: variant.backgroundStyle,
          germanLevel: variant.germanLevel,
          sequence: round * 10 + variantIndex + 1
        }
      };
    });
  }, { round, types });
}

async function importDiagnostic(page) {
  return page.evaluate(() => ({
    url: location.href,
    readyState: document.readyState,
    importDisabled: document.querySelector("#importBackupButton")?.disabled ?? null,
    settingsOpen: document.querySelector("#settingsDialog")?.open ?? null,
    previewOpen: document.querySelector("#backupPreviewDialog")?.open ?? null,
    previewStatus: document.querySelector("#backupPreviewStatus")?.textContent.trim() || "",
    applyDisabled: document.querySelector("#applyBackupButton")?.disabled ?? null,
    applyHidden: document.querySelector("#applyBackupButton")?.hidden ?? null,
    replaceChecked: document.querySelector("#backupReplaceMode")?.checked ?? null,
    backupStatus: document.querySelector("#backupStatus")?.textContent.trim() || "",
    recovery: globalThis.DAILY_ATLAS_IMPORT_RECOVERY || null,
    pendingJournal: localStorage.getItem("dailyAtlas.import.pending.v1"),
    lockStatus: DailyAtlasLock?.status?.() || null
  })).catch(() => ({ navigationInterruptedDiagnostic: true }));
}

async function prepareReplaceImport(page, backup, round) {
  await page.locator("#settingsButton").click();
  try {
    // This scenario tests two import transactions, not whether one browser
    // profile permits two native file pickers to remain open simultaneously.
    // Still exercise the visible button first so the application records the
    // same localImportIntent as a real user gesture; suppress only the native
    // picker, then setInputFiles supplies the FileList/change event.
    await page.evaluate(() => {
      const input = document.querySelector("#importBackupFile");
      const button = document.querySelector("#importBackupButton");
      if (!input || !button) throw new Error("import controls are missing");
      const nativeClick = input.click;
      input.click = () => {};
      try { button.click(); }
      finally { input.click = nativeClick; }
    });
    await page.locator("#importBackupFile").setInputFiles({
      name: `race-${backup.name.toLowerCase()}-${round}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(backup.text, "utf8")
    });
    await page.locator("#backupPreviewDialog").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const panel = document.querySelector("#backupPreviewPanel");
      const apply = document.querySelector("#applyBackupButton");
      return panel && panel.hidden === false && apply && apply.hidden === false;
    });
    await page.locator("#backupReplaceMode").check();
    await page.waitForFunction(() => {
      const status = document.querySelector("#backupPreviewStatus")?.textContent || "";
      const apply = document.querySelector("#applyBackupButton");
      return status.includes("替换会删除") && apply && apply.hidden === false && apply.disabled === false;
    });
  } catch (error) {
    const diagnostic = await importDiagnostic(page);
    throw new Error(`Replace-import preview did not become ready in round ${round + 1}: ${JSON.stringify(diagnostic)}; ${error.message}`);
  }
}

async function confirmPreparedImport(page, round) {
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = `import-${round}-${attempt}-${Date.now()}-${Math.random()}`;
      await page.evaluate((value) => { window.__importConfirmationToken = value; }, token);
      await page.locator("#applyBackupButton").click();
      const outcome = await page.waitForFunction((value) => {
        if (window.__importConfirmationToken !== value) return "navigated";
        const status = document.querySelector("#backupPreviewStatus")?.textContent || "";
        if (status.includes("预览已刷新")) return "stale";
        return false;
      }, token, { timeout: 30000 }).then((handle) => handle.jsonValue());
      if (outcome === "navigated") {
        await waitForAppReady(page);
        return;
      }
      await page.waitForFunction(() => {
        const apply = document.querySelector("#applyBackupButton");
        return document.querySelector("#backupPreviewDialog")?.open === true &&
          document.querySelector("#backupReplaceMode")?.checked === true &&
          apply && apply.hidden === false && apply.disabled === false;
      });
    }
    throw new Error("replace import stayed stale after three confirmed previews");
  } catch (error) {
    const diagnostic = await importDiagnostic(page);
    throw new Error(`Replace import did not commit in round ${round + 1}: ${JSON.stringify(diagnostic)}; ${error.message}`);
  }
}

async function triggerImport(page, backup, round) {
  await prepareReplaceImport(page, backup, round);
  await confirmPreparedImport(page, round);
}

function chooseWinner(profile, variants) {
  const region = profile?.explicit?.city?.regions?.[0];
  return variants.find((variant) => variant.marker.region === region) || null;
}

async function readCanonicalPersistence(page) {
  return page.evaluate(async (types) => {
    const persisted = await DailyAtlasLock.readStorage((storage) => ({
      profile: JSON.parse(storage.getItem("dailyAtlas.profile.v1") || "null"),
      states: Object.fromEntries(types.map((type) => [type, JSON.parse(storage.getItem(`dailyAtlas.state.v3.${type}`) || "null")])),
      appearance: JSON.parse(storage.getItem("dailyAtlas.appearance.v1") || "null"),
      audioV1: JSON.parse(storage.getItem("dailyAtlas.audio.v1") || "null"),
      audioV2: JSON.parse(storage.getItem("dailyAtlas.audio.v2") || "null"),
      speech: JSON.parse(storage.getItem("dailyAtlas.speech.v1") || "null"),
      reminder: JSON.parse(storage.getItem("dailyAtlas.reminder.v1") || "null"),
      journal: storage.getItem("dailyAtlas.import.pending.v1")
    }));
    return {
      ...persisted,
      legacyLockRecords: Object.keys(localStorage).filter((key) => key.startsWith("dailyAtlas.lock.v1.")),
      moduleState: {
        music: DailyAtlasMusic.getState(),
        speech: DailyAtlasSpeech.getState(),
        reminder: DailyAtlasReminders.getState(),
        appearance: DailyAtlasAppearance.getState()
      }
    };
  }, types);
}

async function readCanonicalGeneration(page) {
  return page.evaluate(() => DailyAtlasLock.readStorage((storage) =>
    DailyAtlasProfile.parse(storage.getItem("dailyAtlas.profile.v1")).generation));
}

async function auditCompleteWinner(page, variants, generationBefore, label, generationDelta = 2) {
  const persisted = await readCanonicalPersistence(page);
  const winner = chooseWinner(persisted.profile, variants);
  assert.ok(winner, `${label}: final profile belongs wholly to A or B`);
  assert.equal(persisted.profile.generation, generationBefore + generationDelta, `${label}: serialized profile replacements advance generation once per completed operation`);
  assert.deepEqual(persisted.profile.explicit.city.regions, [winner.marker.region], `${label}: profile marker comes from the winner`);
  assert.deepEqual(persisted.profile.explicit.german.levels, [winner.marker.germanLevel], `${label}: second profile field comes from the same winner`);
  assert.equal(persisted.profile.feedback.book[winner.marker.ids.book]?.favorite, true, `${label}: winner favorite is present`);
  for (const variant of variants.filter((candidate) => candidate !== winner)) {
    assert.equal(persisted.profile.feedback.book[variant.marker.ids.book]?.favorite || false, false, `${label}: loser favorite is absent`);
  }
  for (const type of types) {
    assert.equal(persisted.states[type].currentId, winner.marker.ids[type], `${label}: ${type} state belongs to the same winner`);
    assert.equal(persisted.states[type].sequence, winner.marker.sequence, `${label}: ${type} sequence belongs to the same winner`);
  }
  assert.deepEqual(persisted.audioV1, { volume: winner.marker.volume }, `${label}: legacy audio optional belongs to the winner`);
  assert.deepEqual(persisted.appearance, {
    schemaVersion: 1,
    color: winner.marker.backgroundColor,
    style: winner.marker.backgroundStyle,
    density: "comfortable",
    dataSaver: false,
    textSize: "default",
    contrast: "default",
    motion: "system"
  }, `${label}: appearance optional belongs to the winner`);
  assert.deepEqual(persisted.audioV2, { volume: winner.marker.volume, trackId: winner.marker.trackId }, `${label}: current audio optional belongs to the winner`);
  assert.deepEqual(persisted.speech, { voiceURI: winner.marker.voiceURI }, `${label}: speech optional belongs to the winner`);
  assert.deepEqual(persisted.reminder, {
    schemaVersion: 1,
    enabled: false,
    time: winner.marker.reminderTime,
    lastNotifiedDate: null
  }, `${label}: reminder optional belongs to the winner`);
  assert.equal(persisted.moduleState.music.trackId, winner.marker.trackId, `${label}: music initialized from the winning optional`);
  assert.equal(persisted.moduleState.music.volume, winner.marker.volume, `${label}: music volume initialized from the winning optional`);
  assert.equal(persisted.moduleState.speech.selectedVoiceURI, winner.marker.voiceURI, `${label}: speech initialized from the winning optional`);
  assert.equal(persisted.moduleState.reminder.time, winner.marker.reminderTime, `${label}: reminder initialized from the winning optional`);
  assert.equal(persisted.moduleState.appearance.color, winner.marker.backgroundColor, `${label}: background color initialized from the winning optional`);
  assert.equal(persisted.moduleState.appearance.style, winner.marker.backgroundStyle, `${label}: background style initialized from the winning optional`);
  assert.equal(persisted.journal, null, `${label}: no import journal remains`);
  assert.equal(persisted.legacyLockRecords.length, 0, `${label}: the retired localStorage mutex creates no records`);
  return { winner: winner.name, generation: persisted.profile.generation };
}

async function concurrentImportMode(browser, origin, noWebLocks) {
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  const context = await createContext(browser, noWebLocks);
  try {
    const { first, second, errors } = await preparePair(context, origin);
    const capability = await first.evaluate(() => ({ locks: typeof navigator.locks?.request, backend: DailyAtlasLock.status().backend }));
    if (noWebLocks) assert.deepEqual(capability, { locks: "undefined", backend: "indexeddb" }, `${mode}: fallback path is active`);
    else assert.deepEqual(capability, { locks: "function", backend: "web-locks+indexeddb" }, `${mode}: browser lock manager and canonical IndexedDB gate are active`);
    const winners = [];
    let priorGeneration = await readCanonicalGeneration(first);
    for (let round = 0; round < rounds; round += 1) {
      const variants = await buildCompetingBackups(first, round);
      const assignments = round % 2 === 0 ? variants : [variants[1], variants[0]];
      await Promise.all([
        triggerImport(first, assignments[0], round),
        triggerImport(second, assignments[1], round)
      ]);
      await waitForExpectedGeneration(first, [first, second], priorGeneration + 2, `${mode} concurrent imports round ${round + 1}`);
      await Promise.all([first, second].map(async (page) => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForAppReady(page);
      }));
      const audit = await auditCompleteWinner(first, variants, priorGeneration, `${mode} round ${round + 1}`);
      assert.deepEqual(await second.evaluate(() => DailyAtlasLock.readStorage((storage) => ({
        generation: JSON.parse(storage.getItem("dailyAtlas.profile.v1")).generation,
        journal: storage.getItem("dailyAtlas.import.pending.v1")
      }))), { generation: audit.generation, journal: null }, `${mode} round ${round + 1}: the peer sees the same canonical generation and no journal`);
      winners.push(audit.winner);
      priorGeneration = audit.generation;
      process.stdout.write(`  ${mode}: ${round + 1}/${rounds} complete imports, winner=${audit.winner}, generation=${audit.generation}\n`);
    }
    assert.deepEqual(errors, [], `${mode}: no uncaught browser errors: ${errors.join(" | ")}`);
    return { mode, rounds, finalGeneration: priorGeneration, winners };
  } finally {
    await context.close();
  }
}

async function holdGlobalTransaction(page) {
  await page.evaluate(() => {
    window.__transactionHeld = false;
    window.__transactionDone = false;
    window.__transactionError = null;
    window.__releaseTransaction = false;
    if (typeof navigator.locks?.request === "function") {
      void navigator.locks.request("daily-atlas:transaction", async () => {
        window.__transactionHeld = true;
        await new Promise((resolve) => { window.__releaseTransaction = resolve; });
      }).catch((error) => {
        window.__transactionError = error?.message || String(error);
      }).finally(() => {
        window.__transactionDone = true;
      });
      return;
    }
    const open = indexedDB.open("daily-atlas-coordination", 1);
    open.onerror = () => { window.__transactionError = open.error?.message || "IndexedDB open failed"; };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("mutex", "readwrite");
      const store = tx.objectStore("mutex");
      const keepAlive = () => {
        const request = store.get("daily-atlas:transaction");
        request.onerror = () => { window.__transactionError = request.error?.message || "IndexedDB gate failed"; };
        request.onsuccess = () => {
          if (!window.__transactionHeld) window.__transactionHeld = true;
          if (window.__releaseTransaction !== true) keepAlive();
        };
      };
      tx.oncomplete = () => { window.__transactionDone = true; db.close(); };
      tx.onabort = () => {
        window.__transactionError = tx.error?.message || "IndexedDB test gate aborted";
        window.__transactionDone = true;
        db.close();
      };
      keepAlive();
    };
  });
  await page.waitForFunction(() => window.__transactionHeld === true || window.__transactionError);
  const error = await page.evaluate(() => window.__transactionError);
  assert.equal(error, null, `test gate acquires the production transaction lock: ${error || "ok"}`);
}

async function waitForTransactionContenders(contenders) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const statuses = await Promise.all(contenders.map(({ page }) => page.evaluate(() => DailyAtlasLock.status())));
    if (statuses.every((status, index) =>
      status.accepted >= contenders[index].acceptedBefore + 1 && status.pending >= 1)) return statuses;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const statuses = await Promise.all(contenders.map(({ page }) =>
    page.evaluate(() => DailyAtlasLock.status()).catch((error) => ({ error: error.message }))));
  throw new Error(`transactions did not enter the observable application queues: ${JSON.stringify(statuses)}`);
}

async function waitForAccepted(page, acceptedBefore, label) {
  try {
    await page.waitForFunction((prior) => {
      const status = DailyAtlasLock.status();
      return status.accepted >= prior + 1 && status.pending >= 1;
    }, acceptedBefore, { timeout: 15000 });
  } catch (error) {
    const status = await page.evaluate(() => DailyAtlasLock.status()).catch((failure) => ({ error: failure.message }));
    throw new Error(`${label} did not enter its page queue: ${JSON.stringify(status)}; ${error.message}`);
  }
}

async function releaseGlobalTransaction(page) {
  await page.evaluate(() => {
    if (typeof window.__releaseTransaction === "function") window.__releaseTransaction();
    else if (window.__transactionHeld) window.__releaseTransaction = true;
    else throw new Error("transaction gate was not held");
  });
  try {
    await page.waitForFunction(
      () => window.__transactionDone === true || window.__transactionError,
      null,
      { polling: 25, timeout: 30000 }
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      held: window.__transactionHeld,
      done: window.__transactionDone,
      releaseType: typeof window.__releaseTransaction,
      releaseValue: typeof window.__releaseTransaction === "boolean" ? window.__releaseTransaction : null,
      transactionError: window.__transactionError,
      lock: window.DailyAtlasLock?.status?.() || null,
      visibility: document.visibilityState
    })).catch((failure) => ({ diagnosticError: failure.message }));
    throw new Error(`test gate did not finish after release: ${JSON.stringify(diagnostic)}; ${error.message}`);
  }
}

async function startReset(page) {
  const settingsDialog = page.locator("#settingsDialog");
  const alreadyOpen = await settingsDialog.evaluate((dialog) => dialog.open === true);
  if (!alreadyOpen) await page.locator("#settingsButton").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#resetPreferencesButton").click();
}

async function settlePeerReloads(pages) {
  await pages[0].waitForTimeout(180);
  for (const page of pages) {
    await page.waitForLoadState("domcontentloaded");
    await waitForAppReady(page);
  }
}

async function waitForExpectedGeneration(page, pages, expectedGeneration, label) {
  try {
    await page.waitForFunction((value) => {
      const raw = localStorage.getItem("dailyAtlas.profile.v1");
      return raw && DailyAtlasProfile.parse(raw).generation === value;
    }, expectedGeneration, { timeout: 30000 });
  } catch (error) {
    const diagnostics = await Promise.all(pages.map(async (candidate, index) => {
      try {
        return await candidate.evaluate((pageIndex) => ({
          pageIndex,
          url: location.href,
          readyState: document.readyState,
          generation: DailyAtlasProfile.parse(localStorage.getItem("dailyAtlas.profile.v1")).generation,
          journal: localStorage.getItem(DailyAtlasBackup.PENDING_KEY),
          lock: DailyAtlasLock.status(),
          preference: globalThis.DailyAtlasPreferencePersistence?.status?.() || null,
          backupStatus: document.querySelector("#backupStatus")?.textContent.trim() || ""
        }), index);
      } catch (diagnosticError) {
        return { pageIndex: index, diagnosticError: diagnosticError.message };
      }
    }));
    throw new Error(`${label}: generation ${expectedGeneration} did not settle: ${JSON.stringify(diagnostics)}; ${error.message}`);
  }
}

async function auditImportResetResult(page, backup, generationBefore, label) {
  const persisted = await readCanonicalPersistence(page);
  assert.equal(persisted.profile.generation, generationBefore + 2, `${label}: import and reset each advance the generation inside the shared lock`);
  assert.equal(persisted.profile.feedback.book[backup.marker.ids.book]?.favorite, true, `${label}: reset preserves the imported favorite regardless of serialization order`);
  const importLast = persisted.profile.explicit.city.regions[0] === backup.marker.region;
  if (importLast) {
    assert.deepEqual(persisted.profile.explicit.city.regions, [backup.marker.region], `${label}: import-last city field is intact`);
    assert.deepEqual(persisted.profile.explicit.german.levels, [backup.marker.germanLevel], `${label}: import-last German field is intact`);
  } else {
    assert.deepEqual(persisted.profile.explicit.city.regions, [], `${label}: reset-last clears the city field`);
    assert.deepEqual(persisted.profile.explicit.german.levels, [], `${label}: reset-last clears the German field in the same generation`);
  }
  for (const type of types) {
    assert.equal(persisted.states[type].currentId, backup.marker.ids[type], `${label}: reset never tears imported ${type} state`);
    assert.equal(persisted.states[type].sequence, backup.marker.sequence, `${label}: imported ${type} sequence is intact`);
  }
  assert.deepEqual(persisted.audioV1, { volume: backup.marker.volume }, `${label}: audio v1 is wholly imported`);
  assert.deepEqual(persisted.appearance, {
    schemaVersion: 1,
    color: backup.marker.backgroundColor,
    style: backup.marker.backgroundStyle,
    density: "comfortable",
    dataSaver: false,
    textSize: "default",
    contrast: "default",
    motion: "system"
  }, `${label}: appearance setting is wholly imported`);
  assert.deepEqual(persisted.audioV2, { volume: backup.marker.volume, trackId: backup.marker.trackId }, `${label}: audio v2 is wholly imported`);
  assert.deepEqual(persisted.speech, { voiceURI: backup.marker.voiceURI }, `${label}: speech setting is wholly imported`);
  assert.equal(persisted.reminder.time, backup.marker.reminderTime, `${label}: reminder setting is wholly imported`);
  assert.equal(persisted.journal, null, `${label}: journal is cleared`);
  return { generation: persisted.profile.generation, order: importLast ? "reset-before-import" : "import-before-reset" };
}

async function importVersusBusinessWriteMode(browser, origin, noWebLocks, operation) {
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  const context = await createContext(browser, noWebLocks);
  try {
    const { first, second, errors } = await preparePair(context, origin);
    const outcomes = [];
    let generation = await readCanonicalGeneration(first);
    for (let round = 0; round < transactionRounds; round += 1) {
      const backup = (await buildCompetingBackups(first, 100 + round))[round % 2];
      const visibleBook = await second.locator("#bookCard .swap-button").getAttribute("data-item-id");
      // The current UI computes a canonical read-only preview before the user
      // confirms. Complete that read before taking the test gate so the queue
      // ordering below still measures the replace commit versus the competing
      // business write, rather than measuring the preview read.
      await prepareReplaceImport(first, backup, 1000 + round);
      await holdGlobalTransaction(first);

      const [firstBaseline, secondBaseline] = await Promise.all([
        first.evaluate(() => DailyAtlasLock.status()),
        second.evaluate(() => DailyAtlasLock.status())
      ]);
      const importFirst = round % 2 === 0;

      let importPromise;
      if (importFirst) {
        importPromise = confirmPreparedImport(first, 1000 + round);
        await waitForAccepted(first, firstBaseline.accepted, `${mode} round ${round + 1} import`);
        if (operation === "reset") await startReset(second);
        else await second.locator("#bookCard .swap-button").click();
      } else {
        if (operation === "reset") await startReset(second);
        else await second.locator("#bookCard .swap-button").click();
        await waitForAccepted(second, secondBaseline.accepted, `${mode} round ${round + 1} ${operation}`);
        importPromise = confirmPreparedImport(first, 1000 + round);
      }
      const queuedReceipts = await waitForTransactionContenders([
        { page: first, acceptedBefore: firstBaseline.accepted },
        { page: second, acceptedBefore: secondBaseline.accepted }
      ]);
      await releaseGlobalTransaction(first);
      await importPromise;

      const expectedGeneration = generation + (operation === "reset" ? 2 : 1);
      await waitForExpectedGeneration(first, [first, second], expectedGeneration, `${mode} import-vs-${operation} round ${round + 1}`);
      await settlePeerReloads([first, second]);
      if (operation === "reset") {
        const audit = await auditImportResetResult(first, backup, generation, `${mode} import-vs-reset round ${round + 1}`);
        const expectedOrder = importFirst ? "import-before-reset" : "reset-before-import";
        assert.equal(audit.order, expectedOrder, `${mode} round ${round + 1}: persisted result follows the proven queue order`);
        outcomes.push(audit.order);
        generation = audit.generation;
      } else {
        const audit = await auditCompleteWinner(first, [backup], generation, `${mode} import-vs-skip round ${round + 1}`, 1);
        const state = await first.evaluate(() => DailyAtlasLock.readStorage((storage) =>
          JSON.parse(storage.getItem("dailyAtlas.state.v3.book"))));
        assert.equal(state.skipped.includes(visibleBook), false, `${mode} round ${round + 1}: a stale post-import skip cannot contaminate imported state`);
        outcomes.push("complete-import");
        generation = audit.generation;
      }
      process.stdout.write(`  ${mode} import-vs-${operation}: ${round + 1}/${transactionRounds}, order=${importFirst ? "import-first" : `${operation}-first`}, queued=${queuedReceipts.map((entry) => entry.pending).join("+")}, generation=${generation}\n`);
    }
    assert.deepEqual(errors, [], `${mode} import-vs-${operation}: no uncaught browser errors: ${errors.join(" | ")}`);
    return { mode, operation, rounds: transactionRounds, finalGeneration: generation, outcomes };
  } finally {
    await context.close();
  }
}

async function forwardJournalStartupScenario(browser, origin) {
  const context = await createContext(browser, false);
  const errors = [];
  const page = await context.newPage();
  observePage(page, errors);
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    // This fixture represents a pre-canonical release. Remove the established
    // IndexedDB snapshot so bootstrap must seed from and recover the legacy
    // localStorage journal instead of correctly treating that mirror as stale.
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DailyAtlasLock.constants.DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("could not remove canonical test database"));
      request.onblocked = () => reject(new Error("canonical test database deletion was blocked"));
    }));
    const seeded = await page.evaluate(({ types, targetKeys }) => {
      const collections = { book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" };
      const validIds = Object.fromEntries(types.map((type) => [type, new Set(DAILY_ATLAS_CATALOG[collections[type]].map((item) => item.id))]));
      const date = DailyAtlasEngine.localDateKey(new Date());
      const ids = Object.fromEntries(types.map((type, index) => {
        const collection = DAILY_ATLAS_CATALOG[collections[type]];
        return [type, collection[(70 + index) % collection.length].id];
      }));
      let profile = DailyAtlasProfile.emptyProfile();
      profile = DailyAtlasProfile.setFeedback(profile, "book", ids.book, "favorite", true, new Date("2026-08-12T12:00:00Z"));
      profile = DailyAtlasProfile.setExplicit(profile, "city", "regions", ["大洋洲"], new Date("2026-08-12T12:00:01Z"));
      profile.generation = 77;
      const payload = {
        format: "daily-atlas-backup",
        schemaVersion: 1,
        appVersion: "2.0.0",
        catalogSnapshot: DAILY_ATLAS_CATALOG.snapshotDate,
        exportedAt: "2026-08-12T12:00:02.000Z",
        states: Object.fromEntries(types.map((type, index) => [type, {
          schemaVersion: 3,
          type,
          date,
          revision: 700 + index,
          version: String(700 + index),
          currentId: ids[type],
          sequence: 70 + index,
          skipped: [],
          knownEntries: []
        }])),
        optional: {
          "dailyAtlas.profile.v1": profile,
          "dailyAtlas.appearance.v1": { schemaVersion: 1, color: "sky", style: "clean" },
          "dailyAtlas.audio.v1": { volume: 0.42 },
          "dailyAtlas.audio.v2": { volume: 0.42, trackId: "pine-and-moon" },
          "dailyAtlas.speech.v1": { voiceURI: "journal-voice" },
          "dailyAtlas.reminder.v1": { schemaVersion: 1, enabled: false, time: "06:45", lastNotifiedDate: null }
        }
      };
      const checked = DailyAtlasBackup.validate(payload, validIds);
      if (!checked.ok) throw new Error(`forward journal fixture invalid: ${checked.errors.join(" ")}`);
      const afterByKey = {
        "dailyAtlas.profile.v1": JSON.stringify(checked.normalized.optional["dailyAtlas.profile.v1"]),
        ...Object.fromEntries(types.map((type) => [`dailyAtlas.state.v3.${type}`, JSON.stringify(checked.normalized.states[type])])),
        "dailyAtlas.appearance.v1": JSON.stringify(checked.normalized.optional["dailyAtlas.appearance.v1"]),
        "dailyAtlas.audio.v1": JSON.stringify(checked.normalized.optional["dailyAtlas.audio.v1"]),
        "dailyAtlas.audio.v2": JSON.stringify(checked.normalized.optional["dailyAtlas.audio.v2"]),
        "dailyAtlas.speech.v1": JSON.stringify(checked.normalized.optional["dailyAtlas.speech.v1"]),
        "dailyAtlas.reminder.v1": JSON.stringify(checked.normalized.optional["dailyAtlas.reminder.v1"])
      };
      const entries = targetKeys.map((key) => ({ key, before: localStorage.getItem(key), after: afterByKey[key] }));
      entries.forEach((entry, index) => {
        const value = index % 2 === 0 ? entry.after : entry.before;
        if (value === null) localStorage.removeItem(entry.key);
        else localStorage.setItem(entry.key, value);
      });
      const beforeMatches = entries.filter((entry) => localStorage.getItem(entry.key) === entry.before).length;
      const afterMatches = entries.filter((entry) => localStorage.getItem(entry.key) === entry.after).length;
      if (!beforeMatches || !afterMatches || beforeMatches === entries.length || afterMatches === entries.length) {
        throw new Error("journal fixture did not create a mixed business-key snapshot");
      }
      localStorage.setItem(DailyAtlasBackup.PENDING_KEY, JSON.stringify({
        schemaVersion: DailyAtlasBackup.JOURNAL_VERSION,
        transactionId: "browser-forward-recovery",
        startedAt: new Date().toISOString(),
        forwardOnly: true,
        entries
      }));
      return { afterByKey, ids, beforeMatches, afterMatches };
    }, { types, targetKeys });
    assert.ok(seeded.beforeMatches > 0 && seeded.afterMatches > 0, "precondition: business keys are genuinely mixed before reload");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const audit = await page.evaluate((targetKeys) => ({
      recovery: globalThis.DAILY_ATLAS_IMPORT_RECOVERY,
      values: Object.fromEntries(targetKeys.map((key) => [key, localStorage.getItem(key)])),
      journal: localStorage.getItem(DailyAtlasBackup.PENDING_KEY),
      moduleState: {
        music: DailyAtlasMusic.getState(),
        speech: DailyAtlasSpeech.getState(),
        reminder: DailyAtlasReminders.getState()
      },
      status: document.querySelector("#backupStatus")?.textContent.trim()
    }), targetKeys);
    assert.equal(audit.recovery.ok, true, "startup forward recovery succeeds");
    assert.equal(audit.recovery.status, "committed", "startup identifies the journal as a completed forward commit");
    assert.equal(audit.recovery.dataState, "after", "startup converges to the complete after snapshot");
    assert.equal(audit.recovery.journalCleared, true, "startup reports that the journal was cleared");
    assert.equal(audit.journal, null, "the pending journal is absent after startup");
    for (const key of targetKeys) {
      assert.equal(audit.values[key], seeded.afterByKey[key], `${key} remains exactly at its after value after all modules initialize`);
    }
    assert.equal(audit.moduleState.music.volume, 0.42, "music initializes from recovered audio volume");
    assert.equal(audit.moduleState.music.trackId, "pine-and-moon", "music initializes from recovered track");
    assert.equal(audit.moduleState.speech.selectedVoiceURI, "journal-voice", "speech initializes from recovered voice preference");
    assert.equal(audit.moduleState.reminder.enabled, false, "reminders initialize from recovered enabled flag");
    assert.equal(audit.moduleState.reminder.time, "06:45", "reminders initialize from recovered time");
    assert.match(audit.status, /已补齐全部数据并确认完成/, "UI reports a completed startup recovery");
    assert.deepEqual(errors, [], `forward startup recovery has no uncaught browser errors: ${errors.join(" | ")}`);
    return { beforeMatches: seeded.beforeMatches, afterMatches: seeded.afterMatches, recoveredKeys: targetKeys.length };
  } finally {
    await context.close();
  }
}

async function startupWaitsForActiveWriterMode(browser, origin, noWebLocks) {
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  const context = await createContext(browser, noWebLocks);
  const errors = [];
  const writer = await context.newPage();
  observePage(writer, errors);
  try {
    await writer.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(writer);
    const fixture = await writer.evaluate(() => {
      localStorage.clear();
      const before = {
        appearance: JSON.stringify({ schemaVersion: 1, color: "paper", style: "editorial" }),
        audio: JSON.stringify({ volume: 0.18, trackId: "morning-harbor" })
      };
      const after = {
        appearance: JSON.stringify({ schemaVersion: 1, color: "sky", style: "clean" }),
        audio: JSON.stringify({ volume: 0.42, trackId: "pine-and-moon" })
      };
      localStorage.setItem("dailyAtlas.appearance.v1", before.appearance);
      localStorage.setItem("dailyAtlas.audio.v2", before.audio);
      return { before, after };
    });
    await writer.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(writer);
    await holdGlobalTransaction(writer);

    const transactionId = `active-writer-${noWebLocks ? "idb" : "web-locks"}`;
    await writer.evaluate(({ fixture, transactionId }) => {
      const entries = [
        { key: "dailyAtlas.appearance.v1", before: fixture.before.appearance, after: fixture.after.appearance },
        { key: "dailyAtlas.audio.v2", before: fixture.before.audio, after: fixture.after.audio }
      ];
      localStorage.setItem(DailyAtlasBackup.PENDING_KEY, JSON.stringify({
        schemaVersion: DailyAtlasBackup.JOURNAL_VERSION,
        transactionId,
        startedAt: new Date().toISOString(),
        forwardOnly: true,
        entries
      }));
      // Emulate an already-open legacy release that mutates only its
      // localStorage mirror while holding the historical gate. A current
      // starter must wait for the gate, then keep the established IndexedDB
      // canonical snapshot instead of importing the legacy mixed mirror.
      localStorage.setItem(entries[0].key, entries[0].after);
    }, { fixture, transactionId });

    const starter = await context.newPage();
    observePage(starter, errors);
    await starter.goto(origin, { waitUntil: "domcontentloaded" });
    await starter.waitForFunction(() => globalThis.DailyAtlasLock?.status?.().pending === 1);
    await starter.waitForTimeout(120);
    const blocked = await starter.evaluate(() => ({
      lock: DailyAtlasLock.status(),
      recoveryDefined: Object.prototype.hasOwnProperty.call(globalThis, "DAILY_ATLAS_IMPORT_RECOVERY"),
      journal: localStorage.getItem(DailyAtlasBackup.PENDING_KEY),
      appearance: DailyAtlasAppearance.getState(),
      music: DailyAtlasMusic.getState(),
      populatedCards: [...document.querySelectorAll("article.recommendation-card")]
        .filter((card) => card.querySelector("[data-item-id]")).length
    }));
    assert.equal(blocked.lock.pending, 1, `${mode}: startup recovery is observably queued behind the active writer`);
    assert.equal(blocked.recoveryDefined, false, `${mode}: startup does not publish a recovery result before acquiring the gate`);
    assert.ok(blocked.journal?.includes(transactionId), `${mode}: the active writer's journal is not cleared by the starting tab`);
    assert.equal(blocked.appearance.schemaVersion, 1, `${mode}: appearance schema remains at its uninitialized default while recovery waits`);
    assert.equal(blocked.appearance.color, "paper", `${mode}: appearance color remains at its uninitialized default while recovery waits`);
    assert.equal(blocked.appearance.style, "editorial", `${mode}: appearance style remains at its uninitialized default while recovery waits`);
    assert.equal(blocked.music.trackId, "morning-harbor", `${mode}: music remains at its uninitialized default while recovery waits`);
    assert.equal(blocked.music.volume, 0.18, `${mode}: music volume remains at its uninitialized default while recovery waits`);
    assert.equal(blocked.populatedCards, 0, `${mode}: recommendation state is not initialized from a mixed transaction snapshot`);

    await writer.evaluate(({ after }) => {
      localStorage.setItem("dailyAtlas.audio.v2", after.audio);
      localStorage.removeItem(DailyAtlasBackup.PENDING_KEY);
    }, fixture);
    await releaseGlobalTransaction(writer);
    await waitForAppReady(starter);
    const committed = await starter.evaluate(() => ({
      backend: DailyAtlasLock.status().backend,
      recovery: globalThis.DAILY_ATLAS_IMPORT_RECOVERY,
      journal: localStorage.getItem(DailyAtlasBackup.PENDING_KEY),
      appearance: DailyAtlasAppearance.getState(),
      music: DailyAtlasMusic.getState(),
      persistedAppearance: localStorage.getItem("dailyAtlas.appearance.v1"),
      persistedAudio: localStorage.getItem("dailyAtlas.audio.v2")
    }));
    assert.equal(committed.journal, null, `${mode}: the writer's completed transaction has no pending journal`);
    assert.equal(committed.recovery?.ok, true, `${mode}: startup completes after the writer releases the gate`);
    assert.equal(committed.recovery?.status, "no-pending", `${mode}: startup sees the writer's completed transaction rather than replaying it`);
    assert.equal(committed.appearance.schemaVersion, 1, `${mode}: appearance initializes from the established canonical snapshot`);
    assert.equal(committed.appearance.color, "paper", `${mode}: a legacy mirror writer cannot replace canonical appearance color`);
    assert.equal(committed.appearance.style, "editorial", `${mode}: a legacy mirror writer cannot replace canonical appearance style`);
    assert.equal(committed.music.trackId, "morning-harbor", `${mode}: a legacy mirror writer cannot replace the canonical track`);
    assert.equal(committed.music.volume, 0.18, `${mode}: a legacy mirror writer cannot replace canonical volume`);
    assert.equal(committed.persistedAppearance, fixture.before.appearance, `${mode}: startup repairs the appearance mirror from canonical data`);
    assert.equal(committed.persistedAudio, fixture.before.audio, `${mode}: startup repairs the audio mirror from canonical data`);
    assert.deepEqual(errors, [], `${mode}: active-writer startup test has no uncaught browser errors: ${errors.join(" | ")}`);
    return { mode, backend: committed.backend, transactionId, blockedPending: blocked.lock.pending };
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
    rounds,
    transactionRounds
  };
  const started = Date.now();
  try {
    if (process.env.TRANSACTION_ONLY !== "1") {
      report.startupActiveWriterWebLocks = await startupWaitsForActiveWriterMode(browser, origin, false);
      process.stdout.write("PASS startup recovery waits for an active Web Locks writer\n");
      report.startupActiveWriterFallback = await startupWaitsForActiveWriterMode(browser, origin, true);
      process.stdout.write("PASS startup recovery waits for an active IndexedDB writer\n");
      report.forwardRecovery = await forwardJournalStartupScenario(browser, origin);
      process.stdout.write("PASS forward-only startup recovery precedes optional-module initialization\n");
      report.webLocks = await concurrentImportMode(browser, origin, false);
      process.stdout.write(`PASS concurrent replace imports ${rounds}/${rounds} with Web Locks\n`);
      report.fallback = await concurrentImportMode(browser, origin, true);
      process.stdout.write(`PASS concurrent replace imports ${rounds}/${rounds} with IndexedDB fallback\n`);
    }
    report.importResetWebLocks = await importVersusBusinessWriteMode(browser, origin, false, "reset");
    process.stdout.write(`PASS import-vs-reset ${transactionRounds}/${transactionRounds} with Web Locks\n`);
    report.importResetFallback = await importVersusBusinessWriteMode(browser, origin, true, "reset");
    process.stdout.write(`PASS import-vs-reset ${transactionRounds}/${transactionRounds} with IndexedDB fallback\n`);
    report.importSkipWebLocks = await importVersusBusinessWriteMode(browser, origin, false, "skip");
    process.stdout.write(`PASS import-vs-skip ${transactionRounds}/${transactionRounds} with Web Locks\n`);
    report.importSkipFallback = await importVersusBusinessWriteMode(browser, origin, true, "skip");
    process.stdout.write(`PASS import-vs-skip ${transactionRounds}/${transactionRounds} with IndexedDB fallback\n`);
    report.elapsedMs = Date.now() - started;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await browser.close();
    await closeServer();
  }
})().catch(async (error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  try { await closeServer(); } catch (_error) {}
  process.exitCode = 1;
});
