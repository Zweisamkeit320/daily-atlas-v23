(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasRuntimeHealth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const ERROR_KEY = "dailyAtlas.runtimeHealth.v1";
  const MAX_ERRORS = 20;
  const CACHE_NAME_PATTERN = /^daily-atlas(?:-|$)/i;
  const SAFE_CODE = /^[A-Z0-9_.:-]{1,64}$/i;
  const SAFE_STAGE = /^[a-z0-9-]{1,32}$/i;

  function clampInteger(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
  }

  function safeStorage() {
    try { return root.localStorage || null; }
    catch (_error) { return null; }
  }

  function parseErrors(value) {
    try {
      const parsed = JSON.parse(value || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry) => entry && typeof entry === "object")
        .slice(-MAX_ERRORS)
        .map((entry) => Object.freeze({
          at: /^\d{4}-\d{2}-\d{2}T/.test(String(entry.at || "")) ? String(entry.at) : "",
          stage: SAFE_STAGE.test(String(entry.stage || "")) ? String(entry.stage) : "unknown",
          code: SAFE_CODE.test(String(entry.code || "")) ? String(entry.code) : "UNKNOWN"
        }));
    } catch (_error) {
      return [];
    }
  }

  function readErrors(storage) {
    const target = storage === undefined ? safeStorage() : storage;
    if (!target?.getItem) return [];
    try { return parseErrors(target.getItem(ERROR_KEY)); }
    catch (_error) { return []; }
  }

  function record(stage, code, options) {
    const normalized = Object.freeze({
      at: new Date(options?.now || Date.now()).toISOString(),
      stage: SAFE_STAGE.test(String(stage || "")) ? String(stage) : "unknown",
      code: SAFE_CODE.test(String(code || "")) ? String(code) : "UNKNOWN"
    });
    const storage = options?.storage === undefined ? safeStorage() : options.storage;
    if (!storage?.setItem) return normalized;
    try {
      const entries = [...readErrors(storage), normalized].slice(-MAX_ERRORS);
      storage.setItem(ERROR_KEY, JSON.stringify(entries));
    } catch (_error) {}
    return normalized;
  }

  function clearErrors(storage) {
    const target = storage === undefined ? safeStorage() : storage;
    try { target?.removeItem?.(ERROR_KEY); return true; }
    catch (_error) { return false; }
  }

  function timeoutError(label, timeoutMs) {
    const error = new Error(`${label || "operation"} timed out after ${timeoutMs} ms`);
    error.name = "TimeoutError";
    error.code = "TIMEOUT";
    return error;
  }

  function withTimeout(task, timeoutMs, options) {
    const duration = clampInteger(timeoutMs, 100, 120000, 10000);
    const label = String(options?.label || "operation");
    const setTimer = options?.setTimeout || root.setTimeout;
    const clearTimer = options?.clearTimeout || root.clearTimeout;
    if (typeof setTimer !== "function" || typeof clearTimer !== "function") return Promise.resolve(task);
    let timer;
    return Promise.race([
      Promise.resolve(task),
      new Promise((_, reject) => {
        timer = setTimer(() => reject(timeoutError(label, duration)), duration);
      })
    ]).finally(() => clearTimer(timer));
  }

  function humanBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "不可用";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let amount = bytes / 1024;
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index += 1;
    }
    return `${amount >= 100 ? amount.toFixed(0) : amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${units[index]}`;
  }

  async function storageSnapshot(options) {
    const manager = options?.storageManager || root.navigator?.storage;
    const result = {
      supported: Boolean(manager?.estimate),
      usage: null,
      quota: null,
      available: null,
      usageRatio: null,
      persisted: null
    };
    if (!manager?.estimate) return Object.freeze(result);
    try {
      const estimate = await withTimeout(manager.estimate(), options?.timeoutMs || 5000, { label: "storage-estimate" });
      result.usage = Number.isFinite(Number(estimate?.usage)) ? Number(estimate.usage) : null;
      result.quota = Number.isFinite(Number(estimate?.quota)) ? Number(estimate.quota) : null;
      result.available = result.quota !== null && result.usage !== null ? Math.max(0, result.quota - result.usage) : null;
      result.usageRatio = result.quota > 0 && result.usage !== null ? result.usage / result.quota : null;
    } catch (_error) {}
    if (typeof manager.persisted === "function") {
      try { result.persisted = Boolean(await withTimeout(manager.persisted(), options?.timeoutMs || 5000, { label: "storage-persisted" })); }
      catch (_error) {}
    }
    return Object.freeze(result);
  }

  async function inspectCaches(options) {
    const cacheStorage = options?.caches || root.caches;
    if (!cacheStorage?.keys) return Object.freeze({ supported: false, caches: Object.freeze([]), totalEntries: 0 });
    const names = await withTimeout(cacheStorage.keys(), options?.timeoutMs || 8000, { label: "cache-list" });
    const appNames = names.filter((name) => CACHE_NAME_PATTERN.test(String(name))).sort();
    const entries = [];
    for (const name of appNames) {
      let count = null;
      try {
        const cache = await withTimeout(cacheStorage.open(name), options?.timeoutMs || 8000, { label: "cache-open" });
        const keys = await withTimeout(cache.keys(), options?.timeoutMs || 8000, { label: "cache-keys" });
        count = keys.length;
      } catch (_error) {}
      entries.push(Object.freeze({ name, count }));
    }
    return Object.freeze({
      supported: true,
      caches: Object.freeze(entries),
      totalEntries: entries.reduce((sum, entry) => sum + (Number.isSafeInteger(entry.count) ? entry.count : 0), 0)
    });
  }

  async function repairCaches(options) {
    const cacheStorage = options?.caches || root.caches;
    if (!cacheStorage?.keys || !cacheStorage?.delete) {
      return Object.freeze({ ok: false, code: "CACHE_UNAVAILABLE", deleted: Object.freeze([]), failed: Object.freeze([]) });
    }
    const names = await withTimeout(cacheStorage.keys(), options?.timeoutMs || 8000, { label: "cache-list" });
    const targets = names.filter((name) => CACHE_NAME_PATTERN.test(String(name))).sort();
    const deleted = [];
    const failed = [];
    for (const name of targets) {
      try {
        const removed = await withTimeout(cacheStorage.delete(name), options?.timeoutMs || 8000, { label: "cache-delete" });
        if (removed) deleted.push(name);
        else failed.push(name);
      } catch (_error) { failed.push(name); }
    }
    try { await options?.registration?.update?.(); } catch (_error) {}
    return Object.freeze({ ok: failed.length === 0, code: failed.length ? "CACHE_REPAIR_PARTIAL" : "CACHE_REPAIRED", deleted: Object.freeze(deleted), failed: Object.freeze(failed) });
  }

  async function probe(url, options) {
    const fetchImpl = options?.fetchImpl || root.fetch;
    const started = Date.now();
    if (typeof fetchImpl !== "function") return Object.freeze({ ok: false, code: "FETCH_UNAVAILABLE", status: 0, durationMs: 0, bytes: null });
    const Controller = options?.AbortController || root.AbortController;
    const controller = typeof Controller === "function" ? new Controller() : null;
    const timeoutMs = clampInteger(options?.timeoutMs, 100, 30000, 8000);
    try {
      const response = await withTimeout(fetchImpl(url, {
        method: options?.method || "GET",
        cache: "no-store",
        credentials: "same-origin",
        ...(controller ? { signal: controller.signal } : {})
      }), timeoutMs, { label: "diagnostic-probe" });
      const lengthHeader = Number(response.headers?.get?.("content-length"));
      let bytes = Number.isFinite(lengthHeader) && lengthHeader >= 0 ? lengthHeader : null;
      if (options?.readBody && response.ok) {
        bytes = (await withTimeout(response.arrayBuffer(), timeoutMs, { label: "diagnostic-probe-body" })).byteLength;
      }
      return Object.freeze({
        ok: Boolean(response.ok),
        code: response.ok ? "OK" : "HTTP_ERROR",
        status: Number(response.status) || 0,
        durationMs: Date.now() - started,
        bytes
      });
    } catch (error) {
      if (error?.code === "TIMEOUT") controller?.abort?.();
      return Object.freeze({ ok: false, code: error?.code === "TIMEOUT" ? "TIMEOUT" : "NETWORK", status: 0, durationMs: Date.now() - started, bytes: null });
    }
  }

  function navigationSnapshot(performanceLike) {
    const performanceObject = performanceLike || root.performance;
    const entry = performanceObject?.getEntriesByType?.("navigation")?.[0];
    if (!entry) return Object.freeze({ supported: false, responseStartMs: null, domInteractiveMs: null, loadMs: null, transferBytes: null });
    return Object.freeze({
      supported: true,
      responseStartMs: Math.max(0, Math.round(Number(entry.responseStart) || 0)),
      domInteractiveMs: Math.max(0, Math.round(Number(entry.domInteractive) || 0)),
      loadMs: Math.max(0, Math.round(Number(entry.loadEventEnd) || Number(entry.duration) || 0)),
      transferBytes: Number.isFinite(Number(entry.transferSize)) ? Number(entry.transferSize) : null
    });
  }

  return Object.freeze({
    CACHE_NAME_PATTERN,
    ERROR_KEY,
    MAX_ERRORS,
    clearErrors,
    humanBytes,
    inspectCaches,
    navigationSnapshot,
    parseErrors,
    probe,
    readErrors,
    record,
    repairCaches,
    storageSnapshot,
    withTimeout
  });
});
