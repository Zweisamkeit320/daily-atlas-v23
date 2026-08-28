(function () {
  "use strict";

  const Health = globalThis.DailyAtlasRuntimeHealth;
  const APP_VERSION = document.querySelector('meta[name="daily-atlas-version"]')?.content || "unknown";
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
    actionStatus: document.querySelector("#actionStatus")
  };
  let lastReport = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  function dl(rows) {
    return rows.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  }

  function badge(ok, unavailable) {
    if (ok) return '<span class="badge">通过</span>';
    return `<span class="badge ${unavailable ? "warn" : "fail"}">${unavailable ? "不可用" : "失败"}</span>`;
  }

  function renderErrors() {
    const errors = Health?.readErrors?.() || [];
    elements.errors.innerHTML = errors.length
      ? errors.slice().reverse().map((entry) => `<li>${escapeHtml(entry.at)} · ${escapeHtml(entry.stage)} · ${escapeHtml(entry.code)}</li>`).join("")
      : "<li>暂无记录</li>";
    return errors;
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
      ["Web App Manifest", "./manifest.webmanifest"],
      ["Service Worker", "./sw.js"],
      ["分片目录清单", "./catalog-data/manifest.js"],
      ["搜索 Worker", "./search-worker.js"],
      ["医学图清单", "./assets/medical/manifest.json"],
      ["德语音频清单", "./assets/audio/german/manifest.json"]
    ];
    const results = await Promise.all(targets.map(async ([label, path]) => ({ label, path, ...(await Health.probe(path, { timeoutMs: 8000 })) })));
    const Assets = globalThis.DailyAtlasAssets;
    const cdnBase = Assets?.CDN_BASE;
    if (Assets?.deploymentMatches?.(location) && typeof cdnBase === "string" && cdnBase.startsWith("https://")) {
      results.push({ label: "固定 CDN 清单", path: "固定 CDN", ...(await Health.probe(`${cdnBase}catalog-data/manifest.js`, { timeoutMs: 8000 })) });
    }
    elements.probes.innerHTML = results.map((result) => `
      <div class="probe-row">
        <span>${escapeHtml(result.label)}<br /><small>${escapeHtml(result.ok ? `${result.durationMs} ms${result.bytes === null ? "" : ` · ${Health.humanBytes(result.bytes)}`}` : result.code)}</small></span>
        ${badge(result.ok, false)}
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
    const errors = renderErrors();

    const criticalFailures = probes.filter((entry) => ["诊断页", "应用首页", "Service Worker", "分片目录清单"].includes(entry.label) && !entry.ok);
    const capabilityGaps = capabilities.filter((entry) => !entry.ok);
    const degraded = !environment.secureContext || capabilityGaps.length > 0 || probes.some((entry) => !entry.ok);
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
      status,
      environment,
      capabilities,
      storage,
      caches: cacheReport,
      probes,
      timing,
      errors
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
      `存储: ${Health.humanBytes(report.storage.usage)} / ${Health.humanBytes(report.storage.quota)}`,
      `应用缓存: ${report.caches.caches?.length || 0} 个, ${report.caches.totalEntries || 0} 项`,
      "关键文件:",
      ...report.probes.map((entry) => `- ${entry.label}: ${entry.ok ? `PASS ${entry.durationMs}ms` : entry.code}`),
      "能力:",
      ...report.capabilities.map((entry) => `- ${entry.label}: ${entry.ok ? "PASS" : "UNAVAILABLE"}`),
      `最近错误码: ${report.errors.length ? report.errors.map((entry) => `${entry.at}/${entry.stage}/${entry.code}`).join(", ") : "无"}`,
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

  void run();
})();
