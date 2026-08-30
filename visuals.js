(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasVisuals = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const REMOTE_HOSTS = Object.freeze(new Set([
    "images.weserv.nl",
    "covers.openlibrary.org",
    "images.metahub.space"
  ]));
  const BOUND_ATTRIBUTE = "data-daily-atlas-visual-bound";
  const IMAGE_ROUTE_TIMEOUT_MS = 8000;

  function publicConfig() {
    return root.DAILY_ATLAS_PUBLIC_CONFIG || {};
  }

  function remoteMediaEnabled(options) {
    return publicConfig().remoteBookMovieImages === true
      && options?.dataSaver !== true
      && options?.safeMode !== true;
  }

  function localCityEnabled(options) {
    return publicConfig().localCityImages !== false
      && options?.dataSaver !== true
      && options?.safeMode !== true;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function normalizedRemoteUrl(value) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:" || !REMOTE_HOSTS.has(url.hostname.toLowerCase())) return null;
      return url.href;
    } catch (_error) {
      return null;
    }
  }

  function weservUrl(value, width) {
    try {
      const source = new URL(String(value || ""));
      if (!REMOTE_HOSTS.has(source.hostname.toLowerCase()) || source.hostname.toLowerCase() === "images.weserv.nl") return null;
      const target = new URL("https://images.weserv.nl/");
      target.searchParams.set("url", source.href);
      target.searchParams.set("w", String(width));
      target.searchParams.set("fit", "cover");
      target.searchParams.set("output", "webp");
      return target.href;
    } catch (_error) {
      return null;
    }
  }

  function safeCityId(value) {
    const id = String(value || "");
    return /^city-[a-z0-9-]+$/.test(id) ? id : null;
  }

  function cityEntry(item) {
    const id = safeCityId(item?.id);
    const items = root.DAILY_ATLAS_CITY_VISUALS?.items;
    if (!id || !Array.isArray(items)) return null;
    const entry = items.find((candidate) => candidate?.id === id);
    if (!entry) return null;
    const path = String(entry.path || "").replace(/^assets\//, "./assets/");
    if (path !== `./assets/visuals/cities/${id}.webp`) return null;
    return Object.freeze({ ...entry, path });
  }

  function mediaCandidates(item) {
    const raw = normalizedRemoteUrl(item?.image);
    if (!raw) return [];
    const source = new URL(raw);
    if (source.hostname.toLowerCase() === "covers.openlibrary.org") {
      const match = source.pathname.match(/^(\/b\/id\/\d+)-(?:S|M|L)\.jpg$/i);
      if (!match) return [];
      const medium = new URL(source.href);
      medium.pathname = `${match[1]}-M.jpg`;
      medium.search = "?default=false";
      const large = new URL(source.href);
      large.pathname = `${match[1]}-L.jpg`;
      large.search = "?default=false";
      return unique([weservUrl(medium.href, 480), medium.href, large.href]);
    }
    if (source.hostname.toLowerCase() === "images.metahub.space") {
      const match = source.pathname.match(/^\/poster\/(?:small|medium|large)\/(tt\d{7,10})\/img$/i);
      if (!match) return [];
      const medium = new URL(source.href);
      medium.pathname = `/poster/medium/${match[1]}/img`;
      const small = new URL(source.href);
      small.pathname = `/poster/small/${match[1]}/img`;
      return unique([weservUrl(medium.href, 480), medium.href, small.href]);
    }
    return [];
  }

  function cityCandidates(item) {
    const entry = cityEntry(item);
    return entry ? [entry.path] : [];
  }

  function licenseLabel(entry) {
    const licenseUrl = String(entry?.licenseUrl || "");
    const licenseCode = String(entry?.licenseCode || "");
    const licenseName = String(entry?.licenseName || "");
    if (/(?:-DE|-EE|-PL|-BR|-AU)$/i.test(licenseCode) && licenseName) return licenseName;
    const code = /\/licenses\/(by-sa|by|zero)\/([0-9.]+)\/?/i.exec(licenseUrl);
    if (code) return `${code[1].toLowerCase() === "zero" ? "CC0" : `CC ${code[1].toUpperCase()}`} ${code[2]}`;
    if (/publicdomain\/(?:mark|zero)/i.test(licenseUrl) || /public domain/i.test(licenseName)) return "Public Domain";
    return licenseName || "开放许可";
  }

  function resolve(item, type, options) {
    if (!item || typeof item !== "object") return Object.freeze({ candidates: Object.freeze([]) });
    if ((type === "book" || type === "movie") && remoteMediaEnabled(options)) {
      const candidates = mediaCandidates(item);
      return Object.freeze({
        type,
        candidates: Object.freeze(candidates),
        remote: true,
        provider: type === "book" ? "Open Library 书封" : "MetaHub 电影海报",
        sourcePage: "./sources-and-licenses.html#media-images",
        alt: `${type === "book" ? "图书封面" : "电影海报"}：《${String(item.title || "")}》`
      });
    }
    if (type === "city" && localCityEnabled(options)) {
      const entry = cityEntry(item);
      return Object.freeze({
        type,
        candidates: Object.freeze(entry ? [entry.path] : []),
        remote: false,
        provider: entry ? `Wikimedia Commons · ${String(entry.author || "作者待核")} · ${licenseLabel(entry)}` : "",
        sourcePage: String(entry?.sourcePage || ""),
        attribution: String(entry?.attribution || ""),
        licenseCode: String(entry?.licenseCode || ""),
        licenseName: String(entry?.licenseName || ""),
        licenseUrl: String(entry?.licenseUrl || ""),
        alt: `城市风貌：${String(item.cityZh || item.title || "")}`
      });
    }
    return Object.freeze({ type, candidates: Object.freeze([]), remote: false });
  }

  function parseCandidates(image) {
    try {
      const parsed = JSON.parse(image.getAttribute("data-visual-candidates") || "[]");
      if (!Array.isArray(parsed)) return [];
      return unique(parsed.map((value) => {
        if (/^\.\/assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(String(value))) return String(value);
        return normalizedRemoteUrl(value);
      }));
    } catch (_error) {
      return [];
    }
  }

  function bindImage(image) {
    if (!image || image.getAttribute(BOUND_ATTRIBUTE) === "true") return;
    image.setAttribute(BOUND_ATTRIBUTE, "true");
    const candidates = parseCandidates(image);
    const visual = image.closest?.(".card-visual, .city-visual, .explore-visual") || image.parentElement;
    const credit = visual?.querySelector?.("[data-visual-credit]") || null;
    let index = Math.max(0, Number(image.getAttribute("data-visual-index")) || 0);
    let timer = null;

    const clearTimer = () => {
      if (timer !== null && typeof root.clearTimeout === "function") root.clearTimeout(timer);
      timer = null;
    };
    const armTimer = () => {
      clearTimer();
      if (typeof root.setTimeout !== "function") return;
      timer = root.setTimeout(() => tryNext(), IMAGE_ROUTE_TIMEOUT_MS);
    };

    const markLoaded = () => {
      clearTimer();
      image.hidden = false;
      if (credit) credit.hidden = false;
      visual?.classList?.add("visual-image-loaded");
      visual?.classList?.remove("visual-image-failed");
    };
    const tryNext = () => {
      clearTimer();
      index += 1;
      if (index < candidates.length) {
        image.setAttribute("data-visual-index", String(index));
        image.src = candidates[index];
        armTimer();
        return;
      }
      image.hidden = true;
      if (credit) credit.hidden = true;
      visual?.classList?.remove("visual-image-loaded");
      visual?.classList?.add("visual-image-failed");
    };

    image.addEventListener("load", markLoaded);
    image.addEventListener("error", tryNext);
    if (image.complete) {
      if (image.naturalWidth > 0) markLoaded();
      else tryNext();
    } else armTimer();
  }

  function bind(container) {
    if (!container?.querySelectorAll) return;
    for (const image of container.querySelectorAll("img[data-visual-candidates]")) bindImage(image);
  }

  return Object.freeze({
    REMOTE_HOSTS,
    IMAGE_ROUTE_TIMEOUT_MS,
    bind,
    bindImage,
    cityEntry,
    mediaCandidates,
    normalizedRemoteUrl,
    resolve,
    safeCityId,
    weservUrl
  });
});
