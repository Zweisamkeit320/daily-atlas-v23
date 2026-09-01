(function () {
  "use strict";

  const Health = globalThis.DailyAtlasRuntimeHealth;
  const APP_VERSION = document.querySelector('meta[name="daily-atlas-version"]')?.content || "unknown";
  const REQUIRED_CONFIG_BOOLEANS = Object.freeze([
    "publicReleaseMode", "publicSafeMode", "remoteBookMovieImages", "localCityImages"
  ]);
  const EXTERNAL_IMAGE_TARGETS = Object.freeze([
    Object.freeze({
      label: "images.weserv.nl 图片代理",
      host: "images.weserv.nl",
      url: "https://images.weserv.nl/?url=https%3A%2F%2Fcovers.openlibrary.org%2Fb%2Fid%2F10521439-M.jpg%3Fdefault%3Dfalse&w=64&h=96&fit=cover&output=webp"
    }),
    Object.freeze({
      label: "Open Library 书封",
      host: "covers.openlibrary.org",
      url: "https://covers.openlibrary.org/b/id/10521439-S.jpg?default=false"
    }),
    Object.freeze({
      label: "MetaHub 电影海报",
      host: "images.metahub.space",
      url: "https://images.metahub.space/poster/small/tt0086190/img"
    })
  ]);

  function validatePublicConfig(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return Object.freeze({ ok: false, code: "CONFIG_UNAVAILABLE", value: null });
    }
    if (candidate.schemaVersion !== 2) {
      return Object.freeze({ ok: false, code: "CONFIG_SCHEMA_INVALID", value: null });
    }
    if (candidate.appVersion !== APP_VERSION) {
      return Object.freeze({ ok: false, code: "CONFIG_VERSION_MISMATCH", value: null });
    }
    if (REQUIRED_CONFIG_BOOLEANS.some((field) => typeof candidate[field] !== "boolean")) {
      return Object.freeze({ ok: false, code: "CONFIG_BOOLEAN_INVALID", value: null });
    }
    return Object.freeze({ ok: true, code: "OK", value: candidate });
  }

  const PublicConfigContract = validatePublicConfig(globalThis.DAILY_ATLAS_PUBLIC_CONFIG);
  const PublicConfig = PublicConfigContract.value;
  const elements = {
    overall: document.querySelector("#overallStatus"),
    overallTitle: document.querySelector("#overallTitle"),
    overallDetail: document.querySelector("#overallDetail"),
    environment: document.querySelector("#environmentList"),
    capabilities: document.querySelector("#capabilityList"),
    storage: document.querySelector("#storageList"),
    caches: document.querySelector("#cacheList"),
    probes: document.querySelector("#probeList"),
    timing: document.querySelector("#timingList"),
    errors: document.querySelector("#errorList"),
    rerun: document.querySelector("#rerunButton"),
    copy: document.querySelector("#copyButton"),
    repair: document.querySelector("#repairButton"),
    clearErrors: document.querySelector("#clearErrorsButton"),
    externalImageTest: document.querySelector("#externalImageTestButton"),
    externalImageProbes: document.querySelector("#externalImageProbeList"),
    actionStatus: document.querySelector("#actionStatus")
  };
  let lastReport = null;
  let lastExternalImageReport = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  function dl(rows) {
    return rows.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  }

  function badge(ok, unavailable, label) {
    if (ok) return '<span class="badge">通过</span>';
    return `<span class="badge ${unavailable ? "warn" : "fail"}">${escapeHtml(label || (unavailable ? "不可用" : "失败"))}</span>`;
  }

  function renderErrors(runStartedAt) {
    const errors = Health?.readErrors?.() || [];
    const current = runStartedAt ? errors.filter((entry) => entry.at >= runStartedAt) : [];
    const historical = runStartedAt ? errors.filter((entry) => entry.at < runStartedAt) : errors;
    elements.errors.innerHTML = current.length || historical.length
      ? [
          `<li><strong>本轮：</strong>${current.length ? current.slice().reverse().map((entry) => `${escapeHtml(entry.at)} · ${escapeHtml(entry.stage)} · ${escapeHtml(entry.code)}`).join("；") : "无"}</li>`,
          `<li><strong>历史：</strong>${historical.length ? historical.slice().reverse().map((entry) => `${escapeHtml(entry.at)} · ${escapeHtml(entry.stage)} · ${escapeHtml(entry.code)}`).join("；") : "无"}</li>`
        ].join("")
      : "<li>暂无记录</li>";
    return Object.freeze({ current: Object.freeze(current), historical: Object.freeze(historical) });
  }

  function capabilityRows() {
    const checks = [
      ["Service Worker", "serviceWorker" in navigator, true],
      ["Cache Storage", "caches" in globalThis, true],
      ["IndexedDB", "indexedDB" in globalThis, true],
      ["StorageManager", Boolean(navigator.storage?.estimate), true],
      ["Web Worker", "Worker" in globalThis, true],
      ["Web Crypto", Boolean(globalThis.crypto?.subtle), true],
      ["HTML 对话框", "HTMLDialogElement" in globalThis, false],
      ["Web Audio", Boolean(globalThis.AudioContext || globalThis.webkitAudioContext), true],
      ["设备语音后备", "speechSynthesis" in globalThis, true]
    ];
    elements.capabilities.innerHTML = checks.map(([label, ok]) => `<div class="check-row"><span>${escapeHtml(label)}</span>${badge(ok, true)}</div>`).join("");
    return checks.map(([label, ok, optional]) => ({ label, ok, optional }));
  }

  function environmentRows(registration) {
    const protocol = location.protocol;
    const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    const secureTransport = protocol === "https:" || localhost;
    const rows = [
      ["应用版本", `v${APP_VERSION}`],
      ["Origin", location.origin === "null" ? "本地文件（无 Origin）" : location.origin],
      ["连接", secureTransport ? (protocol === "https:" ? "HTTPS" : "localhost") : protocol.replace(":", "").toUpperCase()],
      ["安全上下文", globalThis.isSecureContext ? "是" : "否"],
      ["网络状态", navigator.onLine ? "浏览器报告在线" : "浏览器报告离线"],
      ["公开配置", PublicConfigContract.ok ? "已加载并通过契约校验" : `无效／未加载（${PublicConfigContract.code}）`],
      ["公开测试发布", PublicConfigContract.ok ? (PublicConfig.publicReleaseMode ? "是" : "否") : "未知（按否处理）"],
      ["显式安全模式", PublicConfigContract.ok ? (PublicConfig.publicSafeMode ? "已启用" : "未启用") : "未知（按启用处理）"],
      ["远程书封／海报", PublicConfigContract.ok && PublicConfig.remoteBookMovieImages ? "允许" : PublicConfigContract.ok ? "已禁用" : "未知（按禁用处理）"],
      ["同源城市图", PublicConfigContract.ok && PublicConfig.localCityImages ? "允许" : PublicConfigContract.ok ? "已禁用" : "未知（按禁用处理）"],
      ["Service Worker", registration ? (navigator.serviceWorker.controller ? "已接管" : "已注册，待刷新接管") : "未注册"]
    ];
    elements.environment.innerHTML = dl(rows);
    return { protocol, secureTransport, secureContext: Boolean(globalThis.isSecureContext), origin: rows[1][1] };
  }

  async function getRegistration() {
    if (!("serviceWorker" in navigator)) return null;
    try { return await Health.withTimeout(navigator.serviceWorker.getRegistration("./"), 5000, { label: "sw-registration" }); }
    catch (_error) { return null; }
  }

  async function runProbes() {
    const targets = [
      ["诊断页", "./diagnostics.html"],
      ["应用首页", "./index.html"],
      ["隐私说明", "./privacy.html"],
      ["来源与许可", "./sources-and-licenses.html"],
      ["城市图署名清单", "./city-credits.html"],
      ["公开配置", "./public-config.js"],
      ["Web App Manifest", "./manifest.webmanifest"],
      ["Service Worker", "./sw.js"],
      ["视觉回退模块", "./visuals.js"],
      ["城市开放许可图片清单", "./assets/visuals/cities/manifest.js"],
      ["同源城市实图（成都）", "./assets/visuals/cities/city-chengdu.webp", "webp"],
      ["分片目录清单", "./catalog-data/manifest.js"],
      ["搜索 Worker", "./search-worker.js"],
      ["医学图清单", "./assets/medical/manifest.json"],
      ["德语音频清单", "./assets/audio/german/manifest.json"]
    ];
    const criticalLabels = new Set(["诊断页", "应用首页", "公开配置", "Service Worker", "分片目录清单"]);
    if (PublicConfigContract.ok && PublicConfig.localCityImages) criticalLabels.add("同源城市实图（成都）");
    const results = await Health.mapWithConcurrency(targets, 4, async ([label, path, kind]) => {
      const probe = await Health.probeWithRetry(path, {
        timeoutMs: 8000,
        maxAttempts: 2,
        retryDelayMs: 250,
        ...(kind === "webp" ? { readBody: true, expectedContentType: "image/webp", expectedFormat: "webp" } : {})
      });
      if (label === "公开配置" && probe.ok && !PublicConfigContract.ok) {
        return { label, path, ...probe, ok: false, code: PublicConfigContract.code, severity: "fail" };
      }
      return { label, path, ...probe, severity: Health.probeSeverity(probe, criticalLabels.has(label)) };
    });
    const Assets = globalThis.DailyAtlasAssets;
    const cdnBase = Assets?.CDN_BASE;
    if (Assets?.deploymentMatches?.(location) && typeof cdnBase === "string" && cdnBase.startsWith("https://")) {
      const probe = await Health.probeWithRetry(`${cdnBase}catalog-data/manifest.js`, { timeoutMs: 8000, maxAttempts: 2, retryDelayMs: 250 });
      results.push({ label: "固定 CDN 清单", path: `${cdnBase}catalog-data/manifest.js`, ...probe, severity: Health.probeSeverity(probe, false) });
    }
    elements.probes.innerHTML = results.map((result) => `
      <div class="probe-row">
        <span>${escapeHtml(result.label)}<br /><small>${escapeHtml(result.path)} · ${escapeHtml(result.ok ? `${result.durationMs} ms${result.bytes === null ? "" : ` · ${Health.humanBytes(result.bytes)}`}${result.attemptCount > 1 ? ` · 重试 ${result.attemptCount - 1} 次` : ""}` : `${result.code}${result.attemptCount > 1 ? ` · 已尝试 ${result.attemptCount} 次` : ""}`)}</small></span>
        ${result.severity === "degraded" ? badge(false, true, "网络降级") : badge(result.ok, false)}
      </div>
    `).join("");
    return results;
  }

  async function run() {
    if (!Health) {
      elements.overall.dataset.status = "fail";
      elements.overallTitle.textContent = "诊断核心未能加载";
      elements.overallDetail.textContent = "请直接检查 runtime-health.js 是否与 diagnostics.html 位于同一目录。";
      return;
    }
    const runStartedAt = new Date().toISOString();
    elements.rerun.disabled = true;
    elements.overall.dataset.status = "running";
    elements.overallTitle.textContent = "正在检测…";
    elements.overallDetail.textContent = "关键探测均有 8 秒上限，不会无限等待。";

    const registrationPromise = getRegistration();
    const storagePromise = Health.storageSnapshot({ timeoutMs: 5000 });
    const cachesPromise = Health.inspectCaches({ timeoutMs: 8000 }).catch(() => ({ supported: true, caches: [], totalEntries: 0, failed: true }));
    const probesPromise = runProbes();
    const capabilities = capabilityRows();
    const registration = await registrationPromise;
    const environment = environmentRows(registration);
    const [storage, cacheReport, probes] = await Promise.all([storagePromise, cachesPromise, probesPromise]);

    elements.storage.innerHTML = dl([
      ["已用", Health.humanBytes(storage.usage)],
      ["配额", Health.humanBytes(storage.quota)],
      ["估算可用", Health.humanBytes(storage.available)],
      ["持久存储", storage.persisted === null ? "浏览器未报告" : storage.persisted ? "已授予" : "未授予"],
      ["应用缓存", cacheReport.supported ? `${cacheReport.caches.length} 个 · ${cacheReport.totalEntries} 项` : "不支持"]
    ]);
    elements.caches.textContent = cacheReport.caches?.length
      ? cacheReport.caches.map((entry) => `${entry.name}（${entry.count === null ? "计数失败" : `${entry.count} 项`}）`).join("；")
      : "没有发现今日万象缓存；首次打开或未安装 PWA 时这是正常状态。";

    const timing = Health.navigationSnapshot();
    elements.timing.innerHTML = dl([
      ["首字节响应", timing.supported ? `${timing.responseStartMs} ms` : "浏览器未提供"],
      ["DOM 可交互", timing.supported ? `${timing.domInteractiveMs} ms` : "浏览器未提供"],
      ["页面 load", timing.supported && timing.loadMs ? `${timing.loadMs} ms` : "本轮尚未结束或未提供"],
      ["页面传输", Health.humanBytes(timing.transferBytes)]
    ]);
    const errorGroups = renderErrors(runStartedAt);
    const criticalFailures = probes.filter((entry) => entry.severity === "fail");
    const capabilityGaps = capabilities.filter((entry) => !entry.ok);
    const degraded = !environment.secureContext || capabilityGaps.length > 0 || probes.some((entry) => entry.severity === "degraded");
    const status = criticalFailures.length ? "fail" : degraded ? "degraded" : "pass";
    elements.overall.dataset.status = status;
    elements.overallTitle.textContent = status === "pass" ? "本轮诊断通过" : status === "degraded" ? "核心可达，存在降级项" : "关键同源文件不可达";
    elements.overallDetail.textContent = status === "pass"
      ? "Origin、关键文件、存储与主要浏览器能力在本轮检查中可用。"
      : status === "degraded"
        ? "请查看标为不可用或失败的项目；今日五项核心功能可能仍可使用。"
        : `有 ${criticalFailures.length} 个关键文件失败；请先重试，再考虑修复应用缓存或切换网络。`;

    lastReport = Object.freeze({
      checkedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      publicConfig: {
        valid: PublicConfigContract.ok,
        code: PublicConfigContract.code,
        publicReleaseMode: PublicConfigContract.ok && PublicConfig.publicReleaseMode === true,
        publicSafeMode: !PublicConfigContract.ok || PublicConfig.publicSafeMode === true,
        remoteBookMovieImages: PublicConfigContract.ok && PublicConfig.remoteBookMovieImages === true,
        localCityImages: PublicConfigContract.ok && PublicConfig.localCityImages === true
      },
      status,
      environment,
      capabilities,
      storage,
      caches: cacheReport,
      probes,
      timing,
      errors: errorGroups.current,
      historicalErrors: errorGroups.historical,
      externalImageProbes: lastExternalImageReport
    });
    elements.rerun.disabled = false;
  }

  function reportText(report) {
    if (!report) return "今日万象诊断尚未完成";
    const lines = [
      `今日万象 v${report.appVersion} 诊断`,
      `检测时间: ${report.checkedAt}`,
      `总体状态: ${report.status}`,
      `Origin: ${report.environment.origin}`,
      `安全上下文: ${report.environment.secureContext ? "是" : "否"}`,
      `公开配置: ${report.publicConfig.valid ? "VALID" : report.publicConfig.code}`,
      `公开测试发布: ${report.publicConfig.publicReleaseMode ? "是" : "否"}`,
      `显式安全模式: ${report.publicConfig.publicSafeMode ? "已启用" : "未启用"}`,
      `远程书封/海报: ${report.publicConfig.remoteBookMovieImages ? "允许" : "已禁用"}`,
      `同源城市图: ${report.publicConfig.localCityImages ? "允许" : "已禁用"}`,
      `存储: ${Health.humanBytes(report.storage.usage)} / ${Health.humanBytes(report.storage.quota)}`,
      `应用缓存: ${report.caches.caches?.length || 0} 个, ${report.caches.totalEntries || 0} 项`,
      "关键文件:",
      ...report.probes.map((entry) => `- ${entry.label} [${entry.path}]: ${entry.ok ? `PASS ${entry.durationMs}ms${entry.attemptCount > 1 ? `（重试 ${entry.attemptCount - 1} 次）` : ""}` : `${entry.code}${entry.severity === "degraded" ? "（网络降级）" : ""}`}`),
      "能力:",
      ...report.capabilities.map((entry) => `- ${entry.label}: ${entry.ok ? "PASS" : "UNAVAILABLE"}`),
      "外部图源（仅在用户点击后检测）:",
      ...(report.externalImageProbes?.length
        ? report.externalImageProbes.map((entry) => `- ${entry.label}: ${entry.ok ? `PASS ${entry.durationMs}ms` : entry.code}`)
        : ["- 未运行（未向第三方发出诊断请求）"]),
      `本轮错误码: ${report.errors.length ? report.errors.map((entry) => `${entry.at}/${entry.stage}/${entry.code}`).join(", ") : "无"}`,
      `历史错误码: ${report.historicalErrors.length ? report.historicalErrors.map((entry) => `${entry.at}/${entry.stage}/${entry.code}`).join(", ") : "无"}`,
      "说明: 此摘要不含收藏、偏好、搜索词、医学关注方向或完整 User-Agent。"
    ];
    return lines.join("\n");
  }

  elements.rerun.addEventListener("click", () => { elements.actionStatus.textContent = ""; void run(); });
  elements.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(reportText(lastReport));
      elements.actionStatus.textContent = "诊断摘要已复制；其中不含个人内容。";
    } catch (_error) {
      elements.actionStatus.textContent = "浏览器阻止自动复制；请允许剪贴板权限后重试。";
    }
  });
  elements.repair.addEventListener("click", async () => {
    if (!confirm("只删除“今日万象”的应用缓存并让 Service Worker 重新检查版本吗？收藏、偏好、探索记录和备份不会被删除。")) return;
    elements.repair.disabled = true;
    elements.actionStatus.textContent = "正在修复应用缓存…";
    const registration = await getRegistration();
    try {
      const result = await Health.repairCaches({ registration, timeoutMs: 8000 });
      elements.actionStatus.textContent = result.ok
        ? `已删除 ${result.deleted.length} 个应用缓存；请返回首页并重新载入。个人数据未更改。`
        : `缓存修复未完全结束：已删除 ${result.deleted.length} 个，${result.failed.length} 个失败。可关闭浏览器后重试。`;
      await run();
    } catch (_error) {
      elements.actionStatus.textContent = "缓存修复失败；个人数据没有被更改。请关闭浏览器后重试。";
    } finally { elements.repair.disabled = false; }
  });
  elements.clearErrors.addEventListener("click", () => {
    Health?.clearErrors?.();
    renderErrors();
    elements.actionStatus.textContent = "最近错误码记录已清除；收藏、偏好和探索记录未更改。";
  });

  function probeExternalImage(target, timeoutMs = 10000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const image = new Image();
      let settled = false;
      const finish = (ok, code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(Object.freeze({
          label: target.label,
          host: target.host,
          ok,
          code,
          durationMs: Date.now() - started
        }));
      };
      const timer = setTimeout(() => finish(false, "TIMEOUT"), timeoutMs);
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0, image.naturalWidth > 0 ? "OK" : "EMPTY_IMAGE");
      image.onerror = () => finish(false, "IMAGE_ERROR");
      image.src = target.url;
    });
  }

  elements.externalImageTest.addEventListener("click", async () => {
    elements.externalImageTest.disabled = true;
    elements.externalImageProbes.innerHTML = EXTERNAL_IMAGE_TARGETS.map((target) => `
      <div class="probe-row"><span>${escapeHtml(target.label)}<br /><small>正在连接 ${escapeHtml(target.host)}…</small></span>${badge(false, true)}</div>
    `).join("");
    try {
      const results = await Promise.all(EXTERNAL_IMAGE_TARGETS.map((target) => probeExternalImage(target)));
      lastExternalImageReport = Object.freeze(results);
      elements.externalImageProbes.innerHTML = results.map((result) => `
        <div class="probe-row"><span>${escapeHtml(result.label)}<br /><small>${escapeHtml(result.ok ? `${result.durationMs} ms` : result.code)}</small></span>${badge(result.ok, false)}</div>
      `).join("");
      if (lastReport) lastReport = Object.freeze({ ...lastReport, externalImageProbes: lastExternalImageReport });
    } finally {
      elements.externalImageTest.disabled = false;
    }
  });

  void run();
})();
