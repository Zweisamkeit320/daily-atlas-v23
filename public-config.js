(function (root) {
  "use strict";

  const config = Object.freeze({
    schemaVersion: 2,
    appVersion: "2.4.1",
    publicReleaseMode: true,
    publicSafeMode: false,
    remoteBookMovieImages: true,
    localCityImages: true,
    visualPolicy: "attributed-remote-media-with-open-license-city-fallback",
    ratingUse: "attributed-noncommercial-snapshot",
    deploymentTier: "public-noncommercial-v2.4.1",
    effectiveDate: "2026-08-30",
    operatorName: "今日万象维护者",
    contactUrl: "https://github.com/Zweisamkeit320/daily-atlas-v23/issues",
    origins: Object.freeze([
      Object.freeze({ id: "github", label: "夸克优先入口", url: "https://zweisamkeit320.github.io/daily-atlas-v23/" }),
      Object.freeze({ id: "cloudflare", label: "完整安全响应头备用入口", url: "https://daily-atlas-mobile-cn.pages.dev/" })
    ])
  });

  root.DAILY_ATLAS_PUBLIC_CONFIG = config;
  if (root.document?.documentElement) {
    root.document.documentElement.dataset.publicSafeMode = String(config.publicSafeMode);
    root.document.documentElement.dataset.remoteBookMovieImages = String(config.remoteBookMovieImages);
    root.document.documentElement.dataset.localCityImages = String(config.localCityImages);
  }
  const banner = root.document?.querySelector?.("#publicSafeBanner");
  if (banner && config.publicSafeMode) banner.hidden = false;
  const current = root.document?.querySelector?.("#originCurrent");
  const alternate = root.document?.querySelector?.("#originAlternate");
  if (current || alternate) {
    const here = config.origins.find((entry) => {
      try { return root.location.href.startsWith(entry.url); }
      catch (_error) { return false; }
    });
    const other = config.origins.find((entry) => entry.id !== here?.id) || config.origins[0];
    if (current) current.textContent = here ? `当前：${here.label}` : "当前：本地／预览环境";
    if (alternate) {
      alternate.href = other.url;
      alternate.textContent = `打开${other.label}`;
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
