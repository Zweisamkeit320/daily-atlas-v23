"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  CITY_LICENSES,
  PATHS,
  browserManifestBytes,
  buildManifest,
  manifestBytes,
  parseJsonSafely,
  resolveWorkspacePath,
  validateVisualManifest
} = require("../scripts/visual-manifest-lib.cjs");

const ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function walkFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(filePath));
    else if (entry.isFile()) result.push(filePath);
  }
  return result;
}

test("visual manifest deterministically covers exactly the frozen 500/500/200 stable IDs", () => {
  const manifest = buildManifest();
  const approvedCount = readJson("data/visuals/city-commons-overrides.json").items.length;
  assert.equal(validateVisualManifest(manifest), true);
  assert.deepEqual(manifest.counts, {
    books: 500,
    movies: 500,
    cities: 200,
    total: 1200,
    remoteOnly: 1000,
    approvedOpenLicenseCities: approvedCount,
    pendingOpenLicenseCities: 200 - approvedCount
  });
  const expected = new Set([
    ...readJson("data/raw/books500.json").books.map((item) => item.id),
    ...readJson("data/raw/movies500.json").movies.map((item) => item.id),
    ...readJson("data/raw/cities200.json").map((item) => item.id)
  ]);
  assert.equal(expected.size, 1200);
  assert.deepEqual(new Set(manifest.items.map((item) => item.id)), expected);
  assert.deepEqual(manifestBytes(buildManifest()), manifestBytes(buildManifest()));
  const timestampInputs = [
    readJson("data/raw/books500.json").retrievedAt,
    readJson("data/raw/movies500.json").retrievedAt,
    readJson("data/raw/movies500.json").expansionMetadataRetrievedAt,
    ...readJson("data/visuals/city-commons-overrides.json").items.map((item) => item.sourceMetadataRetrievedAt)
  ].filter(Boolean);
  assert.equal(
    manifest.generatedAt,
    timestampInputs.sort((a, b) => Date.parse(b) - Date.parse(a))[0],
    "generatedAt must come from frozen inputs, not the wall clock"
  );
});

test("generated audit JSON and compact browser payload are exact build products", () => {
  const manifest = buildManifest();
  assert.deepEqual(fs.readFileSync(resolveWorkspacePath(PATHS.output)), manifestBytes(manifest));
  assert.deepEqual(fs.readFileSync(resolveWorkspacePath(PATHS.browserOutput)), browserManifestBytes(manifest));
  const context = {};
  vm.runInNewContext(fs.readFileSync(resolveWorkspacePath(PATHS.browserOutput), "utf8"), context, {
    filename: PATHS.browserOutput,
    timeout: 2_000
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.DAILY_ATLAS_VISUAL_MANIFEST)), manifest);
});

test("book and movie mappings remain stable-ID remote references without bundled copyrighted binaries", () => {
  const manifest = buildManifest();
  const books = readJson("data/raw/books500.json").books;
  const movies = readJson("data/raw/movies500.json").movies;
  const byId = new Map(manifest.items.map((item) => [item.id, item]));
  for (const source of books) {
    const item = byId.get(source.id);
    assert.equal(item.type, "book");
    assert.equal(item.status, "remote-only");
    assert.equal(item.primary, item.candidates[0]);
    assert.equal(item.candidates.length, 3);
    assert.equal(new URL(item.candidates[0]).hostname, "images.weserv.nl");
    assert.ok(item.candidates.slice(1).every((url) => new URL(url).hostname === "covers.openlibrary.org"));
    assert.ok(item.candidates.every((url) => url.includes(String(source.coverId))));
    assert.equal(item.licenseUrl, null);
    assert.equal(Object.hasOwn(item, "localFile"), false);
  }
  for (const source of movies) {
    const item = byId.get(source.id);
    assert.equal(item.type, "movie");
    assert.equal(item.status, "remote-only");
    assert.equal(item.primary, item.candidates[0]);
    assert.equal(item.candidates.length, 3);
    assert.equal(new URL(item.candidates[0]).hostname, "images.weserv.nl");
    assert.ok(item.candidates.slice(1).every((url) => new URL(url).hostname === "images.metahub.space"));
    assert.ok(item.candidates.every((url) => url.includes(source.id)));
    assert.equal(item.licenseUrl, null);
    assert.equal(Object.hasOwn(item, "localFile"), false);
  }
  assert.equal(manifest.policies["open-library-cover-remote-reference"].buildTimeDownloadAllowed, false);
  assert.equal(manifest.policies["metahub-poster-remote-reference"].buildTimeDownloadAllowed, false);
  const binaryExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
  const visualFiles = walkFiles(path.join(ROOT, "assets", "visuals"));
  const unexpectedBinaries = visualFiles.filter((filePath) => {
    if (!binaryExtensions.has(path.extname(filePath).toLowerCase())) return false;
    const relative = path.relative(path.join(ROOT, "assets", "visuals"), filePath).replaceAll("\\", "/");
    return !/^cities(?:-staged)?\//.test(relative);
  });
  assert.deepEqual(unexpectedBinaries, [], "book/movie binaries must not be bulk-downloaded into assets/visuals");
});

test("all 1000 remote manifest routes exactly equal the browser runtime resolver", () => {
  global.DAILY_ATLAS_PUBLIC_CONFIG = { remoteBookMovieImages: true, localCityImages: true };
  const Visuals = require("../visuals.js");
  const manifest = buildManifest();
  const sources = [
    ...readJson("data/raw/books500.json").books.map((item) => [item, "book"]),
    ...readJson("data/raw/movies500.json").movies.map((item) => [item, "movie"])
  ];
  const byId = new Map(manifest.items.map((item) => [item.id, item]));
  assert.equal(sources.length, 1000);
  for (const [source, type] of sources) {
    assert.deepEqual(
      [...Visuals.resolve(source, type, {}).candidates],
      byId.get(source.id).candidates,
      `${source.id} runtime and audited candidates diverged`
    );
  }
});

test("unreviewed city search results fail closed while preserving deterministic Commons discovery metadata", () => {
  const cities = buildManifest().items.filter((item) => item.type === "city");
  const approved = new Set(readJson("data/visuals/city-commons-overrides.json").items.map((item) => item.id));
  assert.equal(cities.length, 200);
  for (const item of cities) {
    if (approved.has(item.id)) {
      assert.equal(item.status, "approved-open-license-local");
      assert.equal(item.primary, item.localFile);
      assert.match(item.localFile, /^assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/);
      assert.equal(item.candidates[0], item.localFile);
      assert.match(item.licenseUrl, /^https:\/\/creativecommons\.org\//);
      assert.ok(item.attribution);
      continue;
    }
    assert.equal(item.status, "pending-open-license-curation");
    assert.equal(item.primary, null);
    assert.deepEqual(item.candidates, []);
    assert.equal(item.localFile, null);
    assert.match(item.plannedLocalFile, /^assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/);
    assert.equal(new URL(item.sourcePage).hostname, "commons.wikimedia.org");
    assert.equal(item.licenseUrl, null);
    assert.equal(item.attribution, null);
    assert.match(item.discovery.searchQuery, / cityscape$/);
  }
});

test("ported Commons licence names and URLs cannot be downgraded to generic deeds", () => {
  const expected = {
    "city-berlin": ["CC-BY-SA-3.0-DE", "Attribution-ShareAlike 3.0 Germany", "https://creativecommons.org/licenses/by-sa/3.0/de/", "https://creativecommons.org/licenses/by-sa/3.0/"],
    "city-hamburg": ["CC-BY-SA-3.0-DE", "Attribution-ShareAlike 3.0 Germany", "https://creativecommons.org/licenses/by-sa/3.0/de/", "https://creativecommons.org/licenses/by-sa/3.0/"],
    "city-tallinn": ["CC-BY-SA-3.0-EE", "Attribution-ShareAlike 3.0 Estonia", "https://creativecommons.org/licenses/by-sa/3.0/ee/", "https://creativecommons.org/licenses/by-sa/3.0/"],
    "city-kashgar": ["CC-BY-3.0-PL", "Attribution 3.0 Poland", "https://creativecommons.org/licenses/by/3.0/pl/", "https://creativecommons.org/licenses/by/3.0/"],
    "city-brasilia": ["CC-BY-3.0-BR", "Attribution 3.0 Brazil", "https://creativecommons.org/licenses/by/3.0/br/", "https://creativecommons.org/licenses/by/3.0/"],
    "city-fremantle": ["CC-BY-2.5-AU", "Attribution 2.5 Australia", "https://creativecommons.org/licenses/by/2.5/au/", "https://creativecommons.org/licenses/by/2.5/"]
  };
  const manifest = buildManifest();
  const overrides = readJson("data/visuals/city-commons-overrides.json");
  for (const [id, [code, name, url, genericUrl]] of Object.entries(expected)) {
    assert.deepEqual(CITY_LICENSES[code], { name, url });
    const override = overrides.items.find((item) => item.id === id);
    const item = manifest.items.find((entry) => entry.id === id);
    assert.deepEqual(override.license, { code, name, url });
    assert.equal(item.licenseCode, code);
    assert.equal(item.licenseName, name);
    assert.equal(item.licenseUrl, url);
    const downgraded = structuredClone(manifest);
    downgraded.items.find((entry) => entry.id === id).licenseUrl = genericUrl;
    assert.throws(() => validateVisualManifest(downgraded), /licenseUrl does not match its code/);
  }
});

test("manifest input and output guards reject traversal, absolute paths, dangerous JSON keys and unsafe URLs", () => {
  assert.throws(() => resolveWorkspacePath("../outside.json"), /traversal|escapes/);
  assert.throws(() => resolveWorkspacePath("C:\\outside.json"), /absolute path/);
  assert.throws(() => resolveWorkspacePath("data/visuals/../../outside.json"), /traversal/);
  assert.throws(() => parseJsonSafely('{"__proto__":{"polluted":true}}', "attack"), /forbidden key __proto__/);
  assert.throws(() => parseJsonSafely('{"safe":{"constructor":{"prototype":{"polluted":true}}}}', "attack"), /forbidden key constructor/);
  assert.equal({}.polluted, undefined);

  const manifest = buildManifest();
  const attacked = structuredClone(manifest);
  attacked.items.find((item) => item.type === "book").primary = "javascript:alert(1)";
  assert.throws(() => validateVisualManifest(attacked), /first candidate/);

  const attackedCandidate = structuredClone(manifest);
  const movie = attackedCandidate.items.find((item) => item.type === "movie");
  movie.primary = "https://example.com/poster.jpg";
  movie.candidates[0] = movie.primary;
  assert.throws(() => validateVisualManifest(attackedCandidate), /unsupported host/);
});

test("the published JSON Schema declares the runtime contract and fixed counts", () => {
  const schema = readJson("data/visuals/visual-manifest.v1.schema.json");
  const overrideSchema = readJson("data/visuals/city-commons-overrides.schema.json");
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual(schema.required, [
    "schemaVersion", "generatedAt", "releaseTarget", "deterministic", "scope", "sources", "policies", "counts", "items"
  ]);
  assert.equal(schema.properties.counts.properties.books.const, 500);
  assert.equal(schema.properties.counts.properties.movies.const, 500);
  assert.equal(schema.properties.counts.properties.cities.const, 200);
  assert.equal(schema.properties.items.minItems, 1200);
  assert.equal(schema.properties.items.maxItems, 1200);
  assert.equal(overrideSchema.properties.items.items.properties.reviewStatus.const, "approved");
  assert.deepEqual(
    overrideSchema.properties.items.items.properties.license.properties.code.enum,
    buildManifest().policies["wikimedia-commons-reviewed-open-license"].allowedLicenseCodes
  );
});
