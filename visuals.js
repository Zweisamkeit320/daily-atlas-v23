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
  const GENERATION_ATTRIBUTE = "data-daily-atlas-visual-generation";
  const IMAGE_ROUTE_TIMEOUT_MS = 3000;
  const IMAGE_TOTAL_TIMEOUT_MS = 9000;
  const IMAGE_MAX_CANDIDATES = Math.ceil(IMAGE_TOTAL_TIMEOUT_MS / IMAGE_ROUTE_TIMEOUT_MS);
  const HOST_FAILURE_LIMIT = 2;
  const HOST_COOLDOWN_MS = 60000;
  const imageBindings = new WeakMap();
  const hostHealth = new Map();
  let nextGeneration = 0;

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

  function cityMobilePath(id) {
    return `./assets/visuals/cities-mobile/${id}.webp`;
  }

  function preferMobileCity() {
    const connection = root.navigator?.connection || root.navigator?.mozConnection || root.navigator?.webkitConnection;
    return root.matchMedia?.("(max-width: 720px)")?.matches === true
      || /Android|Mobile|MicroMessenger|Quark|VivoBrowser/i.test(String(root.navigator?.userAgent || ""))
      || connection?.saveData === true
      || /(^|-)2g$/.test(String(connection?.effectiveType || ""));
  }

  function remoteHost(value) {
    try {
      const host = new URL(String(value || "")).hostname.toLowerCase();
      return REMOTE_HOSTS.has(host) ? host : null;
    } catch (_error) { return null; }
  }

  function hostAvailable(value, now = Date.now()) {
    const host = remoteHost(value);
    if (!host) return true;
    const state = hostHealth.get(host);
    if (!state || state.blockedUntil <= now) {
      if (state?.blockedUntil) hostHealth.delete(host);
      return true;
    }
    return false;
  }

  function noteHostFailure(value, now = Date.now()) {
    const host = remoteHost(value);
    if (!host) return;
    const previous = hostHealth.get(host) || { failures: 0, blockedUntil: 0 };
    const failures = previous.blockedUntil > now ? previous.failures : previous.failures + 1;
    hostHealth.set(host, {
      failures,
      blockedUntil: failures >= HOST_FAILURE_LIMIT ? now + HOST_COOLDOWN_MS : 0
    });
  }

  function noteHostSuccess(value) {
    const host = remoteHost(value);
    if (host) hostHealth.delete(host);
  }

  function resetHostHealth() {
    hostHealth.clear();
  }

  function cityEntry(item) {
    const id = safeCityId(item?.id);
    const items = root.DAILY_ATLAS_CITY_VISUALS?.items;
    if (!id) return null;
    if (!Array.isArray(items)) {
      return Object.freeze({
        id,
        path: `./assets/visuals/cities/${id}.webp`,
        mobilePath: cityMobilePath(id),
        sourcePage: `./city-credits.html#${id}`,
        provisional: true
      });
    }
    const entry = items.find((candidate) => candidate?.id === id);
    if (!entry) return null;
    const path = String(entry.path || "").replace(/^assets\//, "./assets/");
    if (path !== `./assets/visuals/cities/${id}.webp`) return null;
    return Object.freeze({ ...entry, path, mobilePath: cityMobilePath(id) });
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
    if (!entry) return [];
    return preferMobileCity() ? [entry.mobilePath, entry.path] : [entry.path, entry.mobilePath];
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
        candidates: Object.freeze(entry ? cityCandidates(item) : []),
        remote: false,
        provider: entry?.provisional ? "Wikimedia Commons" : entry ? `Wikimedia Commons · ${String(entry.author || "作者待核")} · ${licenseLabel(entry)}` : "",
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
        if (/^\.\/assets\/visuals\/(?:cities|cities-mobile)\/city-[a-z0-9-]+\.webp$/.test(String(value))) return String(value);
        return normalizedRemoteUrl(value);
      })).filter((value) => hostAvailable(value)).slice(0, IMAGE_MAX_CANDIDATES);
    } catch (_error) {
      return [];
    }
  }

  function bindImage(image) {
    if (!image || imageBindings.has(image)) return;
    const generation = ++nextGeneration;
    image.setAttribute(BOUND_ATTRIBUTE, "true");
    image.setAttribute(GENERATION_ATTRIBUTE, String(generation));
    const candidates = parseCandidates(image);
    const visual = image.closest?.(".card-visual, .city-visual, .explore-visual") || image.parentElement;
    const credit = visual?.querySelector?.("[data-visual-credit]") || null;
    let index = Math.max(0, Number(image.getAttribute("data-visual-index")) || 0);
    let timer = null;
    let disposed = false;
    let decodeGeneration = 0;
    const startedAt = Date.now();
    const binding = { generation, dispose: null };
    imageBindings.set(image, binding);

    const isCurrent = () => !disposed
      && imageBindings.get(image) === binding
      && image.getAttribute(GENERATION_ATTRIBUTE) === String(generation);

    const clearTimer = () => {
      if (timer !== null && typeof root.clearTimeout === "function") root.clearTimeout(timer);
      timer = null;
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      clearTimer();
      image.removeEventListener?.("load", markLoaded);
      image.removeEventListener?.("error", tryNext);
      if (imageBindings.get(image) === binding) imageBindings.delete(image);
      if (image.getAttribute(GENERATION_ATTRIBUTE) === String(generation)) {
        image.removeAttribute(BOUND_ATTRIBUTE);
        image.removeAttribute(GENERATION_ATTRIBUTE);
      }
    };
    const isActive = () => {
      if (!isCurrent()) return false;
      if (image.isConnected === false) {
        dispose();
        return false;
      }
      return true;
    };
    const armTimer = () => {
      clearTimer();
      if (!isActive() || typeof root.setTimeout !== "function") return;
      const remaining = IMAGE_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        tryNext();
        return;
      }
      timer = root.setTimeout(() => tryNext(), Math.min(IMAGE_ROUTE_TIMEOUT_MS, remaining));
    };

    function revealLoaded(loadedIndex, token) {
      if (!isActive()) return;
      if (loadedIndex !== index || token !== decodeGeneration || image.naturalWidth <= 0) return;
      clearTimer();
      image.hidden = false;
      if (credit) credit.hidden = false;
      visual?.classList?.add("visual-image-loaded");
      visual?.classList?.remove("visual-image-failed");
      noteHostSuccess(candidates[index]);
    }
    function markLoaded() {
      if (!isActive()) return;
      clearTimer();
      const loadedIndex = index;
      const token = ++decodeGeneration;
      if (typeof image.decode !== "function") {
        revealLoaded(loadedIndex, token);
        return;
      }
      Promise.resolve().then(() => image.decode()).then(
        () => revealLoaded(loadedIndex, token),
        () => {
          if (isActive() && loadedIndex === index && token === decodeGeneration) tryNext();
        }
      );
    }
    function tryNext() {
      if (!isActive()) return;
      clearTimer();
      decodeGeneration += 1;
      noteHostFailure(candidates[index]);
      index += 1;
      while (index < candidates.length && !hostAvailable(candidates[index])) index += 1;
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
      dispose();
    }
    binding.dispose = dispose;

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

  function unbind(container) {
    if (!container) return;
    const images = [];
    if (container.matches?.("img[data-visual-candidates]")) images.push(container);
    if (container.querySelectorAll) images.push(...container.querySelectorAll("img[data-visual-candidates]"));
    for (const image of new Set(images)) imageBindings.get(image)?.dispose?.();
  }

  return Object.freeze({
    REMOTE_HOSTS,
    IMAGE_ROUTE_TIMEOUT_MS,
    IMAGE_TOTAL_TIMEOUT_MS,
    HOST_FAILURE_LIMIT,
    HOST_COOLDOWN_MS,
    bind,
    bindImage,
    cityCandidates,
    cityEntry,
    hostAvailable,
    mediaCandidates,
    normalizedRemoteUrl,
    resolve,
    resetHostHealth,
    safeCityId,
    unbind,
    weservUrl
  });
});
