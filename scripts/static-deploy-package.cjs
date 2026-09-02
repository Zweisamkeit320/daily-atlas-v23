#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");

const Release = require("./release-package.cjs");
const ServiceWorkerBuild = require("./build-service-worker.cjs");
const CityVisualContract = require("./city-visual-contract.cjs");
const ServiceWorkerContract = require("./service-worker-contract.cjs");

const ROOT = path.resolve(__dirname, "..");
const ARCHIVE_ROOT = "daily-atlas-static";
const ROOT_FILES = Object.freeze([
  ".nojekyll",
  "_headers",
  "app.js",
  "appearance.js",
  "asset-routing.js",
  "backup.js",
  "backup-crypto.js",
  "bootstrap.js",
  "catalog.js",
  "catalog-loader.js",
  "city-live.js",
  "city-credits.html",
  "city-credits.js",
  "diagnostics.css",
  "diagnostics.html",
  "diagnostics.js",
  "engine.js",
  "explore.js",
  "index.html",
  "lock.js",
  "manifest.webmanifest",
  "music.js",
  "privacy.html",
  "profile.js",
  "public-config.js",
  "pwa.js",
  "reminders.js",
  "runtime-health.js",
  "runtime-foundation.js",
  "runtime-features.js",
  "search-worker.js",
  "speech.js",
  "state.js",
  "styles.css",
  "visuals.js",
  "legal.css",
  "LICENSE.txt",
  "NOTICE.txt",
  "sources-and-licenses.html",
  "sw.js",
  "weekly.js"
]);
const ASSET_FILES = Object.freeze([
  "assets/favicon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/visuals/README.md",
  "assets/visuals/manifest.js",
  ...ServiceWorkerBuild.MEDICAL_ASSET_FILES,
  ...ServiceWorkerBuild.VISUAL_ASSET_FILES,
  "assets/audio/german/manifest.json",
  "assets/audio/german/LICENSE-M-AILABS.txt",
  "assets/audio/german/README.md"
]);
const CATALOG_FILES = Object.freeze([
  ...ServiceWorkerBuild.CATALOG_SPLIT.pointer,
  ServiceWorkerBuild.CATALOG_SPLIT.selection,
  ServiceWorkerBuild.CATALOG_SPLIT.selectionData,
  ServiceWorkerBuild.CATALOG_SPLIT.search,
  ...ServiceWorkerBuild.CATALOG_SPLIT.details
]);
const FIXED_FILES = Object.freeze([...ROOT_FILES, ...ASSET_FILES, ...CATALOG_FILES]);
const VERSIONED_ZIP = /^daily-atlas-static-v(\d+\.\d+\.\d+)-r\d+-\d{8}-\d{6}\.zip$/;
const EXPECTED_CATALOG_COUNTS = Object.freeze({ books: 500, movies: 500, cities: 200, german: 500, medical: 500 });
const CACHE_VERSION_PATTERN = /const CACHE_VERSION = "([^"]+)";/;
const CACHE_VERSION_LINE_PATTERN = /const CACHE_VERSION = "[^"]+";/;
const CACHE_VERSION_PLACEHOLDER = 'const CACHE_VERSION = "__CONTENT_HASH__";';
const SERVICE_WORKER_SHELL_FILES = ServiceWorkerBuild.SHELL_FILES;
const PUBLIC_MOVIE_RATING_TEXT = /(?:\bIMDb\s*(?:评分|rating|score)\s*[:：]?\s*\d(?:\.\d+)?(?:\s*\/\s*10)?|\bIMDb\s*(?:[:：]|\s)\s*\d(?:\.\d+)?(?:\s*\/\s*10)?|\d(?:\.\d+)?\s*\/\s*10|\d[\d,.]*\s*(?:票|人评分|人评价|votes?)|固定评分|固定口碑证据)/iu;
const PUBLIC_MOVIE_NON_CONTENT_FIELDS = new Set(["id", "sourceUrl", "image", "visual"]);
const PUBLIC_MOVIE_FIELDS = Object.freeze({
  catalog: new Set([
    "id", "type", "genre", "genres", "genreLabel", "title", "originalTitle", "year", "creator", "detail",
    "summary", "reason", "sourceUrl", "visual", "tags", "audience", "popularityTier", "curationLevel",
    "image", "qualityGate", "themeTags", "contentNotes", "installment", "language", "prerequisite", "region",
    "series", "standaloneFriendly"
  ]),
  selection: new Set([
    "id", "type", "title", "year", "genres", "genre", "tags", "themeTags", "popularityTier",
    "curationLevel", "qualityGate", "sourceUrl", "image", "detailChunk", "selectionOnly"
  ]),
  search: new Set([
    "key", "type", "typeOrder", "item", "title", "normalizedTitle", "text", "genres", "era", "region",
    "ratingPercent", "level", "medicalTopic", "detailChunk"
  ]),
  searchItem: new Set(["id", "year"])
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function validateRelativePath(relative) {
  assert(typeof relative === "string" && relative.length > 0, "deploy path is empty");
  assert(!relative.includes("\\") && !relative.includes("\0") && !relative.includes(":"), `deploy path is not slash-canonical: ${relative}`);
  assert(!relative.startsWith("/") && !/^[A-Za-z]:/.test(relative), `deploy path is absolute: ${relative}`);
  const parts = relative.split("/");
  assert(parts.every((part) => part && part !== "." && part !== ".."), `deploy path is not canonical: ${relative}`);
  return relative;
}

function packageVersion(root) {
  const packagePath = path.join(root, "package.json");
  const stats = fs.lstatSync(packagePath);
  assert(!stats.isSymbolicLink() && stats.isFile(), "source package.json must be a regular file, not a symbolic link");
  return Release.packageVersionFromBytes(fs.readFileSync(packagePath), "source package.json");
}

function assertZipMatchesPackage(zipPath, version) {
  const filename = path.basename(zipPath);
  const match = VERSIONED_ZIP.exec(filename);
  assert(match, "ZIP filename must be versioned: daily-atlas-static-v<semver>-r<round>-YYYYMMDD-HHmmss.zip");
  assert(match[1] === version, `ZIP version ${match[1]} does not match package version ${version}`);
}

function sidecarPaths(zipPath) {
  const zip = path.resolve(zipPath);
  assert(zip.toLowerCase().endsWith(".zip"), "static deploy archive must have a .zip extension");
  return { zip, zipSha: `${zip}.sha256` };
}

function parseHashSidecar(bytes, expectedName) {
  const text = bytes.toString("utf8");
  assert(!text.includes("\r") && text.endsWith("\n"), "ZIP SHA-256 sidecar must use one LF-terminated line");
  const match = /^([A-F0-9]{64})  ([^\r\n]+)\n$/.exec(text);
  assert(match && match[2] === expectedName, "ZIP SHA-256 sidecar has an invalid filename or format");
  return match[1];
}

function assertRegularPath(root, relative) {
  validateRelativePath(relative);
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    assert(fs.existsSync(current), `required static deploy file is missing: ${relative}`);
    const stats = fs.lstatSync(current);
    assert(!stats.isSymbolicLink(), `symbolic link is forbidden in static deploy input: ${relative}`);
  }
  const stats = fs.lstatSync(current);
  assert(stats.isFile(), `static deploy input is not a regular file: ${relative}`);
  return current;
}

function isOutside(base, target) {
  const relative = path.relative(base, target);
  return path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`);
}

function prospectiveRealPath(target) {
  let existing = path.resolve(target);
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    assert(parent !== existing, `cannot resolve an existing ancestor for output path: ${target}`);
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const stats = fs.statSync(existing);
  assert(stats.isDirectory(), `output ancestor is not a directory: ${existing}`);
  return path.resolve(fs.realpathSync.native(existing), ...missing);
}

function assertOutputOutsideSource(sourceRoot, zipPath) {
  const resolvedRoot = path.resolve(sourceRoot);
  const resolvedZip = path.resolve(zipPath);
  assert(isOutside(resolvedRoot, resolvedZip), "static deploy artifacts must be written outside the source tree");
  const realRoot = fs.realpathSync.native(resolvedRoot);
  const prospectiveZip = path.join(prospectiveRealPath(path.dirname(resolvedZip)), path.basename(resolvedZip));
  assert(isOutside(realRoot, prospectiveZip), "static deploy output resolves inside the source tree through a symbolic link or junction");
}

function parseGermanManifest(bytes, fileMap, label) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  assert(manifest && typeof manifest === "object", `${label} must be an object`);
  assert(manifest.count === 500 && Array.isArray(manifest.items) && manifest.items.length === 500, `${label} must describe exactly 500 German MP3 files`);
  const paths = new Set();
  for (const item of manifest.items) {
    assert(item && typeof item === "object", `${label} contains an invalid item`);
    const relative = validateRelativePath(String(item.path || ""));
    assert(/^assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(relative), `${label} contains an invalid MP3 path: ${relative}`);
    assert(!paths.has(relative.toLowerCase()), `${label} contains a duplicate or case-colliding MP3 path: ${relative}`);
    assert(Number.isSafeInteger(item.bytes) && item.bytes > 0, `${label} contains an invalid byte length: ${relative}`);
    assert(/^[A-F0-9]{64}$/.test(item.sha256), `${label} contains an invalid SHA-256: ${relative}`);
    const file = fileMap.get(relative);
    assert(file, `${label} references a missing MP3: ${relative}`);
    assert(file.bytes === item.bytes, `German MP3 byte length differs from manifest: ${relative}`);
    assert(sha256(file.content) === item.sha256, `German MP3 SHA-256 differs from manifest: ${relative}`);
    paths.add(relative.toLowerCase());
  }
  const mp3Paths = [...fileMap.keys()].filter((relative) => /^assets\/audio\/german\/[^/]+\.mp3$/.test(relative));
  assert(mp3Paths.length === 500, `static deploy package must contain exactly 500 German MP3 files; found ${mp3Paths.length}`);
  assert(mp3Paths.every((relative) => paths.has(relative.toLowerCase())), "static deploy package contains an MP3 absent from the German manifest");
  return [...manifest.items.map((item) => item.path)].sort(ordinalCompare);
}

function parseRuntimeCatalog(bytes, label = "catalog.js") {
  const text = bytes.toString("utf8");
  const match = /\n  const catalog = (\{[\s\S]*\});\n  global\.DAILY_ATLAS_CATALOG/.exec(text);
  assert(match, `${label} does not contain the generated catalog payload`);
  let catalog;
  try {
    catalog = JSON.parse(match[1]);
  } catch {
    throw new Error(`${label} contains invalid catalog JSON`);
  }
  assert(catalog && typeof catalog === "object" && catalog.schemaVersion === 4, `${label} has an invalid schema version`);
  assert(/^\d+\.\d+\.\d+$/.test(catalog.appVersion), `${label} has an invalid appVersion`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(catalog.snapshotDate), `${label} has an invalid snapshotDate`);
  for (const [key, expected] of Object.entries(EXPECTED_CATALOG_COUNTS)) {
    assert(Array.isArray(catalog[key]) && catalog[key].length === expected,
      `${label} must contain exactly ${expected} ${key}; found ${Array.isArray(catalog[key]) ? catalog[key].length : "non-array"}`);
  }
  for (const key of ["books", "movies"]) {
    const tiers = catalog[key].reduce((counts, item) => {
      counts[item?.curationLevel] = (counts[item?.curationLevel] || 0) + 1;
      return counts;
    }, {});
    assert(tiers["editorial-curated"] === 50 && tiers["editorial-reviewed"] === 150
      && tiers["evidence-reviewed"] === 300 && !tiers["source-screened"],
    `${label} ${key} must contain 50 curated + 150 reviewed + 300 evidence-reviewed entries`);
  }
  return catalog;
}

function parseRuntimeModule(bytes, label) {
  const sandbox = Object.create(null);
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(bytes.toString("utf8"), sandbox, { filename: label, timeout: 5000 });
  } catch (error) {
    throw new Error(`${label} cannot be evaluated as a generated public module: ${error.message}`);
  }
  const value = sandbox.module.exports;
  assert(value && typeof value === "object", `${label} did not export a public payload`);
  return value;
}

function assertAllowedFields(record, allowedFields, label) {
  assert(record && typeof record === "object", `${label} contains an invalid public movie record`);
  for (const key of Object.keys(record)) {
    assert(allowedFields.has(key), `${label} contains unexpected public movie field: ${key}`);
  }
}

function assertPublicMovieRecord(record, allowedFields, label) {
  assertAllowedFields(record, allowedFields, label);
  const seen = new Set();
  const visit = (value, key = "") => {
    if (typeof value === "string") {
      if (!PUBLIC_MOVIE_NON_CONTENT_FIELDS.has(key)) {
        assert(!PUBLIC_MOVIE_RATING_TEXT.test(value), `${label} contains public movie numeric rating or vote text in ${key || "text"}`);
      }
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [childKey, childValue] of Object.entries(value)) {
      visit(childValue, childKey);
    }
  };
  visit(record);
}

function validatePublicMoviePayload(fileMap, catalog = null) {
  const runtimeCatalog = catalog || parseRuntimeCatalog(fileMap.get("catalog.js")?.content || Buffer.alloc(0), "public catalog.js");
  assert(Array.isArray(runtimeCatalog.movies) && runtimeCatalog.movies.length === 500,
    "public catalog.js must contain exactly 500 movies");
  for (const movie of runtimeCatalog.movies) {
    assert(movie.qualityGate === "editorial-qualified", `public catalog.js movie ${movie.id || "unknown"} is not editorial-qualified`);
    assertPublicMovieRecord(movie, PUBLIC_MOVIE_FIELDS.catalog, `public catalog.js movie ${movie.id || "unknown"}`);
  }

  const manifestEntry = fileMap.get("catalog-data/manifest.json");
  assert(manifestEntry, "public static payload is missing catalog-data/manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.content.toString("utf8"));
  } catch {
    throw new Error("public catalog-data/manifest.json is not valid JSON");
  }
  const publicAsset = (record, pattern, label) => {
    assert(record && typeof record.path === "string" && pattern.test(record.path), `${label} has an invalid path`);
    const relative = validateRelativePath(`catalog-data/${record.path}`);
    const entry = fileMap.get(relative);
    assert(entry, `${label} references a missing public asset: ${relative}`);
    return entry;
  };

  const selectionEntry = publicAsset(manifest.selection, /^selection\.[a-f0-9]{12}\.js$/, "public selection manifest");
  const selection = parseRuntimeModule(selectionEntry.content, "public compact selection");
  assert(Array.isArray(selection.movies) && selection.movies.length === 500,
    "public compact selection must contain exactly 500 movies");
  for (const movie of selection.movies) {
    assert(movie.qualityGate === "editorial-qualified", `public compact selection movie ${movie.id || "unknown"} is not editorial-qualified`);
    assertPublicMovieRecord(movie, PUBLIC_MOVIE_FIELDS.selection, `public compact selection movie ${movie.id || "unknown"}`);
  }

  const selectionDataEntry = publicAsset(manifest.selectionData, /^selection-data\.[a-f0-9]{12}\.json$/, "public selection-data manifest");
  let selectionData;
  try {
    selectionData = JSON.parse(selectionDataEntry.content.toString("utf8"));
  } catch {
    throw new Error("public selection data is not valid JSON");
  }
  assert(Array.isArray(selectionData?.rows?.movie) && selectionData.rows.movie.length === 500,
    "public selection data must contain exactly 500 movie rows");
  for (const row of selectionData.rows.movie) {
    const rowId = Array.isArray(row) ? row[0] : "unknown";
    assert(Array.isArray(row) && row.length === 12, `public selection data movie ${rowId} must use the exact 12-column schema`);
    assert(typeof row[0] === "string" && typeof row[1] === "string" && Number.isSafeInteger(row[2]),
      `public selection data movie ${rowId} has invalid identity, title, or year columns`);
    assert([row[3], row[4], row[5]].every((value) => Array.isArray(value) && value.every((item) => typeof item === "string")),
      `public selection data movie ${rowId} has invalid genre, tag, or theme columns`);
    assert(typeof row[6] === "string" && typeof row[7] === "string" && typeof row[10] === "string" && row[11] == null,
      `public selection data movie ${rowId} has invalid tier, curation, detail, or image columns`);
    assert(row[8] == null && row[9] == null, `public selection data movie ${rowId} contains numeric rating or vote data`);
    const textFields = [row[0], row[1], ...row[3], ...row[4], ...row[5], row[6], row[7], row[10]];
    assert(!textFields.some((value) => PUBLIC_MOVIE_RATING_TEXT.test(value)),
      `public selection data movie ${rowId} contains public movie numeric rating or vote text`);
  }

  assert(Array.isArray(manifest?.details?.chunks), "public detail manifest has no chunks");
  const movieChunks = manifest.details.chunks.filter((chunk) => chunk?.type === "movie");
  assert(movieChunks.length === 10, `public detail manifest must contain exactly 10 movie chunks; found ${movieChunks.length}`);
  const detailMovies = [];
  for (const chunk of movieChunks) {
    const entry = publicAsset(chunk, /^details\/movie-\d{3}\.[a-f0-9]{12}\.js$/, `public movie detail ${chunk.id || "unknown"}`);
    const records = parseRuntimeModule(entry.content, `public movie detail ${chunk.id || "unknown"}`);
    assert(Array.isArray(records) && records.length === 50, `public movie detail ${chunk.id || "unknown"} must contain exactly 50 records`);
    detailMovies.push(...records);
  }
  assert(detailMovies.length === 500, `public movie details must contain exactly 500 records; found ${detailMovies.length}`);
  for (const movie of detailMovies) {
    assert(movie.qualityGate === "editorial-qualified", `public movie detail ${movie.id || "unknown"} is not editorial-qualified`);
    assertPublicMovieRecord(movie, PUBLIC_MOVIE_FIELDS.catalog, `public movie detail ${movie.id || "unknown"}`);
  }

  const searchEntry = publicAsset(manifest.search, /^search\.[a-f0-9]{12}\.js$/, "public search manifest");
  const search = parseRuntimeModule(searchEntry.content, "public search index");
  const searchMovies = Array.isArray(search.entries) ? search.entries.filter((entry) => entry?.type === "movie") : [];
  assert(searchMovies.length === 500, `public search index must contain exactly 500 movies; found ${searchMovies.length}`);
  for (const movie of searchMovies) {
    assert(movie.ratingPercent == null, `public search movie ${movie.item?.id || "unknown"} ratingPercent must be null`);
    assertPublicMovieRecord(movie, PUBLIC_MOVIE_FIELDS.search, `public search movie ${movie.item?.id || "unknown"}`);
    assertAllowedFields(movie.item, PUBLIC_MOVIE_FIELDS.searchItem, `public search movie ${movie.item?.id || "unknown"} item`);
  }
  return { catalog: 500, selection: 500, selectionData: 500, details: 500, search: 500 };
}

function appVersionFromBytes(bytes, label = "app.js") {
  const match = /\bconst APP_VERSION = "(\d+\.\d+\.\d+)";/.exec(bytes.toString("utf8"));
  assert(match, `${label} has no plain semantic APP_VERSION declaration`);
  return match[1];
}

function validateMusicLibrary(bytes, label = "music.js") {
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(bytes.toString("utf8"), sandbox, { filename: label, timeout: 1000 });
  const tracks = sandbox.module.exports?.TRACKS;
  assert(Array.isArray(tracks) && tracks.length === 100, `${label} must export exactly 100 tracks`);
  assert(new Set(tracks.map((track) => track?.id)).size === 100, `${label} contains duplicate track IDs`);
  const publicDomain = tracks.filter((track) => track?.sourceKind === "public-domain-arrangement").length;
  const original = tracks.filter((track) => track?.sourceKind === "original-procedural").length;
  assert(publicDomain === 20 && original === 80, `${label} must contain 80 original + 20 public-domain arrangements`);
}

function expectedServiceWorkerVersion(swBytes, fileMap) {
  return ServiceWorkerContract.expectedServiceWorkerContract(swBytes, fileMap, "static deploy input").cacheVersion;
}

function validateServiceWorkerFreshness(fileMap) {
  return ServiceWorkerContract.validateServiceWorkerContract(fileMap, "static deploy input").cacheVersion;
}

function parseMedicalManifest(bytes, fileMap, label) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  assert(manifest?.schemaVersion === 1 && Array.isArray(manifest.items) && manifest.items.length === 24,
    `${label} must use schemaVersion 1 and describe exactly 24 medical illustrations`);
  assert(fileMap.has("assets/medical/README.md"), `${label} package is missing assets/medical/README.md`);
  const keys = new Set();
  const expectedFiles = new Set();
  for (const item of manifest.items) {
    assert(item && /^[a-z0-9-]+$/.test(item.key || "") && !keys.has(item.key),
      `${label} contains an invalid or duplicate illustration key: ${item?.key}`);
    assert(/^assets\/medical\/[a-z0-9-]+\.webp$/.test(item.file || "") && !expectedFiles.has(item.file),
      `${label} contains an invalid or duplicate illustration file: ${item?.file}`);
    assert(typeof item.alt === "string" && item.alt.length >= 16, `${label} contains an invalid alt for ${item.key}`);
    const file = fileMap.get(item.file);
    assert(file && file.bytes > 0, `${label} references a missing or empty illustration: ${item.file}`);
    keys.add(item.key);
    expectedFiles.add(item.file);
  }
  const packagedFiles = [...fileMap.keys()].filter((relative) => /^assets\/medical\/[a-z0-9-]+\.webp$/.test(relative));
  assert(packagedFiles.length === 24, `${label} package must contain exactly 24 medical WebP files; found ${packagedFiles.length}`);
  assert(packagedFiles.every((relative) => expectedFiles.has(relative)), `${label} package contains a medical WebP absent from the manifest`);
  return [...expectedFiles].sort(ordinalCompare);
}

function validateMedicalReferences(catalogBytes, expectedFiles) {
  const references = new Set(catalogBytes.toString("utf8").match(/\.\/assets\/medical\/[a-z0-9-]+\.webp/g) || []);
  const expected = new Set(expectedFiles.map((relative) => `./${relative}`));
  assert(references.size > 0, "catalog.js does not reference any packaged medical image");
  for (const reference of references) assert(expected.has(reference), `catalog.js references a medical image outside the deploy whitelist: ${reference}`);
  for (const reference of expected) assert(references.has(reference), `packaged medical image is not referenced by catalog.js: ${reference}`);
}

function inspectSource(root = ROOT) {
  const resolvedRoot = path.resolve(root);
  const rootStats = fs.lstatSync(resolvedRoot);
  assert(rootStats.isDirectory() && !rootStats.isSymbolicLink(), "static deploy source root must be a regular directory, not a symbolic link");

  const audioDirectory = path.join(resolvedRoot, "assets", "audio", "german");
  const audioDirectoryStats = fs.lstatSync(audioDirectory);
  assert(audioDirectoryStats.isDirectory() && !audioDirectoryStats.isSymbolicLink(), "German audio directory must be a regular directory, not a symbolic link");
  const mp3Files = fs.readdirSync(audioDirectory)
    .filter((name) => name.toLowerCase().endsWith(".mp3"))
    .map((name) => `assets/audio/german/${name}`)
    .sort(ordinalCompare);
  assert(mp3Files.length === 500, `static deploy source must contain exactly 500 German MP3 files; found ${mp3Files.length}`);

  const requested = [...FIXED_FILES, ...mp3Files].sort(ordinalCompare);
  const seen = new Set();
  const files = requested.map((relative) => {
    const canonical = validateRelativePath(relative);
    assert(!seen.has(canonical.toLowerCase()), `duplicate or case-colliding static deploy path: ${canonical}`);
    seen.add(canonical.toLowerCase());
    const absolute = assertRegularPath(resolvedRoot, canonical);
    const content = fs.readFileSync(absolute);
    return { path: canonical, bytes: content.length, sha256: sha256(content), content };
  });
  const fileMap = new Map(files.map((entry) => [entry.path, entry]));
  parseGermanManifest(fileMap.get("assets/audio/german/manifest.json").content, fileMap, "source German manifest");
  const medicalFiles = parseMedicalManifest(fileMap.get("assets/medical/manifest.json").content, fileMap, "source medical manifest");
  const catalog = parseRuntimeCatalog(fileMap.get("catalog.js").content, "source catalog.js");
  validatePublicMoviePayload(fileMap, catalog);
  const sourceVersion = packageVersion(resolvedRoot);
  const appVersion = appVersionFromBytes(fileMap.get("app.js").content, "source app.js");
  assert(catalog.appVersion === sourceVersion,
    `source catalog.js version ${catalog.appVersion} does not match package version ${sourceVersion}`);
  assert(appVersion === sourceVersion, `source app.js version ${appVersion} does not match package version ${sourceVersion}`);
  validateMusicLibrary(fileMap.get("music.js").content, "source music.js");
  validateMedicalReferences(fileMap.get("catalog.js").content, medicalFiles);
  CityVisualContract.validateSourceRoot(resolvedRoot, { label: "static deploy source" });
  validateServiceWorkerFreshness(fileMap);
  return files;
}

function validateArchiveEntries(entries) {
  const seen = new Set();
  const files = new Map();
  const directories = [];
  for (const entry of entries) {
    const name = entry.name;
    assert(typeof name === "string" && name.length > 0, "ZIP contains an empty path");
    assert(!name.includes("\\") && !name.includes("\0") && !name.includes(":") && !name.startsWith("/"), `unsafe ZIP path: ${name}`);
    const parts = name.split("/");
    assert(parts[0] === ARCHIVE_ROOT, `ZIP has an unexpected root: ${name}`);
    assert(!seen.has(name.toLowerCase()), `duplicate or case-colliding ZIP path: ${name}`);
    seen.add(name.toLowerCase());
    if (name.endsWith("/")) {
      assert(parts.slice(0, -1).every((part) => part && part !== "." && part !== ".."), `unsafe ZIP path: ${name}`);
      directories.push(parts.slice(1, -1).join("/"));
      continue;
    }
    assert(parts.length >= 2 && parts.every((part) => part && part !== "." && part !== ".."), `unsafe ZIP path: ${name}`);
    const relative = validateRelativePath(parts.slice(1).join("/"));
    files.set(relative, { path: relative, bytes: entry.bytes, content: entry.content });
  }

  for (const relative of FIXED_FILES) assert(files.has(relative), `ZIP is missing required static deploy file: ${relative}`);
  const manifestEntry = files.get("assets/audio/german/manifest.json");
  const mp3Paths = parseGermanManifest(manifestEntry.content, files, "archived German manifest");
  const expected = new Set([...FIXED_FILES, ...mp3Paths]);
  assert(files.size === expected.size, `ZIP file count ${files.size} differs from the static deploy whitelist count ${expected.size}`);
  for (const relative of files.keys()) assert(expected.has(relative), `ZIP contains a file outside the static deploy whitelist: ${relative}`);

  const allowedDirectories = new Set([""]);
  for (const relative of expected) {
    const parts = relative.split("/");
    for (let length = 1; length < parts.length; length += 1) allowedDirectories.add(parts.slice(0, length).join("/"));
  }
  for (const relative of directories) assert(allowedDirectories.has(relative), `ZIP contains a directory outside the static deploy whitelist: ${relative}`);
  const catalog = parseRuntimeCatalog(files.get("catalog.js").content, "archived catalog.js");
  validatePublicMoviePayload(files, catalog);
  const medicalFiles = parseMedicalManifest(files.get("assets/medical/manifest.json").content, files, "archived medical manifest");
  const appVersion = appVersionFromBytes(files.get("app.js").content, "archived app.js");
  assert(appVersion === catalog.appVersion,
    `archived app.js version ${appVersion} does not match catalog.js version ${catalog.appVersion}`);
  validateMusicLibrary(files.get("music.js").content, "archived music.js");
  validateMedicalReferences(files.get("catalog.js").content, medicalFiles);
  CityVisualContract.validateCityVisualContract(files, "archived static deploy");
  const cacheVersion = validateServiceWorkerFreshness(files);
  return { files: files.size, audio: mp3Paths.length, appVersion: catalog.appVersion, cacheVersion };
}

function canonicalizeZipPathSeparators(zipPath) {
  const zipBytes = fs.readFileSync(zipPath);
  const signature = 0x06054B50;
  const minimum = Math.max(0, zipBytes.length - 65557);
  let eocd = -1;
  for (let offset = zipBytes.length - 22; offset >= minimum; offset -= 1) {
    if (zipBytes.readUInt32LE(offset) === signature) { eocd = offset; break; }
  }
  assert(eocd >= 0, "ZIP end-of-central-directory record is missing");
  const totalEntries = zipBytes.readUInt16LE(eocd + 10);
  let cursor = zipBytes.readUInt32LE(eocd + 16);
  for (let index = 0; index < totalEntries; index += 1) {
    assert(zipBytes.readUInt32LE(cursor) === 0x02014B50, `invalid ZIP central entry ${index}`);
    const nameLength = zipBytes.readUInt16LE(cursor + 28);
    const extraLength = zipBytes.readUInt16LE(cursor + 30);
    const commentBytes = zipBytes.readUInt16LE(cursor + 32);
    const localOffset = zipBytes.readUInt32LE(cursor + 42);
    assert(zipBytes.readUInt32LE(localOffset) === 0x04034B50, `local ZIP header is missing for central entry ${index}`);
    const localNameLength = zipBytes.readUInt16LE(localOffset + 26);
    assert(localNameLength === nameLength, `ZIP local and central name lengths disagree at entry ${index}`);
    for (let offset = 0; offset < nameLength; offset += 1) {
      if (zipBytes[cursor + 46 + offset] === 0x5C) zipBytes[cursor + 46 + offset] = 0x2F;
      if (zipBytes[localOffset + 30 + offset] === 0x5C) zipBytes[localOffset + 30 + offset] = 0x2F;
    }
    cursor += 46 + nameLength + extraLength + commentBytes;
  }
  fs.writeFileSync(zipPath, zipBytes);
}

function compressWithPowerShell(stagingRoot, outputZip) {
  assert(process.platform === "win32", "static deploy ZIP creation requires Windows PowerShell");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$source = $env:DAILY_ATLAS_DEPLOY_STAGE",
    "$destination = $env:DAILY_ATLAS_DEPLOY_ZIP",
    "Compress-Archive -LiteralPath $source -DestinationPath $destination -CompressionLevel Optimal"
  ].join("\n");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, DAILY_ATLAS_DEPLOY_STAGE: stagingRoot, DAILY_ATLAS_DEPLOY_ZIP: outputZip }
  });
  assert(result.status === 0, `Compress-Archive failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
}

function copyInventory(files, stagingRoot) {
  for (const entry of files) {
    const destination = path.join(stagingRoot, ...entry.path.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, entry.content, { flag: "wx" });
  }
}

function verifyStaticDeploy(zipPath) {
  const paths = sidecarPaths(zipPath);
  assert(fs.existsSync(paths.zip), `static deploy artifact is missing: ${paths.zip}`);
  assert(fs.existsSync(paths.zipSha), `static deploy artifact is missing: ${paths.zipSha}`);
  const zipBytes = fs.readFileSync(paths.zip);
  const expectedHash = parseHashSidecar(fs.readFileSync(paths.zipSha), path.basename(paths.zip));
  assert(sha256(zipBytes) === expectedHash, "ZIP SHA-256 sidecar does not match the static deploy archive");
  const inventory = validateArchiveEntries(Release.readZipEntries(zipBytes));
  assertZipMatchesPackage(paths.zip, inventory.appVersion);
  return { ...inventory, zipSha256: expectedHash, paths };
}

function createStaticDeploy(zipPath, root = ROOT) {
  const resolvedRoot = path.resolve(root);
  const paths = sidecarPaths(zipPath);
  assertZipMatchesPackage(paths.zip, packageVersion(resolvedRoot));
  assert(!Object.values(paths).some((target) => fs.existsSync(target)), "refusing to overwrite an existing static deploy artifact or sidecar");
  assertOutputOutsideSource(resolvedRoot, paths.zip);
  const files = inspectSource(resolvedRoot);
  fs.mkdirSync(path.dirname(paths.zip), { recursive: true });
  assertOutputOutsideSource(resolvedRoot, paths.zip);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "daily-atlas-static-deploy-"));
  const stagingRoot = path.join(temporary, ARCHIVE_ROOT);
  const temporaryZip = path.join(temporary, path.basename(paths.zip));
  const created = [];
  try {
    fs.mkdirSync(stagingRoot, { recursive: true });
    copyInventory(files, stagingRoot);
    compressWithPowerShell(stagingRoot, temporaryZip);
    canonicalizeZipPathSeparators(temporaryZip);
    const zipBytes = fs.readFileSync(temporaryZip);
    const inventory = validateArchiveEntries(Release.readZipEntries(zipBytes));
    assertZipMatchesPackage(paths.zip, inventory.appVersion);
    const zipHash = sha256(zipBytes);
    const payloads = [
      [paths.zip, zipBytes],
      [paths.zipSha, Buffer.from(`${zipHash}  ${path.basename(paths.zip)}\n`, "utf8")]
    ];
    for (const [target, payload] of payloads) {
      fs.writeFileSync(target, payload, { flag: "wx" });
      created.push(target);
    }
    const verified = verifyStaticDeploy(paths.zip);
    assert(verified.files === inventory.files && verified.audio === inventory.audio, "created static deploy inventory changed during verification");
    return verified;
  } catch (error) {
    for (const target of created.reverse()) {
      try { fs.rmSync(target, { force: true }); } catch { /* preserve the original error */ }
    }
    throw error;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function parseCli(argv) {
  const command = argv[0];
  let zip = null;
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--zip") zip = argv[++index];
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  assert(command === "create" || command === "verify", "usage: static-deploy-package.cjs create|verify --zip <versioned.zip>");
  assert(zip, "--zip is required");
  return { command, zip };
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const result = options.command === "create" ? createStaticDeploy(options.zip) : verifyStaticDeploy(options.zip);
  console.log(`PASS: ${options.command} files=${result.files} audio=${result.audio} zipSha256=${result.zipSha256}`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  ARCHIVE_ROOT,
  ASSET_FILES,
  CATALOG_FILES,
  FIXED_FILES,
  ROOT_FILES,
  SERVICE_WORKER_SHELL_FILES,
  VERSIONED_ZIP,
  createStaticDeploy,
  expectedServiceWorkerVersion,
  inspectSource,
  parseGermanManifest,
  parseMedicalManifest,
  sidecarPaths,
  validateArchiveEntries,
  validatePublicMoviePayload,
  verifyStaticDeploy
});
