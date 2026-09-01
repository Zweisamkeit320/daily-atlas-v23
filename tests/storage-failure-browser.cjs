const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { chromium } = require("playwright");

const State = require("../state.js");

const root = path.resolve(__dirname, "..");
const types = Object.freeze(["book", "movie", "city", "german", "medical"]);
const pendingKey = "dailyAtlas.import.pending.v1";
const profileKey = "dailyAtlas.profile.v1";
const stateKey = (type) => `dailyAtlas.state.v3.${type}`;
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
  try {
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll("article.recommendation-card")];
      return ["ready", "safe", "degraded"].includes(document.documentElement.dataset.bootState)
        && cards.length === 5
        && cards.every((card) => !card.hasAttribute("aria-busy") && card.querySelector("[data-item-id]"));
    });
    await page.evaluate(() => globalThis.DailyAtlasLock?.whenIdle?.());
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      readyState: document.readyState,
      cardCount: document.querySelectorAll("article.recommendation-card").length,
      populatedCards: [...document.querySelectorAll("article.recommendation-card")]
        .filter((card) => card.querySelector("[data-item-id]")).length,
      busyCards: [...document.querySelectorAll("article.recommendation-card")]
        .filter((card) => card.hasAttribute("aria-busy")).length,
      recovery: globalThis.DAILY_ATLAS_IMPORT_RECOVERY || null,
      persistence: globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE,
      warning: document.querySelector("#storageWarning")?.textContent.trim() || "",
      backupStatus: document.querySelector("#backupStatus")?.textContent.trim() || "",
      bodyPrefix: document.body?.innerText?.slice(0, 300) || ""
    })).catch((failure) => ({ diagnosticError: failure.message }));
    throw new Error(`app did not become ready: ${JSON.stringify(diagnostic)}; ${error.message}`);
  }
}

function observe(page, errors) {
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|ERR_|favicon|service worker/i.test(message.text())) {
      errors.push(message.text());
    }
  });
}

async function installRuntimeStubs(context) {
  await context.addInitScript(() => {
    class SessionAudio {
      constructor(src) {
        this.src = src;
        this.preload = "";
        this.onplay = null;
        this.onended = null;
        this.onerror = null;
      }
      play() {
        queueMicrotask(() => this.onplay?.());
        return Promise.resolve();
      }
      pause() {}
      removeAttribute(name) { if (name === "src") this.src = ""; }
      load() {}
    }
    class SessionNotification {
      static permission = "granted";
      static requestPermission() { return Promise.resolve("granted"); }
      constructor() {}
      close() {}
    }
    Object.defineProperty(window, "Audio", { configurable: true, value: SessionAudio });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class SessionAudioContext {
        constructor() { this.state = "suspended"; this.currentTime = 0; }
        resume() { this.state = "running"; return Promise.resolve(); }
        suspend() { this.state = "suspended"; return Promise.resolve(); }
      }
    });
    Object.defineProperty(window, "Notification", { configurable: true, value: SessionNotification });
  });
}

async function installFaultHarness(context) {
  await context.addInitScript(() => {
    const original = {
      getItem: Storage.prototype.getItem,
      setItem: Storage.prototype.setItem,
      removeItem: Storage.prototype.removeItem,
      clear: Storage.prototype.clear,
      key: Storage.prototype.key
    };
    const target = (key) => key === "dailyAtlas.import.pending.v1" ||
      key === "dailyAtlas.profile.v1" || /^dailyAtlas\.state\.v3\.(book|movie|city|german|medical)$/.test(String(key));
    const state = {
      armed: false,
      at: 0,
      after: false,
      persistent: false,
      targetKey: null,
      count: 0,
      triggered: false,
      mutations: []
    };
    function quota(label) {
      return new DOMException(`injected-${label}-${state.count}`, "QuotaExceededError");
    }
    function mutate(method, receiver, args) {
      const key = String(args[0]);
      if (!state.armed || !target(key) || (state.targetKey && state.targetKey !== key) ||
          (state.triggered && !state.persistent)) {
        return original[method].apply(receiver, args);
      }
      state.count += 1;
      state.mutations.push({ index: state.count, method, key });
      const fail = state.persistent ? state.count >= state.at : state.count === state.at;
      if (fail && !state.after) {
        state.triggered = true;
        throw quota(`${method}-before`);
      }
      const result = original[method].apply(receiver, args);
      if (fail && state.after) {
        state.triggered = true;
        throw quota(`${method}-after`);
      }
      return result;
    }
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value: function (...args) { return mutate("setItem", this, args); }
    });
    Object.defineProperty(Storage.prototype, "removeItem", {
      configurable: true,
      value: function (...args) { return mutate("removeItem", this, args); }
    });
    window.__storageFault = {
      arm(at, after = false, persistent = false, targetKey = null) {
        Object.assign(state, { armed: true, at, after, persistent, targetKey, count: 0, triggered: false, mutations: [] });
      },
      disarm() { state.armed = false; },
      snapshot() { return JSON.parse(JSON.stringify(state)); },
      rawGet(key) { return original.getItem.call(localStorage, key); },
      rawSet(key, value) { return original.setItem.call(localStorage, key, value); },
      rawRemove(key) { return original.removeItem.call(localStorage, key); },
      rawClear() { return original.clear.call(localStorage); }
    };
  });
}

async function installRuntimeReadFaultHarness(page) {
  await page.evaluate(() => {
    const original = {
      getItem: Storage.prototype.getItem,
      setItem: Storage.prototype.setItem,
      removeItem: Storage.prototype.removeItem
    };
    const state = { armed: false, getItem: 0, setItem: 0, removeItem: 0 };
    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value: function (...args) {
        if (!state.armed) return original.getItem.apply(this, args);
        state.getItem += 1;
        throw new DOMException(`runtime-getItem-${state.getItem}`, "SecurityError");
      }
    });
    for (const method of ["setItem", "removeItem"]) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: function (...args) {
          if (!state.armed) return original[method].apply(this, args);
          state[method] += 1;
          throw new DOMException(`runtime-${method}-${state[method]}`, "SecurityError");
        }
      });
    }
    window.__runtimeReadFault = {
      arm() { Object.assign(state, { armed: true, getItem: 0, setItem: 0, removeItem: 0 }); },
      snapshot() { return { ...state }; },
      rawGet(key) { return original.getItem.call(localStorage, key); }
    };
  });
}

async function createPersistentContext(browser, noWebLocks = false) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  await installRuntimeStubs(context);
  await installFaultHarness(context);
  if (noWebLocks) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    });
  }
  return context;
}

async function currentIds(page) {
  return page.evaluate((allTypes) => Object.fromEntries(allTypes.map((type) => [
    type,
    document.querySelector(`#${type}Card [data-action="favorite"], #${type}Card [data-action="swap"]`)?.dataset.itemId || null
  ])), types);
}

async function beginLiveAudit(page) {
  await page.evaluate(() => {
    globalThis.__liveAudit = [];
    const target = document.querySelector("#liveRegion");
    globalThis.__liveAuditObserver?.disconnect?.();
    globalThis.__liveAuditObserver = new MutationObserver(() => {
      globalThis.__liveAudit.push(target?.textContent || "");
    });
    globalThis.__liveAuditObserver.observe(target, { childList: true, characterData: true, subtree: true });
  });
}

async function liveAudit(page) {
  return page.evaluate(() => [...(globalThis.__liveAudit || [])]);
}

async function storageSnapshot(page, keys) {
  return page.evaluate((wanted) => DailyAtlasLock.readStorage((storage) =>
    Object.fromEntries(wanted.map((key) => [key, storage.getItem(key)]))), keys);
}

async function mirrorStorageSnapshot(page, keys) {
  return page.evaluate((wanted) => Object.fromEntries(wanted.map((key) => [key, localStorage.getItem(key)])), keys);
}

function allEqualSnapshot(left, right, keys) {
  return keys.every((key) => left[key] === right[key]);
}

async function waitForFault(page) {
  await page.waitForFunction(() => globalThis.__storageFault?.snapshot().triggered === true);
  await page.evaluate(async () => {
    await globalThis.DailyAtlasPreferencePersistence?.whenIdle?.();
    await globalThis.DailyAtlasLock?.whenIdle?.();
  });
}

async function runMemoryOnlyScenario(browser, origin, mode) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  const errors = [];
  await installRuntimeStubs(context);
  await context.addInitScript((failureMode) => {
    const methods = ["getItem", "setItem", "removeItem", "clear", "key"];
    const counters = { localStorageGetter: 0, getItem: 0, setItem: 0, removeItem: 0, clear: 0, key: 0 };
    window.__storageUnavailableCounters = counters;
    const unavailable = (method) => {
      counters[method] += 1;
      throw new DOMException(`injected-storage-${method}`, "SecurityError");
    };
    if (failureMode === "getter") {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          counters.localStorageGetter += 1;
          throw new DOMException("injected-localStorage-getter", "SecurityError");
        }
      });
      return;
    }
    for (const method of methods) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: function () { return unavailable(method); }
      });
    }
  }, mode);
  const page = await context.newPage();
  observe(page, errors);
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    assert.equal(await page.evaluate(() => globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE), false, `${mode}: persistence is explicitly unavailable`);
    assert.deepEqual(
      await page.evaluate(() => ({
        ok: globalThis.DAILY_ATLAS_IMPORT_RECOVERY?.ok,
        status: globalThis.DAILY_ATLAS_IMPORT_RECOVERY?.status
      })),
      { ok: true, status: "storage-unavailable-memory-only" },
      `${mode}: first PENDING read failure selects memory-only mode instead of an unfinished import`
    );
    assert.equal(await page.locator("#exportBackupButton").isDisabled(), true, `${mode}: export is disabled without readable persistent data`);
    assert.equal(await page.locator("#importBackupButton").isDisabled(), true, `${mode}: import is disabled without writable persistent data`);
    assert.equal(await page.locator(".swap-button:disabled").count(), 0, `${mode}: all five swap actions remain enabled`);
    assert.equal(await page.locator(".known-button:disabled").count(), 0, `${mode}: all five known actions remain enabled`);
    assert.equal(await page.locator(".feedback-button:disabled").count(), 0, `${mode}: feedback actions remain enabled`);
    const boundaryText = await page.locator("#storageWarning, #backupStatus, #liveRegion").allTextContents();
    assert.match(boundaryText.join(" "), /内存|会话|临时/, `${mode}: the UI explicitly describes volatile session storage`);
    assert.doesNotMatch(boundaryText.join(" "), /未完成导入|导入尚未恢复|上次导入/, `${mode}: memory-only mode is not mislabeled as an unfinished import`);
    const callsAtReady = await page.evaluate(() => ({ ...globalThis.__storageUnavailableCounters }));

    const initialIds = await currentIds(page);
    for (const type of types) {
      await page.locator(`#${type}Card .swap-button`).click();
      await page.waitForFunction(({ type, oldId }) => document.querySelector(`#${type}Card [data-action="favorite"]`)?.dataset.itemId !== oldId, {
        type, oldId: initialIds[type]
      });
    }
    const swappedIds = await currentIds(page);
    for (const type of types) {
      await page.locator(`#${type}Card .known-button`).click();
      await page.waitForFunction(({ type, oldId }) => document.querySelector(`#${type}Card [data-action="favorite"]`)?.dataset.itemId !== oldId, {
        type, oldId: swappedIds[type]
      });
      await page.locator(`#${type}Card [data-action="liked"]`).click();
      await page.waitForFunction((type) => document.querySelector(`#${type}Card [data-action="liked"]`)?.getAttribute("aria-pressed") === "true", type);
    }
    assert.equal(await page.locator("#recordCount").textContent(), "5", `${mode}: five known records live in session memory`);

    await page.locator("#musicTrack").selectOption("rainy-study");
    await page.locator("#musicVolume").fill("57");
    await page.locator("#musicVolume").dispatchEvent("input");
    await page.waitForFunction(() => DailyAtlasMusic.getState().trackId === "rainy-study" && Math.abs(DailyAtlasMusic.getState().volume - 0.57) < 0.001);

    await page.locator("#germanCard [data-german-speak]").click();
    await page.waitForFunction(() => DailyAtlasSpeech.getState().speaking === true && DailyAtlasSpeech.getState().playbackMode === "bundled-female");
    await page.locator("#germanCard [data-german-speak]").click();
    await page.waitForFunction(() => DailyAtlasSpeech.getState().speaking === false && DailyAtlasSpeech.getState().pending === false);

    await page.locator("#settingsButton").click();
    await page.locator("#reminderTime").fill("10:23");
    await page.locator("#enableReminderButton").click();
    await page.waitForFunction(() => DailyAtlasReminders.getState().enabled === true && DailyAtlasReminders.getState().time === "10:23");

    const callsAfterActions = await page.evaluate(() => ({ ...globalThis.__storageUnavailableCounters }));
    assert.equal(
      callsAfterActions.localStorageGetter,
      callsAtReady.localStorageGetter,
      `${mode}: no window.localStorage getter access is attempted after memory-only startup`
    );
    assert.equal(callsAfterActions.setItem, 0, `${mode}: no persistent setItem is attempted after the availability probe`);
    assert.equal(callsAfterActions.removeItem, 0, `${mode}: no persistent removeItem is attempted after the availability probe`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    assert.deepEqual(await currentIds(page), initialIds, `${mode}: refresh discards all volatile recommendation changes`);
    assert.equal(await page.locator("#recordCount").textContent(), "0", `${mode}: refresh discards volatile known records`);
    assert.equal(await page.locator('#bookCard [data-action="liked"]').getAttribute("aria-pressed"), "false", `${mode}: refresh discards volatile feedback`);
    assert.deepEqual(errors, [], `${mode}: memory-only flow has no uncaught page errors: ${errors.join(" | ")}`);
    return { mode, initialIds, unavailableCalls: callsAfterActions };
  } finally {
    await context.close();
  }
}

async function runSingleKeyFault(browser, origin, operation, after) {
  const context = await createPersistentContext(browser, false);
  const errors = [];
  const page = await context.newPage();
  observe(page, errors);
  const label = `${operation} single-key setItem ${after ? "after" : "before"}`;
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => __storageFault.rawClear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const oldId = (await currentIds(page)).book;
    const key = operation === "swap" ? stateKey("book") : profileKey;
    const before = (await storageSnapshot(page, [key]))[key];
    const mirrorBefore = (await mirrorStorageSnapshot(page, [key]))[key];
    if (operation === "preference") {
      await page.locator("#settingsButton").click();
      assert.equal(await page.locator('[data-pref-type="book"][data-pref-field="genres"][value="history"]').isChecked(), false, `${label}: preference starts clear`);
    }
    const preferenceBefore = operation === "preference"
      ? await page.evaluate(() => DailyAtlasPreferencePersistence.status())
      : null;
    await beginLiveAudit(page);
    await page.evaluate(({ after, key }) => __storageFault.arm(1, after, false, key), { after, key });

    if (operation === "liked") {
      await page.locator('#bookCard [data-action="liked"]').click();
    } else if (operation === "preference") {
      // A write-before fault can roll the optimistic checkbox back before
      // Playwright's check() postcondition runs. click() still exercises the
      // real user event while allowing the test to inspect the durable result.
      await page.locator('[data-pref-type="book"][data-pref-field="genres"][value="history"]').click();
    } else {
      await page.locator("#bookCard .swap-button").click();
    }
    await waitForFault(page);

    const mirror = (await mirrorStorageSnapshot(page, [key]))[key];
    const durable = (await storageSnapshot(page, [key]))[key];
    const announcements = await liveAudit(page);
    const fault = await page.evaluate(() => __storageFault.snapshot());
    assert.equal(fault.count, 1, `${label}: exactly one business-key mutation is attempted`);
    assert.deepEqual(fault.mutations.map(({ method, key: mutatedKey }) => ({ method, key: mutatedKey })), [
      { method: "setItem", key }
    ], `${label}: the injected mutation is the intended single key`);

    if (operation === "liked") {
      const persistedLiked = durable ? JSON.parse(durable)?.feedback?.book?.[oldId]?.liked === true : false;
      assert.equal(persistedLiked, true, `${label}: the canonical liked state commits before mirror copying starts`);
      assert.equal(await page.locator('#bookCard [data-action="liked"]').getAttribute("aria-pressed"), "true", `${label}: DOM and in-memory liked state match the canonical commit`);
      assert.equal(announcements.filter((text) => text === "已加入喜欢。").length, 1, `${label}: a committed action is announced exactly once`);
    } else if (operation === "preference") {
      const values = durable ? JSON.parse(durable)?.explicit?.book?.genres || [] : [];
      const preferenceAfter = await page.evaluate(() => DailyAtlasPreferencePersistence.status());
      assert.equal(values.includes("history"), true, `${label}: the canonical explicit preference commits before mirror copying starts`);
      assert.equal(await page.locator('[data-pref-type="book"][data-pref-field="genres"][value="history"]').isChecked(), true, `${label}: preference control and in-memory profile match the canonical commit`);
      assert.equal(announcements.filter((text) => text.startsWith("偏好已保存在本机")).length, 1, `${label}: preference success is announced exactly once`);
      assert.equal(preferenceAfter.accepted, preferenceBefore.accepted + 1, `${label}: exactly one preference intent is accepted`);
      assert.equal(preferenceAfter.pending, 0, `${label}: the accepted preference intent is fully settled`);
      assert.equal(preferenceAfter.completed, preferenceBefore.completed + 1, `${label}: the canonical commit increments completed`);
      assert.equal(preferenceAfter.failed, preferenceBefore.failed, `${label}: a post-commit mirror failure is not a failed preference`);
    } else {
      const state = JSON.parse(durable);
      assert.notEqual(state.currentId, oldId, `${label}: the canonical current card commits before mirror copying starts`);
      assert.equal(state.skipped.includes(oldId), true, `${label}: the canonical skip marker is committed`);
      assert.equal((await currentIds(page)).book, state.currentId, `${label}: visible and in-memory card match the canonical commit`);
      assert.equal(announcements.filter((text) => text.startsWith("已仅在今天跳过")).length, 1, `${label}: swap success is announced exactly once`);
    }

    assert.notEqual(durable, before, `${label}: the canonical value is committed regardless of mirror write timing`);
    assert.equal(after ? mirror !== mirrorBefore : mirror === mirrorBefore, true,
      `${label}: the compatibility mirror reflects whether the injected write threw before or after mutation`);
    assert.equal(await page.locator("#storageWarning").isVisible(), true, `${label}: mirror failure is visibly disclosed`);
    assert.match(await page.locator("#storageWarning").textContent(), /数据已安全保存|镜像/, `${label}: warning does not mislabel the canonical commit as rollback`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    assert.equal((await storageSnapshot(page, [key]))[key], durable, `${label}: reload preserves the canonical commit`);
    assert.equal((await mirrorStorageSnapshot(page, [key]))[key], durable, `${label}: a later successful canonical read repairs the mirror`);
    assert.deepEqual(errors, [], `${label}: no uncaught errors: ${errors.join(" | ")}`);
    return { label, canonicalCommitted: true, mirrorCommitted: after, announcements, mutation: fault.mutations[0] };
  } finally {
    await context.close();
  }
}

async function runRuntimeReadFailure(browser, origin) {
  const context = await createPersistentContext(browser, false);
  const errors = [];
  const page = await context.newPage();
  observe(page, errors);
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => __storageFault.rawClear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    // First synchronize a peer preference into this tab. The runtime read
    // fault below must fall back to that canonical in-memory mirror rather
    // than an older startup snapshot.
    const peer = await context.newPage();
    observe(peer, errors);
    await peer.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(peer);
    await peer.locator("#settingsButton").click();
    await peer.locator('[data-pref-type="city"][data-pref-field="regions"][value="欧洲"]').check();
    await peer.evaluate(async () => {
      await DailyAtlasPreferencePersistence.whenIdle();
      await DailyAtlasLock.whenIdle();
    });
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() => document.querySelector("#liveRegion")?.textContent.includes(
      "已同步另一个标签页完成的本地数据事务"
    ));
    await page.evaluate(() => DailyAtlasLock.whenIdle());
    await page.locator("#settingsButton").click();
    assert.equal(await page.locator('[data-pref-type="city"][data-pref-field="regions"][value="欧洲"]').isChecked(), true, "peer city preference reaches the receiving tab before fault injection");
    await page.locator("#doneSettingsButton").click();
    await peer.close();

    const oldId = (await currentIds(page)).book;
    const durableBefore = await page.evaluate(({ profileKey, bookKey }) => ({
      profile: localStorage.getItem(profileKey),
      book: localStorage.getItem(bookKey)
    }), { profileKey, bookKey: stateKey("book") });
    await installRuntimeReadFaultHarness(page);
    await page.evaluate(() => __runtimeReadFault.arm());
    await page.locator('#bookCard [data-action="liked"]').click();
    await page.evaluate(() => DailyAtlasLock.whenIdle());
    await page.waitForTimeout(30);
    const transition = await page.evaluate(() => ({
      persistenceAvailable: globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE,
      liked: document.querySelector('#bookCard [data-action="liked"]')?.getAttribute("aria-pressed"),
      peerCityRetained: document.querySelector('[data-pref-type="city"][data-pref-field="regions"][value="欧洲"]')?.checked,
      fault: __runtimeReadFault.snapshot(),
      toast: document.querySelector("#toastMessage")?.textContent || ""
    }));
    assert.deepEqual(transition, {
      persistenceAvailable: false,
      liked: "false",
      peerCityRetained: true,
      fault: { armed: true, getItem: 1, setItem: 0, removeItem: 0 },
      toast: "喜欢操作未执行；已切换到临时内存模式，请重新选择。后续操作仅在本次会话有效。"
    }, "the first post-startup read failure fails the triggering feedback closed and explains how to retry in memory-only mode");

    assert.equal(await page.locator("#exportBackupButton").isDisabled(), true, "runtime read failure disables export");
    assert.equal(await page.locator("#importBackupButton").isDisabled(), true, "runtime read failure disables import");
    assert.equal(await page.locator("#importBackupFile").isDisabled(), true, "runtime read failure disables the hidden import input");
    assert.equal(await page.locator(".swap-button:disabled").count(), 0, "runtime memory mode keeps all swaps enabled");
    assert.equal(await page.locator(".known-button:disabled").count(), 0, "runtime memory mode keeps all known actions enabled");
    assert.equal(await page.locator(".feedback-button:disabled").count(), 0, "runtime memory mode keeps all feedback actions enabled");
    for (const selector of ["#personalizationEnabled", "#themeLinkingEnabled", "#musicToggle", "#musicVolume", "#musicTrack", "#reminderTime", "#enableReminderButton"]) {
      assert.equal(await page.locator(selector).isDisabled(), false, `runtime memory mode keeps ${selector} enabled`);
    }
    const warning = (await page.locator("#storageWarning, #backupStatus").allTextContents()).join(" ");
    assert.match(warning, /临时内存|本次会话|不会保留/, "runtime read failure clearly discloses volatile memory mode");
    assert.doesNotMatch(warning, /未完成导入|导入尚未恢复/, "runtime read failure is not mislabeled as journal recovery failure");

    await page.locator("#bookCard .swap-button").click();
    await page.waitForFunction((id) => document.querySelector('#bookCard [data-action="favorite"]')?.dataset.itemId !== id, oldId);
    await page.locator('#bookCard [data-action="favorite"]').click();
    await page.waitForFunction(() => document.querySelector('#bookCard [data-action="favorite"]')?.getAttribute("aria-pressed") === "true");
    await page.locator("#settingsButton").click();
    assert.equal(await page.locator('[data-pref-type="city"][data-pref-field="regions"][value="欧洲"]').isChecked(), true, "runtime memory fallback retains the peer preference mirrored before the read failure");
    await page.locator('[data-pref-type="book"][data-pref-field="genres"][value="history"]').check();
    await page.evaluate(() => DailyAtlasPreferencePersistence.whenIdle());
    assert.equal(await page.locator('[data-pref-type="book"][data-pref-field="genres"][value="history"]').isChecked(), true, "runtime memory-only preference settles before whenIdle returns");
    assert.match(await page.locator("#liveRegion").textContent(), /本次会话|不会保留/, "runtime memory-only preference uses an honest volatile-state announcement");
    await page.locator("#musicTrack").selectOption("rainy-study");
    await page.locator("#reminderTime").fill("10:23");
    await page.locator("#enableReminderButton").click();
    await page.waitForFunction(() => DailyAtlasReminders.getState().enabled === true && DailyAtlasReminders.getState().time === "10:23");
    await page.evaluate(() => DailyAtlasLock.whenIdle());

    const fault = await page.evaluate(() => __runtimeReadFault.snapshot());
    assert.deepEqual(fault, { armed: true, getItem: 1, setItem: 0, removeItem: 0 }, "after the first read failure no persistent read or write is attempted");
    const durableAfter = await page.evaluate(({ profileKey, bookKey }) => ({
      profile: __runtimeReadFault.rawGet(profileKey),
      book: __runtimeReadFault.rawGet(bookKey)
    }), { profileKey, bookKey: stateKey("book") });
    assert.deepEqual(durableAfter, durableBefore, "all post-failure changes remain volatile and durable keys stay unchanged");

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    assert.equal((await currentIds(page)).book, oldId, "reload discards runtime memory-only swaps");
    assert.equal(await page.locator('#bookCard [data-action="liked"]').getAttribute("aria-pressed"), "false", "reload discards runtime memory-only feedback");
    assert.equal(await page.locator('[data-pref-type="city"][data-pref-field="regions"][value="欧洲"]').isChecked(), true, "reload retains the peer preference that was durable before memory-only fallback");
    assert.equal(await page.evaluate(() => globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE), true, "a fresh successful load can use storage again");
    assert.deepEqual(errors, [], `runtime read failure has no uncaught errors: ${errors.join(" | ")}`);
    return { initialId: oldId, fault };
  } finally {
    await context.close();
  }
}

async function runHardRecoveryScenario(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 850 }, serviceWorkers: "block" });
  const errors = [];
  await installRuntimeStubs(context);
  await context.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    const key = "dailyAtlas.state.v3.book";
    const pending = "dailyAtlas.import.pending.v1";
    const before = JSON.stringify({ marker: "before" });
    const after = JSON.stringify({ marker: "after" });
    setItem.call(localStorage, key, after);
    setItem.call(localStorage, pending, JSON.stringify({
      schemaVersion: 3,
      transactionId: "hard-recovery-test",
      startedAt: "2026-08-12T00:00:00.000Z",
      operation: "reset-known",
      forwardOnly: false,
      entries: [{ key, before, after }]
    }));
    let journalRead = false;
    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value: function (wanted) {
        const value = getItem.call(this, wanted);
        if (wanted === pending) journalRead = true;
        return value;
      }
    });
    for (const [method, original] of [["setItem", setItem], ["removeItem", removeItem]]) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: function (...args) {
          if (journalRead) throw new DOMException(`persistent-recovery-${method}`, "QuotaExceededError");
          return original.apply(this, args);
        }
      });
    }
  });
  const page = await context.newPage();
  observe(page, errors);
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const recovery = await page.evaluate(() => ({
      ok: globalThis.DAILY_ATLAS_IMPORT_RECOVERY?.ok,
      status: globalThis.DAILY_ATLAS_IMPORT_RECOVERY?.status,
      persistenceAvailable: DAILY_ATLAS_PERSISTENCE_AVAILABLE,
      pending: localStorage.getItem("dailyAtlas.import.pending.v1")
    }));
    assert.equal(recovery.ok, false, "a journal that was read successfully but cannot be recovered remains a hard block");
    assert.match(recovery.status, /rollback-incomplete|recovery-incomplete/, "hard block identifies incomplete rollback/recovery");
    assert.notEqual(recovery.persistenceAvailable, false, "post-read recovery failure is not downgraded to memory-only mode");
    assert.ok(recovery.pending, "the unresolved journal is retained for a future startup recovery attempt");
    assert.equal(await page.locator(".swap-button:disabled").count(), 5, "hard recovery failure disables all five swap actions");
    assert.equal(await page.locator(".known-button:disabled").count(), 5, "hard recovery failure disables all five known actions");
    const before = await currentIds(page);
    await page.locator("#bookCard .swap-button").click({ force: true });
    await page.waitForTimeout(50);
    assert.deepEqual(await currentIds(page), before, "forced clicks cannot mutate cards while recovery is incomplete");
    assert.equal(await page.locator("#storageWarning").isVisible(), true, "hard block is visibly disclosed");
    assert.deepEqual(errors, [], `hard recovery page has no uncaught errors: ${errors.join(" | ")}`);
    return recovery;
  } finally {
    await context.close();
  }
}

async function seedFiveKnown(page) {
  await page.evaluate((allTypes) => DailyAtlasLock.transaction((lease) => {
    const collections = { book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" };
    for (const type of allTypes) {
      const key = `dailyAtlas.state.v3.${type}`;
      const saved = JSON.parse(lease.storage.getItem(key));
      const knownId = DAILY_ATLAS_CATALOG[collections[type]].find((item) => item.id !== saved.currentId).id;
      saved.knownEntries = [{ id: knownId, at: "2026-08-12T00:00:00.000Z" }];
      saved.revision += 1;
      saved.version = DailyAtlasState.incrementVersion(saved.version);
      lease.storage.setItem(key, JSON.stringify(saved));
    }
  }), types);
  await page.evaluate(() => DailyAtlasLock.whenIdle());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  assert.equal(await page.locator("#recordCount").textContent(), "5", "precondition: five long-term records are visible");
}

function incrementCounter(value) {
  const safe = State.safeSequence(value);
  return safe >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : safe + 1;
}

function expectedResetSnapshot(oldSnapshot, keys) {
  return Object.fromEntries(keys.map((key) => {
    const record = JSON.parse(oldSnapshot[key]);
    record.knownEntries = [];
    record.version = State.incrementVersion(record.version ?? record.revision);
    record.revision = incrementCounter(record.revision);
    return [key, record];
  }));
}

function parsedSnapshot(snapshot, keys) {
  return Object.fromEntries(keys.map((key) => [key, JSON.parse(snapshot[key])]));
}

async function runResetFault(browser, origin, faultAt, after, noWebLocks) {
  const context = await createPersistentContext(browser, noWebLocks);
  const errors = [];
  const page = await context.newPage();
  observe(page, errors);
  const label = `reset ${noWebLocks ? "fallback" : "WebLocks"} mutation ${faultAt} ${after ? "after" : "before"}`;
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => __storageFault.rawClear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await seedFiveKnown(page);
    const keys = types.map(stateKey);
    const oldSnapshot = await storageSnapshot(page, keys);
    const expectedNew = expectedResetSnapshot(oldSnapshot, keys);
    await page.evaluate(({ faultAt, after }) => __storageFault.arm(faultAt, after), { faultAt, after });
    await page.locator("#recordButton").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#resetRecordButton").click();
    await waitForFault(page);

    const outcome = await page.evaluate(async (allTypes) => {
      const snapshot = await DailyAtlasLock.readStorage((storage) => ({
        values: Object.fromEntries(allTypes.map((type) => [`dailyAtlas.state.v3.${type}`, storage.getItem(`dailyAtlas.state.v3.${type}`)])),
        pending: storage.getItem("dailyAtlas.import.pending.v1")
      }));
      const values = snapshot.values;
      const knownCounts = allTypes.map((type) => JSON.parse(values[`dailyAtlas.state.v3.${type}`]).knownEntries.length);
      return {
        values,
        knownCounts,
        pending: snapshot.pending,
        recordCount: document.querySelector("#recordCount")?.textContent,
        live: document.querySelector("#liveRegion")?.textContent || "",
        fault: __storageFault.snapshot()
      };
    }, types);
    const allNew = isDeepStrictEqual(parsedSnapshot(outcome.values, keys), expectedNew);
    assert.equal(allNew, true, `${label}: all five state keys commit atomically before compatibility mirroring`);
    assert.equal(outcome.pending, null, `${label}: the canonical snapshot has no pending journal`);
    assert.equal(outcome.recordCount, "0", `${label}: UI reflects the committed canonical reset`);
    assert.match(outcome.live, /已清空全部长期探索记录/, `${label}: the committed reset is announced`);
    assert.equal(outcome.fault.triggered, true, `${label}: requested fault point was reached`);

    const durable = outcome.values;
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    assert.deepEqual(await storageSnapshot(page, keys), durable, `${label}: reload preserves the selected atomic result`);
    assert.equal(await page.locator("#recordCount").textContent(), "0", `${label}: reload UI matches canonical durable state`);
    assert.deepEqual(errors, [], `${label}: no uncaught errors: ${errors.join(" | ")}`);
    return { label, allNew, mutations: outcome.fault.mutations };
  } finally {
    await context.close();
  }
}

function feedbackAndState(snapshot, oldId) {
  const profile = snapshot[profileKey] ? JSON.parse(snapshot[profileKey]) : null;
  const state = snapshot[stateKey("book")] ? JSON.parse(snapshot[stateKey("book")]) : null;
  return {
    unsuitable: profile?.feedback?.book?.[oldId]?.unsuitable === true,
    currentId: state?.currentId || null
  };
}

async function runUnsuitableFault(browser, origin, faultAt, after, noWebLocks) {
  const context = await createPersistentContext(browser, noWebLocks);
  const errors = [];
  const page = await context.newPage();
  observe(page, errors);
  const label = `unsuitable ${noWebLocks ? "fallback" : "WebLocks"} mutation ${faultAt} ${after ? "after" : "before"}`;
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => __storageFault.rawClear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const keys = [profileKey, stateKey("book")];
    const oldId = (await currentIds(page)).book;
    const before = await storageSnapshot(page, keys);
    await page.evaluate(({ faultAt, after }) => __storageFault.arm(faultAt, after), { faultAt, after });
    await page.locator('#bookCard [data-action="unsuitable"]').click();
    await waitForFault(page);
    const afterSnapshot = await storageSnapshot(page, keys);
    const result = feedbackAndState(afterSnapshot, oldId);
    const allOld = allEqualSnapshot(afterSnapshot, before, keys);
    const allNew = result.unsuitable && result.currentId !== oldId;
    assert.equal(allOld || allNew, true, `${label}: profile and book state are entirely old or entirely new`);
    assert.equal(await page.evaluate(() => localStorage.getItem("dailyAtlas.import.pending.v1")), null, `${label}: journal is cleared after recovery`);
    assert.equal((await currentIds(page)).book, allOld ? oldId : result.currentId, `${label}: visible card matches durable state`);
    const toast = await page.locator("#toastMessage").textContent();
    if (allOld) assert.doesNotMatch(toast, /已标记为不适合/, `${label}: rolled-back feedback never announces success`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const reloaded = await storageSnapshot(page, keys);
    assert.deepEqual(reloaded, afterSnapshot, `${label}: reload preserves profile/state atomicity`);
    assert.deepEqual(errors, [], `${label}: no uncaught errors: ${errors.join(" | ")}`);
    return { label, allOld, allNew };
  } finally {
    await context.close();
  }
}

async function runUndoFault(browser, origin, faultAt, after, noWebLocks) {
  const context = await createPersistentContext(browser, noWebLocks);
  const errors = [];
  const page = await context.newPage();
  observe(page, errors);
  const label = `undo ${noWebLocks ? "fallback" : "WebLocks"} mutation ${faultAt} ${after ? "after" : "before"}`;
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await page.evaluate(() => __storageFault.rawClear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const oldId = (await currentIds(page)).book;
    await page.locator('#bookCard [data-action="unsuitable"]').click();
    await page.waitForFunction((id) => document.querySelector('#bookCard [data-action="favorite"]')?.dataset.itemId !== id, oldId);
    await page.evaluate(() => DailyAtlasLock.whenIdle());
    const keys = [profileKey, stateKey("book")];
    const unsuitableSnapshot = await storageSnapshot(page, keys);
    const unsuitableResult = feedbackAndState(unsuitableSnapshot, oldId);
    assert.equal(unsuitableResult.unsuitable, true, `${label}: precondition unsuitable feedback committed`);
    assert.notEqual(unsuitableResult.currentId, oldId, `${label}: precondition replacement committed`);
    assert.equal(await page.locator("#undoButton").isVisible(), true, `${label}: undo control is available`);

    await page.evaluate(({ faultAt, after }) => __storageFault.arm(faultAt, after), { faultAt, after });
    await page.locator("#undoButton").click();
    await waitForFault(page);
    const afterSnapshot = await storageSnapshot(page, keys);
    const result = feedbackAndState(afterSnapshot, oldId);
    const unchanged = allEqualSnapshot(afterSnapshot, unsuitableSnapshot, keys);
    const restored = result.unsuitable === false && result.currentId === oldId;
    assert.equal(unchanged || restored, true, `${label}: undo keeps both keys new or restores both keys old`);
    assert.equal(await page.evaluate(() => localStorage.getItem("dailyAtlas.import.pending.v1")), null, `${label}: journal is cleared after undo recovery`);
    assert.equal((await currentIds(page)).book, unchanged ? unsuitableResult.currentId : oldId, `${label}: visible card matches durable undo result`);
    const live = await page.locator("#liveRegion").textContent();
    if (unchanged) assert.doesNotMatch(live, /已撤销/, `${label}: rolled-back undo never announces success`);
    let durableSnapshot = afterSnapshot;
    if (unchanged) {
      assert.equal(await page.locator("#undoButton").isVisible(), true, `${label}: a fully rolled-back undo remains available for retry`);
      await page.evaluate(() => __storageFault.disarm());
      await page.locator("#undoButton").click();
      await page.waitForFunction((id) => {
        const profile = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
        const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.book") || "null");
        return profile?.feedback?.book?.[id]?.unsuitable === false && state?.currentId === id;
      }, oldId);
      await page.evaluate(() => DailyAtlasLock.whenIdle());
      durableSnapshot = await storageSnapshot(page, keys);
      const retried = feedbackAndState(durableSnapshot, oldId);
      assert.equal(retried.unsuitable, false, `${label}: retry restores unsuitable feedback`);
      assert.equal(retried.currentId, oldId, `${label}: retry restores the original card`);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    assert.deepEqual(await storageSnapshot(page, keys), durableSnapshot, `${label}: reload preserves undo profile/state atomicity`);
    assert.deepEqual(errors, [], `${label}: no uncaught errors: ${errors.join(" | ")}`);
    return { label, unchanged, restored };
  } finally {
    await context.close();
  }
}

(async () => {
  const port = await listen();
  const edgePath = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  assert.equal(fs.existsSync(edgePath), true, `Microsoft Edge executable is required at ${edgePath}`);
  const browser = await chromium.launch({ headless: true, executablePath: edgePath, timeout: 20000 });
  const browserVersion = browser.version();
  const report = { browser: `Microsoft Edge ${browserVersion}`, memoryOnly: [], singleKey: [], reset: [], unsuitable: [], undo: [] };
  try {
    assert.match(browserVersion, /^151\./, `Round 3 storage fault suite must run in Microsoft Edge 151, got ${browserVersion}`);
    const origin = `http://127.0.0.1:${port}`;

    for (const mode of ["getter", "methods"]) {
      report.memoryOnly.push(await runMemoryOnlyScenario(browser, origin, mode));
      process.stdout.write(`PASS memory-only ${mode}\n`);
    }
    report.hardRecovery = await runHardRecoveryScenario(browser, origin);
    process.stdout.write("PASS readable journal recovery failure stays hard-blocked\n");
    for (const operation of ["liked", "preference", "swap"]) {
      for (const after of [false, true]) {
        report.singleKey.push(await runSingleKeyFault(browser, origin, operation, after));
        process.stdout.write(`PASS ${operation} single-key ${after ? "after" : "before"}\n`);
      }
    }
    report.runtimeReadFailure = await runRuntimeReadFailure(browser, origin);
    process.stdout.write("PASS post-startup first getItem failure enters memory-only mode\n");

    for (const after of [false, true]) {
      for (let point = 1; point <= 7; point += 1) {
        report.reset.push(await runResetFault(browser, origin, point, after, false));
        process.stdout.write(`PASS reset WebLocks point=${point} ${after ? "after" : "before"}\n`);
      }
    }
    for (const [point, after] of [[1, false], [4, true], [7, true]]) {
      report.reset.push(await runResetFault(browser, origin, point, after, true));
      process.stdout.write(`PASS reset fallback point=${point} ${after ? "after" : "before"}\n`);
    }

    for (const after of [false, true]) {
      for (let point = 1; point <= 4; point += 1) {
        report.unsuitable.push(await runUnsuitableFault(browser, origin, point, after, false));
        report.undo.push(await runUndoFault(browser, origin, point, after, false));
        process.stdout.write(`PASS unsuitable+undo WebLocks point=${point} ${after ? "after" : "before"}\n`);
      }
    }
    for (const [point, after] of [[2, false], [3, true]]) {
      report.unsuitable.push(await runUnsuitableFault(browser, origin, point, after, true));
      report.undo.push(await runUndoFault(browser, origin, point, after, true));
      process.stdout.write(`PASS unsuitable+undo fallback point=${point} ${after ? "after" : "before"}\n`);
    }

    process.stdout.write(`${JSON.stringify({ status: "PASS", ...report }, null, 2)}\n`);
  } finally {
    await browser.close();
    await closeServer();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
