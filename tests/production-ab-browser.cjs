const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const mode = argument("mode");
const baseUrl = new URL(argument("url"));
const profileDir = path.resolve(argument("profile"));
const evidencePath = path.resolve(argument("evidence"));
const expectedVersion = argument("version");

assert.ok(["prepare", "verify"].includes(mode), "--mode must be prepare or verify");
assert.equal(baseUrl.protocol, "https:", "production A/B verification requires HTTPS");
assert.ok(expectedVersion, "--version is required");
fs.mkdirSync(profileDir, { recursive: true });
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });

async function waitForApp(page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll("article.recommendation-card")];
    return cards.length === 5 && cards.every((card) => !card.hasAttribute("aria-busy") && card.querySelector("[data-item-id]"));
  }, null, { timeout: 45000 });
}

async function ensureControlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page);
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
}

async function convergeVersion(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${baseUrl.href}${baseUrl.search ? "&" : "?"}ab=${Date.now()}-${attempt}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await waitForApp(page);
    await ensureControlled(page);
    const current = await page.evaluate(() => globalThis.DAILY_ATLAS_PUBLIC_CONFIG?.appVersion || "");
    if (current === expectedVersion) return;
    await page.evaluate(() => globalThis.DailyAtlasPWA?.checkForUpdate?.());
    await page.waitForTimeout(2500);
    const applying = await page.evaluate(() => globalThis.DailyAtlasPWA?.applyUpdate?.({ reload: true, timeoutMs: 30000 }) || false);
    if (applying) await page.waitForTimeout(3500);
  }
  assert.equal(await page.evaluate(() => globalThis.DAILY_ATLAS_PUBLIC_CONFIG?.appVersion || ""), expectedVersion, "the same-origin profile converges to the expected application version");
}

async function settle(page) {
  await page.evaluate(async () => {
    await globalThis.DailyAtlasPreferencePersistence?.whenIdle?.();
    await globalThis.DailyAtlasLock?.whenIdle?.();
  });
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const profile = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
    const pwa = await globalThis.DailyAtlasPWA.getOfflineStatus();
    const favorites = {};
    for (const [type, entries] of Object.entries(profile?.feedback || {})) {
      favorites[type] = Object.entries(entries).filter(([, value]) => value?.favorite).map(([id]) => id).sort();
    }
    return {
      version: globalThis.DAILY_ATLAS_PUBLIC_CONFIG?.appVersion || null,
      controlled: Boolean(navigator.serviceWorker.controller),
      serviceWorker: navigator.serviceWorker.controller?.scriptURL || null,
      favoriteBookId: favorites.book?.[0] || null,
      favorites,
      cityRegions: [...(profile?.explicit?.city?.regions || [])].sort(),
      profileGeneration: profile?.generation ?? null,
      offlineMode: pwa?.mode || globalThis.DailyAtlasPWA.getState().offlineMode,
      offlinePhase: pwa?.phase || globalThis.DailyAtlasPWA.getState().offlinePhase,
      cacheNames: (await caches.keys()).filter((name) => name.startsWith("daily-atlas-")).sort()
    };
  });
}

async function openProfile() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "allow"
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(45000);
  await convergeVersion(page);
  return { context, page };
}

async function prepare() {
  const { context, page } = await openProfile();
  try {
    assert.equal(await page.evaluate(() => DAILY_ATLAS_PUBLIC_CONFIG.appVersion), expectedVersion);
    const favorite = page.locator('#bookCard [data-action="favorite"]');
    const favoriteId = await favorite.getAttribute("data-item-id");
    if ((await favorite.getAttribute("aria-pressed")) !== "true") await favorite.click();

    await page.locator("#settingsButton").click();
    const preference = page.locator('input[data-pref-type="city"][data-pref-field="regions"][value="欧洲"]');
    if (!(await preference.isChecked())) await preference.check();
    await page.locator("#doneSettingsButton").click();
    await settle(page);

    const light = await page.evaluate(() => DailyAtlasPWA.setOfflineMode("light"));
    assert.equal(light.ok, true, "light offline preparation succeeds");
    assert.equal(light.mode, "light");
    const state = await snapshot(page);
    assert.equal(state.version, expectedVersion);
    assert.equal(state.controlled, true);
    assert.equal(state.favoriteBookId, favoriteId);
    assert.ok(state.cityRegions.includes("欧洲"));
    assert.equal(state.offlineMode, "light");
    const evidence = { schemaVersion: 1, origin: baseUrl.origin, preparedAt: new Date().toISOString(), a: state };
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await context.close();
  }
}

async function verify() {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  let online;
  {
    const { context, page } = await openProfile();
    try {
      await settle(page);
      online = await snapshot(page);
      assert.equal(online.version, expectedVersion);
      assert.equal(online.controlled, true);
      assert.equal(online.favoriteBookId, evidence.a.favoriteBookId, "favorite survives the same-origin update");
      assert.deepEqual(online.favorites, evidence.a.favorites, "favorite set survives the same-origin update");
      assert.deepEqual(online.cityRegions, evidence.a.cityRegions, "explicit preference survives the same-origin update");
      assert.equal(online.profileGeneration, evidence.a.profileGeneration, "the update does not replace the profile generation");
      assert.equal(online.offlineMode, "light", "light offline mode survives the same-origin update");
    } finally {
      await context.close();
    }
  }

  let reopened;
  let offline;
  {
    const { context, page } = await openProfile();
    try {
      reopened = await snapshot(page);
      assert.equal(reopened.favoriteBookId, evidence.a.favoriteBookId, "favorite survives a complete browser close and reopen");
      assert.deepEqual(reopened.cityRegions, evidence.a.cityRegions, "preference survives a complete browser close and reopen");
      assert.equal(reopened.offlineMode, "light");
      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      await waitForApp(page);
      offline = {
        version: await page.evaluate(() => globalThis.DAILY_ATLAS_PUBLIC_CONFIG?.appVersion || null),
        cards: await page.locator("article.recommendation-card").count(),
        favoriteBookId: await page.evaluate(() => {
          const profile = JSON.parse(localStorage.getItem("dailyAtlas.profile.v1") || "null");
          return Object.entries(profile?.feedback?.book || {}).find(([, value]) => value?.favorite)?.[0] || null;
        })
      };
      assert.equal(offline.version, expectedVersion);
      assert.equal(offline.cards, 5, "five cached cards remain visible after an offline reopen");
      assert.equal(offline.favoriteBookId, evidence.a.favoriteBookId, "favorite remains present while offline");
      await context.setOffline(false);
    } finally {
      await context.close();
    }
  }

  const result = { ...evidence, verifiedAt: new Date().toISOString(), b: { online, reopened, offline } };
  fs.writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

(mode === "prepare" ? prepare() : verify()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
