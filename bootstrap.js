(function () {
  "use strict";

  const root = globalThis;
  const Health = root.DailyAtlasRuntimeHealth || null;
  const elements = {
    panel: document.querySelector("#bootPanel"),
    title: document.querySelector("#bootTitle"),
    detail: document.querySelector("#bootDetail"),
    progress: document.querySelector("#bootProgress"),
    actions: document.querySelector("#bootActions"),
    retry: document.querySelector("#bootRetryButton"),
    safe: document.querySelector("#bootSafeButton"),
    main: document.querySelector("#appMain"),
    compatibility: document.querySelector("#compatibilityNotice")
  };
  const params = new URLSearchParams(location.search);
  const requestedSafeMode = params.get("safe") === "1";
  const SCRIPT_TIMEOUT_MS = 12000;
  const CATALOG_TIMEOUT_MS = 18000;
  const APP_TIMEOUT_MS = 20000;
  const scripts = new Map();
  let currentStage = "shell";

  root.DAILY_ATLAS_DEFER_PLATFORM_INIT = true;
  root.DAILY_ATLAS_SAFE_MODE = requestedSafeMode;

  function record(code, stage) {
    Health?.record?.(stage || currentStage, code);
  }

  function withDeadline(task, timeoutMs, label) {
    if (typeof Health?.withTimeout === "function") {
      return Health.withTimeout(task, timeoutMs, { label });
    }
    return new Promise((resolve, reject) => {
      const timer = root.setTimeout(() => {
        const error = new Error(`${label || "operation"} timed out`);
        error.code = "TIMEOUT";
        reject(error);
      }, timeoutMs);
      Promise.resolve(task).then(
        (value) => { root.clearTimeout(timer); resolve(value); },
        (error) => { root.clearTimeout(timer); reject(error); }
      );
    });
  }

  function setStage(stage, title, detail, value) {
    currentStage = stage;
    document.documentElement.dataset.bootStage = stage;
    if (elements.title) elements.title.textContent = title;
    if (elements.detail) elements.detail.textContent = detail;
    if (elements.progress) elements.progress.value = Number(value) || 0;
    root.dispatchEvent(new CustomEvent("dailyatlasbootstage", { detail: Object.freeze({ stage, title, value: Number(value) || 0 }) }));
  }

  function showFailure(code, detail) {
    record(code, currentStage);
    document.documentElement.dataset.bootState = "error";
    if (elements.panel) elements.panel.hidden = false;
    if (elements.title) elements.title.textContent = "今日内容没有在时限内准备好";
    if (elements.detail) elements.detail.textContent = detail || "可以重试；若当前网络不稳定，请进入安全模式改用同源完整目录。";
    if (elements.actions) elements.actions.hidden = false;
    if (elements.progress) elements.progress.removeAttribute("value");
    elements.main?.setAttribute("aria-busy", "false");
  }

  function complete(detail) {
    const degraded = detail?.degraded === true;
    document.documentElement.dataset.bootState = root.DAILY_ATLAS_SAFE_MODE ? "safe" : degraded ? "degraded" : "ready";
    elements.main?.setAttribute("aria-busy", "false");
    if (!elements.panel) return;
    if (root.DAILY_ATLAS_SAFE_MODE || degraded) {
      elements.panel.hidden = false;
      elements.title.textContent = root.DAILY_ATLAS_SAFE_MODE ? "安全模式已启用" : "今日选择已生成，部分详情待重试";
      elements.detail.textContent = detail?.message || (root.DAILY_ATLAS_SAFE_MODE
        ? "当前只使用同源完整目录，并暂停可选的远程媒体与离线更新；今日五项仍可使用。"
        : "请使用卡片内的重试按钮；收藏和探索记录没有改变。");
      elements.actions.hidden = false;
      elements.safe.hidden = root.DAILY_ATLAS_SAFE_MODE;
      elements.progress.value = 5;
      return;
    }
    elements.panel.hidden = true;
  }

  function supportsRequiredPlatform() {
    return typeof root.Promise === "function" &&
      typeof root.fetch === "function" &&
      typeof Object.fromEntries === "function" &&
      typeof Object.hasOwn === "function" &&
      typeof String.prototype.replaceAll === "function" &&
      typeof String.prototype.normalize === "function" &&
      typeof root.TextEncoder === "function" &&
      typeof root.TextDecoder === "function" &&
      typeof root.Map === "function" &&
      typeof root.Set === "function" &&
      typeof root.HTMLDialogElement === "function" &&
      root.Element && typeof root.Element.prototype.replaceChildren === "function";
  }

  function scriptUrl(path) {
    return new URL(path, document.baseURI).href;
  }

  function loadScript(path, timeoutMs) {
    const url = scriptUrl(path);
    if (scripts.has(url)) return scripts.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      let settled = false;
      const timer = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        script.remove();
        const error = new Error(`script timeout: ${path}`);
        error.code = "SCRIPT_TIMEOUT";
        reject(error);
      }, Number(timeoutMs) || SCRIPT_TIMEOUT_MS);
      script.addEventListener("load", () => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        resolve(url);
      }, { once: true });
      script.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        const error = new Error(`script failed: ${path}`);
        error.code = "SCRIPT_LOAD_FAILED";
        reject(error);
      }, { once: true });
      document.head.append(script);
    });
    scripts.set(url, promise);
    promise.catch(() => scripts.delete(url));
    return promise;
  }

  function sameOriginAssetResolver(record) {
    return { url: new URL(record.path, new URL("catalog-data/", document.baseURI)).href, integrity: record.integrity || "" };
  }

  function routedAssetResolver(record, kind) {
    if (root.DAILY_ATLAS_SAFE_MODE || kind === "search-worker-index") return sameOriginAssetResolver(record);
    const assets = root.DailyAtlasAssets;
    if (typeof assets?.catalogAssetRequest === "function") {
      return assets.catalogAssetRequest(record, kind, location);
    }
    return sameOriginAssetResolver(record);
  }

  async function fetchCatalogData(record) {
    const assets = root.DailyAtlasAssets;
    if (typeof assets?.assetResolver !== "function") throw Object.assign(new Error("verified catalog fetch is unavailable"), { code: "ROUTING_UNAVAILABLE" });
    return assets.assetResolver(`catalog-data/${record.path}`, {
      location,
      bytes: record.bytes,
      sha256: record.sha256,
      integrity: record.integrity,
      timeoutMs: CATALOG_TIMEOUT_MS,
      preferTransfer: false
    });
  }

  async function loadSplitCatalog() {
    await loadScript("./catalog-loader.js");
    if (!root.DailyAtlasCatalogData?.createStore) throw Object.assign(new Error("catalog loader unavailable"), { code: "CATALOG_LOADER_MISSING" });
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const mobileClient = /Android|Mobile|MicroMessenger|Quark|VivoBrowser/i.test(String(navigator.userAgent || ""));
    const store = root.DailyAtlasCatalogData.createStore({
      baseUrl: document.baseURI,
      assetResolver: routedAssetResolver,
      assetFetcher: fetchCatalogData,
      disableWorker: root.DAILY_ATLAS_SAFE_MODE,
      requestTimeoutMs: CATALOG_TIMEOUT_MS,
      detailConcurrency: mobileClient || connection?.saveData || /(^|-)2g$/.test(String(connection?.effectiveType || "")) ? 2 : 4
    });
    const selection = await withDeadline(store.loadSelection(), CATALOG_TIMEOUT_MS, "selection-catalog");
    root.DailyAtlasCatalogStore = store;
    root.DAILY_ATLAS_CATALOG = selection;
    root.DAILY_DUET_CATALOG = selection;
  }

  async function loadLegacyCatalog() {
    root.DAILY_ATLAS_SAFE_MODE = true;
    await loadScript("./catalog.js", 30000);
    if (!root.DAILY_ATLAS_CATALOG) throw Object.assign(new Error("legacy catalog unavailable"), { code: "LEGACY_CATALOG_MISSING" });
  }

  function waitForAppReady() {
    return withDeadline(new Promise((resolve, reject) => {
      const ready = (event) => resolve(event.detail || {});
      const failed = (event) => reject(Object.assign(new Error("app initialization failed"), { code: event.detail?.code || "APP_INIT_FAILED" }));
      root.addEventListener("dailyatlasappready", ready, { once: true });
      root.addEventListener("dailyatlasappfailed", failed, { once: true });
    }), APP_TIMEOUT_MS, "app-ready");
  }

  async function start() {
    if (!supportsRequiredPlatform()) {
      elements.compatibility.hidden = false;
      showFailure("BROWSER_UNSUPPORTED", "此浏览器缺少安全运行所需的基础能力。请升级浏览器后重试；诊断页仍可查看受限项目。"
      );
      return;
    }

    setStage("routing", "正在确认资源路线", requestedSafeMode ? "安全模式：只使用当前 HTTPS Origin。" : "将先验证首屏紧凑目录，失败时自动退回同源安全模式。", 1);
    try { await loadScript("./asset-routing.js"); }
    catch (error) {
      record(error.code || "ROUTING_LOAD_FAILED", "routing");
      root.DAILY_ATLAS_SAFE_MODE = true;
    }

    setStage("engine", "正在准备每日选择器", "只加载生成今天五项所需的小型程序。", 2);
    try { await loadScript("./engine.js"); }
    catch (error) { showFailure(error.code || "ENGINE_LOAD_FAILED", "每日选择器未能加载；请重试或检查同源文件。" ); return; }

    setStage("catalog", "正在加载紧凑候选索引", "正常模式不会下载旧的 3.4 MB 整目录；本阶段最多等待 18 秒。", 3);
    if (requestedSafeMode) {
      try { await loadLegacyCatalog(); }
      catch (error) { showFailure(error.code || "SAFE_CATALOG_FAILED", "同源完整目录也未能加载。请切换网络、修复缓存，或打开诊断页查看具体失败项。" ); return; }
    } else {
      try { await loadSplitCatalog(); }
      catch (error) {
        record(error.code || error.name || "SPLIT_CATALOG_FAILED", "catalog");
        setStage("safe-fallback", "紧凑目录不可用，正在进入安全模式", "改用同源完整目录；不会继续请求 CDN。", 3);
        try { await loadLegacyCatalog(); }
        catch (fallbackError) { showFailure(fallbackError.code || "CATALOG_FALLBACK_FAILED", "紧凑目录与同源安全目录均不可用。请重试、修复缓存或切换网络。" ); return; }
      }
    }

    setStage("modules", "正在组合页面功能", "偏好、备份、音乐和医学边界模块并行加载；单项均有超时。", 4);
    const foundationPaths = ["./state.js", "./profile.js", "./lock.js", "./backup-crypto.js"];
    const featurePaths = [
      "./backup.js", "./appearance.js", "./explore.js", "./weekly.js", "./music.js", "./speech.js",
      "./city-live.js", "./reminders.js", "./visuals.js",
      ...(root.DAILY_ATLAS_SAFE_MODE ? [] : ["./pwa.js"])
    ];
    try {
      await Promise.all(foundationPaths.map((path) => loadScript(path)));
      await Promise.all(featurePaths.map((path) => loadScript(path)));
    }
    catch (error) { showFailure(error.code || "MODULE_LOAD_FAILED", "一个页面模块未能在 12 秒内加载。今日数据没有被修改，可以直接重试。" ); return; }

    setStage("app", "正在呈现今天五项", "先显示今日选择，再按需加载五条详情；搜索索引此时仍未下载。", 5);
    const readyPromise = waitForAppReady();
    try {
      await loadScript("./app.js");
      const detail = await readyPromise;
      complete(detail);
      root.addEventListener("dailyatlasdetailssettled", () => {
        void loadScript("./assets/visuals/cities/manifest.js").catch(() => null);
      }, { once: true });
    } catch (error) {
      showFailure(error.code || error.name || "APP_START_FAILED", "应用没有在 20 秒内报告就绪。个人数据不会因本次超时被清除。" );
    }
  }

  elements.retry?.addEventListener("click", () => location.reload());
  elements.safe?.addEventListener("click", () => {
    const next = new URL(location.href);
    next.searchParams.set("safe", "1");
    location.assign(next.href);
  });
  root.addEventListener("error", () => record("WINDOW_ERROR", currentStage));
  root.addEventListener("unhandledrejection", () => record("UNHANDLED_REJECTION", currentStage));

  void start();
})();
