(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasAssets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DEPLOYMENT_HOST = "zweisamkeit320.github.io";
  const DEPLOYMENT_PATH = "/daily-atlas-v23/";
  // A full commit is immutable on the CDN. The release builder may replace this
  // value explicitly, but a moving branch or tag must never be used here.
  const DEPLOYMENT_REVISION = "113b69412fb7d9b853f52fd5f0b9bd8764fd311b";
  const CDN_BASE = `https://cdn.jsdelivr.net/gh/Zweisamkeit320/daily-atlas-v23@${DEPLOYMENT_REVISION}/`;
  const CATALOG_INTEGRITY = "sha384-zKpJtMPmuD0eyJv9MeWbIoI2ACWLvDRfrVcroywVszlSuilgVc0+D8eXuTo52XA4";
  const CATALOG_SHA256 = "08525DE9CE45D83786D383FFAA3251D89CD74ACF74CD98DF7FBC38A5FCE2707D";
  const CATALOG_BYTES = 3397181;
  const DEFAULT_TIMEOUT_MS = 15000;
  const PRIMARY_ROUTE_TIMEOUT_MS = 6500;
  const FALLBACK_ROUTE_TIMEOUT_MS = 6500;
  const CATALOG_HEDGE_DELAY_MS = 1800;
  const TRANSFER_CACHE_PREFIX = "daily-atlas-transfer-";
  const ROUTABLE_ASSET = /^(?:assets\/audio\/german\/de-[a-z0-9-]+\.mp3|catalog-data\/(?:selection|search)\.[a-f0-9]{12}\.js|catalog-data\/selection-data\.[a-f0-9]{12}\.json|catalog-data\/details\/(?:book|movie|city|german|medical)-\d{3}\.[a-f0-9]{12}\.js)$/;
  const IMMUTABLE_CATALOG_ASSET = /^catalog-data\/(?:selection|search)\.[a-f0-9]{12}\.js$|^catalog-data\/selection-data\.[a-f0-9]{12}\.json$|^catalog-data\/details\/(?:book|movie|city|german|medical)-\d{3}\.[a-f0-9]{12}\.js$/;

  function deploymentMatches(locationLike) {
    const hostname = String(locationLike?.hostname || "").toLowerCase();
    const pathname = String(locationLike?.pathname || "/");
    return hostname === DEPLOYMENT_HOST && (pathname === DEPLOYMENT_PATH.slice(0, -1) || pathname.startsWith(DEPLOYMENT_PATH));
  }

  function normalizeAssetPath(value) {
    const path = String(value || "").replace(/^\.\//, "");
    if (!ROUTABLE_ASSET.test(path)) throw new TypeError("Asset path is not eligible for the pinned CDN route");
    return path;
  }

  function cdnUrl(value) {
    return `${CDN_BASE}${normalizeAssetPath(value)}`;
  }

  function sameOriginUrl(value, locationLike) {
    const relative = `./${normalizeAssetPath(value)}`;
    const base = String(locationLike?.href || "");
    if (!base) return relative;
    try { return new URL(relative, base).href; }
    catch (_error) { return relative; }
  }

  function candidateUrls(value, locationLike) {
    const path = normalizeAssetPath(value);
    const local = sameOriginUrl(path, locationLike);
    const immutableCatalogChunk = IMMUTABLE_CATALOG_ASSET.test(path);
    const candidates = deploymentMatches(locationLike)
      ? [
          Object.freeze({ source: "same-origin", url: local, cache: immutableCatalogChunk ? "force-cache" : "reload" }),
          Object.freeze({ source: "cdn", url: cdnUrl(path), cache: "force-cache" })
        ]
      : [Object.freeze({ source: "same-origin", url: local, cache: immutableCatalogChunk ? "force-cache" : "reload" })];
    return Object.freeze(candidates);
  }

  function catalogUrl(locationLike, serviceWorkerControlled) {
    return "./catalog.js";
  }

  function networkUrl(value, locationLike) {
    const path = normalizeAssetPath(value);
    return deploymentMatches(locationLike) ? cdnUrl(path) : `./${path}`;
  }

  function isCdnUrl(value) {
    return String(value || "").startsWith(CDN_BASE);
  }

  function bytesToHex(value) {
    return [...new Uint8Array(value)].map((item) => item.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function assetError(message, code, details) {
    const error = new Error(message);
    error.code = code;
    if (details) Object.assign(error, details);
    return error;
  }

  async function validateResponse(response, options) {
    if (!response?.ok) {
      throw assetError(`Asset request failed with HTTP ${Number(response?.status) || 0}`, "NETWORK", {
        status: Number(response?.status) || 0
      });
    }
    const bytes = await response.clone().arrayBuffer();
    if (Number.isSafeInteger(options.bytes) && bytes.byteLength !== options.bytes) {
      throw assetError(`Asset byte length mismatch: expected ${options.bytes}, received ${bytes.byteLength}`, "INVALID_ASSET");
    }
    const expectedSha256 = String(options.sha256 || "").toUpperCase();
    let actualSha256 = null;
    if (expectedSha256) {
      if (!/^[A-F0-9]{64}$/.test(expectedSha256)) throw new TypeError("Expected SHA-256 must be 64 hexadecimal characters");
      const subtle = options.crypto?.subtle || root.crypto?.subtle;
      if (!subtle?.digest) throw assetError("SHA-256 verification is unavailable", "VERIFY_UNAVAILABLE");
      actualSha256 = bytesToHex(await subtle.digest("SHA-256", bytes));
      if (actualSha256 !== expectedSha256) throw assetError("Asset SHA-256 mismatch", "INVALID_ASSET", { actualSha256 });
    }
    return Object.freeze({ bytes: bytes.byteLength, sha256: actualSha256 });
  }

  async function fetchAttempt(candidate, options) {
    const fetchImpl = options.fetchImpl || root.fetch;
    if (typeof fetchImpl !== "function") throw assetError("Fetch is unavailable", "NETWORK");
    if (options.signal?.aborted) throw assetError("Asset request was cancelled", "CANCELLED");

    const Controller = options.AbortController || root.AbortController;
    const controller = typeof Controller === "function" ? new Controller() : null;
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
    let timedOut = false;
    let timer = null;
    let rejectGate = null;
    const gate = new Promise((_resolve, reject) => { rejectGate = reject; });
    const cancel = () => {
      controller?.abort();
      rejectGate?.(assetError("Asset request was cancelled", "CANCELLED"));
    };
    if (options.signal?.addEventListener) options.signal.addEventListener("abort", cancel, { once: true });
    timer = (options.setTimeout || root.setTimeout)(() => {
      timedOut = true;
      controller?.abort();
      rejectGate?.(assetError(`Asset request timed out after ${timeoutMs} ms`, "TIMEOUT"));
    }, timeoutMs);

    try {
      const request = Promise.resolve().then(() => fetchImpl(candidate.url, {
        cache: candidate.cache,
        ...(options.integrity ? { integrity: options.integrity } : {}),
        ...(controller ? { signal: controller.signal } : options.signal ? { signal: options.signal } : {})
      }));
      const response = await Promise.race([request, gate]);
      const verified = await validateResponse(response, options);
      if (options.signal?.aborted) throw assetError("Asset request was cancelled", "CANCELLED");
      if (timedOut) throw assetError(`Asset request timed out after ${timeoutMs} ms`, "TIMEOUT");
      return Object.freeze({ response, url: candidate.url, source: candidate.source, ...verified });
    } catch (error) {
      if (options.signal?.aborted) throw assetError("Asset request was cancelled", "CANCELLED", { cause: error });
      if (timedOut) throw assetError(`Asset request timed out after ${timeoutMs} ms`, "TIMEOUT", { cause: error });
      if (error?.code) throw error;
      throw assetError(String(error?.message || error || "Asset request failed"), "NETWORK", { cause: error });
    } finally {
      if (timer !== null) (options.clearTimeout || root.clearTimeout)(timer);
      if (options.signal?.removeEventListener) options.signal.removeEventListener("abort", cancel);
    }
  }

  async function fetchVerifiedAsset(value, options) {
    const settings = options || {};
    const path = normalizeAssetPath(value);
    const candidates = candidateUrls(path, settings.location || root.location);
    if (candidates.length === 2 && IMMUTABLE_CATALOG_ASSET.test(path) && settings.serviceWorkerControlled !== true) {
      return fetchHedgedAsset(candidates, settings);
    }
    const attempts = [];
    let finalCode = "NETWORK";
    for (const candidate of candidates) {
      try {
        const requestedTimeout = Math.max(1, Number(settings.timeoutMs) || DEFAULT_TIMEOUT_MS);
        const routeTimeout = candidates.length > 1
          ? Math.min(requestedTimeout, candidate.source === "same-origin" ? PRIMARY_ROUTE_TIMEOUT_MS : FALLBACK_ROUTE_TIMEOUT_MS)
          : requestedTimeout;
        const result = await fetchAttempt(candidate, { ...settings, timeoutMs: routeTimeout });
        return Object.freeze({ ...result, attempts: Object.freeze([...attempts]) });
      } catch (error) {
        if (error?.code === "CANCELLED") throw error;
        if (["INVALID_ASSET", "VERIFY_UNAVAILABLE"].includes(error?.code)) finalCode = error.code;
        else if (error?.code === "TIMEOUT" && finalCode === "NETWORK") finalCode = "TIMEOUT";
        attempts.push(Object.freeze({
          source: candidate.source,
          url: candidate.url,
          code: error?.code || "NETWORK",
          ...(Number.isSafeInteger(error?.status) ? { status: error.status } : {})
        }));
      }
    }
    throw assetError(`All ${attempts.length} verified asset routes failed`, finalCode, { attempts: Object.freeze(attempts) });
  }

  function failedAttempt(candidate, error) {
    return Object.freeze({
      source: candidate.source,
      url: candidate.url,
      code: error?.code || "NETWORK",
      ...(Number.isSafeInteger(error?.status) ? { status: error.status } : {})
    });
  }

  function finalFailure(attempts) {
    let code = "NETWORK";
    if (attempts.some((attempt) => ["INVALID_ASSET", "VERIFY_UNAVAILABLE"].includes(attempt.code))) code = "INVALID_ASSET";
    else if (attempts.some((attempt) => attempt.code === "TIMEOUT")) code = "TIMEOUT";
    return assetError(`All ${attempts.length} verified asset routes failed`, code, { attempts: Object.freeze(attempts) });
  }

  async function fetchHedgedAsset(candidates, settings) {
    const requestedTimeout = Math.max(1, Number(settings.timeoutMs) || DEFAULT_TIMEOUT_MS);
    const Controller = settings.AbortController || root.AbortController;
    const controllers = candidates.map(() => typeof Controller === "function" ? new Controller() : null);
    if (settings.signal?.aborted) throw assetError("Asset request was cancelled", "CANCELLED");
    const cancelAll = () => controllers.forEach((controller) => controller?.abort());
    const cleanup = () => settings.signal?.removeEventListener?.("abort", cancelAll);
    settings.signal?.addEventListener?.("abort", cancelAll, { once: true });
    const attempt = (index) => fetchAttempt(candidates[index], {
      ...settings,
      signal: controllers[index]?.signal || settings.signal,
      timeoutMs: Math.min(requestedTimeout, index === 0 ? PRIMARY_ROUTE_TIMEOUT_MS : FALLBACK_ROUTE_TIMEOUT_MS)
    }).then(
      (result) => ({ ok: true, index, result }),
      (error) => ({ ok: false, index, error })
    );
    const finish = (outcome, failures) => {
      controllers.forEach((controller, index) => { if (index !== outcome.index) controller?.abort(); });
      cleanup();
      return Object.freeze({ ...outcome.result, attempts: Object.freeze(failures) });
    };
    const failures = [];
    const primary = attempt(0);
    let hedgeTimer = null;
    const hedgeDelayMs = Number.isFinite(Number(settings.hedgeDelayMs))
      ? Math.max(0, Math.min(CATALOG_HEDGE_DELAY_MS, Number(settings.hedgeDelayMs)))
      : CATALOG_HEDGE_DELAY_MS;
    const delay = new Promise((resolve) => {
      hedgeTimer = (settings.setTimeout || root.setTimeout)(() => resolve({ hedge: true }), hedgeDelayMs);
    });
    const first = await Promise.race([primary, delay]);
    if (!first.hedge) {
      if (hedgeTimer !== null) (settings.clearTimeout || root.clearTimeout)(hedgeTimer);
      if (first.ok) return finish(first, failures);
      if (first.error?.code === "CANCELLED") { cleanup(); throw first.error; }
      failures.push(failedAttempt(candidates[0], first.error));
      const fallback = await attempt(1);
      if (fallback.ok) return finish(fallback, failures);
      if (fallback.error?.code === "CANCELLED") { cleanup(); throw fallback.error; }
      failures.push(failedAttempt(candidates[1], fallback.error));
      cleanup();
      throw finalFailure(failures);
    }

    const fallback = attempt(1);
    const outcome = await Promise.race([primary, fallback]);
    if (outcome.ok) return finish(outcome, failures);
    if (outcome.error?.code === "CANCELLED") { cleanup(); throw outcome.error; }
    failures.push(failedAttempt(candidates[outcome.index], outcome.error));
    const remaining = await (outcome.index === 0 ? fallback : primary);
    if (remaining.ok) return finish(remaining, failures);
    if (remaining.error?.code === "CANCELLED") { cleanup(); throw remaining.error; }
    failures.push(failedAttempt(candidates[remaining.index], remaining.error));
    cleanup();
    throw finalFailure(failures);
  }

  function transferCacheName(value) {
    const path = normalizeAssetPath(value);
    if (path === "catalog.js") return `${TRANSFER_CACHE_PREFIX}catalog-${CATALOG_SHA256.slice(0, 16).toLowerCase()}`;
    const immutableSelection = path.match(/^catalog-data\/selection-data\.([a-f0-9]{12})\.json$/);
    return immutableSelection ? `${TRANSFER_CACHE_PREFIX}selection-${immutableSelection[1]}` : null;
  }

  function transferRequestUrl(value, locationLike) {
    const name = transferCacheName(value);
    if (!name) return null;
    const base = String(locationLike?.href || "");
    const relative = `./__${name}__`;
    if (!base) return relative;
    try { return new URL(relative, base).href; }
    catch (_error) { return relative; }
  }

  async function verifiedTransfer(value, settings) {
    const cacheStorage = settings.cacheStorage || root.caches;
    const name = transferCacheName(value);
    if (!name || !cacheStorage?.open) return null;
    const key = transferRequestUrl(value, settings.location || root.location);
    try {
      const cache = await cacheStorage.open(name);
      const response = await cache.match(key);
      if (!response) return null;
      const verified = await validateResponse(response, settings);
      return Object.freeze({ response, url: key, source: "transfer", ...verified, attempts: Object.freeze([]) });
    } catch (_error) {
      try { await (await cacheStorage.open(name)).delete(key); } catch (_deleteError) {}
      return null;
    }
  }

  async function shareVerifiedTransfer(value, result, settings) {
    const cacheStorage = settings.cacheStorage || root.caches;
    const name = transferCacheName(value);
    if (!name || !cacheStorage?.open || settings.shareTransfer === false) return;
    try {
      const cache = await cacheStorage.open(name);
      await cache.put(transferRequestUrl(value, settings.location || root.location), result.response.clone());
    } catch (_error) {
      // Sharing only removes duplicate transfer. A quota failure here must not
      // invalidate an otherwise verified catalog response.
    }
  }

  async function clearVerifiedTransfer(value, options) {
    const settings = options || {};
    const cacheStorage = settings.cacheStorage || root.caches;
    const name = transferCacheName(value);
    if (!name || !cacheStorage?.delete) return false;
    try { return await cacheStorage.delete(name); }
    catch (_error) { return false; }
  }

  async function assetResolver(value, options) {
    const path = normalizeAssetPath(value);
    const settings = path === "catalog.js"
      ? {
          ...(options || {}),
          bytes: CATALOG_BYTES,
          sha256: CATALOG_SHA256,
          integrity: CATALOG_INTEGRITY
        }
      : (options || {});
    const transfer = settings.preferTransfer === false ? null : await verifiedTransfer(path, settings);
    if (transfer) return transfer;
    const result = await fetchVerifiedAsset(path, settings);
    await shareVerifiedTransfer(path, result, settings);
    return result;
  }

  function catalogAssetRequest(record, _kind, locationLike) {
    if (!record || typeof record.path !== "string") throw new TypeError("Catalog asset record is invalid");
    const path = normalizeAssetPath(`catalog-data/${record.path}`);
    const bytes = Number(record.bytes);
    const sha256 = String(record.sha256 || "").toUpperCase();
    const integrity = String(record.integrity || "");
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || !/^[A-F0-9]{64}$/.test(sha256)
      || !/^sha384-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
      throw new TypeError("Catalog asset record has invalid byte, SHA-256, or SRI metadata");
    }
    const routed = candidateUrls(path, locationLike);
    const controlled = Boolean(root.navigator?.serviceWorker?.controller);
    const candidates = controlled && routed.length > 1
      ? Object.freeze(routed.filter((candidate) => candidate.source === "same-origin"))
      : routed;
    return Object.freeze({
      path,
      url: candidates[0].url,
      fallbackUrl: candidates[1]?.url || null,
      integrity,
      bytes,
      sha256
    });
  }

  return Object.freeze({
    CATALOG_BYTES,
    CATALOG_INTEGRITY,
    CATALOG_SHA256,
    CATALOG_HEDGE_DELAY_MS,
    CDN_BASE,
    DEFAULT_TIMEOUT_MS,
    FALLBACK_ROUTE_TIMEOUT_MS,
    DEPLOYMENT_HOST,
    DEPLOYMENT_PATH,
    DEPLOYMENT_REVISION,
    PRIMARY_ROUTE_TIMEOUT_MS,
    TRANSFER_CACHE_PREFIX,
    assetResolver,
    catalogAssetRequest,
    candidateUrls,
    catalogUrl,
    cdnUrl,
    deploymentMatches,
    clearVerifiedTransfer,
    fetchVerifiedAsset,
    isCdnUrl,
    networkUrl,
    normalizeAssetPath,
    sameOriginUrl,
    transferCacheName,
    transferRequestUrl
  });
});
