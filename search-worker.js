(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root.importScripts === "function" && typeof root.postMessage === "function" && !root.document) api.install(root);
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function invariant(condition, message) {
    if (!condition) throw new Error(message);
  }

  function serializeEntry(entry) {
    return Object.freeze({
      key: entry.key,
      id: entry.item?.id,
      type: entry.type,
      typeOrder: entry.typeOrder,
      title: entry.title,
      genres: Object.freeze(Array.isArray(entry.genres) ? [...entry.genres] : []),
      era: entry.era || "",
      region: entry.region || "",
      ratingPercent: entry.ratingPercent == null ? null : Number(entry.ratingPercent),
      level: entry.level || "",
      medicalTopic: entry.medicalTopic || "",
      year: Number(entry.item?.year) || 0,
      detailChunk: entry.detailChunk
    });
  }

  function serializeResult(result) {
    return Object.freeze({
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      pageCount: result.pageCount,
      filters: Object.freeze({ ...result.filters }),
      items: Object.freeze(result.items.map(serializeEntry))
    });
  }

  function install(scope) {
    invariant(scope && typeof scope.importScripts === "function" && typeof scope.postMessage === "function",
      "search worker scope is invalid");
    let Explore = null;
    let index = null;
    let initialized = false;

    scope.addEventListener("message", async (event) => {
      const message = event.data || {};
      const requestId = message.requestId;
      try {
        if (message.kind === "init") {
          invariant(typeof message.exploreUrl === "string" && typeof message.searchUrl === "string", "search worker URLs are missing");
          if (!scope.DailyAtlasExplore) scope.importScripts(message.exploreUrl);
          if (!scope.DAILY_ATLAS_SEARCH_INDEX) scope.importScripts(message.searchUrl);
          Explore = scope.DailyAtlasExplore;
          index = scope.DAILY_ATLAS_SEARCH_INDEX;
          invariant(typeof Explore?.query === "function", "explore query module did not initialize");
          invariant(index?.count === 2200 && Array.isArray(index.entries), "search index did not initialize");
          invariant(index.contentVersion === message.expectedContentVersion, "search content version mismatch");
          invariant(index.searchVersion === message.expectedSearchVersion, "search index version mismatch");
          initialized = true;
          scope.postMessage({ requestId, ok: true, result: Object.freeze({ count: index.count }) });
          return;
        }
        if (message.kind === "query") {
          invariant(initialized && Explore && index, "search worker is not initialized");
          scope.postMessage({ requestId, ok: true, result: serializeResult(Explore.query(index, message.filters)) });
          return;
        }
        throw new Error("unknown search worker request");
      } catch (error) {
        scope.postMessage({ requestId, ok: false, error: String(error?.message || error || "search worker failed").slice(0, 500) });
      }
    });
    return Object.freeze({ get initialized() { return initialized; } });
  }

  return Object.freeze({ install, serializeEntry, serializeResult });
});
