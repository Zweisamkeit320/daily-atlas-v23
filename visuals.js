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
  const EDITORIAL_PALETTES = Object.freeze([
    Object.freeze(["#173f3c", "#d9b65f", "#a34d32", "#f2e5c8", "#547685"]),
    Object.freeze(["#293f38", "#c98f49", "#7f4936", "#e9d9b8", "#718060"]),
    Object.freeze(["#243d4a", "#d6a84b", "#9b4b36", "#eee0c3", "#486b72"]),
    Object.freeze(["#3f3a35", "#caa45d", "#8f4a35", "#eadbc3", "#596f6a"]),
    Object.freeze(["#263b35", "#d0a05b", "#a4452d", "#efe3cc", "#4a6776"]),
    Object.freeze(["#193d43", "#c7944e", "#86423b", "#e7d9c1", "#5e786e"])
  ]);
  const EDITORIAL_FAMILIES = Object.freeze({
    history: Object.freeze(["archive", "passage", "terrain"]),
    mystery: Object.freeze(["labyrinth", "threshold", "evidence"]),
    scifi: Object.freeze(["orbit", "signal", "horizon"])
  });
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

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    return (hash ^ (hash >>> 16)) >>> 0;
  }

  function seededNumber(seed, salt, minimum, maximum) {
    const mixed = stableHash(`${seed}:${salt}`) / 0xffffffff;
    return Math.round(minimum + (maximum - minimum) * mixed);
  }

  function mediaGenre(item) {
    const values = [item?.genre, ...(Array.isArray(item?.genres) ? item.genres : [])]
      .map((value) => String(value || "").toLowerCase());
    if (values.some((value) => /sci.?fi|science.?fiction|科幻/.test(value))) return "scifi";
    if (values.some((value) => /mystery|thriller|crime|悬疑|推理|犯罪/.test(value))) return "mystery";
    return "history";
  }

  function editorialMotif(family, seed, palette) {
    const [ink, gold, rust, paper, slate] = palette;
    const a = seededNumber(seed, "a", 38, 116);
    const b = seededNumber(seed, "b", 152, 244);
    const c = seededNumber(seed, "c", 300, 440);
    const tilt = seededNumber(seed, "tilt", -24, 24);
    const common = Array.from({ length: 7 }, (_value, index) => {
      const x = seededNumber(seed, `mark-x-${index}`, 24, 334);
      const y = seededNumber(seed, `mark-y-${index}`, 36, 510);
      const radius = seededNumber(seed, `mark-r-${index}`, 2, 7);
      return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${index % 2 ? paper : gold}" opacity="${index % 3 === 0 ? ".42" : ".22"}"/>`;
    }).join("");
    const motifs = {
      archive: `<rect x="${a}" y="72" width="${b - 44}" height="350" rx="4" fill="${paper}" opacity=".12"/><path d="M${a + 18} 422V210a${Math.max(34, a - 6)} ${Math.max(34, a - 6)} 0 0 1 ${Math.max(68, (a - 6) * 2)} 0v212" fill="none" stroke="${gold}" stroke-width="18" opacity=".72"/><path d="M42 ${c}H318M58 ${c + 32}H302M78 ${c + 64}H282" stroke="${paper}" stroke-width="3" opacity=".45"/><rect x="${b}" y="118" width="54" height="232" fill="${rust}" opacity=".68" transform="rotate(${tilt / 4} ${b + 27} 234)"/>`,
      passage: `<circle cx="${b}" cy="${a + 30}" r="${seededNumber(seed, "sun", 34, 72)}" fill="${gold}" opacity=".84"/><path d="M18 450L${b - 28} 190L342 450Z" fill="${slate}" opacity=".62"/><path d="M${b} 190V510M28 455L${b} 190L332 455M70 382H294M100 326H265M128 274H238" fill="none" stroke="${paper}" stroke-width="3" opacity=".55"/><path d="M0 ${c}Q95 ${c - 34} 182 ${c + 12}T360 ${c - 8}V560H0Z" fill="${rust}" opacity=".44"/>`,
      terrain: `<path d="M-20 ${a + 90}Q70 ${a} 164 ${a + 86}T380 ${a + 24}" fill="none" stroke="${gold}" stroke-width="20" opacity=".58"/><path d="M-30 ${b}Q72 ${b - 98} 174 ${b}T390 ${b - 42}M-20 ${b + 54}Q84 ${b - 34} 190 ${b + 50}T380 ${b + 8}M-30 ${b + 112}Q86 ${b + 32} 202 ${b + 114}T390 ${b + 70}" fill="none" stroke="${paper}" stroke-width="4" opacity=".44"/><path d="M0 ${c}L78 ${c - 94} 142 ${c - 30} 232 ${c - 136} 360 ${c - 20}V560H0Z" fill="${slate}" opacity=".76"/><circle cx="${seededNumber(seed, "seal-x", 70, 290)}" cy="${seededNumber(seed, "seal-y", 94, 210)}" r="42" fill="none" stroke="${rust}" stroke-width="11" opacity=".74"/>`,
      labyrinth: `<path d="M44 84H316V436H82V132H270V388H130V180H222V340H176V228" fill="none" stroke="${paper}" stroke-width="16" stroke-linecap="square" opacity=".72" transform="rotate(${tilt / 7} 180 270)"/><circle cx="${b}" cy="${c - 120}" r="${seededNumber(seed, "clue", 18, 38)}" fill="${rust}" opacity=".9"/><path d="M${b} ${c - 82}V510" stroke="${gold}" stroke-width="5" opacity=".7"/>`,
      threshold: `<rect x="${a}" y="78" width="${seededNumber(seed, "door-w", 132, 196)}" height="390" fill="${paper}" opacity=".13"/><rect x="${a + 24}" y="112" width="${seededNumber(seed, "light-w", 88, 140)}" height="330" fill="${slate}" opacity=".76"/><path d="M${a + 42} 442L330 520H36Z" fill="${gold}" opacity=".48"/><circle cx="${b}" cy="278" r="9" fill="${gold}"/><path d="M30 104L326 ${c}M18 188L310 ${c + 58}" stroke="${rust}" stroke-width="9" opacity=".64"/>`,
      evidence: `<path d="M${a} 86L${b} 166L${seededNumber(seed, "node-x", 212, 320)} 102L318 ${c}L${a + 22} 458L42 276Z" fill="none" stroke="${paper}" stroke-width="4" opacity=".6"/><path d="M${a} 86L42 276M${b} 166L${a + 22} 458M318 ${c}L42 276" stroke="${gold}" stroke-width="3" opacity=".72"/>${[0, 1, 2, 3, 4].map((index) => `<circle cx="${seededNumber(seed, `node-${index}-x`, 48, 314)}" cy="${seededNumber(seed, `node-${index}-y`, 78, 466)}" r="${seededNumber(seed, `node-${index}-r`, 12, 28)}" fill="${index === 2 ? rust : slate}" stroke="${paper}" stroke-width="3" opacity=".82"/>`).join("")}<rect x="76" y="214" width="208" height="78" fill="${paper}" opacity=".12" transform="rotate(${tilt / 2} 180 253)"/>`,
      orbit: `<circle cx="${b}" cy="${a + 128}" r="${seededNumber(seed, "planet", 46, 82)}" fill="${rust}" opacity=".88"/><ellipse cx="${b}" cy="${a + 128}" rx="142" ry="44" fill="none" stroke="${paper}" stroke-width="5" opacity=".56" transform="rotate(${tilt} ${b} ${a + 128})"/><ellipse cx="${b}" cy="${a + 128}" rx="106" ry="176" fill="none" stroke="${gold}" stroke-width="3" opacity=".55" transform="rotate(${tilt + 28} ${b} ${a + 128})"/><path d="M0 ${c}Q180 ${c - 110} 360 ${c}V560H0Z" fill="${slate}" opacity=".76"/>`,
      signal: `<path d="M24 ${a + 34}H336M24 ${a + 92}H336M24 ${a + 150}H336M24 ${a + 208}H336M24 ${a + 266}H336M72 62V452M132 62V452M192 62V452M252 62V452M312 62V452" stroke="${paper}" stroke-width="2" opacity=".22"/><path d="M18 ${c}C72 ${c - 168} 126 ${c + 110} 180 ${c - 42}S288 ${c - 126} 348 ${c + 20}" fill="none" stroke="${gold}" stroke-width="13" opacity=".8"/><path d="M22 ${c + 54}C90 ${c - 70} 134 ${c + 98} 204 ${c - 8}S298 ${c - 42} 346 ${c + 64}" fill="none" stroke="${rust}" stroke-width="6" opacity=".72"/><circle cx="${b}" cy="${a + 92}" r="36" fill="${slate}" stroke="${paper}" stroke-width="4"/>`,
      horizon: `<circle cx="${b}" cy="${c - 130}" r="${seededNumber(seed, "world", 116, 172)}" fill="${slate}" opacity=".72"/><path d="M-24 ${c - 108}Q${b} ${c - 240} 384 ${c - 94}" fill="none" stroke="${gold}" stroke-width="9" opacity=".8"/><path d="M0 ${c + 18}H360V560H0Z" fill="${ink}"/><rect x="${a}" y="${c - 28}" width="42" height="180" fill="${rust}" opacity=".84"/><rect x="${a + 62}" y="${c + 18}" width="26" height="134" fill="${paper}" opacity=".34"/><path d="M${a + 21} ${c - 28}L${a + 21} ${c - 92}" stroke="${paper}" stroke-width="5"/><circle cx="${a + 21}" cy="${c - 104}" r="12" fill="${gold}"/>`
    };
    return `${motifs[family]}${common}`;
  }

  function editorialArt(item, type) {
    if (!item || (type !== "book" && type !== "movie") || !String(item.id || "").trim()) return null;
    const seed = stableHash(`${type}:${String(item.id)}`);
    const signature = `${type}-${seed.toString(16).padStart(8, "0")}`;
    const genre = mediaGenre(item);
    const families = EDITORIAL_FAMILIES[genre];
    const family = families[seed % families.length];
    const palette = EDITORIAL_PALETTES[(seed >>> 5) % EDITORIAL_PALETTES.length];
    const frame = type === "book"
      ? `<path d="M24 24H336V536H24Z" fill="none" stroke="${palette[3]}" stroke-width="3" opacity=".34"/><path d="M42 24V536" stroke="${palette[1]}" stroke-width="7" opacity=".52"/><path d="M286 24H336V76Z" fill="${palette[3]}" opacity=".2"/>`
      : `<path d="M0 36H360M0 524H360" stroke="${palette[3]}" stroke-width="24" opacity=".18"/>${Array.from({ length: 6 }, (_value, index) => `<rect x="${22 + index * 58}" y="48" width="24" height="9" rx="2" fill="${palette[3]}" opacity=".46"/><rect x="${22 + index * 58}" y="503" width="24" height="9" rx="2" fill="${palette[3]}" opacity=".46"/>`).join("")}`;
    const markup = `<svg class="editorial-art" data-art-signature="${signature}" data-art-family="${family}" data-art-medium="${type}" viewBox="0 0 360 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="360" height="560" fill="${palette[0]}"/>${editorialMotif(family, seed, palette)}${frame}</svg>`;
    return Object.freeze({ signature, family, medium: type, markup });
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

  function localEditorialSource(type, disabled) {
    const noun = type === "book" ? "书封" : type === "movie" ? "海报" : "城市风貌图";
    const sourcePage = `./sources-and-licenses.html#${type === "city" ? "city-images" : "media-images"}`;
    const fallbackLabel = type === "book" || type === "movie"
      ? `本地编辑视觉 · 原创主题插画 · 非原${noun}`
      : disabled
        ? "本地编辑视觉 · 已关闭城市风貌图"
      : type === "city"
        ? "本地编辑视觉 · 城市图片暂不可用"
        : `本地编辑视觉 · 非原${noun}`;
    return Object.freeze({
      sourceKind: "local-editorial",
      cachePolicy: "same-origin-shell",
      pendingLabel: fallbackLabel,
      loadedLabel: fallbackLabel,
      fallbackLabel,
      sourcePage,
      pendingSourcePage: sourcePage,
      loadedSourcePage: sourcePage,
      fallbackSourcePage: sourcePage,
      pendingSourceTitle: "了解原创本地主题插画与图片来源边界",
      loadedSourceTitle: "了解原创本地主题插画与图片来源边界",
      fallbackSourceTitle: "了解原创本地主题插画与图片来源边界"
    });
  }

  function resolve(item, type, options) {
    if (!item || typeof item !== "object") {
      return Object.freeze({ type, candidates: Object.freeze([]), remote: false, ...localEditorialSource(type, false) });
    }
    if ((type === "book" || type === "movie") && remoteMediaEnabled(options)) {
      const candidates = mediaCandidates(item);
      if (!candidates.length) {
        return Object.freeze({
          type,
          candidates: Object.freeze([]),
          remote: false,
          ...localEditorialSource(type, false),
          alt: `${type === "book" ? "图书封面" : "电影海报"}：《${String(item.title || "")}》`
        });
      }
      return Object.freeze({
        type,
        candidates: Object.freeze(candidates),
        remote: true,
        sourceKind: "third-party-progressive",
        cachePolicy: "network-only",
        pendingLabel: "第三方渐进图片 · 正在加载",
        loadedLabel: type === "book" ? "第三方书封 · 在线加载" : "第三方海报 · 在线加载",
        fallbackLabel: type === "book" ? "本地编辑视觉 · 原创主题插画 · 非原书封" : "本地编辑视觉 · 原创主题插画 · 非原海报",
        provider: type === "book" ? "Open Library 书封" : "MetaHub 电影海报",
        sourcePage: "./sources-and-licenses.html#media-images",
        pendingSourcePage: "./sources-and-licenses.html#media-images",
        loadedSourcePage: "./sources-and-licenses.html#media-images",
        fallbackSourcePage: "./sources-and-licenses.html#media-images",
        pendingSourceTitle: "查看第三方渐进图片说明",
        loadedSourceTitle: "查看当前图片来源策略",
        fallbackSourceTitle: "了解原创本地主题插画与图片来源边界",
        alt: `${type === "book" ? "图书封面" : "电影海报"}：《${String(item.title || "")}》`
      });
    }
    if (type === "city" && localCityEnabled(options)) {
      const entry = cityEntry(item);
      if (!entry) {
        return Object.freeze({
          type,
          candidates: Object.freeze([]),
          remote: false,
          ...localEditorialSource(type, false),
          alt: `城市风貌：${String(item.cityZh || item.title || "")}`
        });
      }
      return Object.freeze({
        type,
        candidates: Object.freeze(cityCandidates(item)),
        remote: false,
        sourceKind: "same-origin-open-license",
        cachePolicy: "same-origin-pwa",
        pendingLabel: "同源开放许可图片 · 正在加载",
        loadedLabel: `同源开放许可图片 · ${licenseLabel(entry)}`,
        fallbackLabel: "本地编辑视觉 · 城市图片暂不可用",
        provider: entry.provisional ? "Wikimedia Commons" : `Wikimedia Commons · ${String(entry.author || "作者待核")} · ${licenseLabel(entry)}`,
        sourcePage: String(entry.sourcePage || ""),
        pendingSourcePage: `./city-credits.html#${String(item.id || "")}`,
        loadedSourcePage: String(entry.sourcePage || ""),
        fallbackSourcePage: "./sources-and-licenses.html#city-images",
        pendingSourceTitle: "查看城市图片署名记录",
        loadedSourceTitle: "查看当前城市图片来源与许可",
        fallbackSourceTitle: "了解本地编辑视觉与城市图片边界",
        attribution: String(entry?.attribution || ""),
        licenseCode: String(entry?.licenseCode || ""),
        licenseName: String(entry?.licenseName || ""),
        licenseUrl: String(entry?.licenseUrl || ""),
        alt: `城市风貌：${String(item.cityZh || item.title || "")}`
      });
    }
    return Object.freeze({
      type,
      candidates: Object.freeze([]),
      remote: false,
      ...localEditorialSource(type, true),
      alt: type === "city"
        ? `城市风貌：${String(item.cityZh || item.title || "")}`
        : `${type === "book" ? "图书封面" : "电影海报"}：《${String(item.title || "")}》`
    });
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
    const status = visual?.querySelector?.("[data-visual-status]") || null;
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
    const setVisualStatus = (state) => {
      if (!status) return;
      const stateName = state === "loaded" ? "Loaded" : state === "fallback" ? "Fallback" : "Pending";
      const label = String(status.dataset?.[`visual${stateName}Label`] || "");
      const href = String(status.dataset?.[`visual${stateName}Href`] || "./sources-and-licenses.html");
      const title = String(status.dataset?.[`visual${stateName}Title`] || "查看图片来源说明");
      const external = status.dataset?.[`visual${stateName}External`] === "true";
      if (label) status.textContent = label;
      if (status.dataset) status.dataset.visualState = state;
      status.setAttribute?.("href", href);
      status.setAttribute?.("title", title);
      if (external) {
        status.setAttribute?.("target", "_blank");
        status.setAttribute?.("rel", "noreferrer");
      } else {
        status.removeAttribute?.("target");
        status.removeAttribute?.("rel");
      }
      status.hidden = false;
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
      setVisualStatus("loaded");
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
      setVisualStatus("fallback");
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
    editorialArt,
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
