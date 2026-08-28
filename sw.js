"use strict";

importScripts("./asset-routing.js");

const CACHE_PREFIX = "daily-atlas-shell-";
const CONTENT_CACHE_PREFIX = "daily-atlas-content-";
const MEDICAL_CACHE_PREFIX = "daily-atlas-medical-";
const SEARCH_CACHE_PREFIX = "daily-atlas-search-";
const CONTENT_RUNTIME_CACHE_PREFIX = "daily-atlas-content-runtime-";
const SEARCH_DATA_CACHE_PREFIX = "daily-atlas-search-data-";
const AUDIO_CACHE_PREFIX = "daily-atlas-audio-";

// CACHE_VERSION remains as a release-integrity compatibility field for the
// packaging tools. Runtime caches use independently generated pack versions.
const CACHE_VERSION = "v3-5af2fd2d628e89b1";
const SHELL_VERSION = "s1-7222d633367077b1";
const CONTENT_VERSION = "c1-5d285a0223d2b3b6";
const MEDICAL_VERSION = "m1-9c59aa54b9d7dc86";
const AUDIO_VERSION = "a1-390c78b958c182b5";
const SEARCH_VERSION = "q1-9150911cfef89c87";
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
const FULL_AUDIO_MARKER = "./__daily-atlas-full-audio-complete__";
const FULL_CONTENT_MARKER = "./__daily-atlas-full-content-complete__";
const FULL_SEARCH_MARKER = "./__daily-atlas-full-search-complete__";
const PACK_READY_MARKER = "./__daily-atlas-pack-ready__";
const GERMAN_AUDIO_MANIFEST = "./assets/audio/german/manifest.json";
const SPLIT_CATALOG_MANIFEST = "./catalog-data/manifest.json";
const ASSET_TIMEOUT_MS = 20000;
const FULL_AUDIO_BATCH_SIZE = 4;
const APP_SHELL = Object.freeze([
  "./",
  "./index.html",
  "./styles.css",
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
  "./pwa.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./catalog-data/manifest.js",
  "./catalog-data/manifest.json",
  "./catalog-data/selection-data.8830690affcf.json",
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
  search: SEARCH_VERSION
});

let narrationManifestPromise = null;
let splitCatalogManifestPromise = null;
let fullDownloadPromise = null;
let fullDownloadStopReason = null;
let fullDownloadCount = 0;
let fullDownloadAbortController = null;
const fullDownloadObservers = new Set();

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
    const packs = [
      [CACHE_NAME, SHELL_VERSION, CORE_SHELL_ASSETS, cacheApplicationShell],
      [CONTENT_CACHE, CONTENT_VERSION, CONTENT_ASSETS, cacheContentPack],
      [MEDICAL_CACHE, MEDICAL_VERSION, MEDICAL_ASSETS, () => cacheOrdinaryPack(MEDICAL_CACHE, MEDICAL_VERSION, MEDICAL_ASSETS)],
      [SEARCH_CACHE, SEARCH_VERSION, SEARCH_ASSETS, () => cacheOrdinaryPack(SEARCH_CACHE, SEARCH_VERSION, SEARCH_ASSETS)],
      [AUDIO_METADATA_CACHE, AUDIO_VERSION, AUDIO_METADATA_ASSETS, () => cacheOrdinaryPack(AUDIO_METADATA_CACHE, AUDIO_VERSION, AUDIO_METADATA_ASSETS)]
    ];
    const reusable = new Map(await Promise.all(packs.map(async ([name, version, paths]) => (
      [name, await packReady(name, version, paths)]
    ))));
    try {
      await Promise.all(packs.map(([, , , installPack]) => installPack()));
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

async function cachePack(cacheName, version, paths, loader) {
  if (await packReady(cacheName, version, paths)) return Object.freeze({ reused: true });
  await caches.delete(cacheName);
  const cache = await caches.open(cacheName);
  try {
    const responses = await Promise.all(paths.map(async (assetPath) => ({
      assetPath,
      response: await loader(assetPath)
    })));
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
  return response;
}

async function cacheApplicationShell() {
  return cachePack(CACHE_NAME, SHELL_VERSION, CORE_SHELL_ASSETS, fetchLocalAsset);
}

async function cacheOrdinaryPack(cacheName, version, paths) {
  return cachePack(cacheName, version, paths, fetchLocalAsset);
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

async function cacheContentPack() {
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
  });
}

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await cleanupManagedCaches();
    await fullAudioReady();
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
    FULL_AUDIO_CACHE
  ]);
  const managedPrefixes = [
    CACHE_PREFIX,
    CONTENT_CACHE_PREFIX,
    CONTENT_RUNTIME_CACHE_PREFIX,
    MEDICAL_CACHE_PREFIX,
    SEARCH_CACHE_PREFIX,
    SEARCH_DATA_CACHE_PREFIX,
    AUDIO_CACHE_PREFIX,
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

async function fullAudioReady() {
  if (!(await caches.keys()).includes(FULL_AUDIO_CACHE)) {
    return false;
  }
  const manifest = await narrationEntries();
  const cache = await caches.open(FULL_AUDIO_CACHE);
  const marker = await cache.match(localUrl(FULL_AUDIO_MARKER));
  if (!marker?.ok) {
    return false;
  }
  try {
    const value = await marker.json();
    if (value?.audioVersion !== AUDIO_VERSION
      || value?.manifestSha256 !== AUDIO_MANIFEST_SHA256
      || value?.count !== manifest.entries.length
      || value?.totalBytes !== manifest.totalBytes) {
      return false;
    }
    const snapshot = await audioCacheSnapshot(cache, manifest, false);
    return snapshot.count === manifest.entries.length && snapshot.bytes === manifest.totalBytes;
  } catch (_error) {
    return false;
  }
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
  const [audioFull, catalogFull, manifest, splitManifest] = await Promise.all([
    fullAudioReady(),
    fullSplitCatalogReady(),
    narrationEntries(),
    splitCatalogManifest()
  ]);
  const full = audioFull && catalogFull;
  const extra = overrides || {};
  const staging = full ? 0 : (Boolean(fullDownloadPromise) ? fullDownloadCount : audioFull ? 0 : await stagedAudioCount());
  const light = full ? 0 : await lightAudioCount();
  const defaultPhase = full ? "ready" : fullDownloadPromise ? "downloading" : staging > 0 ? "paused" : "ready";
  const requestedFull = Boolean(fullDownloadPromise) && !["error", "cancelled", "paused"].includes(extra.phase);
  return {
    ok: extra.ok !== false,
    mode: full || requestedFull ? "full" : "light",
    phase: extra.phase || defaultPhase,
    cachedCount: full ? 500 : staging > 0 ? staging : light,
    stagedCount: staging,
    lightCachedCount: light,
    totalCount: 500,
    estimatedFullBytes: manifest.totalBytes + splitManifest.fullBytes,
    contentReady: catalogFull,
    contentCachedCount: catalogFull ? splitManifest.details.length + 1 : null,
    contentTotalCount: splitManifest.details.length + 1,
    errorCode: extra.errorCode || null,
    packVersions: PACK_VERSIONS,
    ...(Number.isFinite(extra.requiredBytes) ? { requiredBytes: extra.requiredBytes } : {}),
    ...(Number.isFinite(extra.availableBytes) ? { availableBytes: extra.availableBytes } : {}),
    ...(extra.error ? { error: extra.error } : {})
  };
}

async function repairApplicationCaches() {
  await stopFullDownload("PAUSED", false);
  await cleanupManagedCaches();
  await Promise.all([
    cacheApplicationShell(),
    cacheContentPack(),
    cacheOrdinaryPack(MEDICAL_CACHE, MEDICAL_VERSION, MEDICAL_ASSETS),
    cacheOrdinaryPack(SEARCH_CACHE, SEARCH_VERSION, SEARCH_ASSETS),
    cacheOrdinaryPack(AUDIO_METADATA_CACHE, AUDIO_VERSION, AUDIO_METADATA_ASSETS)
  ]);
  narrationManifestPromise = null;
  splitCatalogManifestPromise = null;
  const manifest = await narrationEntries();
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
    await Promise.all([
      caches.delete(FULL_AUDIO_CACHE),
      caches.delete(CONTENT_RUNTIME_CACHE),
      caches.delete(SEARCH_DATA_CACHE)
    ]);
    fullDownloadCount = 0;
  }
  if (!active) fullDownloadStopReason = null;
}

async function ensureFullAudio() {
  if ((await fullAudioReady()) && (await fullSplitCatalogReady())) return offlineStatus({ phase: "ready" });
  if (fullDownloadPromise) return fullDownloadPromise;
  fullDownloadStopReason = null;
  fullDownloadAbortController = new AbortController();
  fullDownloadPromise = (async () => {
    const manifest = await narrationEntries();
    const cache = await caches.open(FULL_AUDIO_CACHE);
    const audioWasReady = await fullAudioReady();
    if (!audioWasReady) await cache.delete(localUrl(FULL_AUDIO_MARKER));
    const staged = audioWasReady
      ? Object.freeze({ count: manifest.entries.length, bytes: manifest.totalBytes, urls: manifest.urls })
      : await audioCacheSnapshot(cache, manifest, true);
    fullDownloadCount = staged.count;
    const missing = audioWasReady ? [] : manifest.entries.filter((entry) => !staged.urls.has(localUrl(entry.path)));
    const catalogWasReady = await fullSplitCatalogReady();
    const splitStage = catalogWasReady ? null : await splitStageState(true);
    const requiredBytes = missing.reduce((sum, entry) => sum + entry.bytes, 0) + (splitStage?.requiredBytes || 0);
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
        if (!(await fullAudioReady())) {
          await cache.delete(localUrl(FULL_AUDIO_MARKER));
          throw codedError("The narration ready marker failed its 500-file validation", "INCOMPLETE_AUDIO");
        }
      }
      await caches.delete(LIGHT_AUDIO_CACHE);
      return offlineStatus({ phase: "ready" });
    } catch (error) {
      if (!audioWasReady) {
        await cache.delete(localUrl(FULL_AUDIO_MARKER));
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

async function matchInstalledAsset(request) {
  for (const cacheName of [CACHE_NAME, CONTENT_CACHE, MEDICAL_CACHE, SEARCH_CACHE, AUDIO_METADATA_CACHE]) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = (await cache.match(request)) || (await cache.match(localUrl("./index.html")));
      if (cached) return cached;
      try { return await fetch(request); }
      catch (_error) { return cache.match(localUrl("./index.html")); }
    })());
    return;
  }

  event.respondWith((async () => {
    if (/\/catalog-data\/(?:selection|search)\.[a-f0-9]{12}\.js$|\/catalog-data\/selection-data\.[a-f0-9]{12}\.json$|\/catalog-data\/details\/(?:book|movie|city|german|medical)-\d{3}\.[a-f0-9]{12}\.js$/.test(url.pathname)) {
      const catalogAsset = await matchOrFetchSplitCatalog(request);
      if (catalogAsset) return catalogAsset;
    }
    if (/\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(url.pathname)) {
      if (await fullAudioReady()) {
        const complete = await caches.open(FULL_AUDIO_CACHE);
        const cached = await complete.match(request);
        if (cached) return cached;
      }
      const light = await caches.open(LIGHT_AUDIO_CACHE);
      const cached = await light.match(request);
      if (cached) return cached;
    }
    const cached = await matchInstalledAsset(request);
    if (cached) return cached;
    return fetch(request);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "./", self.location.href).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
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
  PACK_VERSIONS,
  cacheApplicationShell,
  cacheContentPack,
  ensureFullAudio,
  fullAudioReady,
  narrationEntries,
  offlineStatus,
  packReady
});
