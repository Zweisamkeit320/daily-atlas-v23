"use strict";

importScripts("./asset-routing.js");

const CACHE_PREFIX = "daily-atlas-shell-";
const CONTENT_CACHE_PREFIX = "daily-atlas-content-";
const MEDICAL_CACHE_PREFIX = "daily-atlas-medical-";
const SEARCH_CACHE_PREFIX = "daily-atlas-search-";
const CONTENT_RUNTIME_CACHE_PREFIX = "daily-atlas-content-runtime-";
const SEARCH_DATA_CACHE_PREFIX = "daily-atlas-search-data-";
const AUDIO_CACHE_PREFIX = "daily-atlas-audio-";
const VISUAL_CACHE_PREFIX = "daily-atlas-visual-";
const VISUAL_PACK_CACHE_PREFIX = "daily-atlas-visual-pack-";

// CACHE_VERSION remains as a release-integrity compatibility field for the
// packaging tools. Runtime caches use independently generated pack versions.
const CACHE_VERSION = "v3-74d2e462a68a3b54";
const SHELL_VERSION = "s1-c158d968d617428e";
const CONTENT_VERSION = "c1-9bd86054a0e87ea9";
const MEDICAL_VERSION = "m1-9c59aa54b9d7dc86";
const AUDIO_VERSION = "a1-390c78b958c182b5";
const SEARCH_VERSION = "q1-2e57efa7447e616b";
const VISUAL_VERSION = "i1-9645b96d488e53f2";
const AUDIO_MANIFEST_SHA256 = "35E652038EB1B805D51D7AC50A72F892B6F3451792D573940ECBF550AAB4C0EA";

const CACHE_NAME = `${CACHE_PREFIX}${SHELL_VERSION}`;
const CONTENT_CACHE = `${CONTENT_CACHE_PREFIX}${CONTENT_VERSION}`;
const MEDICAL_CACHE = `${MEDICAL_CACHE_PREFIX}${MEDICAL_VERSION}`;
const SEARCH_CACHE = `${SEARCH_CACHE_PREFIX}${SEARCH_VERSION}`;
const CONTENT_RUNTIME_CACHE = `${CONTENT_RUNTIME_CACHE_PREFIX}${CONTENT_VERSION}`;
const SEARCH_DATA_CACHE = `${SEARCH_DATA_CACHE_PREFIX}${SEARCH_VERSION}`;
const AUDIO_METADATA_CACHE = `${AUDIO_CACHE_PREFIX}metadata-${AUDIO_VERSION}`;
const LIGHT_AUDIO_CACHE = `${AUDIO_CACHE_PREFIX}light-${AUDIO_VERSION}`;
// One physical cache is intentionally used for both logical stages. Until the
// ready marker is written, its verified files are resumable staging data and
// are never served as a complete pack. This avoids a quota-heavy 10 MB copy.
const FULL_AUDIO_CACHE = `${AUDIO_CACHE_PREFIX}pack-${AUDIO_VERSION}`;
const VISUAL_CACHE = `${VISUAL_CACHE_PREFIX}${VISUAL_VERSION}`;
const FULL_VISUAL_CACHE = `${VISUAL_PACK_CACHE_PREFIX}${VISUAL_VERSION}`;
const VISUAL_CACHE_MAX_ITEMS = 180;
const FULL_AUDIO_MARKER = "./__daily-atlas-full-audio-complete__";
const FULL_CONTENT_MARKER = "./__daily-atlas-full-content-complete__";
const FULL_SEARCH_MARKER = "./__daily-atlas-full-search-complete__";
const FULL_VISUAL_MARKER = "./__daily-atlas-full-visual-complete__";
const PACK_READY_MARKER = "./__daily-atlas-pack-ready__";
const GERMAN_AUDIO_MANIFEST = "./assets/audio/german/manifest.json";
const CITY_VISUAL_MANIFEST = "./assets/visuals/cities/manifest.json";
const SPLIT_CATALOG_MANIFEST = "./catalog-data/manifest.json";
const ASSET_TIMEOUT_MS = 20000;
const FULL_AUDIO_BATCH_SIZE = 4;
const INSTALL_FETCH_CONCURRENCY = 4;
const APP_SHELL = Object.freeze([
  "./",
  "./index.html",
  "./styles.css",
  "./public-config.js",
  "./privacy.html",
  "./sources-and-licenses.html",
  "./city-credits.html",
  "./city-credits.js",
  "./legal.css",
  "./asset-routing.js",
  "./runtime-health.js",
  "./diagnostics.html",
  "./diagnostics.css",
  "./diagnostics.js",
  "./bootstrap.js",
  "./catalog-loader.js",
  "./engine.js",
  "./state.js",
  "./profile.js",
  "./lock.js",
  "./backup.js",
  "./backup-crypto.js",
  "./appearance.js",
  "./weekly.js",
  "./music.js",
  "./speech.js",
  "./city-live.js",
  "./reminders.js",
  "./visuals.js",
  "./assets/visuals/cities/manifest.js",
  "./assets/visuals/cities/manifest.json",
  "./pwa.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./catalog-data/manifest.js",
  "./catalog-data/manifest.json",
  "./catalog-data/selection-data.d6e3cb1e495c.json",
  "./explore.js",
  "./search-worker.js",
  "./assets/medical/manifest.json",
  "./assets/medical/README.md",
  "./assets/medical/activity.webp",
  "./assets/medical/movement-musculoskeletal.webp",
  "./assets/medical/sleep.webp",
  "./assets/medical/sleep-disorders.webp",
  "./assets/medical/nutrition.webp",
  "./assets/medical/digestion-oral.webp",
  "./assets/medical/cardiovascular.webp",
  "./assets/medical/metabolic-renal.webp",
  "./assets/medical/immunity.webp",
  "./assets/medical/infection-hygiene.webp",
  "./assets/medical/mental-wellbeing.webp",
  "./assets/medical/brain.webp",
  "./assets/medical/vision-hearing.webp",
  "./assets/medical/skin-sun.webp",
  "./assets/medical/medication-safety.webp",
  "./assets/medical/tests-literacy.webp",
  "./assets/medical/emergency-heart-brain.webp",
  "./assets/medical/emergency.webp",
  "./assets/medical/environment-climate-air.webp",
  "./assets/medical/environment-travel-work.webp",
  "./assets/medical/screening-cancer.webp",
  "./assets/medical/prevention-risk.webp",
  "./assets/medical/lifespan-reproductive-child.webp",
  "./assets/medical/lifespan-ageing-falls.webp",
  GERMAN_AUDIO_MANIFEST
]);

const CONTENT_ASSETS = Object.freeze(APP_SHELL.filter((path) => /\.\/catalog-data\/selection-data\.[a-f0-9]{12}\.json$/.test(path)));
const SEARCH_ASSETS = Object.freeze(APP_SHELL.filter((path) => path === "./explore.js" || path === "./search-worker.js"));
const MEDICAL_ASSETS = Object.freeze(APP_SHELL.filter((path) => path.startsWith("./assets/medical/")));
const AUDIO_METADATA_ASSETS = Object.freeze([GERMAN_AUDIO_MANIFEST]);
const CORE_SHELL_ASSETS = Object.freeze(APP_SHELL.filter((path) => (
  !CONTENT_ASSETS.includes(path)
  && !SEARCH_ASSETS.includes(path)
  && !MEDICAL_ASSETS.includes(path)
  && !AUDIO_METADATA_ASSETS.includes(path)
)));
const PACK_VERSIONS = Object.freeze({
  shell: SHELL_VERSION,
  content: CONTENT_VERSION,
  medical: MEDICAL_VERSION,
  audio: AUDIO_VERSION,
  search: SEARCH_VERSION,
  visual: VISUAL_VERSION
});

let narrationManifestPromise = null;
let cityVisualManifestPromise = null;
let splitCatalogManifestPromise = null;
let fullAudioReadyPromise = null;
let fullVisualReadyPromise = null;
let fullDownloadPromise = null;
let fullDownloadStopReason = null;
let fullDownloadCount = 0;
let fullDownloadAbortController = null;
const fullDownloadObservers = new Set();

function createTaskQueue(concurrency) {
  const limit = Math.max(1, Math.min(8, Number(concurrency) || INSTALL_FETCH_CONCURRENCY));
  const pending = [];
  let active = 0;
  const drain = () => {
    while (active < limit && pending.length) {
      const entry = pending.shift();
      active += 1;
      Promise.resolve().then(entry.task).then(entry.resolve, entry.reject).finally(() => {
        active -= 1;
        drain();
      });
    }
  };
  return Object.freeze({
    run(task) {
      if (typeof task !== "function") return Promise.reject(new TypeError("queued task must be a function"));
      return new Promise((resolve, reject) => {
        pending.push({ task, resolve, reject });
        drain();
      });
    }
  });
}

function invalidateFullAudioTrust() {
  fullAudioReadyPromise = null;
}

function invalidateFullVisualTrust() {
  fullVisualReadyPromise = null;
}

function localUrl(value) {
  return new URL(value, self.location.href).href;
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}

function codedError(message, code, details) {
  const error = new Error(message);
  error.code = code;
  if (details) Object.assign(error, details);
  return error;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const installQueue = createTaskQueue(INSTALL_FETCH_CONCURRENCY);
    const packs = [
      [CACHE_NAME, SHELL_VERSION, CORE_SHELL_ASSETS, cacheApplicationShell],
      [CONTENT_CACHE, CONTENT_VERSION, CONTENT_ASSETS, cacheContentPack],
      [MEDICAL_CACHE, MEDICAL_VERSION, MEDICAL_ASSETS, (queue) => cacheOrdinaryPack(MEDICAL_CACHE, MEDICAL_VERSION, MEDICAL_ASSETS, queue)],
      [SEARCH_CACHE, SEARCH_VERSION, SEARCH_ASSETS, (queue) => cacheOrdinaryPack(SEARCH_CACHE, SEARCH_VERSION, SEARCH_ASSETS, queue)],
      [AUDIO_METADATA_CACHE, AUDIO_VERSION, AUDIO_METADATA_ASSETS, (queue) => cacheOrdinaryPack(AUDIO_METADATA_CACHE, AUDIO_VERSION, AUDIO_METADATA_ASSETS, queue)]
    ];
    const reusable = new Map(await Promise.all(packs.map(async ([name, version, paths]) => (
      [name, await packReady(name, version, paths)]
    ))));
    try {
      await Promise.all(packs.map(([, , , installPack]) => installPack(installQueue)));
      await narrationEntries();
    } catch (error) {
      await Promise.all(packs
        .filter(([name]) => !reusable.get(name))
        .map(([name]) => caches.delete(name)));
      throw error;
    }
  })());
});

async function packReady(cacheName, version, paths) {
  if (!(await caches.keys()).includes(cacheName)) return false;
  const cache = await caches.open(cacheName);
  const marker = await cache.match(localUrl(PACK_READY_MARKER));
  if (!marker?.ok) return false;
  try {
    const value = await marker.json();
    if (value?.version !== version || value?.count !== paths.length) return false;
    const expected = new Set(paths.map(localUrl));
    const actual = (await cache.keys())
      .map((request) => request.url)
      .filter((url) => url !== localUrl(PACK_READY_MARKER));
    return actual.length === expected.size && actual.every((url) => expected.has(url));
  } catch (_error) {
    return false;
  }
}

async function cachePack(cacheName, version, paths, loader, queue) {
  if (await packReady(cacheName, version, paths)) return Object.freeze({ reused: true });
  await caches.delete(cacheName);
  const cache = await caches.open(cacheName);
  try {
    const responses = await Promise.all(paths.map(async (assetPath) => {
      const task = () => loader(assetPath);
      return {
        assetPath,
        response: await (queue?.run ? queue.run(task) : task())
      };
    }));
    for (const { assetPath, response } of responses) await cache.put(localUrl(assetPath), response);
    const expected = new Set(paths.map(localUrl));
    const keys = await cache.keys();
    if (keys.length !== expected.size || keys.some((request) => !expected.has(request.url))) {
      throw codedError(`Pack ${version} was not written completely`, "CACHE_WRITE_FAILED");
    }
    await cache.put(localUrl(PACK_READY_MARKER), jsonResponse({ version, count: paths.length }));
    if (!(await packReady(cacheName, version, paths))) throw codedError(`Pack ${version} failed its ready check`, "CACHE_WRITE_FAILED");
    return Object.freeze({ reused: false });
  } catch (error) {
    await caches.delete(cacheName);
    throw error;
  }
}

async function fetchLocalAsset(assetPath) {
  const response = await fetch(localUrl(assetPath), { cache: "reload" });
  if (!response.ok) throw codedError(`Application asset failed with HTTP ${response.status}: ${assetPath}`, "NETWORK");
  if (!response.redirected) return response;
  const finalUrl = new URL(response.url);
  if (finalUrl.origin !== self.location.origin) {
    throw codedError(`Application asset redirected off-origin: ${assetPath}`, "NETWORK");
  }
  // Static hosts such as Cloudflare Pages canonicalize /index.html to /.
  // Returning a cached redirected Response from a navigation fetch causes
  // Chromium to reject the navigation with net::ERR_FAILED. Reconstruct the
  // same-origin 200 response before caching so it has no redirect URL list.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function cacheApplicationShell(queue) {
  return cachePack(CACHE_NAME, SHELL_VERSION, CORE_SHELL_ASSETS, fetchLocalAsset, queue);
}

async function cacheOrdinaryPack(cacheName, version, paths, queue) {
  return cachePack(cacheName, version, paths, fetchLocalAsset, queue);
}

function validateSplitCatalogManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest?.total !== 2200
    || !Array.isArray(manifest?.details?.chunks) || manifest.details.chunks.length !== 44) {
    throw codedError("Split catalog manifest is invalid", "INVALID_CATALOG_MANIFEST");
  }
  const records = [manifest.selection, manifest.selectionData, manifest.search, ...manifest.details.chunks];
  if (records.some((record) => (
    !record || !/^(?:selection|search)\.[a-f0-9]{12}\.js$|^selection-data\.[a-f0-9]{12}\.json$|^details\/(?:book|movie|city|german|medical)-\d{3}\.[a-f0-9]{12}\.js$/.test(record.path || "")
    || !Number.isSafeInteger(record.bytes) || record.bytes <= 0
    || !/^[A-F0-9]{64}$/.test(String(record.sha256 || ""))
  ))) throw codedError("Split catalog asset metadata is invalid", "INVALID_CATALOG_MANIFEST");
  return manifest;
}

async function fetchReleaseSplitCatalogManifest() {
  const response = await fetchLocalAsset(SPLIT_CATALOG_MANIFEST);
  return validateSplitCatalogManifest(await response.json());
}

async function cacheContentPack(queue) {
  let manifestPromise = null;
  return cachePack(CONTENT_CACHE, CONTENT_VERSION, CONTENT_ASSETS, async (assetPath) => {
    if (!/\/catalog-data\/(?:selection|search)\.[a-f0-9]{12}\.js$|\/catalog-data\/selection-data\.[a-f0-9]{12}\.json$/.test(assetPath)) return fetchLocalAsset(assetPath);
    manifestPromise ||= fetchReleaseSplitCatalogManifest();
    const manifest = await manifestPromise;
    const relative = assetPath.replace(/^\.\/catalog-data\//, "");
    const record = relative === manifest.selectionData.path ? manifest.selectionData : relative === manifest.search.path ? manifest.search : null;
    if (!record) throw codedError(`Split catalog asset is not declared: ${relative}`, "INVALID_CATALOG_MANIFEST");
    const verified = await DailyAtlasAssets.assetResolver(`catalog-data/${record.path}`, {
      location: self.location,
      bytes: record.bytes,
      sha256: record.sha256,
      integrity: record.integrity,
      timeoutMs: ASSET_TIMEOUT_MS,
      shareTransfer: false
    });
    return verified.response;
  }, queue);
}

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await cleanupManagedCaches();
    await Promise.all([fullAudioReady(), fullVisualReady()]);
    await self.clients.claim();
  })());
});

async function cleanupManagedCaches() {
  const current = new Set([
    CACHE_NAME,
    CONTENT_CACHE,
    CONTENT_RUNTIME_CACHE,
    MEDICAL_CACHE,
    SEARCH_CACHE,
    SEARCH_DATA_CACHE,
    AUDIO_METADATA_CACHE,
    LIGHT_AUDIO_CACHE,
    FULL_AUDIO_CACHE,
    VISUAL_CACHE,
    FULL_VISUAL_CACHE
  ]);
  const managedPrefixes = [
    CACHE_PREFIX,
    CONTENT_CACHE_PREFIX,
    CONTENT_RUNTIME_CACHE_PREFIX,
    MEDICAL_CACHE_PREFIX,
    SEARCH_CACHE_PREFIX,
    SEARCH_DATA_CACHE_PREFIX,
    AUDIO_CACHE_PREFIX,
    VISUAL_CACHE_PREFIX,
    VISUAL_PACK_CACHE_PREFIX,
    DailyAtlasAssets.TRANSFER_CACHE_PREFIX
  ];
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => managedPrefixes.some((prefix) => key.startsWith(prefix)) && !current.has(key))
    .map((key) => caches.delete(key)));
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  const type = String(event.data?.type || "");
  if (!["OFFLINE_GET_STATUS", "OFFLINE_SET_MODE", "OFFLINE_CACHE_CURRENT_AUDIO", "OFFLINE_PAUSE_FULL", "OFFLINE_RESUME_FULL", "OFFLINE_CANCEL_FULL", "OFFLINE_REPAIR_CACHES"].includes(type)) return;
  event.waitUntil(handleOfflineMessage(event));
});

async function handleOfflineMessage(event) {
  const requestId = typeof event.data?.requestId === "string" ? event.data.requestId : "";
  const reply = (payload, final = true) => postOfflineMessage(event, { ...payload, requestId, final });
  try {
    if (event.data.type === "OFFLINE_GET_STATUS") {
      reply(await offlineStatus());
      return;
    }
    if (event.data.type === "OFFLINE_REPAIR_CACHES") {
      reply(await repairApplicationCaches());
      return;
    }
    if (event.data.type === "OFFLINE_PAUSE_FULL") {
      await stopFullDownload("PAUSED", false);
      reply(await offlineStatus({ phase: "paused", errorCode: null }));
      return;
    }
    if (event.data.type === "OFFLINE_CANCEL_FULL") {
      await stopFullDownload("CANCELLED", true);
      reply(await offlineStatus({ phase: "cancelled", errorCode: "CANCELLED" }));
      return;
    }
    if (event.data.type === "OFFLINE_RESUME_FULL") {
      const observer = (payload, final) => reply(payload, final);
      fullDownloadObservers.add(observer);
      try { reply(await ensureFullAudio()); }
      finally { fullDownloadObservers.delete(observer); }
      return;
    }
    if (event.data.type === "OFFLINE_SET_MODE") {
      const mode = event.data?.mode;
      if (mode !== "light" && mode !== "full") {
        reply(await offlineStatus({ ok: false, phase: "error", errorCode: "INVALID_MODE" }));
        return;
      }
      if (mode === "light") {
        await stopFullDownload("CANCELLED", true);
        reply(await offlineStatus({ phase: "ready", errorCode: null }));
        return;
      }
      const observer = (payload, final) => reply(payload, final);
      fullDownloadObservers.add(observer);
      try { reply(await ensureFullAudio()); }
      finally { fullDownloadObservers.delete(observer); }
      return;
    }
    reply(await cacheCurrentNarration(event.data?.path));
  } catch (error) {
    reply(await offlineStatus({
      ok: false,
      phase: "error",
      errorCode: offlineErrorCode(error),
      error: String(error?.message || error)
    }));
  }
}

function postOfflineMessage(event, payload) {
  try {
    if (event.ports?.[0]) event.ports[0].postMessage(payload);
    else event.source?.postMessage?.({ type: "OFFLINE_STATUS", ...payload });
  } catch (_error) {}
}

async function narrationEntries() {
  if (narrationManifestPromise) return narrationManifestPromise;
  narrationManifestPromise = (async () => {
    const metadata = await caches.open(AUDIO_METADATA_CACHE);
    const response = await metadata.match(localUrl(GERMAN_AUDIO_MANIFEST));
    if (!response?.ok) throw new Error("German narration manifest was not cached");
    const manifest = await response.json();
    const entries = Array.isArray(manifest.items) ? manifest.items.map((entry) => ({
      path: `./${String(entry.path || "")}`,
      bytes: Number(entry.bytes),
      sha256: String(entry.sha256 || "").toUpperCase()
    })) : [];
    if (manifest.count !== 500 || entries.length !== 500 || entries.some((entry) => (
      !/^\.\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(entry.path)
      || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0
      || !/^[A-F0-9]{64}$/.test(entry.sha256)
    ))) throw new Error("German narration manifest is invalid");
    const urls = new Set(entries.map((entry) => localUrl(entry.path)));
    if (urls.size !== 500) throw new Error("German narration manifest contains duplicate paths");
    const byUrl = new Map(entries.map((entry) => [localUrl(entry.path), entry]));
    const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    return Object.freeze({ entries: Object.freeze(entries), urls, byUrl, totalBytes });
  })().catch((error) => {
    narrationManifestPromise = null;
    throw error;
  });
  return narrationManifestPromise;
}

async function cityVisualEntries() {
  if (cityVisualManifestPromise) return cityVisualManifestPromise;
  cityVisualManifestPromise = (async () => {
    const shell = await caches.open(CACHE_NAME);
    const response = await shell.match(localUrl(CITY_VISUAL_MANIFEST));
    if (!response?.ok) throw codedError("City visual manifest was not cached", "INVALID_VISUAL_MANIFEST");
    const raw = await response.clone().arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", raw);
    const manifestSha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
    const manifest = JSON.parse(new TextDecoder().decode(raw));
    const entries = Array.isArray(manifest.items) ? manifest.items.map((entry) => ({
      id: String(entry.id || ""),
      path: String(entry.path || ""),
      bytes: Number(entry.bytes),
      sha256: String(entry.sha256 || "").toUpperCase(),
      width: Number(entry.width),
      height: Number(entry.height)
    })) : [];
    if (manifest.schemaVersion !== 1 || manifest.count !== 200 || entries.length !== 200 || entries.some((entry) => (
      !/^city-[a-z0-9-]+$/.test(entry.id)
      || entry.path !== `./assets/visuals/cities/${entry.id}.webp`
      || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0
      || !/^[A-F0-9]{64}$/.test(entry.sha256)
      || entry.width !== 960 || entry.height !== 540
    ))) throw codedError("City visual manifest is invalid", "INVALID_VISUAL_MANIFEST");
    const urls = new Set(entries.map((entry) => localUrl(entry.path)));
    const ids = new Set(entries.map((entry) => entry.id));
    if (urls.size !== 200 || ids.size !== 200) throw codedError("City visual manifest contains duplicates", "INVALID_VISUAL_MANIFEST");
    const byUrl = new Map(entries.map((entry) => [localUrl(entry.path), entry]));
    const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    return Object.freeze({ entries: Object.freeze(entries), urls, byUrl, totalBytes, manifestSha256 });
  })().catch((error) => {
    cityVisualManifestPromise = null;
    throw error;
  });
  return cityVisualManifestPromise;
}

async function splitCatalogManifest() {
  if (splitCatalogManifestPromise) return splitCatalogManifestPromise;
  splitCatalogManifestPromise = (async () => {
    const shell = await caches.open(CACHE_NAME);
    const response = await shell.match(localUrl(SPLIT_CATALOG_MANIFEST));
    if (!response?.ok) throw codedError("Split catalog manifest was not cached", "INVALID_CATALOG_MANIFEST");
    const value = validateSplitCatalogManifest(await response.json());
    const records = [value.selection, value.selectionData, value.search, ...value.details.chunks];
    const byUrl = new Map(records.map((record) => [localUrl(`./catalog-data/${record.path}`), Object.freeze({ ...record })]));
    const details = Object.freeze(value.details.chunks.map((record) => byUrl.get(localUrl(`./catalog-data/${record.path}`))));
    const search = byUrl.get(localUrl(`./catalog-data/${value.search.path}`));
    return Object.freeze({
      value,
      byUrl,
      details,
      search,
      fullBytes: details.reduce((sum, record) => sum + record.bytes, 0) + search.bytes
    });
  })().catch((error) => {
    splitCatalogManifestPromise = null;
    throw error;
  });
  return splitCatalogManifestPromise;
}

async function matchOrFetchSplitCatalog(request) {
  const manifest = await splitCatalogManifest();
  const record = manifest.byUrl.get(request.url);
  if (!record) return null;
  if (record.path === manifest.value.selectionData.path) {
    const content = await caches.open(CONTENT_CACHE);
    const cached = await content.match(request);
    if (cached) return cached;
  }
  const cacheName = record.path === manifest.value.search.path ? SEARCH_DATA_CACHE : CONTENT_RUNTIME_CACHE;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const verified = await DailyAtlasAssets.assetResolver(`catalog-data/${record.path}`, {
    location: self.location,
    bytes: record.bytes,
    sha256: record.sha256,
    integrity: record.integrity,
    timeoutMs: ASSET_TIMEOUT_MS,
    shareTransfer: false
  });
  try { await cache.put(request, verified.response.clone()); }
  catch (_error) {}
  return verified.response;
}

async function verifyCachedCatalogAsset(response, record) {
  if (!response?.ok) throw codedError(`Catalog response is unavailable: ${record.path}`, "INVALID_CATALOG_ASSET");
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== record.bytes) throw codedError(`Catalog size mismatch: ${record.path}`, "INVALID_CATALOG_ASSET");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("").toUpperCase();
  if (hash !== record.sha256) throw codedError(`Catalog hash mismatch: ${record.path}`, "INVALID_CATALOG_ASSET");
}

async function splitCacheSnapshot(cache, records, markerPath, verifyBodies) {
  const byUrl = new Map(records.map((record) => [localUrl(`./catalog-data/${record.path}`), record]));
  const markerUrl = localUrl(markerPath);
  const urls = new Set();
  let bytes = 0;
  for (const request of await cache.keys()) {
    if (request.url === markerUrl) continue;
    const record = byUrl.get(request.url);
    if (!record || urls.has(request.url)) {
      await cache.delete(request);
      continue;
    }
    const response = await cache.match(request);
    try {
      if (verifyBodies) await verifyCachedCatalogAsset(response, record);
      else if (!response?.ok) throw new Error("missing response");
    } catch (_error) {
      await cache.delete(request);
      continue;
    }
    urls.add(request.url);
    bytes += record.bytes;
  }
  return Object.freeze({ count: urls.size, bytes, urls });
}

async function splitPackReady(cacheName, markerPath, version, records) {
  if (!(await caches.keys()).includes(cacheName)) return false;
  const cache = await caches.open(cacheName);
  const marker = await cache.match(localUrl(markerPath));
  if (!marker?.ok) return false;
  const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0);
  try {
    const value = await marker.json();
    if (value?.version !== version || value?.count !== records.length || value?.totalBytes !== totalBytes) return false;
    const snapshot = await splitCacheSnapshot(cache, records, markerPath, false);
    return snapshot.count === records.length && snapshot.bytes === totalBytes;
  } catch (_error) {
    return false;
  }
}

async function writeSplitReadyMarker(cache, markerPath, version, records) {
  const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0);
  await cache.put(localUrl(markerPath), jsonResponse({ version, count: records.length, totalBytes }));
}

async function fullSplitCatalogReady() {
  const manifest = await splitCatalogManifest();
  const [content, search] = await Promise.all([
    splitPackReady(CONTENT_RUNTIME_CACHE, FULL_CONTENT_MARKER, CONTENT_VERSION, manifest.details),
    splitPackReady(SEARCH_DATA_CACHE, FULL_SEARCH_MARKER, SEARCH_VERSION, [manifest.search])
  ]);
  return content && search;
}

async function clearSplitReadyMarkers() {
  if ((await caches.keys()).includes(CONTENT_RUNTIME_CACHE)) {
    await (await caches.open(CONTENT_RUNTIME_CACHE)).delete(localUrl(FULL_CONTENT_MARKER));
  }
  if ((await caches.keys()).includes(SEARCH_DATA_CACHE)) {
    await (await caches.open(SEARCH_DATA_CACHE)).delete(localUrl(FULL_SEARCH_MARKER));
  }
}

async function splitStageState(verifyBodies) {
  const manifest = await splitCatalogManifest();
  const content = await caches.open(CONTENT_RUNTIME_CACHE);
  const search = await caches.open(SEARCH_DATA_CACHE);
  await clearSplitReadyMarkers();
  const [contentSnapshot, searchSnapshot] = await Promise.all([
    splitCacheSnapshot(content, manifest.details, FULL_CONTENT_MARKER, verifyBodies),
    splitCacheSnapshot(search, [manifest.search], FULL_SEARCH_MARKER, verifyBodies)
  ]);
  const missingContent = manifest.details.filter((record) => !contentSnapshot.urls.has(localUrl(`./catalog-data/${record.path}`)));
  const missingSearch = searchSnapshot.urls.has(localUrl(`./catalog-data/${manifest.search.path}`)) ? [] : [manifest.search];
  const missing = [...missingContent, ...missingSearch];
  return Object.freeze({
    manifest,
    content,
    search,
    missing: Object.freeze(missing),
    requiredBytes: missing.reduce((sum, record) => sum + record.bytes, 0)
  });
}

async function downloadSplitStage(stage, signal) {
  for (let index = 0; index < stage.missing.length; index += FULL_AUDIO_BATCH_SIZE) {
    if (fullDownloadStopReason) throw codedError("Full offline download was stopped", fullDownloadStopReason);
    const batch = stage.missing.slice(index, index + FULL_AUDIO_BATCH_SIZE);
    const responses = await Promise.all(batch.map(async (record) => ({
      record,
      response: (await DailyAtlasAssets.assetResolver(`catalog-data/${record.path}`, {
        location: self.location,
        bytes: record.bytes,
        sha256: record.sha256,
        integrity: record.integrity,
        timeoutMs: ASSET_TIMEOUT_MS,
        signal,
        shareTransfer: false
      })).response
    })));
    if (fullDownloadStopReason) throw codedError("Full offline download was stopped", fullDownloadStopReason);
    for (const { record, response } of responses) {
      const cache = record.path === stage.manifest.value.search.path ? stage.search : stage.content;
      await cache.put(localUrl(`./catalog-data/${record.path}`), response);
    }
  }
  const [contentSnapshot, searchSnapshot] = await Promise.all([
    splitCacheSnapshot(stage.content, stage.manifest.details, FULL_CONTENT_MARKER, true),
    splitCacheSnapshot(stage.search, [stage.manifest.search], FULL_SEARCH_MARKER, true)
  ]);
  if (contentSnapshot.count !== stage.manifest.details.length || searchSnapshot.count !== 1) {
    throw codedError("The staged split catalog is incomplete", "INCOMPLETE_CATALOG");
  }
  await Promise.all([
    writeSplitReadyMarker(stage.content, FULL_CONTENT_MARKER, CONTENT_VERSION, stage.manifest.details),
    writeSplitReadyMarker(stage.search, FULL_SEARCH_MARKER, SEARCH_VERSION, [stage.manifest.search])
  ]);
  if (!(await fullSplitCatalogReady())) {
    await clearSplitReadyMarkers();
    throw codedError("The split catalog ready markers failed validation", "INCOMPLETE_CATALOG");
  }
}

async function repairSplitRuntimeCaches() {
  const stage = await splitStageState(true);
  if (stage.missing.length === 0) {
    await Promise.all([
      writeSplitReadyMarker(stage.content, FULL_CONTENT_MARKER, CONTENT_VERSION, stage.manifest.details),
      writeSplitReadyMarker(stage.search, FULL_SEARCH_MARKER, SEARCH_VERSION, [stage.manifest.search])
    ]);
  }
}

async function audioCacheSnapshot(cache, manifest, verifyBodies) {
  const validUrls = new Set();
  let bytes = 0;
  for (const request of await cache.keys()) {
    if (request.url === localUrl(FULL_AUDIO_MARKER)) continue;
    const entry = manifest.byUrl.get(request.url);
    if (!entry || validUrls.has(request.url)) {
      await cache.delete(request);
      continue;
    }
    const response = await cache.match(request);
    if (!response?.ok) {
      await cache.delete(request);
      continue;
    }
    if (verifyBodies) {
      try {
        await verifyCachedNarration(response, entry);
      } catch (_error) {
        await cache.delete(request);
        continue;
      }
    }
    validUrls.add(request.url);
    bytes += entry.bytes;
  }
  return Object.freeze({ count: validUrls.size, bytes, urls: validUrls });
}

async function verifyCachedNarration(response, entry) {
  const value = await response.clone().arrayBuffer();
  if (value.byteLength !== entry.bytes) throw codedError(`Narration size mismatch: ${entry.path}`, "INVALID_AUDIO");
  const digest = await crypto.subtle.digest("SHA-256", value);
  const actual = [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("").toUpperCase();
  if (actual !== entry.sha256) throw codedError(`Narration hash mismatch: ${entry.path}`, "INVALID_AUDIO");
}

async function verifyCachedCityVisual(response, entry) {
  if (!response?.ok || !String(response.headers.get("content-type") || "").toLowerCase().startsWith("image/webp")) {
    throw codedError(`City visual is not a WebP response: ${entry.path}`, "INVALID_VISUAL");
  }
  const value = await response.clone().arrayBuffer();
  if (value.byteLength !== entry.bytes) throw codedError(`City visual size mismatch: ${entry.path}`, "INVALID_VISUAL");
  const bytes = new Uint8Array(value);
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") {
    throw codedError(`City visual signature mismatch: ${entry.path}`, "INVALID_VISUAL");
  }
  const digest = await crypto.subtle.digest("SHA-256", value);
  const actual = [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("").toUpperCase();
  if (actual !== entry.sha256) throw codedError(`City visual hash mismatch: ${entry.path}`, "INVALID_VISUAL");
}

async function visualPackSnapshot(cache, manifest, verifyBodies) {
  const validUrls = new Set();
  let bytes = 0;
  for (const request of await cache.keys()) {
    if (request.url === localUrl(FULL_VISUAL_MARKER)) continue;
    const entry = manifest.byUrl.get(request.url);
    if (!entry || validUrls.has(request.url)) {
      await cache.delete(request);
      continue;
    }
    const response = await cache.match(request);
    if (!response?.ok) {
      await cache.delete(request);
      continue;
    }
    if (verifyBodies) {
      try { await verifyCachedCityVisual(response, entry); }
      catch (_error) {
        await cache.delete(request);
        continue;
      }
    }
    validUrls.add(request.url);
    bytes += entry.bytes;
  }
  return Object.freeze({ count: validUrls.size, bytes, urls: validUrls });
}

async function fullVisualReady() {
  if (fullVisualReadyPromise) return fullVisualReadyPromise;
  const check = (async () => {
    if (!(await caches.keys()).includes(FULL_VISUAL_CACHE)) return false;
    const manifest = await cityVisualEntries();
    const cache = await caches.open(FULL_VISUAL_CACHE);
    const marker = await cache.match(localUrl(FULL_VISUAL_MARKER));
    if (!marker?.ok) return false;
    try {
      const value = await marker.json();
      if (value?.visualVersion !== VISUAL_VERSION
        || value?.manifestSha256 !== manifest.manifestSha256
        || value?.count !== manifest.entries.length
        || value?.totalBytes !== manifest.totalBytes) {
        await cache.delete(localUrl(FULL_VISUAL_MARKER));
        return false;
      }
      // The marker is only metadata. Trust it once per worker lifetime after
      // all 200 cached bodies pass content-type, byte-length and SHA-256 checks.
      const snapshot = await visualPackSnapshot(cache, manifest, true);
      const ready = snapshot.count === manifest.entries.length && snapshot.bytes === manifest.totalBytes;
      if (!ready) await cache.delete(localUrl(FULL_VISUAL_MARKER));
      return ready;
    } catch (_error) {
      await cache.delete(localUrl(FULL_VISUAL_MARKER));
      return false;
    }
  })();
  fullVisualReadyPromise = check;
  const ready = await check;
  if (!ready && fullVisualReadyPromise === check) fullVisualReadyPromise = null;
  return ready;
}

async function stagedVisualCount() {
  if (!(await caches.keys()).includes(FULL_VISUAL_CACHE) || await fullVisualReady()) return 0;
  const manifest = await cityVisualEntries();
  const cache = await caches.open(FULL_VISUAL_CACHE);
  return (await visualPackSnapshot(cache, manifest, false)).count;
}

async function fullAudioReady() {
  if (fullAudioReadyPromise) return fullAudioReadyPromise;
  const check = (async () => {
    if (!(await caches.keys()).includes(FULL_AUDIO_CACHE)) return false;
    const manifest = await narrationEntries();
    const cache = await caches.open(FULL_AUDIO_CACHE);
    const marker = await cache.match(localUrl(FULL_AUDIO_MARKER));
    if (!marker?.ok) return false;
    try {
      const value = await marker.json();
      if (value?.audioVersion !== AUDIO_VERSION
        || value?.manifestSha256 !== AUDIO_MANIFEST_SHA256
        || value?.count !== manifest.entries.length
        || value?.totalBytes !== manifest.totalBytes) {
        await cache.delete(localUrl(FULL_AUDIO_MARKER));
        return false;
      }
      const snapshot = await audioCacheSnapshot(cache, manifest, true);
      const ready = snapshot.count === manifest.entries.length && snapshot.bytes === manifest.totalBytes;
      if (!ready) await cache.delete(localUrl(FULL_AUDIO_MARKER));
      return ready;
    } catch (_error) {
      await cache.delete(localUrl(FULL_AUDIO_MARKER));
      return false;
    }
  })();
  fullAudioReadyPromise = check;
  const ready = await check;
  if (!ready && fullAudioReadyPromise === check) fullAudioReadyPromise = null;
  return ready;
}

async function lightAudioCount() {
  const manifest = await narrationEntries();
  const cache = await caches.open(LIGHT_AUDIO_CACHE);
  const keys = await cache.keys();
  return keys.filter((request) => manifest.urls.has(request.url)).length;
}

async function stagedAudioCount() {
  if (!(await caches.keys()).includes(FULL_AUDIO_CACHE) || await fullAudioReady()) return 0;
  const manifest = await narrationEntries();
  const cache = await caches.open(FULL_AUDIO_CACHE);
  return (await audioCacheSnapshot(cache, manifest, false)).count;
}

async function offlineStatus(overrides) {
  const [audioFull, catalogFull, visualFull, manifest, splitManifest, visualManifest] = await Promise.all([
    fullAudioReady(),
    fullSplitCatalogReady(),
    fullVisualReady(),
    narrationEntries(),
    splitCatalogManifest(),
    cityVisualEntries()
  ]);
  const full = audioFull && catalogFull && visualFull;
  const extra = overrides || {};
  const staging = full ? 0 : (Boolean(fullDownloadPromise)
    ? fullDownloadCount
    : (audioFull ? 500 : await stagedAudioCount()) + (visualFull ? 200 : await stagedVisualCount()));
  const light = full ? 0 : await lightAudioCount();
  const defaultPhase = full ? "ready" : fullDownloadPromise ? "downloading" : staging > 0 ? "paused" : "ready";
  const requestedFull = Boolean(fullDownloadPromise) && !["error", "cancelled", "paused"].includes(extra.phase);
  return {
    ok: extra.ok !== false,
    mode: full || requestedFull ? "full" : "light",
    phase: extra.phase || defaultPhase,
    cachedCount: full ? 700 : staging > 0 ? staging : light,
    stagedCount: staging,
    lightCachedCount: light,
    totalCount: 700,
    estimatedFullBytes: manifest.totalBytes + splitManifest.fullBytes + visualManifest.totalBytes,
    contentReady: catalogFull,
    contentCachedCount: catalogFull ? splitManifest.details.length + 1 : null,
    contentTotalCount: splitManifest.details.length + 1,
    visualReady: visualFull,
    visualCachedCount: visualFull ? visualManifest.entries.length : await stagedVisualCount(),
    visualTotalCount: visualManifest.entries.length,
    errorCode: extra.errorCode || null,
    packVersions: PACK_VERSIONS,
    ...(Number.isFinite(extra.requiredBytes) ? { requiredBytes: extra.requiredBytes } : {}),
    ...(Number.isFinite(extra.availableBytes) ? { availableBytes: extra.availableBytes } : {}),
    ...(extra.error ? { error: extra.error } : {})
  };
}

async function repairApplicationCaches() {
  await stopFullDownload("PAUSED", false);
  invalidateFullAudioTrust();
  invalidateFullVisualTrust();
  await caches.delete(VISUAL_CACHE);
  await cleanupManagedCaches();
  await Promise.all([
    cacheApplicationShell(),
    cacheContentPack(),
    cacheOrdinaryPack(MEDICAL_CACHE, MEDICAL_VERSION, MEDICAL_ASSETS),
    cacheOrdinaryPack(SEARCH_CACHE, SEARCH_VERSION, SEARCH_ASSETS),
    cacheOrdinaryPack(AUDIO_METADATA_CACHE, AUDIO_VERSION, AUDIO_METADATA_ASSETS)
  ]);
  narrationManifestPromise = null;
  cityVisualManifestPromise = null;
  splitCatalogManifestPromise = null;
  const [manifest, visualManifest] = await Promise.all([narrationEntries(), cityVisualEntries()]);
  await repairSplitRuntimeCaches();
  const light = await caches.open(LIGHT_AUDIO_CACHE);
  await audioCacheSnapshot(light, manifest, true);
  if ((await caches.keys()).includes(FULL_AUDIO_CACHE)) {
    const full = await caches.open(FULL_AUDIO_CACHE);
    await full.delete(localUrl(FULL_AUDIO_MARKER));
    const snapshot = await audioCacheSnapshot(full, manifest, true);
    if (snapshot.count === manifest.entries.length && snapshot.bytes === manifest.totalBytes) {
      await full.put(localUrl(FULL_AUDIO_MARKER), jsonResponse({
        audioVersion: AUDIO_VERSION,
        manifestSha256: AUDIO_MANIFEST_SHA256,
        count: manifest.entries.length,
        totalBytes: manifest.totalBytes
      }));
      invalidateFullAudioTrust();
    }
  }
  if ((await caches.keys()).includes(FULL_VISUAL_CACHE)) {
    const full = await caches.open(FULL_VISUAL_CACHE);
    await full.delete(localUrl(FULL_VISUAL_MARKER));
    const snapshot = await visualPackSnapshot(full, visualManifest, true);
    if (snapshot.count === visualManifest.entries.length && snapshot.bytes === visualManifest.totalBytes) {
      await full.put(localUrl(FULL_VISUAL_MARKER), jsonResponse({
        visualVersion: VISUAL_VERSION,
        manifestSha256: visualManifest.manifestSha256,
        count: visualManifest.entries.length,
        totalBytes: visualManifest.totalBytes
      }));
      invalidateFullVisualTrust();
    }
  }
  const result = await offlineStatus();
  return Object.freeze({ ...result, repaired: true });
}

function notifyFullDownload(payload) {
  for (const observer of fullDownloadObservers) {
    try { observer(payload, false); } catch (_error) {}
  }
}

function offlineErrorCode(error) {
  if (error?.name === "QuotaExceededError") return "QUOTA";
  return typeof error?.code === "string" && error.code ? error.code : "OFFLINE_FAILED";
}

async function storageCapacity(requiredBytes) {
  try {
    const estimateTask = self.navigator?.storage?.estimate?.();
    if (!estimateTask) return null;
    let timer;
    const estimate = await Promise.race([
      Promise.resolve(estimateTask),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), 5000); })
    ]).finally(() => clearTimeout(timer));
    const quota = Number(estimate?.quota);
    const usage = Number(estimate?.usage);
    if (!Number.isFinite(quota) || !Number.isFinite(usage) || quota <= 0 || usage < 0) return null;
    return Object.freeze({ requiredBytes, availableBytes: Math.max(0, quota - usage) });
  } catch (_error) {
    return null;
  }
}

async function stopFullDownload(reason, removeStaging) {
  fullDownloadStopReason = reason;
  fullDownloadAbortController?.abort();
  const active = fullDownloadPromise;
  if (active) await active;
  if (removeStaging) {
    invalidateFullAudioTrust();
    invalidateFullVisualTrust();
    await Promise.all([
      caches.delete(FULL_AUDIO_CACHE),
      caches.delete(FULL_VISUAL_CACHE),
      caches.delete(CONTENT_RUNTIME_CACHE),
      caches.delete(SEARCH_DATA_CACHE)
    ]);
    fullDownloadCount = 0;
  }
  if (!active) fullDownloadStopReason = null;
}

async function ensureFullAudio() {
  if ((await fullAudioReady()) && (await fullSplitCatalogReady()) && (await fullVisualReady())) return offlineStatus({ phase: "ready" });
  if (fullDownloadPromise) return fullDownloadPromise;
  fullDownloadStopReason = null;
  fullDownloadAbortController = new AbortController();
  fullDownloadPromise = (async () => {
    const [manifest, visualManifest] = await Promise.all([narrationEntries(), cityVisualEntries()]);
    const cache = await caches.open(FULL_AUDIO_CACHE);
    const visualCache = await caches.open(FULL_VISUAL_CACHE);
    const audioWasReady = await fullAudioReady();
    const visualWasReady = await fullVisualReady();
    if (!audioWasReady) {
      invalidateFullAudioTrust();
      await cache.delete(localUrl(FULL_AUDIO_MARKER));
    }
    if (!visualWasReady) {
      invalidateFullVisualTrust();
      await visualCache.delete(localUrl(FULL_VISUAL_MARKER));
    }
    const staged = audioWasReady
      ? Object.freeze({ count: manifest.entries.length, bytes: manifest.totalBytes, urls: manifest.urls })
      : await audioCacheSnapshot(cache, manifest, true);
    const stagedVisuals = visualWasReady
      ? Object.freeze({ count: visualManifest.entries.length, bytes: visualManifest.totalBytes, urls: visualManifest.urls })
      : await visualPackSnapshot(visualCache, visualManifest, true);
    fullDownloadCount = staged.count + stagedVisuals.count;
    const missing = audioWasReady ? [] : manifest.entries.filter((entry) => !staged.urls.has(localUrl(entry.path)));
    const missingVisuals = visualWasReady ? [] : visualManifest.entries.filter((entry) => !stagedVisuals.urls.has(localUrl(entry.path)));
    const catalogWasReady = await fullSplitCatalogReady();
    const splitStage = catalogWasReady ? null : await splitStageState(true);
    const requiredBytes = missing.reduce((sum, entry) => sum + entry.bytes, 0)
      + missingVisuals.reduce((sum, entry) => sum + entry.bytes, 0)
      + (splitStage?.requiredBytes || 0);
    const capacity = await storageCapacity(requiredBytes);
    const margin = Math.min(1024 * 1024, Math.ceil(requiredBytes * 0.1));
    if (capacity && capacity.availableBytes < requiredBytes + margin) {
      return offlineStatus({
        ok: false,
        phase: "error",
        errorCode: "QUOTA",
        error: "Insufficient storage for the remaining verified offline pack",
        ...capacity
      });
    }
    try {
      notifyFullDownload(await offlineStatus({ phase: "downloading", requiredBytes, ...(capacity || {}) }));
      if (splitStage) await downloadSplitStage(splitStage, fullDownloadAbortController.signal);
      for (let index = 0; index < missingVisuals.length; index += FULL_AUDIO_BATCH_SIZE) {
        if (fullDownloadStopReason) throw codedError("Full offline download was stopped", fullDownloadStopReason);
        const batch = missingVisuals.slice(index, index + FULL_AUDIO_BATCH_SIZE);
        const responses = await Promise.all(batch.map(async (entry) => ({
          entry,
          response: await fetchVerifiedCityVisual(entry, fullDownloadAbortController.signal)
        })));
        if (fullDownloadStopReason) throw codedError("Full offline download was stopped", fullDownloadStopReason);
        for (const { entry, response } of responses) {
          await visualCache.put(localUrl(entry.path), response);
          fullDownloadCount += 1;
        }
        notifyFullDownload(await offlineStatus({ phase: "downloading", requiredBytes, ...(capacity || {}) }));
      }
      for (let index = 0; index < missing.length; index += FULL_AUDIO_BATCH_SIZE) {
        if (fullDownloadStopReason) throw codedError("Full offline download was stopped", fullDownloadStopReason);
        const batch = missing.slice(index, index + FULL_AUDIO_BATCH_SIZE);
        const responses = await Promise.all(batch.map(async (entry) => ({
          entry,
          response: await fetchVerifiedNarration(entry, fullDownloadAbortController.signal)
        })));
        if (fullDownloadStopReason) throw codedError("Full offline download was stopped", fullDownloadStopReason);
        for (const { entry, response } of responses) {
          await cache.put(localUrl(entry.path), response);
          fullDownloadCount += 1;
        }
        notifyFullDownload(await offlineStatus({ phase: "downloading", requiredBytes, ...(capacity || {}) }));
      }
      if (fullDownloadStopReason) throw codedError("Full offline download was stopped", fullDownloadStopReason);
      if (!audioWasReady) {
        const finalSnapshot = await audioCacheSnapshot(cache, manifest, true);
        if (finalSnapshot.count !== manifest.entries.length || finalSnapshot.bytes !== manifest.totalBytes) {
          throw codedError("The staged narration pack is incomplete", "INCOMPLETE_AUDIO");
        }
        await cache.put(localUrl(FULL_AUDIO_MARKER), jsonResponse({
          audioVersion: AUDIO_VERSION,
          manifestSha256: AUDIO_MANIFEST_SHA256,
          count: manifest.entries.length,
          totalBytes: manifest.totalBytes
        }));
        invalidateFullAudioTrust();
        if (!(await fullAudioReady())) {
          await cache.delete(localUrl(FULL_AUDIO_MARKER));
          throw codedError("The narration ready marker failed its 500-file validation", "INCOMPLETE_AUDIO");
        }
      }
      if (!visualWasReady) {
        const finalVisualSnapshot = await visualPackSnapshot(visualCache, visualManifest, true);
        if (finalVisualSnapshot.count !== visualManifest.entries.length || finalVisualSnapshot.bytes !== visualManifest.totalBytes) {
          throw codedError("The staged city visual pack is incomplete", "INCOMPLETE_VISUAL");
        }
        await visualCache.put(localUrl(FULL_VISUAL_MARKER), jsonResponse({
          visualVersion: VISUAL_VERSION,
          manifestSha256: visualManifest.manifestSha256,
          count: visualManifest.entries.length,
          totalBytes: visualManifest.totalBytes
        }));
        invalidateFullVisualTrust();
        if (!(await fullVisualReady())) {
          await visualCache.delete(localUrl(FULL_VISUAL_MARKER));
          throw codedError("The city visual ready marker failed its 200-file validation", "INCOMPLETE_VISUAL");
        }
      }
      await caches.delete(LIGHT_AUDIO_CACHE);
      return offlineStatus({ phase: "ready" });
    } catch (error) {
      if (!audioWasReady) {
        invalidateFullAudioTrust();
        await cache.delete(localUrl(FULL_AUDIO_MARKER));
      }
      if (!visualWasReady) {
        invalidateFullVisualTrust();
        await visualCache.delete(localUrl(FULL_VISUAL_MARKER));
      }
      const reason = fullDownloadStopReason || error?.code;
      const paused = reason === "PAUSED";
      const cancelled = reason === "CANCELLED";
      return offlineStatus({
        ok: paused,
        phase: paused ? "paused" : cancelled ? "cancelled" : "error",
        errorCode: paused ? null : cancelled ? "CANCELLED" : offlineErrorCode(error),
        error: paused ? undefined : String(error?.message || error)
      });
    }
  })().finally(() => {
    fullDownloadPromise = null;
    fullDownloadAbortController = null;
    fullDownloadStopReason = null;
  });
  return fullDownloadPromise;
}

async function cacheCurrentNarration(value) {
  if (await fullAudioReady()) return offlineStatus({ phase: "ready" });
  const manifest = await narrationEntries();
  let url;
  try { url = new URL(String(value || ""), self.location.href); }
  catch (_error) { url = null; }
  if (!url || !manifest.urls.has(url.href)) {
    return offlineStatus({ ok: false, phase: "error", errorCode: "INVALID_AUDIO_PATH" });
  }
  const entry = manifest.byUrl.get(url.href);
  const cache = await caches.open(LIGHT_AUDIO_CACHE);
  if (!(await cache.match(url.href))) {
    try {
      const response = await fetchVerifiedNarration(entry);
      await cache.put(url.href, response);
    } catch (error) {
      return offlineStatus({ ok: false, phase: "error", errorCode: "CURRENT_AUDIO_FAILED", error: String(error?.message || error) });
    }
  }
  for (const request of await cache.keys()) {
    if (request.url !== url.href) await cache.delete(request);
  }
  return offlineStatus({ phase: "ready" });
}

async function fetchVerifiedNarration(entry, signal) {
  try {
    const verified = await DailyAtlasAssets.assetResolver(entry.path, {
      location: self.location,
      bytes: entry.bytes,
      sha256: entry.sha256,
      timeoutMs: ASSET_TIMEOUT_MS,
      signal
    });
    return verified.response;
  } catch (error) {
    if (error?.code === "INVALID_ASSET") throw codedError(`Narration verification failed: ${entry.path}`, "INVALID_AUDIO", { cause: error });
    throw error;
  }
}

async function fetchVerifiedCityVisual(entry, signal) {
  const response = await fetch(localUrl(entry.path), {
    cache: "reload",
    credentials: "same-origin",
    redirect: "error",
    signal
  });
  await verifyCachedCityVisual(response, entry);
  return response;
}

async function matchInstalledAsset(request) {
  for (const cacheName of [CACHE_NAME, CONTENT_CACHE, MEDICAL_CACHE, SEARCH_CACHE, AUDIO_METADATA_CACHE]) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
  }
  return null;
}

async function trimVisualCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - VISUAL_CACHE_MAX_ITEMS;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

async function matchOrFetchVisual(request) {
  const cache = await caches.open(VISUAL_CACHE);
  const cached = await cache.match(request);
  const manifest = await cityVisualEntries();
  const entry = manifest.byUrl.get(request.url);
  if (cached && entry) {
    try {
      await verifyCachedCityVisual(cached, entry);
      return cached;
    } catch (_error) {
      await cache.delete(request);
    }
  }
  // A same-origin city path that is absent from the signed manifest is not a
  // publishable visual. Failing the image request exposes the card's existing
  // procedural fallback without ever pairing unknown bytes with attribution.
  if (!entry) return Response.error();
  let response;
  try {
    // cache:reload prevents a browser HTTP-cache copy from an older A release
    // being displayed under the current B release's author/licence metadata.
    response = await fetchVerifiedCityVisual(entry);
  } catch (_error) {
    return Response.error();
  }
  try {
    await cache.put(request, response.clone());
    await trimVisualCache(cache);
  } catch (_error) {
    // A quota failure must not hide a response whose bytes were already
    // verified; it simply remains uncached and can be retried later.
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Remote covers/posters stay on the browser's ordinary network path. The
  // worker never persists opaque/error challenge responses, so a transient
  // third-party failure can recover on the next retry.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const aliases = new Map([
        [new URL(localUrl("./index.html")).pathname, "./"],
        [new URL(localUrl("./diagnostics")).pathname, "./diagnostics.html"],
        [new URL(localUrl("./privacy")).pathname, "./privacy.html"],
        [new URL(localUrl("./sources-and-licenses")).pathname, "./sources-and-licenses.html"],
        [new URL(localUrl("./city-credits")).pathname, "./city-credits.html"]
      ]);
      const alias = aliases.get(url.pathname);
      const cached = (await cache.match(request, { ignoreSearch: true }))
        || (alias ? await cache.match(localUrl(alias)) : null)
        || (await cache.match(localUrl("./")));
      if (cached) return cached;
      try { return await fetch(request); }
      catch (_error) { return cache.match(localUrl("./")); }
    })());
    return;
  }

  event.respondWith((async () => {
    if (/\/assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(url.pathname)) {
      if (await fullVisualReady()) {
        const complete = await caches.open(FULL_VISUAL_CACHE);
        const cached = await complete.match(request);
        if (cached) {
          const manifest = await cityVisualEntries();
          const entry = manifest.byUrl.get(request.url);
          try {
            if (!entry) throw codedError("City visual is absent from the current manifest", "INVALID_VISUAL");
            await verifyCachedCityVisual(cached, entry);
            return cached;
          } catch (_error) {
            await complete.delete(request);
            await complete.delete(localUrl(FULL_VISUAL_MARKER));
            invalidateFullVisualTrust();
          }
        } else {
          await complete.delete(localUrl(FULL_VISUAL_MARKER));
          invalidateFullVisualTrust();
        }
      }
      return matchOrFetchVisual(request);
    }
    if (/\/catalog-data\/(?:selection|search)\.[a-f0-9]{12}\.js$|\/catalog-data\/selection-data\.[a-f0-9]{12}\.json$|\/catalog-data\/details\/(?:book|movie|city|german|medical)-\d{3}\.[a-f0-9]{12}\.js$/.test(url.pathname)) {
      const catalogAsset = await matchOrFetchSplitCatalog(request);
      if (catalogAsset) return catalogAsset;
    }
    if (/\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(url.pathname)) {
      const manifest = await narrationEntries();
      const entry = manifest.byUrl.get(request.url);
      if (await fullAudioReady()) {
        const complete = await caches.open(FULL_AUDIO_CACHE);
        const cached = await complete.match(request);
        if (cached) {
          try {
            if (!entry) throw codedError("Narration is absent from the current manifest", "INVALID_AUDIO");
            await verifyCachedNarration(cached, entry);
            return cached;
          } catch (_error) {
            await complete.delete(request);
            await complete.delete(localUrl(FULL_AUDIO_MARKER));
            invalidateFullAudioTrust();
          }
        } else {
          await complete.delete(localUrl(FULL_AUDIO_MARKER));
          invalidateFullAudioTrust();
        }
      }
      const light = await caches.open(LIGHT_AUDIO_CACHE);
      const cached = await light.match(request);
      if (cached && entry) {
        try {
          await verifyCachedNarration(cached, entry);
          return cached;
        } catch (_error) {
          await light.delete(request);
        }
      }
      if (!entry) return Response.error();
      try { return await fetchVerifiedNarration(entry); }
      catch (_error) { return Response.error(); }
    }
    const cached = await matchInstalledAsset(request);
    if (cached) return cached;
    return fetch(request);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  let destination = scope;
  try {
    const requested = new URL(event.notification.data?.url || "./", scope);
    if (requested.origin === self.location.origin && requested.href.startsWith(scope)) destination = requested.href;
  } catch (_error) {}
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => {
      try { return new URL(client.url).href.startsWith(scope); }
      catch (_error) { return false; }
    });
    if (existing) {
      await existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
  })());
});

// Read-only diagnostics/test surface. It deliberately exposes operations, not
// mutable state, so production callers cannot bypass the message protocol.
self.DailyAtlasServiceWorkerInternals = Object.freeze({
  INSTALL_FETCH_CONCURRENCY,
  PACK_VERSIONS,
  cacheApplicationShell,
  cacheContentPack,
  cityVisualEntries,
  createTaskQueue,
  ensureFullAudio,
  fullAudioReady,
  fullVisualReady,
  narrationEntries,
  offlineStatus,
  packReady
});
