"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const zlib = require("node:zlib");

const Engine = require("../engine.js");
const Explore = require("../explore.js");
const Profile = require("../profile.js");
const CatalogData = require("../catalog-loader.js");
const SearchWorker = require("../search-worker.js");
const catalog = require("../data/catalog.source.json");
const manifest = require("../catalog-data/manifest.js");
const ROOT = path.resolve(__dirname, "..");
const TYPES = ["book", "movie", "city", "german", "medical"];
const COLLECTIONS = { book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" };

function bytes(relativePath) {
  return fs.readFileSync(path.join(ROOT, "catalog-data", ...relativePath.split("/")));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function selectionCatalog() {
  return require(path.join(ROOT, "catalog-data", ...manifest.selection.path.split("/")));
}

function searchIndex() {
  return require(path.join(ROOT, "catalog-data", ...manifest.search.path.split("/")));
}

function profileFor(type, fullCollection) {
  const profile = Profile.emptyProfile();
  if (type === "book" || type === "movie") {
    profile.explicit[type].genres = ["scifi"];
    profile.explicit[type].eras = ["recent"];
    profile.explicit[type].popularity = ["underseen"];
  } else if (type === "city") profile.explicit.city.regions = [fullCollection[0].region];
  else if (type === "german") profile.explicit.german.levels = ["B2"];
  else profile.explicit.medical.topicGroups = [fullCollection[0].topicGroup];
  for (const item of fullCollection.slice(0, 3)) {
    profile.feedback[type][item.id] = {
      liked: true,
      favorite: false,
      unsuitable: false,
      updatedAt: "2026-08-28T00:00:00.000Z",
      updatedAtByKind: { liked: "2026-08-28T00:00:00.000Z", favorite: "", unsuitable: "" }
    };
  }
  return profile;
}

function fakeScriptEnvironment(baseHref = pathToFileURL(`${ROOT}${path.sep}`).href) {
  const host = { location: { href: baseHref }, DailyAtlasExplore: Explore };
  const loaded = [];
  if (/^https?:/.test(baseHref)) {
    host.fetch = async (url) => {
      const parsed = new URL(url, baseHref);
      const absolute = path.join(ROOT, ...decodeURIComponent(parsed.pathname).replace(/^\/+/, "").split("/"));
      loaded.push(path.relative(ROOT, absolute).replaceAll(path.sep, "/"));
      return new Response(fs.readFileSync(absolute), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }
  async function loadScript(request) {
    const url = typeof request === "string" ? request : request.url;
    const parsed = new URL(url);
    const absolute = parsed.protocol === "file:"
      ? fileURLToPath(parsed)
      : path.join(ROOT, ...decodeURIComponent(parsed.pathname).replace(/^\/+/, "").split("/"));
    loaded.push(path.relative(ROOT, absolute).replaceAll(path.sep, "/"));
    delete require.cache[require.resolve(absolute)];
    const value = require(absolute);
    const name = path.basename(absolute);
    if (name === "manifest.js") host.DAILY_ATLAS_SPLIT_MANIFEST = value;
    else if (name.startsWith("selection.")) host.DAILY_ATLAS_SELECTION_CATALOG = value;
    else if (name.startsWith("search.")) host.DAILY_ATLAS_SEARCH_INDEX = value;
    else if (absolute.includes(`${path.sep}details${path.sep}`)) {
      host.DAILY_ATLAS_DETAIL_CHUNKS ||= Object.create(null);
      host.DAILY_ATLAS_DETAIL_CHUNKS[host.DAILY_ATLAS_SPLIT_MANIFEST.contentVersion] ||= Object.create(null);
      const record = host.DAILY_ATLAS_SPLIT_MANIFEST.details.chunks.find((chunk) => path.basename(chunk.path) === name);
      assert.ok(record, `detail manifest record missing for ${name}`);
      host.DAILY_ATLAS_DETAIL_CHUNKS[host.DAILY_ATLAS_SPLIT_MANIFEST.contentVersion][record.id] = value;
    }
    return url;
  }
  return { host, loaded, loadScript };
}

test("split manifest covers every stable ID in 44 immutable, integrity-described chunks", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.total, 2200);
  assert.deepEqual(manifest.counts, { book: 500, movie: 500, city: 200, german: 500, medical: 500 });
  assert.equal(manifest.details.count, 44);
  assert.equal(manifest.details.chunks.length, 44);
  const assets = [manifest.selection, manifest.selectionData, manifest.search, ...manifest.details.chunks];
  assert.equal(new Set(assets.map((asset) => asset.path)).size, assets.length);
  for (const asset of assets) {
    const content = bytes(asset.path);
    assert.equal(content.length, asset.bytes, `${asset.path} bytes`);
    assert.equal(sha256(content), asset.sha256, `${asset.path} SHA-256`);
    assert.equal(`sha384-${crypto.createHash("sha384").update(content).digest("base64")}`, asset.integrity, `${asset.path} SRI`);
    assert.match(asset.path, asset === manifest.selectionData ? /\.[a-f0-9]{12}\.json$/ : /\.[a-f0-9]{12}\.js$/);
  }
  assert.equal(manifest.details.chunks.reduce((sum, chunk) => sum + chunk.count, 0), 2200);
  assert.ok(manifest.details.chunks.every((chunk) => chunk.count === 50));
});

test("selection bootstrap stays under 100 KiB gzip and each detail chunk stays independently small", () => {
  const selection = bytes(manifest.selection.path);
  const selectionData = bytes(manifest.selectionData.path);
  const search = bytes(manifest.search.path);
  assert.equal(selection.includes(Buffer.from('"appVersion"')), false, "selection payload is coupled to the shell appVersion");
  assert.ok(zlib.gzipSync(selection, { level: 9 }).length < 100 * 1024, "selection bootstrap exceeds 100 KiB gzip");
  assert.ok(zlib.gzipSync(selectionData, { level: 9 }).length < 100 * 1024, "selection data exceeds 100 KiB gzip");
  assert.ok(selection.length < 400 * 1024, "selection bootstrap exceeds 400 KiB raw");
  assert.ok(zlib.gzipSync(search, { level: 9 }).length < 450 * 1024, "delayed search index exceeds 450 KiB gzip");
  assert.ok(manifest.details.chunks.every((chunk) => chunk.bytes < 100 * 1024), "a detail chunk exceeds 100 KiB raw");
});

test("the verified HTTP selection data reconstructs the same compact catalog as the file script", () => {
  assert.deepEqual(CatalogData.selectionFromData(JSON.parse(bytes(manifest.selectionData.path))), selectionCatalog());
});

test("compact media records carry enough visual identity to start covers before detail chunks", () => {
  const compact = selectionCatalog();
  assert.ok(compact.books.every((item) => /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg\?default=false$/.test(item.image)),
    "every compact book needs a directly usable Open Library cover URL");
  assert.ok(compact.movies.every((item) => new URL(item.image).pathname === `/poster/medium/${item.id}/img`),
    "every compact movie needs a directly usable MetaHub poster URL derived from its stable IMDb ID");
  assert.ok(compact.books.every((item) => item.selectionOnly === true) && compact.movies.every((item) => item.selectionOnly === true));
});

test("compact selection records qualify in the existing Engine and preserve deterministic choices", () => {
  const compact = selectionCatalog();
  const dates = ["2026-01-01", "2026-02-17", "2026-04-30", "2026-08-28", "2027-12-31", "2031-06-15"];
  for (const type of TYPES) {
    const full = catalog[COLLECTIONS[type]];
    const slim = compact[COLLECTIONS[type]];
    assert.equal(Engine.qualifiedItems(slim).length, full.length, `${type} compact qualification`);
    assert.deepEqual(slim.map((item) => item.id), full.map((item) => item.id), `${type} stable order`);
    const profile = profileFor(type, full);
    for (const dateKey of dates) {
      for (const themeId of [null, Engine.dailyTheme(dateKey).id]) {
        const settings = { dateKey, type, sequence: 0, themeId, excludedIds: [] };
        assert.equal(Engine.chooseInitial(slim, settings)?.id, Engine.chooseInitial(full, settings)?.id, `${type}/${dateKey}/ordinary`);
        const scoredFull = { ...settings, scoreItem: (item) => Profile.scoreItem(item, type, profile, full) };
        const scoredSlim = { ...settings, scoreItem: (item) => Profile.scoreItem(item, type, profile, slim) };
        assert.equal(Engine.chooseInitial(slim, scoredSlim)?.id, Engine.chooseInitial(full, scoredFull)?.id, `${type}/${dateKey}/profile`);
      }
    }
    const seenFull = [];
    const seenSlim = [];
    let currentFull = Engine.chooseInitial(full, { dateKey: "2026-08-28", type, themeId: null, excludedIds: [] });
    let currentSlim = Engine.chooseInitial(slim, { dateKey: "2026-08-28", type, themeId: null, excludedIds: [] });
    while (currentFull && currentSlim) {
      assert.equal(currentSlim.id, currentFull.id, `${type} traversal ${seenFull.length}`);
      seenFull.push(currentFull.id);
      seenSlim.push(currentSlim.id);
      currentFull = Engine.chooseNext(full, { dateKey: "2026-08-28", type, themeId: null, currentId: currentFull.id, excludedIds: seenFull, sequence: seenFull.length });
      currentSlim = Engine.chooseNext(slim, { dateKey: "2026-08-28", type, themeId: null, currentId: currentSlim.id, excludedIds: seenSlim, sequence: seenSlim.length });
    }
    assert.equal(currentSlim, null, `${type} compact exhausted result`);
    assert.equal(currentFull, null, `${type} full exhausted result`);
    assert.equal(seenSlim.length, full.length, `${type} full reachability`);
  }
});

test("delayed generated search index is query-equivalent to the full in-memory index", () => {
  const full = Explore.buildIndex(catalog, Engine);
  const split = searchIndex();
  assert.equal(split.count, 2200);
  assert.deepEqual(split.counts, full.counts);
  const cases = [
    { q: "Berlin", pageSize: 24 },
    { q: "schlaf", type: "medical", pageSize: 50 },
    { q: "straße", type: "german", level: "A2", pageSize: 30 },
    { type: "book", genre: "scifi", era: "recent", ratingPercent: 0.8, sort: "rating", page: 2, pageSize: 17 },
    { type: "movie", genre: "mystery", sort: "year", pageSize: 100 },
    { type: "city", region: catalog.cities[0].region, sort: "title", pageSize: 100 },
    { type: "medical", medicalTopic: catalog.medical[0].topicGroup, pageSize: 100 }
  ];
  for (const filters of cases) {
    const expected = Explore.query(full, filters);
    const actual = Explore.query(split, filters);
    assert.deepEqual(
      { total: actual.total, page: actual.page, pageCount: actual.pageCount, keys: actual.items.map((entry) => entry.key) },
      { total: expected.total, page: expected.page, pageCount: expected.pageCount, keys: expected.items.map((entry) => entry.key) },
      JSON.stringify(filters)
    );
  }
});

test("file:// loader selects first, hydrates only requested chunks, then can reconstruct all 2,200 details", async () => {
  const environment = fakeScriptEnvironment();
  const store = CatalogData.createStore({
    root: environment.host,
    baseUrl: environment.host.location.href,
    loadScript: environment.loadScript
  });
  const compact = await store.loadSelection();
  assert.equal(compact.appVersion, manifest.appVersion, "loader view receives the shell appVersion from manifest");
  assert.equal(environment.loaded.filter((name) => name.includes("details/")).length, 0, "selection bootstrap loaded a detail chunk");
  assert.equal(environment.loaded.some((name) => name.startsWith("catalog-data/search.")), false, "selection bootstrap loaded search");

  const references = TYPES.map((type) => compact[COLLECTIONS[type]][Math.floor(compact[COLLECTIONS[type]].length / 2)]);
  const hydrated = await store.loadDetails(references);
  assert.deepEqual(hydrated.map((item) => `${item.type}:${item.id}`), references.map((item) => `${item.type}:${item.id}`));
  assert.equal(environment.loaded.filter((name) => name.includes("catalog-data/details/")).length, 5);
  for (const item of hydrated) {
    const expected = catalog[COLLECTIONS[item.type]].find((candidate) => candidate.id === item.id);
    assert.deepEqual(item, expected);
    assert.equal(store.isDetailItem(item), true);
  }

  const full = await store.loadAllDetails();
  for (const type of TYPES) assert.deepEqual(full[COLLECTIONS[type]], catalog[COLLECTIONS[type]], type);
  assert.equal(environment.loaded.filter((name) => name.includes("catalog-data/details/")).length, 44);
  store.close();
});

test("detail concurrency is shared across simultaneous loadDetails calls", async () => {
  const environment = fakeScriptEnvironment();
  let activeDetailLoads = 0;
  let peakDetailLoads = 0;
  const store = CatalogData.createStore({
    root: environment.host,
    baseUrl: environment.host.location.href,
    detailConcurrency: 2,
    async loadScript(request) {
      const url = typeof request === "string" ? request : request.url;
      const isDetail = new URL(url).pathname.includes("/catalog-data/details/");
      if (!isDetail) return environment.loadScript(request);
      activeDetailLoads += 1;
      peakDetailLoads = Math.max(peakDetailLoads, activeDetailLoads);
      try {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return await environment.loadScript(request);
      } finally {
        activeDetailLoads -= 1;
      }
    }
  });
  const compact = await store.loadSelection();
  const references = TYPES.map((type) => compact[COLLECTIONS[type]][0]);

  const hydrated = await Promise.all(references.map((reference) => store.loadDetails([reference])));

  assert.equal(peakDetailLoads, 2, "five independent calls must share the configured two-request ceiling");
  assert.deepEqual(hydrated.map(([item]) => `${item.type}:${item.id}`), references.map((item) => `${item.type}:${item.id}`));
  store.close();
});

test("simultaneous callers deduplicate one detail chunk and a failed chunk remains retryable and cacheable", async () => {
  const environment = fakeScriptEnvironment();
  let targetChunk = "";
  let targetAttempts = 0;
  const store = CatalogData.createStore({
    root: environment.host,
    baseUrl: environment.host.location.href,
    detailConcurrency: 2,
    async loadScript(request) {
      const url = typeof request === "string" ? request : request.url;
      const record = manifest.details.chunks.find((chunk) => new URL(url).pathname.endsWith(`/${path.basename(chunk.path)}`));
      if (record?.id === targetChunk) {
        targetAttempts += 1;
        if (targetAttempts === 1) throw new Error("injected detail failure");
      }
      return environment.loadScript(request);
    }
  });
  const compact = await store.loadSelection();
  const first = compact.books[0];
  const second = compact.books.find((item) => item.id !== first.id && item.detailChunk === first.detailChunk);
  assert.ok(second, "fixture needs two books in one detail chunk");
  targetChunk = first.detailChunk;

  const firstAttempt = await Promise.allSettled([store.loadDetails([first]), store.loadDetails([second])]);
  assert.equal(targetAttempts, 1, "concurrent callers must share the same failed chunk request");
  assert.ok(firstAttempt.every((result) => result.status === "rejected" && /injected detail failure/.test(result.reason.message)));

  const recovered = await Promise.all([store.loadDetails([first]), store.loadDetails([second])]);
  assert.equal(targetAttempts, 2, "the rejected chunk promise must be evicted for retry");
  assert.deepEqual(recovered.map(([item]) => item.id), [first.id, second.id]);

  await store.loadDetails([first, second]);
  assert.equal(targetAttempts, 2, "a successful chunk promise must remain cached");
  store.close();
});

test("file:// search falls back to main-thread delayed index and hydrates only its result page", async () => {
  const environment = fakeScriptEnvironment();
  const store = CatalogData.createStore({ root: environment.host, baseUrl: environment.host.location.href, loadScript: environment.loadScript });
  const result = await store.query({ q: "Berlin", pageSize: 5 });
  assert.ok(result.total > 0);
  assert.ok(result.items.length > 0 && result.items.length <= 5);
  assert.ok(result.items.every((entry) => entry.item && entry.item.id === entry.id && !entry.item.selectionOnly));
  assert.equal(environment.loaded.filter((name) => name.startsWith("catalog-data/search.")).length, 1);
  assert.ok(environment.loaded.filter((name) => name.includes("catalog-data/details/")).length <= result.items.length);
  const lightweight = await store.query({ q: "Berlin", pageSize: 5 }, { hydrate: false });
  assert.ok(lightweight.items.every((entry) => !Object.hasOwn(entry, "item")));
  store.close();
});

test("a catalog script that never loads settles at the configured deadline", async () => {
  const documentObject = {
    baseURI: "https://atlas.test/",
    defaultView: globalThis,
    head: { append() {} },
    createElement() {
      return {
        addEventListener() {},
        remove() {}
      };
    }
  };
  const store = CatalogData.createStore({
    root: { location: { href: documentObject.baseURI }, document: documentObject },
    document: documentObject,
    baseUrl: documentObject.baseURI,
    requestTimeoutMs: 500
  });
  const started = Date.now();
  await assert.rejects(store.loadSelection(), /failed to load catalog script/);
  assert.ok(Date.now() - started >= 450 && Date.now() - started < 2000, "hung catalog script must reject near its deadline");
  store.close();
});

test("HTTP worker failure terminates once and falls back to the same delayed local query", async () => {
  const environment = fakeScriptEnvironment("https://atlas.test/");
  let terminated = 0;
  const loaderHost = environment.host;
  loaderHost.Worker = function Worker() {};
  const fallbackStore = CatalogData.createStore({
    root: loaderHost,
    baseUrl: "https://atlas.test/",
    loadScript: environment.loadScript,
    workerFactory() {
      const listeners = new Map();
      loaderHost.Worker = function Worker() {};
      return {
        addEventListener(type, listener) { listeners.set(type, listener); },
        postMessage() { setImmediate(() => listeners.get("error")?.(new Error("injected worker failure"))); },
        terminate() { terminated += 1; }
      };
    },
    requestTimeoutMs: 1000
  });
  const result = await fallbackStore.query({ q: "Berlin", pageSize: 3 }, { hydrate: false });
  assert.ok(result.total > 0 && result.items.length > 0);
  assert.equal(terminated, 1);
  assert.equal(environment.loaded.filter((name) => name.startsWith("catalog-data/search.")).length, 1);
  fallbackStore.close();
});

test("search worker initializes a versioned index, returns serializable references, and rejects bad versions", async () => {
  function scopeWith(versionOverride) {
    const listeners = new Map();
    const messages = [];
    const scope = {
      DailyAtlasExplore: null,
      DAILY_ATLAS_SEARCH_INDEX: null,
      addEventListener(type, listener) { listeners.set(type, listener); },
      importScripts(url) {
        if (url.endsWith("explore.js")) scope.DailyAtlasExplore = Explore;
        else scope.DAILY_ATLAS_SEARCH_INDEX = versionOverride ? { ...searchIndex(), searchVersion: versionOverride } : searchIndex();
      },
      postMessage(message) { messages.push(message); }
    };
    SearchWorker.install(scope);
    return { scope, messages, async dispatch(data) { await listeners.get("message")({ data }); await new Promise((resolve) => setImmediate(resolve)); } };
  }

  const good = scopeWith();
  await good.dispatch({
    kind: "init", requestId: "i1", exploreUrl: "https://example.test/explore.js", searchUrl: "https://example.test/search.js",
    expectedContentVersion: manifest.contentVersion, expectedSearchVersion: manifest.searchVersion
  });
  assert.deepEqual(good.messages[0], { requestId: "i1", ok: true, result: { count: 2200 } });
  await good.dispatch({ kind: "query", requestId: "q1", filters: { q: "Berlin", pageSize: 3 } });
  const response = good.messages[1];
  assert.equal(response.ok, true);
  assert.ok(response.result.items.length > 0 && response.result.items.length <= 3);
  assert.ok(response.result.items.every((entry) => entry.id && entry.detailChunk && !Object.hasOwn(entry, "text")));

  const bad = scopeWith("wrong-version");
  await bad.dispatch({
    kind: "init", requestId: "i2", exploreUrl: "https://example.test/explore.js", searchUrl: "https://example.test/search.js",
    expectedContentVersion: manifest.contentVersion, expectedSearchVersion: manifest.searchVersion
  });
  assert.equal(bad.messages[0].ok, false);
  assert.match(bad.messages[0].error, /version mismatch/);
});
