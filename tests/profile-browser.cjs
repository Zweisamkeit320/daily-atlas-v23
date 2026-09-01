const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const rounds = Math.max(1, Number.parseInt(process.env.PROFILE_RACE_ROUNDS || "50", 10) || 50);
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

async function currentId(page, type) {
  return page.locator(`#${type}Card [data-action="favorite"]`).getAttribute("data-item-id");
}

async function readProfile(page) {
  return page.evaluate(() => DailyAtlasProfile.normalize(
    JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null")
  ));
}

async function waitForPersistenceIdle(pages) {
  await Promise.all(pages.map((page) => page.evaluate(async () => {
    await DailyAtlasPreferencePersistence.whenIdle();
    await DailyAtlasLock.whenIdle();
  })));
}

async function preferenceStatus(page) {
  return page.evaluate(() => DailyAtlasPreferencePersistence.status());
}

function assertResetShape(profile, favoriteType, favoriteId, unsuitableType, unsuitableId) {
  assert.ok(profile && Number.isSafeInteger(profile.generation), "a versioned profile is persisted");
  for (const byType of Object.values(profile.feedback)) {
    for (const entry of Object.values(byType)) {
      assert.equal(entry.liked, false, "reset removes every like");
      assert.equal(entry.unsuitable, false, "reset removes every unsuitable signal");
    }
  }
  assert.equal(profile.feedback[favoriteType][favoriteId]?.favorite, true, "reset preserves favorites");
  assert.equal(profile.feedback[unsuitableType][unsuitableId]?.unsuitable, false, "the tested unsuitable tombstone is false");
  for (const fields of Object.values(profile.explicit)) {
    for (const values of Object.values(fields)) assert.deepEqual(values, [], "reset clears every explicit preference field");
  }
}

async function createContext(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  if (options.noWebLocks) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    });
  }
  if (options.suspendProfileEvents) {
    await context.addInitScript(() => {
      window.__suspendProfileStorageEvents = true;
      window.addEventListener("storage", (event) => {
        if (window.__suspendProfileStorageEvents && event.key === "dailyAtlas.profile.v1") event.stopImmediatePropagation();
      }, true);
    });
  }
  return context;
}

async function preparePair(context, origin) {
  const errors = [];
  const pages = [await context.newPage(), await context.newPage()];
  for (const page of pages) {
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/Failed to load resource|ERR_|favicon|service worker/i.test(message.text())) errors.push(message.text());
    });
  }
  await pages[0].goto(origin, { waitUntil: "domcontentloaded" });
  await waitForAppReady(pages[0]);
  await pages[0].evaluate(() => localStorage.clear());
  await pages[0].reload({ waitUntil: "domcontentloaded" });
  await waitForAppReady(pages[0]);
  await pages[1].goto(origin, { waitUntil: "domcontentloaded" });
  await waitForAppReady(pages[1]);
  const ids = Object.fromEntries(await Promise.all(["book", "movie", "city", "german", "medical"].map(async (type) => [type, await currentId(pages[0], type)])));
  await pages[1].waitForFunction((expected) => Object.entries(expected).every(([type, id]) =>
    document.querySelector(`#${type}Card [data-action="favorite"]`)?.dataset.itemId === id
  ), ids);
  return { first: pages[0], second: pages[1], errors };
}

async function resetPreferencesScenario(browser, origin) {
  const context = await createContext(browser);
  try {
    const { first, second, errors } = await preparePair(context, origin);
    const favoriteId = await currentId(first, "book");
    const unsuitableId = await currentId(first, "movie");
    await first.locator('#bookCard [data-action="liked"]').click();
    await first.locator('#bookCard [data-action="favorite"]').click();
    await first.locator('#movieCard [data-action="unsuitable"]').click();
    await first.waitForFunction((id) => document.querySelector('#movieCard [data-action="favorite"]')?.dataset.itemId !== id, unsuitableId);
    await first.locator("#settingsButton").click();
    await first.locator('input[data-pref-type="city"][data-pref-field="regions"][value="亚洲"]').check();
    await first.locator('#medicalPreferenceOptions input[data-pref-type="medical"]').first().check();
    await waitForPersistenceIdle([first]);
    const stale = await readProfile(first);
    assert.equal(stale.feedback.book[favoriteId].liked, true, "precondition: liked signal exists before reset");
    assert.equal(stale.feedback.book[favoriteId].favorite, true, "precondition: favorite exists before reset");
    assert.equal(stale.feedback.movie[unsuitableId].unsuitable, true, "precondition: unsuitable signal exists before reset");
    first.once("dialog", (dialog) => dialog.accept());
    await first.locator("#resetPreferencesButton").click();
    await first.waitForFunction((generation) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).generation > generation, stale.generation);
    const reset = await readProfile(first);
    assertResetShape(reset, "book", favoriteId, "movie", unsuitableId);
    await second.waitForFunction((generation) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).generation > generation, stale.generation);

    await second.evaluate((oldProfile) => localStorage.setItem("dailyAtlas.profile.v1", JSON.stringify(oldProfile)), stale);
    await first.waitForFunction((generation) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).generation > generation, stale.generation);
    assertResetShape(await readProfile(first), "book", favoriteId, "movie", unsuitableId);

    await Promise.all([first, second].map(async (page) => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      assertResetShape(await readProfile(page), "book", favoriteId, "movie", unsuitableId);
      await page.locator("#settingsButton").click();
      assert.equal(await page.locator("[data-pref-type][data-pref-field]:checked").count(), 0, "explicit preferences remain cleared after reload");
      await page.locator("#doneSettingsButton").click();
    }));
    assert.deepEqual(errors, [], `reset scenario has no page errors: ${errors.join(" | ")}`);
    return { generationBefore: stale.generation, generationAfter: reset.generation, favoriteId, unsuitableId };
  } finally {
    await context.close();
  }
}

async function replaceImportScenario(browser, origin) {
  const context = await createContext(browser);
  try {
    const { first, second, errors } = await preparePair(context, origin);
    const staleLikedId = await currentId(first, "book");
    const importedFavoriteId = await currentId(first, "movie");
    await first.locator('#bookCard [data-action="liked"]').click();
    await first.waitForFunction((id) => {
      const saved = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
      return saved?.feedback?.book?.[id]?.liked === true;
    }, staleLikedId);
    const stale = await readProfile(first);
    const backupText = await first.evaluate(({ favoriteId }) => {
      let imported = DailyAtlasProfile.emptyProfile();
      imported = DailyAtlasProfile.setFeedback(imported, "movie", favoriteId, "favorite", true, new Date("2026-08-12T08:00:00Z"));
      imported = DailyAtlasProfile.setExplicit(imported, "german", "levels", ["B1"], new Date("2026-08-12T08:00:01Z"));
      const payload = JSON.parse(DailyAtlasBackup.serialize(localStorage, {
        appVersion: "2.0.0",
        catalogSnapshot: DAILY_ATLAS_CATALOG.snapshotDate
      }));
      payload.optional[DailyAtlasProfile.STORAGE_KEY] = imported;
      return JSON.stringify(payload);
    }, { favoriteId: importedFavoriteId });

    await first.locator("#settingsButton").click();
    const chooserPromise = first.waitForEvent("filechooser");
    await first.locator("#importBackupButton").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "valid-replace-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(backupText, "utf8")
    });
    await first.locator("#backupPreviewDialog").waitFor({ state: "visible" });
    await first.locator("#backupReplaceMode").waitFor({ state: "visible" });
    await first.locator("#backupReplaceMode").check();
    await first.waitForFunction(() => {
      const panel = document.querySelector("#backupPreviewPanel");
      const mode = document.querySelector("#backupReplaceMode");
      const apply = document.querySelector("#applyBackupButton");
      return panel && !panel.hidden
        && mode?.checked
        && apply && !apply.hidden && !apply.disabled
        && apply.textContent.trim() === "确认替换";
    });
    const navigation = first.waitForNavigation({ waitUntil: "domcontentloaded" });
    await first.locator("#applyBackupButton").click();
    await navigation;
    await waitForAppReady(first);
    await first.waitForFunction((generation) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).generation > generation, stale.generation);
    const imported = await readProfile(first);
    assert.equal(imported.feedback.book[staleLikedId]?.liked || false, false, "replace import removes the old liked signal");
    assert.equal(imported.feedback.movie[importedFavoriteId]?.favorite, true, "replace import installs its favorite");
    assert.deepEqual(imported.explicit.german.levels, ["B1"], "replace import installs its explicit preference");

    await second.waitForFunction((generation) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).generation > generation, stale.generation);
    await second.evaluate((oldProfile) => localStorage.setItem("dailyAtlas.profile.v1", JSON.stringify(oldProfile)), stale);
    await first.waitForFunction((generation) => JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).generation > generation, stale.generation);
    await Promise.all([first, second].map(async (page) => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      const profile = await readProfile(page);
      assert.equal(profile.generation, imported.generation, "both tabs retain the imported generation");
      assert.equal(profile.feedback.book[staleLikedId]?.liked || false, false, "a stale tab cannot resurrect replaced likes");
      assert.equal(profile.feedback.movie[importedFavoriteId]?.favorite, true, "the imported favorite survives stale writes and reload");
      assert.deepEqual(profile.explicit.german.levels, ["B1"], "the imported explicit field survives stale writes and reload");
    }));
    assert.deepEqual(errors, [], `replace import scenario has no page errors: ${errors.join(" | ")}`);
    return { generationBefore: stale.generation, generationAfter: imported.generation, importedFavoriteId };
  } finally {
    await context.close();
  }
}

async function concurrentExplicitScenario(browser, origin, noWebLocks) {
  const context = await createContext(browser, { noWebLocks, suspendProfileEvents: true });
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  try {
    const { first, second, errors } = await preparePair(context, origin);
    await Promise.all([first.locator("#settingsButton").click(), second.locator("#settingsButton").click()]);
    const city = first.locator('input[data-pref-type="city"][data-pref-field="regions"][value="欧洲"]');
    const medical = second.locator('#medicalPreferenceOptions input[data-pref-type="medical"]').first();
    const medicalValue = await medical.getAttribute("value");
    const finalChecked = rounds % 2 === 1;
    const capability = await Promise.all([first, second].map((page) => page.evaluate(() => ({
      request: typeof navigator.locks?.request,
      backend: DailyAtlasLock.status().backend,
      preference: DailyAtlasPreferencePersistence.status()
    }))));
    for (const entry of capability) {
      assert.equal(entry.backend, noWebLocks ? "indexeddb" : "web-locks+indexeddb", `${mode} selects the expected canonical coordinator`);
      assert.equal(entry.request, noWebLocks ? "undefined" : "function");
      assert.equal(entry.preference.pending, 0);
    }

    // Prove acceptance happens inside the same dispatch stack and that two
    // opposite intents retain request order without relying on Playwright's
    // post-action wait behavior.
    const synchronous = await first.evaluate(() => {
      const input = document.querySelector('input[data-pref-type="city"][data-pref-field="regions"][value="非洲"]');
      if (!input) throw new Error("synchronous preference probe input is missing");
      const before = DailyAtlasPreferencePersistence.status();
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const afterCheck = DailyAtlasPreferencePersistence.status();
      input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const afterUncheck = DailyAtlasPreferencePersistence.status();
      return { before, afterCheck, afterUncheck };
    });
    assert.equal(synchronous.afterCheck.accepted, synchronous.before.accepted + 1, `${mode}: check is accepted before dispatchEvent returns`);
    assert.equal(synchronous.afterCheck.pending, synchronous.before.pending + 1, `${mode}: check is pending before dispatchEvent returns`);
    assert.equal(synchronous.afterUncheck.accepted, synchronous.before.accepted + 2, `${mode}: immediate uncheck is accepted before dispatchEvent returns`);
    assert.equal(synchronous.afterUncheck.pending, synchronous.before.pending + 2, `${mode}: both opposite intents enter the shared queue in call order`);
    await waitForPersistenceIdle([first, second]);
    const synchronousSettled = await preferenceStatus(first);
    assert.equal(synchronousSettled.completed, synchronous.before.completed + 2, `${mode}: both opposite intents commit exactly once`);
    assert.equal(synchronousSettled.failed, synchronous.before.failed, `${mode}: neither opposite intent fails`);
    assert.equal(synchronousSettled.pending, 0, `${mode}: opposite intents fully settle`);
    assert.equal((await readProfile(first)).explicit.city.regions.includes("非洲"), false, `${mode}: check then uncheck leaves the canonical field clear`);

    for (let index = 0; index < rounds; index += 1) {
      const checked = index % 2 === 0;
      const beforeProfile = await readProfile(first);
      const beforeStatuses = await Promise.all([preferenceStatus(first), preferenceStatus(second)]);
      await Promise.all([city.setChecked(checked), medical.setChecked(checked)]);

      const acceptedStatuses = await Promise.all([preferenceStatus(first), preferenceStatus(second)]);
      for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
        assert.equal(
          acceptedStatuses[pageIndex].accepted,
          beforeStatuses[pageIndex].accepted + 1,
          `${mode} round ${index + 1}: the UI intent is accepted synchronously`
        );
        assert.equal(
          acceptedStatuses[pageIndex].accepted,
          acceptedStatuses[pageIndex].completed + acceptedStatuses[pageIndex].failed + acceptedStatuses[pageIndex].pending,
          `${mode} round ${index + 1}: preference accounting is balanced immediately after dispatch`
        );
      }

      await waitForPersistenceIdle([first, second]);
      const settledStatuses = await Promise.all([preferenceStatus(first), preferenceStatus(second)]);
      for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
        assert.equal(settledStatuses[pageIndex].pending, 0, `${mode} round ${index + 1}: no accepted preference remains pending`);
        assert.equal(settledStatuses[pageIndex].failed, beforeStatuses[pageIndex].failed, `${mode} round ${index + 1}: no preference write fails`);
        assert.equal(settledStatuses[pageIndex].completed, beforeStatuses[pageIndex].completed + 1, `${mode} round ${index + 1}: the accepted preference commits once`);
      }

      const persisted = await readProfile(first);
      assert.deepEqual(persisted.explicit.city.regions, checked ? ["欧洲"] : [], `${mode} round ${index + 1}: city field follows its intent`);
      assert.deepEqual(persisted.explicit.medical.topicGroups, checked ? [medicalValue] : [], `${mode} round ${index + 1}: medical field follows its intent`);
      assert.ok(
        Date.parse(persisted.updatedAtByField.explicit.city.regions) > Date.parse(beforeProfile.updatedAtByField.explicit.city.regions),
        `${mode} round ${index + 1}: city field clock advances`
      );
      assert.ok(
        Date.parse(persisted.updatedAtByField.explicit.medical.topicGroups) > Date.parse(beforeProfile.updatedAtByField.explicit.medical.topicGroups),
        `${mode} round ${index + 1}: medical field clock advances`
      );
      assert.equal(persisted.generation, beforeProfile.generation, `${mode} round ${index + 1}: ordinary preferences do not change generation`);
      if ((index + 1) % 10 === 0 || index + 1 === rounds) {
        process.stdout.write(`  ${mode} explicit fields: ${index + 1}/${rounds} rounds committed\n`);
      }
    }

    // Two stale tabs now modify different values of the same field. A full DOM
    // snapshot would lose one value even with a perfect mutex; per-toggle
    // intents must preserve both.
    const asia = second.locator('input[data-pref-type="city"][data-pref-field="regions"][value="亚洲"]');
    await Promise.all([city.setChecked(false), asia.setChecked(false)]);
    await waitForPersistenceIdle([first, second]);
    const beforeSameField = await Promise.all([preferenceStatus(first), preferenceStatus(second)]);
    await Promise.all([city.check(), asia.check()]);
    const acceptedSameField = await Promise.all([preferenceStatus(first), preferenceStatus(second)]);
    assert.equal(acceptedSameField[0].accepted, beforeSameField[0].accepted + 1, `${mode}: first same-field toggle is synchronously accepted`);
    assert.equal(acceptedSameField[1].accepted, beforeSameField[1].accepted + 1, `${mode}: second same-field toggle is synchronously accepted`);
    await waitForPersistenceIdle([first, second]);
    assert.deepEqual(
      new Set((await readProfile(first)).explicit.city.regions),
      new Set(["欧洲", "亚洲"]),
      `${mode}: same-field deltas from two stale tabs are both preserved`
    );

    await Promise.all([first, second].map((page) => page.evaluate(() => { window.__suspendProfileStorageEvents = false; })));
    await Promise.all([first, second].map(async (page) => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      const profile = await readProfile(page);
      assert.deepEqual(new Set(profile.explicit.city.regions), new Set(["欧洲", "亚洲"]), `${mode}: city values converge after reload`);
      assert.deepEqual(profile.explicit.medical.topicGroups, finalChecked ? [medicalValue] : [], `${mode}: final medical preference converges after reload`);
      const queue = await preferenceStatus(page);
      assert.equal(queue.pending, 0);
      assert.equal(queue.failed, 0);
    }));
    assert.deepEqual(errors, [], `${mode} explicit merge scenario has no page errors: ${errors.join(" | ")}`);
    return { mode, rounds, city: ["欧洲", "亚洲"], medical: medicalValue };
  } finally {
    await context.close();
  }
}

async function unsuitableUndoRaceScenario(browser, origin, noWebLocks) {
  const context = await createContext(browser, { noWebLocks });
  const mode = noWebLocks ? "IndexedDB fallback" : "Web Locks";
  try {
    const { first, second, errors } = await preparePair(context, origin);
    const loadTokens = await Promise.all([first, second].map((page) => page.evaluate(() => performance.timeOrigin)));
    const capability = await first.evaluate(() => ({
      locks: typeof navigator.locks,
      request: typeof navigator.locks?.request,
      backend: DailyAtlasLock?.status?.().backend
    }));
    if (noWebLocks) assert.deepEqual(capability, { locks: "undefined", request: "undefined", backend: "indexeddb" }, "fallback mode disables Web Locks and uses IndexedDB");
    else {
      assert.equal(capability.request, "function", "Web Locks mode uses the browser lock manager");
      assert.equal(capability.backend, "web-locks+indexeddb");
    }

    for (let index = 0; index < rounds; index += 1) {
      const actor = index % 2 === 0 ? first : second;
      const peer = actor === first ? second : first;
      const originalId = await currentId(actor, "movie");
      assert.equal(await currentId(peer, "movie"), originalId, `${mode} round ${index + 1}: tabs start converged`);
      await actor.locator('#movieCard [data-action="unsuitable"]').click();
      await actor.waitForFunction((id) => document.querySelector('#movieCard [data-action="favorite"]')?.dataset.itemId !== id, originalId);
      await actor.locator("#undoButton").waitFor({ state: "visible" });
      const marked = await actor.evaluate((id) => {
        const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.movie") || "null");
        const profile = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
        return {
          currentId: state?.currentId,
          skipped: state?.skipped || [],
          unsuitable: profile?.feedback?.movie?.[id]?.unsuitable
        };
      }, originalId);
      assert.notEqual(marked.currentId, originalId, `${mode} round ${index + 1}: unsuitable transaction replaces the visible ID`);
      assert.equal(marked.skipped.includes(originalId), true, `${mode} round ${index + 1}: unsuitable transaction records the replaced ID`);
      assert.equal(marked.unsuitable, true, `${mode} round ${index + 1}: unsuitable profile and state commit atomically before undo`);
      await peer.waitForFunction((id) =>
        document.querySelector('#movieCard [data-action="favorite"]')?.dataset.itemId !== id,
      originalId);
      const undoDispatch = await actor.evaluate(() => {
        const button = document.querySelector("#undoButton");
        const before = DailyAtlasLock.status();
        const toastBefore = document.querySelector("#toastMessage")?.textContent || "";
        button.click();
        const after = DailyAtlasLock.status();
        return { before, after, toastBefore, toastAfter: document.querySelector("#toastMessage")?.textContent || "", hidden: button.hidden };
      });
      assert.equal(
        undoDispatch.after.accepted,
        undoDispatch.before.accepted + 1,
        `${mode} round ${index + 1}: the visible undo control synchronously submits one transaction; ${JSON.stringify(undoDispatch)}`
      );
      await actor.evaluate(() => DailyAtlasLock.whenIdle());
      const durableUndo = await actor.evaluate((id) => {
        const state = JSON.parse(localStorage.getItem("dailyAtlas.state.v3.movie") || "null");
        const profile = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
        return {
          restored: state?.currentId === id && profile?.feedback?.movie?.[id]?.unsuitable === false,
          state,
          unsuitable: profile?.feedback?.movie?.[id]?.unsuitable,
          lockStatus: DailyAtlasLock.status(),
          toast: document.querySelector("#toastMessage")?.textContent || "",
          warning: document.querySelector("#storageWarning")?.textContent || ""
        };
      }, originalId);
      assert.equal(
        durableUndo.restored,
        true,
        `${mode} round ${index + 1}: undo transaction must restore state/profile after its observable lock settles; ${JSON.stringify(durableUndo)}`
      );
      for (const [role, page] of [["actor", actor], ["peer", peer]]) {
        try {
          await page.waitForFunction((id) =>
            document.querySelector('#movieCard [data-action="favorite"]')?.dataset.itemId === id &&
            document.querySelector('#movieCard [data-action="unsuitable"]')?.getAttribute("aria-pressed") === "false",
          originalId);
        } catch (error) {
          const diagnostic = await page.evaluate(() => ({
            visibleId: document.querySelector('#movieCard [data-action="favorite"]')?.dataset.itemId || null,
            ariaPressed: document.querySelector('#movieCard [data-action="unsuitable"]')?.getAttribute("aria-pressed") || null,
            state: JSON.parse(localStorage.getItem("dailyAtlas.state.v3.movie") || "null"),
            profile: JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null"),
            pending: localStorage.getItem("dailyAtlas.import.pending.v1"),
            lockStatus: DailyAtlasLock?.status?.() || null,
            backupStatus: document.querySelector("#backupStatus")?.textContent || ""
          }));
          throw new Error(`${mode} round ${index + 1} ${role} did not converge: ${JSON.stringify(diagnostic)}; ${error.message}`);
        }
      }
      const persisted = await actor.evaluate((id) => ({
        state: JSON.parse(localStorage.getItem("dailyAtlas.state.v3.movie")),
        unsuitable: JSON.parse(localStorage.getItem("dailyAtlas.profile.v1")).feedback.movie[id]?.unsuitable,
        legacyLockRecords: Object.keys(localStorage).filter((key) => key.startsWith("dailyAtlas.lock.v1."))
      }), originalId);
      assert.equal(persisted.state.currentId, originalId, `${mode} round ${index + 1}: persisted state restores the original ID`);
      assert.equal(persisted.unsuitable, false, `${mode} round ${index + 1}: persisted feedback is restored`);
      assert.equal(persisted.legacyLockRecords.length, 0, `${mode} round ${index + 1}: no retired localStorage mutex record exists`);
      if ((index + 1) % 10 === 0 || index + 1 === rounds) process.stdout.write(`  ${mode}: ${index + 1}/${rounds} rounds converged\n`);
    }
    assert.deepEqual(
      await Promise.all([first, second].map((page) => page.evaluate(() => performance.timeOrigin))),
      loadTokens,
      `${mode}: ordinary unsuitable/undo journals synchronize in place without reloading either tab`
    );
    assert.deepEqual(errors, [], `${mode} race scenario has no page errors: ${errors.join(" | ")}`);
    return { mode, rounds };
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
  const started = Date.now();
  const report = { browser: executablePath ? `Microsoft Edge ${browser.version()}` : `Playwright Chromium ${browser.version()}`, origin, rounds };
  try {
    report.reset = await resetPreferencesScenario(browser, origin);
    process.stdout.write("PASS reset generation, two tabs, stale write and reload\n");
    report.import = await replaceImportScenario(browser, origin);
    process.stdout.write("PASS replace import generation, two tabs, stale write and reload\n");
    report.explicitWebLocks = await concurrentExplicitScenario(browser, origin, false);
    process.stdout.write(`PASS independent city/medical field clocks ${rounds}/${rounds} with Web Locks\n`);
    report.explicitIndexedDb = await concurrentExplicitScenario(browser, origin, true);
    process.stdout.write(`PASS independent city/medical field clocks ${rounds}/${rounds} with IndexedDB fallback\n`);
    report.webLocks = await unsuitableUndoRaceScenario(browser, origin, false);
    process.stdout.write(`PASS unsuitable/undo ${rounds} rounds with Web Locks\n`);
    report.fallback = await unsuitableUndoRaceScenario(browser, origin, true);
    process.stdout.write(`PASS unsuitable/undo ${rounds} rounds with IndexedDB fallback\n`);
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
