(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasPWA = api;
  root.DailyAtlasPwa = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const PWA_BOUNDARY = "PWA 安装和 Service Worker 离线缓存需要 HTTPS 或 localhost；file:// 双击模式仍可使用核心页面，但不能注册 Service Worker。远程书封和电影海报不纳入离线缓存。";
  const state = {
    registration: null,
    installPrompt: null,
    updateAvailable: false,
    registered: false,
    online: root.navigator?.onLine !== false,
    status: "idle",
    initialized: false,
    controllerChanged: false,
    offlineMode: "light",
    offlinePhase: "idle",
    offlineCachedCount: 0,
    offlineStagedCount: 0,
    offlineLightCachedCount: 0,
    offlineTotalCount: 500,
    offlineErrorCode: null,
    offlineRequiredBytes: null,
    offlineAvailableBytes: null,
    offlineEstimatedFullBytes: null,
    offlineContentReady: false,
    offlineContentCachedCount: null,
    offlineContentTotalCount: null,
    packVersions: null
  };

  function withTimeout(task, timeoutMs, label) {
    if (typeof root.setTimeout !== "function" || typeof root.clearTimeout !== "function") return Promise.resolve(task);
    let timer;
    return Promise.race([
      Promise.resolve(task),
      new Promise((_, reject) => {
        timer = root.setTimeout(() => {
          const error = new Error(`${label || "operation"} timed out`);
          error.code = "TIMEOUT";
          reject(error);
        }, timeoutMs);
      })
    ]).finally(() => root.clearTimeout(timer));
  }
  const installCallbacks = new Set();

  function capability() {
    const protocol = String(root.location?.protocol || "");
    if (!(protocol === "http:" || protocol === "https:")) return { supported: false, reason: "requires-http" };
    if (root.isSecureContext === false) return { supported: false, reason: "requires-secure-context" };
    if (!root.navigator?.serviceWorker) return { supported: false, reason: "service-worker-unavailable" };
    return { supported: true, reason: null };
  }

  function initialize(options) {
    if (state.initialized) {
      if (options?.autoRegister !== false && !state.registration) void register(options).catch(() => {});
      return api;
    }
    state.initialized = true;
    root.addEventListener?.("beforeinstallprompt", (event) => {
      event.preventDefault?.();
      state.installPrompt = event;
      for (const callback of installCallbacks) {
        try { callback(getState()); } catch (_error) {}
      }
      dispatch("install-available");
    });
    root.addEventListener?.("appinstalled", () => {
      state.installPrompt = null;
      dispatch("installed");
    });
    root.addEventListener?.("online", () => { state.online = true; dispatch("online"); });
    root.addEventListener?.("offline", () => { state.online = false; dispatch("offline"); });
    root.navigator?.serviceWorker?.addEventListener?.("controllerchange", () => {
      state.controllerChanged = true;
      state.updateAvailable = false;
      dispatch("controller-changed");
      void getOfflineStatus();
    });
    if (options?.autoRegister !== false) void register(options).catch(() => {});
    return api;
  }

  async function register(options) {
    const support = capability();
    if (!support.supported) {
      state.status = support.reason;
      dispatch(support.reason);
      return Object.freeze({ ok: false, ...support, boundary: PWA_BOUNDARY });
    }
    if (state.registration) return Object.freeze({ ok: true, registration: state.registration, reused: true });
    const settings = options || {};
    try {
      const registration = await root.navigator.serviceWorker.register(settings.serviceWorkerUrl || "./sw.js", {
        scope: settings.scope || "./",
        updateViaCache: "none"
      });
      state.registration = registration;
      state.registered = true;
      state.status = "registered";
      observeRegistration(registration);
      if (registration.waiting) {
        state.updateAvailable = true;
        dispatch("update-available");
      } else dispatch("registered");
      void getOfflineStatus();
      return Object.freeze({ ok: true, registration, reused: false });
    } catch (error) {
      state.status = "registration-failed";
      dispatch("registration-failed", { error: String(error?.message || error) });
      return Object.freeze({ ok: false, supported: true, reason: "registration-failed", error: String(error?.message || error), boundary: PWA_BOUNDARY });
    }
  }

  function observeRegistration(registration) {
    registration.addEventListener?.("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      dispatch("update-installing");
      worker.addEventListener?.("statechange", () => {
        if (worker.state === "installed" && root.navigator.serviceWorker.controller) {
          state.updateAvailable = true;
          dispatch("update-available");
        }
      });
    });
  }

  async function checkForUpdate() {
    if (!state.registration) {
      const result = await register({ autoRegister: false });
      if (!result.ok) return false;
    }
    try {
      await state.registration.update();
      dispatch("update-checked");
      return true;
    } catch (error) {
      dispatch("update-check-failed", { error: String(error?.message || error) });
      return false;
    }
  }

  function applyUpdate(options) {
    const waiting = state.registration?.waiting;
    if (!waiting) return false;
    state.controllerChanged = false;
    waiting.postMessage({ type: "SKIP_WAITING" });
    if (options?.reload) {
      const onChange = () => {
        root.navigator.serviceWorker.removeEventListener?.("controllerchange", onChange);
        root.location?.reload?.();
      };
      root.navigator.serviceWorker.addEventListener?.("controllerchange", onChange);
    }
    dispatch("update-requested");
    return true;
  }

  async function promptInstall() {
    const prompt = state.installPrompt;
    if (!prompt) return Object.freeze({ available: false, outcome: "unavailable" });
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      state.installPrompt = null;
      dispatch(`install-${choice?.outcome || "dismissed"}`);
      return Object.freeze({ available: true, outcome: choice?.outcome || "dismissed", platform: choice?.platform || null });
    } catch (_error) {
      state.installPrompt = null;
      dispatch("install-failed");
      return Object.freeze({ available: true, outcome: "failed" });
    }
  }

  function onInstallAvailable(callback) {
    if (typeof callback !== "function") throw new TypeError("install callback must be a function");
    installCallbacks.add(callback);
    if (state.installPrompt) {
      try { callback(getState()); } catch (_error) {}
    }
    return () => installCallbacks.delete(callback);
  }

  function updateOfflineState(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.mode === "light" || payload.mode === "full") state.offlineMode = payload.mode;
    if (typeof payload.phase === "string") state.offlinePhase = payload.phase;
    if (Number.isSafeInteger(payload.cachedCount) && payload.cachedCount >= 0) state.offlineCachedCount = payload.cachedCount;
    if (Number.isSafeInteger(payload.stagedCount) && payload.stagedCount >= 0) state.offlineStagedCount = payload.stagedCount;
    if (Number.isSafeInteger(payload.lightCachedCount) && payload.lightCachedCount >= 0) state.offlineLightCachedCount = payload.lightCachedCount;
    if (Number.isSafeInteger(payload.totalCount) && payload.totalCount > 0) state.offlineTotalCount = payload.totalCount;
    state.offlineErrorCode = typeof payload.errorCode === "string" && payload.errorCode ? payload.errorCode : null;
    state.offlineRequiredBytes = Number.isFinite(payload.requiredBytes) && payload.requiredBytes >= 0 ? payload.requiredBytes : null;
    state.offlineAvailableBytes = Number.isFinite(payload.availableBytes) && payload.availableBytes >= 0 ? payload.availableBytes : null;
    if (Number.isFinite(payload.estimatedFullBytes) && payload.estimatedFullBytes > 0) state.offlineEstimatedFullBytes = payload.estimatedFullBytes;
    if (typeof payload.contentReady === "boolean") state.offlineContentReady = payload.contentReady;
    state.offlineContentCachedCount = Number.isSafeInteger(payload.contentCachedCount) && payload.contentCachedCount >= 0 ? payload.contentCachedCount : null;
    state.offlineContentTotalCount = Number.isSafeInteger(payload.contentTotalCount) && payload.contentTotalCount > 0 ? payload.contentTotalCount : null;
    if (payload.packVersions && typeof payload.packVersions === "object") {
      state.packVersions = Object.freeze({ ...payload.packVersions });
    }
    dispatch(`offline-${state.offlinePhase}`, { offlineResult: payload });
  }

  async function activeWorker() {
    if (!state.registration) {
      const registered = await register({ autoRegister: false });
      if (!registered.ok) return null;
    }
    if (root.navigator?.serviceWorker?.controller) return root.navigator.serviceWorker.controller;
    if (state.registration?.active) return state.registration.active;
    try {
      const ready = await root.navigator?.serviceWorker?.ready;
      return ready?.active || null;
    } catch (_error) {
      return null;
    }
  }

  async function sendOfflineMessage(message, options) {
    const support = capability();
    if (!support.supported) {
      const result = Object.freeze({ ok: false, mode: "light", phase: "unsupported", cachedCount: 0, totalCount: 500, errorCode: support.reason });
      updateOfflineState(result);
      return result;
    }
    if (typeof root.MessageChannel !== "function") {
      const result = Object.freeze({ ok: false, mode: "light", phase: "unsupported", cachedCount: 0, totalCount: 500, errorCode: "message-channel-unavailable" });
      updateOfflineState(result);
      return result;
    }
    const worker = await activeWorker();
    if (!worker || typeof worker.postMessage !== "function") {
      const result = Object.freeze({ ok: false, mode: state.offlineMode, phase: "error", cachedCount: state.offlineCachedCount, totalCount: 500, errorCode: "worker-not-active" });
      updateOfflineState(result);
      return result;
    }
    const settings = options || {};
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      const channel = new root.MessageChannel();
      const timeoutMs = Math.max(1000, Number(settings.timeoutMs) || 30000);
      let timer = null;
      let settled = false;
      const close = () => {
        if (timer !== null) root.clearTimeout?.(timer);
        timer = null;
        try { channel.port1.close?.(); } catch (_error) {}
      };
      const failTimeout = () => {
        if (settled) return;
        settled = true;
        const result = Object.freeze({
          ok: false,
          mode: state.offlineMode,
          phase: "error",
          cachedCount: state.offlineCachedCount,
          totalCount: state.offlineTotalCount,
          errorCode: "worker-timeout"
        });
        updateOfflineState(result);
        close();
        resolve(result);
      };
      const armTimeout = () => {
        if (timer !== null) root.clearTimeout?.(timer);
        timer = root.setTimeout?.(failTimeout, timeoutMs) ?? null;
      };
      channel.port1.onmessage = (event) => {
        const payload = event?.data;
        if (!payload || payload.requestId !== requestId || settled) return;
        updateOfflineState(payload);
        try { settings.onProgress?.(Object.freeze({ ...payload })); } catch (_error) {}
        if (payload.final === false) {
          armTimeout();
          return;
        }
        settled = true;
        close();
        resolve(Object.freeze({ ...payload }));
      };
      armTimeout();
      try {
        worker.postMessage({ ...message, requestId }, [channel.port2]);
      } catch (_error) {
        failTimeout();
      }
    });
  }

  function getOfflineStatus() {
    return sendOfflineMessage({ type: "OFFLINE_GET_STATUS" });
  }

  function setOfflineMode(mode, onProgress) {
    if (mode !== "light" && mode !== "full") return Promise.reject(new TypeError("Offline mode must be light or full"));
    return sendOfflineMessage({ type: "OFFLINE_SET_MODE", mode }, {
      onProgress,
      timeoutMs: mode === "full" ? 10 * 60 * 1000 : 60000
    });
  }

  function cacheCurrentNarration(path) {
    if (typeof path !== "string" || !path) return Promise.resolve(Object.freeze({ ok: false, mode: state.offlineMode, phase: "error", errorCode: "invalid-audio-path" }));
    return sendOfflineMessage({ type: "OFFLINE_CACHE_CURRENT_AUDIO", path }, { timeoutMs: 60000 });
  }

  function cancelOfflineDownload() {
    return sendOfflineMessage({ type: "OFFLINE_CANCEL_FULL" }, { timeoutMs: 60000 });
  }

  function pauseOfflineDownload() {
    return sendOfflineMessage({ type: "OFFLINE_PAUSE_FULL" }, { timeoutMs: 60000 });
  }

  function resumeOfflineDownload(onProgress) {
    return sendOfflineMessage({ type: "OFFLINE_RESUME_FULL" }, {
      onProgress,
      timeoutMs: 10 * 60 * 1000
    });
  }

  async function getStorageEstimate() {
    const storage = root.navigator?.storage;
    if (!storage?.estimate) {
      return Object.freeze({ supported: false, usage: null, quota: null, available: null, estimatedFullBytes: state.offlineEstimatedFullBytes, persisted: null });
    }
    if (capability().supported && !state.offlineEstimatedFullBytes) {
      try { await getOfflineStatus(); } catch (_error) {}
    }
    try {
      const [estimate, persisted] = await Promise.all([
        withTimeout(storage.estimate(), 5000, "storage estimate"),
        typeof storage.persisted === "function" ? withTimeout(storage.persisted(), 5000, "storage persistence status").catch(() => null) : null
      ]);
      const usage = Number.isFinite(estimate?.usage) ? estimate.usage : null;
      const quota = Number.isFinite(estimate?.quota) ? estimate.quota : null;
      return Object.freeze({
        supported: true,
        usage,
        quota,
        available: usage !== null && quota !== null ? Math.max(0, quota - usage) : null,
        estimatedFullBytes: state.offlineEstimatedFullBytes,
        persisted: typeof persisted === "boolean" ? persisted : null
      });
    } catch (error) {
      return Object.freeze({ supported: true, usage: null, quota: null, available: null, estimatedFullBytes: state.offlineEstimatedFullBytes, persisted: null, error: String(error?.message || error) });
    }
  }

  async function requestPersistentStorage() {
    const storage = root.navigator?.storage;
    if (typeof storage?.persist !== "function") return Object.freeze({ supported: false, persisted: false });
    try {
      const persisted = Boolean(await withTimeout(storage.persist(), 10000, "persistent storage request"));
      return Object.freeze({ supported: true, persisted });
    } catch (error) {
      return Object.freeze({ supported: true, persisted: false, error: String(error?.message || error) });
    }
  }

  function repairCaches() {
    return sendOfflineMessage({ type: "OFFLINE_REPAIR_CACHES" }, { timeoutMs: 2 * 60 * 1000 });
  }

  function getState() {
    const support = capability();
    return Object.freeze({
      supported: support.supported,
      reason: support.reason,
      registered: state.registered,
      controlled: Boolean(root.navigator?.serviceWorker?.controller),
      updateAvailable: state.updateAvailable,
      installAvailable: Boolean(state.installPrompt),
      online: state.online,
      status: state.status,
      offlineMode: state.offlineMode,
      offlinePhase: state.offlinePhase,
      offlineCachedCount: state.offlineCachedCount,
      offlineStagedCount: state.offlineStagedCount,
      offlineLightCachedCount: state.offlineLightCachedCount,
      offlineTotalCount: state.offlineTotalCount,
      offlineErrorCode: state.offlineErrorCode,
      offlineRequiredBytes: state.offlineRequiredBytes,
      offlineAvailableBytes: state.offlineAvailableBytes,
      offlineEstimatedFullBytes: state.offlineEstimatedFullBytes,
      offlineContentReady: state.offlineContentReady,
      offlineContentCachedCount: state.offlineContentCachedCount,
      offlineContentTotalCount: state.offlineContentTotalCount,
      packVersions: state.packVersions ? Object.freeze({ ...state.packVersions }) : null,
      boundary: PWA_BOUNDARY
    });
  }

  function dispatch(status, extra) {
    state.status = status;
    if (typeof root.CustomEvent !== "function" || typeof root.dispatchEvent !== "function") return;
    root.dispatchEvent(new root.CustomEvent("dailyatlaspwastate", {
      detail: { ...getState(), ...(extra || {}) }
    }));
  }

  const api = Object.freeze({
    PWA_BOUNDARY,
    initialize,
    capability,
    register,
    checkForUpdate,
    applyUpdate,
    getOfflineStatus,
    setOfflineMode,
    cacheCurrentNarration,
    pauseOfflineDownload,
    resumeOfflineDownload,
    getStorageEstimate,
    requestPersistentStorage,
    repairCaches,
    cancelOfflineDownload,
    onInstallAvailable,
    install: promptInstall,
    promptInstall,
    status: getState,
    getState
  });

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", () => initialize(), { once: true });
    } else initialize();
  }
  return api;
});
