(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasAppearance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STORAGE_KEY = "dailyAtlas.appearance.v1";
  const SCHEMA_VERSION = 1;
  const PALETTES = Object.freeze([
    Object.freeze({ id: "paper", label: "原纸米白", themeColor: "#f2eee4" }),
    Object.freeze({ id: "sage", label: "鼠尾草绿", themeColor: "#e8f0e8" }),
    Object.freeze({ id: "sky", label: "薄雾天青", themeColor: "#e9f1f5" }),
    Object.freeze({ id: "peach", label: "柔杏暖橙", themeColor: "#f7ebe3" }),
    Object.freeze({ id: "lavender", label: "浅雾丁香", themeColor: "#f0ebf5" }),
    Object.freeze({ id: "sand", label: "日光沙金", themeColor: "#f3ead8" })
  ]);
  const STYLES = Object.freeze([
    Object.freeze({ id: "editorial", label: "杂志纸纹" }),
    Object.freeze({ id: "clean", label: "纯净留白" }),
    Object.freeze({ id: "botanical", label: "植物光影" }),
    Object.freeze({ id: "aurora", label: "柔和极光" })
  ]);
  const DENSITIES = Object.freeze([
    Object.freeze({ id: "comfortable", label: "舒展模式" }),
    Object.freeze({ id: "compact", label: "紧凑模式" })
  ]);
  const TEXT_SIZES = Object.freeze([
    Object.freeze({ id: "default", label: "标准字号" }),
    Object.freeze({ id: "large", label: "大字号" })
  ]);
  const CONTRASTS = Object.freeze([
    Object.freeze({ id: "default", label: "标准对比度" }),
    Object.freeze({ id: "high", label: "增强对比度" })
  ]);
  const MOTIONS = Object.freeze([
    Object.freeze({ id: "system", label: "跟随系统" }),
    Object.freeze({ id: "reduce", label: "减少动画" })
  ]);
  const PALETTE_IDS = new Set(PALETTES.map((entry) => entry.id));
  const STYLE_IDS = new Set(STYLES.map((entry) => entry.id));
  const DENSITY_IDS = new Set(DENSITIES.map((entry) => entry.id));
  const TEXT_SIZE_IDS = new Set(TEXT_SIZES.map((entry) => entry.id));
  const CONTRAST_IDS = new Set(CONTRASTS.map((entry) => entry.id));
  const MOTION_IDS = new Set(MOTIONS.map((entry) => entry.id));
  const DEFAULTS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    color: "paper",
    style: "editorial",
    density: "comfortable",
    dataSaver: false,
    textSize: "default",
    contrast: "default",
    motion: "system"
  });
  let settings = { ...DEFAULTS };
  let persistenceStatus = "idle";
  let persistence = Promise.resolve(true);
  let initialized = false;
  let synchronizationEpoch = 0;

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalize(value) {
    const input = isObject(value) ? value : {};
    return {
      schemaVersion: SCHEMA_VERSION,
      color: PALETTE_IDS.has(input.color) ? input.color : DEFAULTS.color,
      style: STYLE_IDS.has(input.style) ? input.style : DEFAULTS.style,
      density: DENSITY_IDS.has(input.density) ? input.density : DEFAULTS.density,
      dataSaver: input.dataSaver === true,
      textSize: TEXT_SIZE_IDS.has(input.textSize) ? input.textSize : DEFAULTS.textSize,
      contrast: CONTRAST_IDS.has(input.contrast) ? input.contrast : DEFAULTS.contrast,
      motion: MOTION_IDS.has(input.motion) ? input.motion : DEFAULTS.motion
    };
  }

  function normalizePatch(value) {
    const input = isObject(value) ? value : {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(input, "color") && PALETTE_IDS.has(input.color)) patch.color = input.color;
    if (Object.prototype.hasOwnProperty.call(input, "style") && STYLE_IDS.has(input.style)) patch.style = input.style;
    if (Object.prototype.hasOwnProperty.call(input, "density") && DENSITY_IDS.has(input.density)) patch.density = input.density;
    if (Object.prototype.hasOwnProperty.call(input, "dataSaver") && typeof input.dataSaver === "boolean") patch.dataSaver = input.dataSaver;
    if (Object.prototype.hasOwnProperty.call(input, "textSize") && TEXT_SIZE_IDS.has(input.textSize)) patch.textSize = input.textSize;
    if (Object.prototype.hasOwnProperty.call(input, "contrast") && CONTRAST_IDS.has(input.contrast)) patch.contrast = input.contrast;
    if (Object.prototype.hasOwnProperty.call(input, "motion") && MOTION_IDS.has(input.motion)) patch.motion = input.motion;
    return patch;
  }

  function paletteFor(color) {
    return PALETTES.find((entry) => entry.id === color) || PALETTES[0];
  }

  function styleFor(style) {
    return STYLES.find((entry) => entry.id === style) || STYLES[0];
  }

  function optionFor(options, id) {
    return options.find((entry) => entry.id === id) || options[0];
  }

  function applyToDocument(value, targetDocument) {
    const clean = normalize(value);
    const document = targetDocument || root.document;
    const documentElement = document?.documentElement;
    if (!documentElement) return clean;
    if (documentElement.dataset) {
      documentElement.dataset.backgroundColor = clean.color;
      documentElement.dataset.backgroundStyle = clean.style;
      documentElement.dataset.density = clean.density;
      documentElement.dataset.dataSaver = String(clean.dataSaver);
      documentElement.dataset.textSize = clean.textSize;
      documentElement.dataset.contrast = clean.contrast;
      documentElement.dataset.motion = clean.motion;
    } else {
      documentElement.setAttribute?.("data-background-color", clean.color);
      documentElement.setAttribute?.("data-background-style", clean.style);
      documentElement.setAttribute?.("data-density", clean.density);
      documentElement.setAttribute?.("data-data-saver", String(clean.dataSaver));
      documentElement.setAttribute?.("data-text-size", clean.textSize);
      documentElement.setAttribute?.("data-contrast", clean.contrast);
      documentElement.setAttribute?.("data-motion", clean.motion);
    }
    document.querySelector?.('meta[name="theme-color"]')?.setAttribute("content", paletteFor(clean.color).themeColor);
    return clean;
  }

  function readFromStorage(storage) {
    try {
      return normalize(JSON.parse(storage?.getItem(STORAGE_KEY) || "null"));
    } catch (_error) {
      return { ...DEFAULTS };
    }
  }

  function safeRead() {
    try {
      return readFromStorage(root.localStorage);
    } catch (_error) {
      return { ...DEFAULTS };
    }
  }

  function transactionStorage(lease) {
    const storage = lease?.storage;
    if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") return storage;
    // CommonJS/unit shims predating the canonical coordinator invoke the
    // callback without a lease. The production coordinator advertises its
    // constants and must always provide lease.storage; fail closed if it does
    // not.
    if (!root.DailyAtlasLock?.constants && root.localStorage) return root.localStorage;
    throw new Error("Canonical appearance transaction storage is unavailable");
  }

  function publicState(reason) {
    return Object.freeze({
      ...settings,
      colorLabel: paletteFor(settings.color).label,
      styleLabel: styleFor(settings.style).label,
      densityLabel: optionFor(DENSITIES, settings.density).label,
      textSizeLabel: optionFor(TEXT_SIZES, settings.textSize).label,
      contrastLabel: optionFor(CONTRASTS, settings.contrast).label,
      motionLabel: optionFor(MOTIONS, settings.motion).label,
      persistenceStatus,
      reason: reason || "state"
    });
  }

  function dispatch(reason) {
    const detail = publicState(reason);
    if (typeof root.CustomEvent === "function" && typeof root.dispatchEvent === "function") {
      try { root.dispatchEvent(new root.CustomEvent("dailyatlasappearancestate", { detail })); }
      catch (_error) {}
    }
    return detail;
  }

  function save(patch) {
    if (root.DAILY_ATLAS_PERSISTENCE_AVAILABLE === false || root.DAILY_ATLAS_IMPORT_RECOVERY?.ok === false) {
      persistenceStatus = "memory-only";
      persistence = Promise.resolve(false);
      dispatch("memory-only");
      return persistence;
    }
    const input = normalizePatch(patch);
    const write = (lease) => {
      const storage = transactionStorage(lease);
      const next = normalize({ ...readFromStorage(storage), ...input });
      const serialized = JSON.stringify(next);
      storage.setItem(STORAGE_KEY, serialized);
      if (storage.getItem(STORAGE_KEY) !== serialized) {
        throw new Error("Background preference write verification failed");
      }
      return next;
    };
    const transaction = root.DailyAtlasLock?.transaction;
    if (root.document && typeof transaction !== "function") {
      persistenceStatus = "unavailable";
      persistence = Promise.resolve(false);
      dispatch("persistence-unavailable");
      return persistence;
    }
    persistenceStatus = "saving";
    dispatch("saving");
    persistence = (typeof transaction === "function"
      ? transaction(write)
      : Promise.resolve().then(() => write({ storage: root.localStorage })))
      .then((next) => {
        settings = normalize(next);
        applyToDocument(settings);
        persistenceStatus = "saved";
        dispatch("saved");
        return true;
      })
      .catch((error) => {
        if (error?.committed === true && error.result) {
          settings = normalize(error.result);
          applyToDocument(settings);
          persistenceStatus = "saved";
          dispatch("saved-mirror-failed");
          return true;
        }
        persistenceStatus = "error";
        dispatch("save-error");
        return false;
      });
    return persistence;
  }

  function configure(patch) {
    const input = normalizePatch(patch);
    synchronizationEpoch += 1;
    settings = normalize({ ...settings, ...input });
    applyToDocument(settings);
    dispatch("applied");
    save(input);
    return publicState("applied");
  }

  function handleStorage(event) {
    if (event?.key !== STORAGE_KEY) return;
    const readStorage = root.DailyAtlasLock?.readStorage;
    if (typeof readStorage === "function") {
      const epoch = ++synchronizationEpoch;
      void readStorage((storage) => readFromStorage(storage)).then((next) => {
        if (epoch !== synchronizationEpoch) return;
        settings = normalize(next);
        persistenceStatus = "synced";
        applyToDocument(settings);
        dispatch("canonical-sync");
      }).catch(() => {
        if (epoch !== synchronizationEpoch) return;
        persistenceStatus = "sync-error";
        dispatch("sync-error");
      });
      return;
    }
    // Legacy/non-browser shims have no canonical reader. Re-read their shared
    // storage rather than trusting a possibly out-of-order event payload.
    settings = safeRead();
    persistenceStatus = "synced";
    applyToDocument(settings);
    dispatch("storage-sync");
  }

  function initialize() {
    settings = safeRead();
    applyToDocument(settings);
    persistenceStatus = root.DAILY_ATLAS_PERSISTENCE_AVAILABLE === false ? "memory-only" : "ready";
    if (!initialized) root.addEventListener?.("storage", handleStorage);
    initialized = true;
    return dispatch("ready");
  }

  function getState() {
    return publicState("state");
  }

  function whenSaved() {
    return persistence;
  }

  return Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    DEFAULTS,
    PALETTES,
    STYLES,
    DENSITIES,
    TEXT_SIZES,
    CONTRASTS,
    MOTIONS,
    normalize,
    applyToDocument,
    initialize,
    configure,
    getState,
    whenSaved
  });
});
