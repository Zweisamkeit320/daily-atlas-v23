(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasCatalogData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TYPES = Object.freeze(["book", "movie", "city", "german", "medical"]);
  const COLLECTIONS = Object.freeze({ book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" });
  const EXPECTED_COUNTS = Object.freeze({ book: 500, movie: 500, city: 200, german: 500, medical: 500 });
  const MANIFEST_PATH = "catalog-data/manifest.js";
  const SEARCH_WORKER_PATH = "search-worker.js";
  const EXPLORE_PATH = "explore.js";

  function invariant(condition, message) {
    if (!condition) throw new Error(message);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function selectionFromData(payload) {
    invariant(isObject(payload?.metadata) && isObject(payload?.rows), "selection data payload is invalid");
    const metadata = payload.metadata;
    const rows = payload.rows;
    const placeholder = ".";
    const media = (type, row) => {
      const isBook = type === "book";
      return Object.freeze({
        id: row[0], type, title: row[1], year: row[2], genres: Object.freeze(row[3]), genre: row[3][0],
        tags: Object.freeze(row[4]), themeTags: Object.freeze(row[5]), popularityTier: row[6], curationLevel: row[7],
        rating: Object.freeze({ source: isBook ? "Open Library" : "IMDb", value: row[8], max: isBook ? 5 : 10, count: row[9] }),
        sourceUrl: "https://selection.invalid/",
        image: isBook
          ? `https://covers.openlibrary.org/b/id/${row[11]}-M.jpg?default=false`
          : `https://images.metahub.space/poster/medium/${row[11]}/img`,
        detailChunk: row[10], selectionOnly: true
      });
    };
    const city = (row) => Object.freeze({
      id: row[0], type: "city", title: row[1], countryZh: row[2], region: row[3], themeTags: Object.freeze(row[4]),
      sourceUrl: "https://selection.invalid/", summary: placeholder, highlights: Object.freeze([placeholder, placeholder, placeholder]),
      detailChunk: row[5], selectionOnly: true
    });
    const german = (row) => Object.freeze({
      id: row[0], type: "german", title: row[1], german: row[1], kind: row[2], level: row[3], themeTags: Object.freeze(row[4]),
      sourceUrl: "https://selection.invalid/", chinese: placeholder, explanation: placeholder, exampleGerman: placeholder,
      exampleChinese: placeholder, detailChunk: row[5], selectionOnly: true
    });
    const medical = (row) => Object.freeze({
      id: row[0], type: "medical", title: row[1], topicGroup: row[2], topic: row[3], themeTags: Object.freeze(row[4]),
      sourceUrl: "https://selection.invalid/", summary: placeholder, action: placeholder, limitsOrRedFlags: placeholder,
      image: placeholder, alt: placeholder, detailChunk: row[5], selectionOnly: true
    });
    for (const type of TYPES) invariant(Array.isArray(rows[type]) && rows[type].length === EXPECTED_COUNTS[type], `${type} selection rows are invalid`);
    return Object.freeze({
      schemaVersion: metadata.schemaVersion,
      splitSchemaVersion: metadata.splitSchemaVersion,
      snapshotDate: metadata.snapshotDate,
      contentVersion: metadata.contentVersion,
      selectionVersion: metadata.selectionVersion,
      themes: Object.freeze(metadata.themes),
      dailyThemeIds: Object.freeze(metadata.dailyThemeIds),
      selectionPolicy: Object.freeze(metadata.selectionPolicy),
      books: Object.freeze(rows.book.map((row) => media("book", row))),
      movies: Object.freeze(rows.movie.map((row) => media("movie", row))),
      cities: Object.freeze(rows.city.map(city)),
      german: Object.freeze(rows.german.map(german)),
      medical: Object.freeze(rows.medical.map(medical))
    });
  }

  function baseUrlFrom(options, host, documentObject) {
    const fallback = documentObject?.baseURI || host.location?.href;
    const value = options.baseUrl || fallback;
    invariant(typeof value === "string" && value, "catalog loader needs a base URL");
    return new URL(value, fallback || value).href;
  }

  function scriptElementLoader(documentObject, timeoutMs) {
    invariant(documentObject?.createElement && documentObject?.head, "this environment cannot load catalog scripts");
    const deadlineMs = Number.isFinite(timeoutMs) ? Math.max(500, timeoutMs) : 10000;
    const windowObject = documentObject.defaultView || globalThis;
    const active = new Map();
    return function loadScript(request) {
      const normalized = typeof request === "string" ? { url: request } : request;
      invariant(typeof normalized?.url === "string" && normalized.url, "catalog script URL is missing");
      if (active.has(normalized.url)) return active.get(normalized.url);
      const promise = new Promise((resolve, reject) => {
        const candidates = [normalized.url, normalized.fallbackUrl]
          .filter((url, index, values) => typeof url === "string" && url && values.indexOf(url) === index);
        const attempt = (index) => {
          const url = candidates[index];
          if (!url) {
            reject(new Error(`failed to load catalog script: ${normalized.url}`));
            return;
          }
          const script = documentObject.createElement("script");
          let finished = false;
          let timer = null;
          const finish = (loaded) => {
            if (finished) return;
            finished = true;
            windowObject.clearTimeout(timer);
            if (loaded) resolve(url);
            else {
              script.remove();
              attempt(index + 1);
            }
          };
          script.async = true;
          script.src = url;
          if (normalized.integrity && !url.startsWith("file:")) {
            script.integrity = normalized.integrity;
            script.crossOrigin = "anonymous";
          }
          script.addEventListener("load", () => finish(true), { once: true });
          script.addEventListener("error", () => finish(false), { once: true });
          timer = windowObject.setTimeout(() => finish(false), deadlineMs);
          documentObject.head.append(script);
        };
        attempt(0);
      });
      active.set(normalized.url, promise);
      promise.catch(() => active.delete(normalized.url));
      return promise;
    };
  }

  function assetRequest(record, dataBaseUrl, resolver, kind) {
    invariant(isObject(record) && typeof record.path === "string", `${kind} asset record is invalid`);
    const resolved = typeof resolver === "function" ? resolver(record, kind) : null;
    const request = typeof resolved === "string" ? { url: resolved } : isObject(resolved) ? { ...resolved } : {};
    request.url = new URL(request.url || record.path, dataBaseUrl).href;
    if (!request.integrity && !request.url.startsWith("file:")) request.integrity = record.integrity || "";
    return Object.freeze(request);
  }

  function validateManifest(manifest) {
    invariant(isObject(manifest) && manifest.schemaVersion === 1, "split catalog manifest schema is unsupported");
    invariant(typeof manifest.contentVersion === "string" && manifest.contentVersion.length >= 12, "content version is missing");
    invariant(manifest.total === 2200, `split catalog must contain 2,200 entries; got ${manifest.total}`);
    for (const type of TYPES) invariant(manifest.counts?.[type] === EXPECTED_COUNTS[type], `${type} manifest count is invalid`);
    invariant(isObject(manifest.selection) && isObject(manifest.selectionData) && isObject(manifest.search), "selection/search assets are missing");
    invariant(Array.isArray(manifest.details?.chunks) && manifest.details.chunks.length === 44, "detail chunk manifest must contain 44 chunks");
    const ids = new Set();
    for (const chunk of manifest.details.chunks) {
      invariant(isObject(chunk) && /^[a-z]+-\d{3}$/.test(chunk.id || ""), "detail chunk ID is invalid");
      invariant(TYPES.includes(chunk.type) && chunk.count > 0 && chunk.count <= 50, `${chunk.id} detail chunk metadata is invalid`);
      invariant(!ids.has(chunk.id), `duplicate detail chunk: ${chunk.id}`);
      ids.add(chunk.id);
    }
    return manifest;
  }

  function normalizeReference(reference, selectionByKey, selectionById) {
    if (typeof reference === "string") {
      if (selectionByKey.has(reference)) return selectionByKey.get(reference);
      if (selectionById.has(reference)) return selectionById.get(reference);
      throw new Error(`unknown catalog item: ${reference}`);
    }
    if (isObject(reference) && typeof reference.type === "string" && typeof reference.id === "string") {
      const key = `${reference.type}:${reference.id}`;
      if (selectionByKey.has(key)) return selectionByKey.get(key);
      throw new Error(`unknown catalog item: ${key}`);
    }
    throw new TypeError("catalog references must be a stable ID, composite key, or {type,id}");
  }

  function searchReference(entry) {
    return Object.freeze({
      key: entry.key,
      id: entry.item?.id || entry.id,
      type: entry.type,
      typeOrder: entry.typeOrder,
      title: entry.title,
      genres: Object.freeze(Array.isArray(entry.genres) ? [...entry.genres] : []),
      era: entry.era || "",
      region: entry.region || "",
      ratingPercent: entry.ratingPercent == null ? null : Number(entry.ratingPercent),
      level: entry.level || "",
      medicalTopic: entry.medicalTopic || "",
      year: Number(entry.item?.year ?? entry.year) || 0,
      detailChunk: entry.detailChunk
    });
  }

  function lightweightResult(result) {
    return Object.freeze({
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      pageCount: result.pageCount,
      filters: Object.freeze({ ...result.filters }),
      items: Object.freeze(result.items.map(searchReference))
    });
  }

  function createStore(rawOptions = {}) {
    const options = isObject(rawOptions) ? rawOptions : {};
    const host = options.root || (typeof globalThis !== "undefined" ? globalThis : {});
    const documentObject = options.document || host.document;
    const baseUrl = baseUrlFrom(options, host, documentObject);
    const dataBaseUrl = new URL("catalog-data/", baseUrl).href;
    const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Math.max(500, options.requestTimeoutMs) : 10000;
    const loadScript = options.loadScript || scriptElementLoader(documentObject, requestTimeoutMs);
    const workerFactory = options.workerFactory || ((url) => new host.Worker(url));
    const detailConcurrency = Number.isFinite(options.detailConcurrency)
      ? Math.max(1, Math.min(8, Math.floor(options.detailConcurrency)))
      : 4;

    let manifestPromise = null;
    let selectionPromise = null;
    let selectionByKey = null;
    let selectionById = null;
    let chunkManifest = null;
    const chunkPromises = new Map();
    const detailByKey = new Map();
    const detailQueue = [];
    let activeDetailLoads = 0;
    let searchPromise = null;
    let workerPromise = null;
    let workerUnavailable = options.disableWorker === true;
    let workerSequence = 0;

    function scriptRequest(record, kind) {
      return assetRequest(record, dataBaseUrl, options.assetResolver, kind);
    }

    async function loadData(record, kind) {
      const request = scriptRequest(record, kind);
      let response;
      if (typeof options.assetFetcher === "function") {
        const result = await options.assetFetcher(record, kind, request);
        response = result?.response || result;
      } else {
        const fetchImpl = options.fetch || host.fetch;
        invariant(typeof fetchImpl === "function", "catalog data fetch is unavailable");
        const urls = [request.url, request.fallbackUrl].filter((url, index, values) => typeof url === "string" && url && values.indexOf(url) === index);
        let lastError = null;
        for (const url of urls) {
          try {
            const candidate = await fetchImpl(url, { cache: "force-cache", ...(request.integrity ? { integrity: request.integrity } : {}) });
            if (candidate?.ok) { response = candidate; break; }
            lastError = new Error(`catalog data request failed with HTTP ${Number(candidate?.status) || 0}`);
          } catch (error) { lastError = error; }
        }
        if (!response) throw lastError || new Error("catalog data request failed");
      }
      invariant(response?.ok, `${kind} data response is unavailable`);
      return response.json();
    }

    async function loadManifest() {
      if (manifestPromise) return manifestPromise;
      manifestPromise = (async () => {
        if (!host.DAILY_ATLAS_SPLIT_MANIFEST) {
          await loadScript({ url: new URL(options.manifestPath || MANIFEST_PATH, baseUrl).href });
        }
        const manifest = validateManifest(host.DAILY_ATLAS_SPLIT_MANIFEST);
        chunkManifest = new Map(manifest.details.chunks.map((chunk) => [chunk.id, chunk]));
        return manifest;
      })();
      manifestPromise.catch(() => { manifestPromise = null; });
      return manifestPromise;
    }

    async function loadSelection() {
      if (selectionPromise) return selectionPromise;
      selectionPromise = (async () => {
        const manifest = await loadManifest();
        if (!host.DAILY_ATLAS_SELECTION_CATALOG) {
          if (new URL(baseUrl).protocol === "file:") await loadScript(scriptRequest(manifest.selection, "selection"));
          else host.DAILY_ATLAS_SELECTION_CATALOG = selectionFromData(await loadData(manifest.selectionData, "selection-data"));
        }
        const registered = host.DAILY_ATLAS_SELECTION_CATALOG;
        invariant(isObject(registered), "selection catalog did not register itself");
        invariant(registered.contentVersion === manifest.contentVersion, "selection content version differs from manifest");
        invariant(registered.selectionVersion === manifest.selectionVersion, "selection version differs from manifest");
        // appVersion belongs to the shell/manifest pointer, not the immutable
        // selection payload. Add it to this in-memory view so a shell-only
        // release can reuse byte-identical selection and detail assets.
        const selection = Object.freeze({ ...registered, appVersion: manifest.appVersion });
        const byKey = new Map();
        const byId = new Map();
        for (const type of TYPES) {
          const items = selection[COLLECTIONS[type]];
          invariant(Array.isArray(items) && items.length === EXPECTED_COUNTS[type], `${type} selection count is invalid`);
          for (const item of items) {
            const key = `${type}:${item?.id}`;
            invariant(item?.type === type && item.selectionOnly === true, `${key} is not a compact selection record`);
            invariant(chunkManifest.has(item.detailChunk) && chunkManifest.get(item.detailChunk).type === type, `${key} has an invalid detail chunk`);
            invariant(!byKey.has(key) && !byId.has(item.id), `duplicate stable ID in selection catalog: ${item.id}`);
            byKey.set(key, item);
            byId.set(item.id, item);
          }
        }
        invariant(byKey.size === 2200, `selection catalog must contain 2,200 unique IDs; got ${byKey.size}`);
        selectionByKey = byKey;
        selectionById = byId;
        return selection;
      })();
      selectionPromise.catch(() => { selectionPromise = null; });
      return selectionPromise;
    }

    function pumpDetailQueue() {
      while (activeDetailLoads < detailConcurrency && detailQueue.length) {
        const job = detailQueue.shift();
        activeDetailLoads += 1;
        (async () => {
          try {
            job.resolve(await job.task());
          } catch (error) {
            job.reject(error);
          } finally {
            activeDetailLoads -= 1;
            pumpDetailQueue();
          }
        })();
      }
    }

    function scheduleDetailLoad(task) {
      return new Promise((resolve, reject) => {
        detailQueue.push({ task, resolve, reject });
        pumpDetailQueue();
      });
    }

    async function loadChunk(chunkId) {
      await loadSelection();
      if (chunkPromises.has(chunkId)) return chunkPromises.get(chunkId);
      const promise = scheduleDetailLoad(async () => {
        const record = chunkManifest.get(chunkId);
        invariant(record, `unknown detail chunk: ${chunkId}`);
        const versions = host.DAILY_ATLAS_DETAIL_CHUNKS || (host.DAILY_ATLAS_DETAIL_CHUNKS = Object.create(null));
        const manifest = await loadManifest();
        const registry = versions[manifest.contentVersion] || (versions[manifest.contentVersion] = Object.create(null));
        if (!registry[chunkId]) await loadScript(scriptRequest(record, "detail"));
        const items = registry[chunkId];
        invariant(Array.isArray(items) && items.length === record.count, `${chunkId} did not register ${record.count} details`);
        for (const item of items) {
          const key = `${record.type}:${item?.id}`;
          const selectionItem = selectionByKey.get(key);
          invariant(selectionItem && selectionItem.detailChunk === chunkId && item.type === record.type, `${chunkId} contains an unexpected detail: ${key}`);
          detailByKey.set(key, item);
        }
        return items;
      });
      chunkPromises.set(chunkId, promise);
      promise.catch(() => chunkPromises.delete(chunkId));
      return promise;
    }

    async function loadChunks(chunkIds) {
      const ids = [...new Set(chunkIds)];
      let cursor = 0;
      async function consume() {
        while (cursor < ids.length) {
          const chunkId = ids[cursor++];
          await loadChunk(chunkId);
        }
      }
      await Promise.all(Array.from({ length: Math.min(detailConcurrency, ids.length) }, consume));
    }

    async function loadDetails(references) {
      await loadSelection();
      invariant(Array.isArray(references), "loadDetails expects an array");
      const normalized = references.map((reference) => normalizeReference(reference, selectionByKey, selectionById));
      await loadChunks(normalized.map((item) => item.detailChunk));
      return Object.freeze(normalized.map((item) => {
        const detail = detailByKey.get(`${item.type}:${item.id}`);
        invariant(detail, `detail is missing after chunk load: ${item.type}:${item.id}`);
        return detail;
      }));
    }

    async function getDetail(reference) {
      return (await loadDetails([reference]))[0];
    }

    async function loadAllDetails() {
      const selection = await loadSelection();
      await loadChunks([...chunkManifest.keys()]);
      const complete = {
        schemaVersion: selection.schemaVersion,
        splitSchemaVersion: selection.splitSchemaVersion,
        appVersion: selection.appVersion,
        snapshotDate: selection.snapshotDate,
        contentVersion: selection.contentVersion,
        themes: selection.themes,
        dailyThemeIds: selection.dailyThemeIds,
        selectionPolicy: selection.selectionPolicy
      };
      for (const type of TYPES) {
        complete[COLLECTIONS[type]] = Object.freeze(selection[COLLECTIONS[type]].map((item) => {
          const detail = detailByKey.get(`${type}:${item.id}`);
          invariant(detail, `detail is missing from full catalog: ${type}:${item.id}`);
          return detail;
        }));
      }
      return Object.freeze(complete);
    }

    async function ensureExplore() {
      if (!host.DailyAtlasExplore) await loadScript({ url: new URL(EXPLORE_PATH, baseUrl).href });
      invariant(typeof host.DailyAtlasExplore?.query === "function", "explore query module is unavailable");
      return host.DailyAtlasExplore;
    }

    async function loadSearchIndex() {
      if (searchPromise) return searchPromise;
      searchPromise = (async () => {
        const manifest = await loadManifest();
        if (!host.DAILY_ATLAS_SEARCH_INDEX) await loadScript(scriptRequest(manifest.search, "search"));
        const index = host.DAILY_ATLAS_SEARCH_INDEX;
        invariant(isObject(index) && Array.isArray(index.entries) && index.count === 2200, "search index is incomplete");
        invariant(index.contentVersion === manifest.contentVersion && index.searchVersion === manifest.searchVersion,
          "search index version differs from manifest");
        return index;
      })();
      searchPromise.catch(() => { searchPromise = null; });
      return searchPromise;
    }

    function workerAllowed() {
      if (workerUnavailable || (typeof host.Worker !== "function" && typeof options.workerFactory !== "function")) return false;
      const protocol = new URL(baseUrl).protocol;
      return protocol === "http:" || protocol === "https:";
    }

    function createWorkerClient() {
      const workerUrl = new URL(options.workerPath || SEARCH_WORKER_PATH, baseUrl).href;
      const worker = workerFactory(workerUrl);
      const pending = new Map();
      let closed = false;

      function rejectAll(error) {
        for (const request of pending.values()) {
          clearTimeout(request.timer);
          request.reject(error);
        }
        pending.clear();
      }

      function request(kind, payload) {
        invariant(!closed, "search worker is closed");
        const requestId = `catalog-${++workerSequence}`;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new Error(`search worker ${kind} timed out`));
          }, requestTimeoutMs);
          pending.set(requestId, { resolve, reject, timer });
          worker.postMessage({ kind, requestId, ...payload });
        });
      }

      worker.addEventListener("message", (event) => {
        const message = event.data || {};
        const request = pending.get(message.requestId);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(message.requestId);
        if (message.ok) request.resolve(message.result);
        else request.reject(new Error(message.error || "search worker failed"));
      });
      worker.addEventListener("error", () => {
        if (closed) return;
        closed = true;
        worker.terminate();
        rejectAll(new Error("search worker crashed"));
      });

      return Object.freeze({
        request,
        close() {
          if (closed) return;
          closed = true;
          rejectAll(new Error("search worker closed"));
          worker.terminate();
        }
      });
    }

    async function getWorker() {
      if (!workerAllowed()) return null;
      if (workerPromise) return workerPromise;
      workerPromise = (async () => {
        const manifest = await loadManifest();
        const client = createWorkerClient();
        try {
          const search = scriptRequest(manifest.search, "search-worker-index");
          await client.request("init", {
            exploreUrl: new URL(EXPLORE_PATH, baseUrl).href,
            searchUrl: search.url,
            expectedContentVersion: manifest.contentVersion,
            expectedSearchVersion: manifest.searchVersion
          });
          return client;
        } catch (error) {
          client.close();
          throw error;
        }
      })();
      workerPromise.catch(() => { workerPromise = null; workerUnavailable = true; });
      return workerPromise;
    }

    async function queryReferences(filters) {
      if (workerAllowed()) {
        try {
          const worker = await getWorker();
          if (worker) return await worker.request("query", { filters });
        } catch {
          workerUnavailable = true;
          if (workerPromise) workerPromise.then((client) => client?.close()).catch(() => {});
          workerPromise = null;
        }
      }
      const [Explore, index] = await Promise.all([ensureExplore(), loadSearchIndex()]);
      return lightweightResult(Explore.query(index, filters));
    }

    async function hydrateResult(result) {
      const details = await loadDetails(result.items.map((entry) => ({ type: entry.type, id: entry.id })));
      return Object.freeze({
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        pageCount: result.pageCount,
        filters: Object.freeze({ ...result.filters }),
        items: Object.freeze(result.items.map((entry, index) => Object.freeze({ ...entry, item: details[index] })))
      });
    }

    async function query(filters, queryOptions = {}) {
      const result = await queryReferences(filters);
      return queryOptions.hydrate === false ? result : hydrateResult(result);
    }

    function close() {
      if (workerPromise) workerPromise.then((client) => client?.close()).catch(() => {});
      workerPromise = null;
      workerUnavailable = true;
    }

    return Object.freeze({
      loadManifest,
      loadSelection,
      loadDetails,
      getDetail,
      loadAllDetails,
      loadSearchIndex,
      queryReferences,
      hydrateResult,
      query,
      close,
      isSelectionItem: (item) => Boolean(item?.selectionOnly),
      isDetailItem: (item) => Boolean(item && TYPES.includes(item.type) && !item.selectionOnly)
    });
  }

  return Object.freeze({
    TYPES,
    COLLECTIONS,
    EXPECTED_COUNTS,
    MANIFEST_PATH,
    SEARCH_WORKER_PATH,
    EXPLORE_PATH,
    createStore,
    selectionFromData,
    lightweightResult,
    searchReference
  });
});
