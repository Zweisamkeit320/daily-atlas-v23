"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const CityVisualContract = require("./city-visual-contract.cjs");

const ROOT = path.resolve(__dirname, "..");
const SW_PATH = path.join(ROOT, "sw.js");
const ASSET_ROUTING_PATH = path.join(ROOT, "asset-routing.js");
const CHECK_ONLY = process.argv.includes("--check");
const REVISION_ARGUMENT = process.argv.find((value) => value.startsWith("--deployment-revision="));
const VERSION_PATTERN = /const CACHE_VERSION = "[^"]+";/;
const APP_SHELL_PATTERN = /const APP_SHELL = Object\.freeze\(\[[\s\S]*?\n\]\);/;
const PLACEHOLDER_LINE = 'const CACHE_VERSION = "__CONTENT_HASH__";';
const PACK_VERSION_PATTERNS = Object.freeze({
  shell: /const SHELL_VERSION = "[^"]+";/,
  content: /const CONTENT_VERSION = "[^"]+";/,
  medical: /const MEDICAL_VERSION = "[^"]+";/,
  audio: /const AUDIO_VERSION = "[^"]+";/,
  search: /const SEARCH_VERSION = "[^"]+";/,
  visual: /const VISUAL_VERSION = "[^"]+";/
});
const PACK_PLACEHOLDERS = Object.freeze({
  shell: 'const SHELL_VERSION = "__SHELL_VERSION__";',
  content: 'const CONTENT_VERSION = "__CONTENT_VERSION__";',
  medical: 'const MEDICAL_VERSION = "__MEDICAL_VERSION__";',
  audio: 'const AUDIO_VERSION = "__AUDIO_VERSION__";',
  search: 'const SEARCH_VERSION = "__SEARCH_VERSION__";',
  visual: 'const VISUAL_VERSION = "__VISUAL_VERSION__";'
});
const AUDIO_MANIFEST_HASH_PATTERN = /const AUDIO_MANIFEST_SHA256 = "[A-F0-9]{64}";/;
const AUDIO_MANIFEST_HASH_PLACEHOLDER = 'const AUDIO_MANIFEST_SHA256 = "__AUDIO_MANIFEST_SHA256__";';
const ROUTING_PATTERNS = Object.freeze({
  revision: /const DEPLOYMENT_REVISION = "[^"]+";/,
  integrity: /const CATALOG_INTEGRITY = "[^"]+";/,
  sha256: /const CATALOG_SHA256 = "[A-F0-9]{64}";/,
  bytes: /const CATALOG_BYTES = \d+;/
});

const MEDICAL_MANIFEST_FILE = "assets/medical/manifest.json";
const MEDICAL_README_FILE = "assets/medical/README.md";
const MEDICAL_ASSET_FILES = Object.freeze(loadMedicalAssetFiles());
const VISUAL_ASSET_FILES = Object.freeze(loadVisualAssetFiles());
const VISUAL_METADATA_FILES = Object.freeze(VISUAL_ASSET_FILES.filter((entry) => /\/manifest\.(?:js|json)$/.test(entry)));
const CATALOG_SPLIT = loadCatalogAssetFiles();
const CORE_SHELL_FILES = Object.freeze([
  "index.html",
  "styles.css",
  "public-config.js",
  "privacy.html",
  "sources-and-licenses.html",
  "LICENSE.txt",
  "NOTICE.txt",
  "city-credits.html",
  "city-credits.js",
  "legal.css",
  "asset-routing.js",
  "runtime-health.js",
  "diagnostics.html",
  "diagnostics.css",
  "diagnostics.js",
  "bootstrap.js",
  "runtime-foundation.js",
  "runtime-features.js",
  "catalog-loader.js",
  "engine.js",
  "state.js",
  "profile.js",
  "lock.js",
  "backup.js",
  "backup-crypto.js",
  "appearance.js",
  "weekly.js",
  "music.js",
  "speech.js",
  "city-live.js",
  "reminders.js",
  "visuals.js",
  ...VISUAL_METADATA_FILES,
  "pwa.js",
  "app.js",
  "manifest.webmanifest",
  "assets/favicon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png"
]);
const SHELL_PACK_FILES = Object.freeze([...CORE_SHELL_FILES, ...CATALOG_SPLIT.pointer]);
const CONTENT_FILES = Object.freeze([CATALOG_SPLIT.selectionData, ...CATALOG_SPLIT.details]);
const SEARCH_FILES = Object.freeze(["explore.js", "search-worker.js", CATALOG_SPLIT.search]);
const AUDIO_METADATA_FILES = Object.freeze(["assets/audio/german/manifest.json"]);
const VISUAL_FILES = Object.freeze(["visuals.js", "public-config.js", "assets/visuals/manifest.js", ...VISUAL_ASSET_FILES]
  .filter((value, index, values) => values.indexOf(value) === index));
const APP_SHELL_FILES = Object.freeze([
  ...CORE_SHELL_FILES,
  ...CATALOG_SPLIT.pointer,
  CATALOG_SPLIT.selectionData,
  "explore.js",
  "search-worker.js",
  ...MEDICAL_ASSET_FILES,
  ...AUDIO_METADATA_FILES
]);
// Kept as the complete release surface for static-package compatibility.
const SHELL_FILES = Object.freeze([
  ...CORE_SHELL_FILES,
  "catalog.js",
  ...CATALOG_SPLIT.pointer,
  CATALOG_SPLIT.selection,
  ...CONTENT_FILES,
  ...SEARCH_FILES,
  ...MEDICAL_ASSET_FILES,
  ...AUDIO_METADATA_FILES
].filter((value, index, values) => values.indexOf(value) === index));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveInside(relative) {
  const resolved = path.resolve(ROOT, relative);
  assert(resolved.startsWith(`${ROOT}${path.sep}`), `path leaves release root: ${relative}`);
  return resolved;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function loadMedicalAssetFiles(root = ROOT) {
  const manifestPath = path.join(root, ...MEDICAL_MANIFEST_FILE.split("/"));
  const readmePath = path.join(root, ...MEDICAL_README_FILE.split("/"));
  assert(fs.existsSync(manifestPath) && fs.lstatSync(manifestPath).isFile() && !fs.lstatSync(manifestPath).isSymbolicLink(),
    "medical illustration manifest must be a regular file");
  assert(fs.existsSync(readmePath) && fs.lstatSync(readmePath).isFile() && !fs.lstatSync(readmePath).isSymbolicLink(),
    "medical illustration README must be a regular file");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert(manifest.schemaVersion === 1 && Array.isArray(manifest.items) && manifest.items.length === 24,
    "medical illustration manifest must use schemaVersion 1 and contain exactly 24 items");
  const keys = new Set();
  const files = new Set();
  for (const item of manifest.items) {
    assert(item && /^[a-z0-9-]+$/.test(item.key || "") && !keys.has(item.key),
      `invalid or duplicate medical illustration key: ${item?.key}`);
    assert(/^assets\/medical\/[a-z0-9-]+\.webp$/.test(item.file || "") && !files.has(item.file),
      `${item.key}: invalid or duplicate medical illustration file`);
    assert(typeof item.alt === "string" && item.alt.length >= 16, `${item.key}: medical illustration alt is missing or too short`);
    const filePath = path.join(root, ...item.file.split("/"));
    assert(fs.existsSync(filePath) && fs.lstatSync(filePath).isFile() && !fs.lstatSync(filePath).isSymbolicLink(),
      `${item.key}: medical illustration must be a regular file`);
    assert(fs.statSync(filePath).size > 0, `${item.key}: medical illustration is empty`);
    keys.add(item.key);
    files.add(item.file);
  }
  return [MEDICAL_MANIFEST_FILE, MEDICAL_README_FILE, ...manifest.items.map((item) => item.file)];
}

function loadVisualAssetFiles(root = ROOT) {
  const directories = ["cities", "cities-mobile"];
  CityVisualContract.validateSourceRoot(root, { label: "service-worker source" });
  const files = [];
  for (const name of directories) {
    const directory = path.join(root, "assets", "visuals", name);
    assert(fs.existsSync(directory), `${name} visual asset directory is missing`);
    assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(),
      `${name} visual asset directory must be a regular directory`);
    const entries = fs.readdirSync(directory)
      .filter((entry) => /^(?:city-[a-z0-9-]+\.webp|manifest\.(?:json|js)|README\.md)$/.test(entry))
      .sort()
      .map((entry) => `assets/visuals/${name}/${entry}`);
    const cityWebps = entries.filter((relative) => /\/city-[a-z0-9-]+\.webp$/.test(relative));
    assert(cityWebps.length === 200, `service-worker ${name} pack must contain exactly 200 city WebP files; found ${cityWebps.length}`);
    files.push(...entries);
  }
  validateMobileCityAssets(root);
  return files;
}

function validateMobileCityAssets(root) {
  const mobileDirectory = path.join(root, "assets", "visuals", "cities-mobile");
  const primaryManifest = JSON.parse(fs.readFileSync(path.join(root, "assets", "visuals", "cities", "manifest.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(mobileDirectory, "manifest.json"), "utf8"));
  assert(manifest.schemaVersion === 1 && manifest.count === 200 && Array.isArray(manifest.items) && manifest.items.length === 200,
    "mobile city manifest must contain exactly 200 items");
  const primaryById = new Map(primaryManifest.items.map((entry) => [entry.id, entry]));
  const ids = new Set();
  for (const entry of manifest.items) {
    assert(/^city-[a-z0-9-]+$/.test(entry?.id || "") && !ids.has(entry.id), `invalid or duplicate mobile city id: ${entry?.id}`);
    assert(entry.path === `./assets/visuals/cities-mobile/${entry.id}.webp`, `${entry.id}: invalid mobile city path`);
    assert(entry.sourcePath === `./assets/visuals/cities/${entry.id}.webp`, `${entry.id}: invalid mobile city source path`);
    assert(entry.width === 480 && entry.height === 270, `${entry.id}: mobile city dimensions must be 480x270`);
    const primary = primaryById.get(entry.id);
    assert(primary && entry.sourceSha256 === primary.sha256, `${entry.id}: mobile city source SHA-256 mismatch`);
    const file = fs.readFileSync(path.join(mobileDirectory, `${entry.id}.webp`));
    assert(file.length === entry.bytes && sha256(file) === entry.sha256, `${entry.id}: mobile city byte/hash mismatch`);
    assert(file.length >= 12 && file.subarray(0, 4).toString("ascii") === "RIFF" && file.subarray(8, 12).toString("ascii") === "WEBP",
      `${entry.id}: mobile city file is not WebP`);
    ids.add(entry.id);
  }
}

function loadCatalogAssetFiles(root = ROOT) {
  const jsonRelative = "catalog-data/manifest.json";
  const scriptRelative = "catalog-data/manifest.js";
  const jsonPath = path.join(root, ...jsonRelative.split("/"));
  const scriptPath = path.join(root, ...scriptRelative.split("/"));
  assert(fs.existsSync(jsonPath) && fs.existsSync(scriptPath), "split catalog manifest files are missing");
  const manifest = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  assert(manifest.schemaVersion === 1 && manifest.total === 2200, "split catalog manifest is invalid");
  assert(Array.isArray(manifest.details?.chunks) && manifest.details.chunks.length === 44, "split catalog must contain 44 detail chunks");
  const records = [manifest.selection, manifest.selectionData, manifest.search, ...manifest.details.chunks];
  for (const record of records) {
    assert(record && /^(?:selection|search)\.[a-f0-9]{12}\.js$|^selection-data\.[a-f0-9]{12}\.json$|^details\/(?:book|movie|city|german|medical)-\d{3}\.[a-f0-9]{12}\.js$/.test(record.path || ""),
      `invalid split catalog path: ${record?.path}`);
    const relative = `catalog-data/${record.path}`;
    const bytes = fs.readFileSync(path.join(root, ...relative.split("/")));
    assert(bytes.length === record.bytes, `${relative}: split catalog byte length mismatch`);
    assert(sha256(bytes) === record.sha256, `${relative}: split catalog SHA-256 mismatch`);
    const integrity = `sha384-${crypto.createHash("sha384").update(bytes).digest("base64")}`;
    assert(integrity === record.integrity, `${relative}: split catalog SRI mismatch`);
  }
  return Object.freeze({
    manifest: Object.freeze(manifest),
    pointer: Object.freeze([scriptRelative, jsonRelative]),
    selection: `catalog-data/${manifest.selection.path}`,
    selectionData: `catalog-data/${manifest.selectionData.path}`,
    search: `catalog-data/${manifest.search.path}`,
    details: Object.freeze(manifest.details.chunks.map((record) => `catalog-data/${record.path}`))
  });
}

function renderAppShellBlock() {
  const entries = ["./", ...APP_SHELL_FILES].map((relative) => relative === "assets/audio/german/manifest.json"
    ? "  GERMAN_AUDIO_MANIFEST"
    : `  ${JSON.stringify(relative === "./" ? relative : `./${relative}`)}`);
  return `const APP_SHELL = Object.freeze([\n${entries.join(",\n")}\n]);`;
}

function normalizeAppShell(swText) {
  assert(APP_SHELL_PATTERN.test(swText), "sw.js has no APP_SHELL declaration");
  return swText.replace(APP_SHELL_PATTERN, renderAppShellBlock());
}

function validateNarrations() {
  const manifestPath = resolveInside("assets/audio/german/manifest.json");
  const lessonsPath = resolveInside("data/raw/german500.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const lessonsBytes = fs.readFileSync(lessonsPath);
  const lessons = JSON.parse(lessonsBytes.toString("utf8"));
  assert(manifest.count === 500 && Array.isArray(manifest.items) && manifest.items.length === 500,
    "German narration manifest must contain exactly 500 items");
  assert(Array.isArray(lessons) && lessons.length === 500, "German lesson pool must contain exactly 500 items");
  assert(manifest.source?.lessonsSha256 === sha256(lessonsBytes),
    "German narration manifest belongs to a different lesson-pool revision");
  assert(new Set(manifest.items.map((entry) => entry.id)).size === 500,
    "German narration manifest contains duplicate IDs");
  for (let index = 0; index < manifest.items.length; index += 1) {
    const entry = manifest.items[index];
    const lesson = lessons[index];
    assert(entry.id === lesson.id, `narration order/ID mismatch: ${entry.id}`);
    assert(entry.textSha256 === sha256(String(lesson.exampleGerman || "").trim()),
      `narration sentence hash mismatch: ${entry.id}`);
    assert(/^assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(entry.path),
      `invalid narration path: ${entry.path}`);
    const file = resolveInside(entry.path);
    assert(fs.existsSync(file), `narration is missing: ${entry.path}`);
    const bytes = fs.readFileSync(file);
    assert(bytes.length === entry.bytes, `narration size mismatch: ${entry.path}`);
    assert(sha256(bytes) === entry.sha256, `narration hash mismatch: ${entry.path}`);
  }
  return manifest;
}

function deploymentRevision(currentRoutingText) {
  const requested = REVISION_ARGUMENT ? REVISION_ARGUMENT.slice("--deployment-revision=".length) : null;
  const current = /const DEPLOYMENT_REVISION = "([^"]+)";/.exec(currentRoutingText)?.[1] || "";
  const revision = requested || current;
  assert(/^[a-f0-9]{40}$/.test(revision), "deployment revision must be a full 40-character lowercase Git commit");
  return revision;
}

function expectedAssetRouting(routingText, revision) {
  for (const [name, pattern] of Object.entries(ROUTING_PATTERNS)) assert(pattern.test(routingText), `asset-routing.js has no ${name} declaration`);
  const catalog = fs.readFileSync(resolveInside("catalog.js"));
  const integrity = `sha384-${crypto.createHash("sha384").update(catalog).digest("base64")}`;
  return routingText
    .replace(ROUTING_PATTERNS.revision, `const DEPLOYMENT_REVISION = "${revision}";`)
    .replace(ROUTING_PATTERNS.integrity, `const CATALOG_INTEGRITY = "${integrity}";`)
    .replace(ROUTING_PATTERNS.sha256, `const CATALOG_SHA256 = "${sha256(catalog)}";`)
    .replace(ROUTING_PATTERNS.bytes, `const CATALOG_BYTES = ${catalog.length};`);
}

function normalizedPackWorker(swText) {
  let value = swText.replace(VERSION_PATTERN, PLACEHOLDER_LINE);
  for (const [name, pattern] of Object.entries(PACK_VERSION_PATTERNS)) {
    assert(pattern.test(value), `sw.js has no ${name} pack version declaration`);
    value = value.replace(pattern, PACK_PLACEHOLDERS[name]);
  }
  assert(AUDIO_MANIFEST_HASH_PATTERN.test(value), "sw.js has no audio manifest SHA-256 declaration");
  return value.replace(AUDIO_MANIFEST_HASH_PATTERN, AUDIO_MANIFEST_HASH_PLACEHOLDER);
}

function fileBytes(relative, overrides) {
  if (overrides?.has(relative)) return Buffer.from(overrides.get(relative));
  const file = resolveInside(relative);
  assert(fs.existsSync(file), `pack file is missing: ${relative}`);
  return fs.readFileSync(file);
}

function digestFiles(namespace, files, overrides, prefix, normalizedWorker) {
  const digest = crypto.createHash("sha256");
  digest.update(`${namespace}\0`);
  if (normalizedWorker) digest.update(normalizedWorker);
  for (const relative of files) {
    digest.update(`\0${relative}\0`);
    digest.update(fileBytes(relative, overrides));
  }
  return `${prefix}-${digest.digest("hex").slice(0, 16)}`;
}

function expectedPackVersions(swText, narrationManifest, overrides) {
  const normalizedWorker = normalizedPackWorker(swText);
  const audioDigest = crypto.createHash("sha256");
  audioDigest.update("daily-atlas-audio-pack-v1\0");
  audioDigest.update(fileBytes("assets/audio/german/manifest.json", overrides));
  for (const entry of narrationManifest.items) audioDigest.update(`\0${entry.path}\0${entry.bytes}\0${entry.sha256}`);
  return Object.freeze({
    shell: digestFiles("daily-atlas-shell-pack-v1", SHELL_PACK_FILES, overrides, "s1", normalizedWorker),
    content: digestFiles("daily-atlas-content-pack-v1", CONTENT_FILES, overrides, "c1"),
    medical: digestFiles("daily-atlas-medical-pack-v1", MEDICAL_ASSET_FILES, overrides, "m1"),
    audio: `a1-${audioDigest.digest("hex").slice(0, 16)}`,
    search: digestFiles("daily-atlas-search-pack-v1", SEARCH_FILES, overrides, "q1"),
    visual: digestFiles("daily-atlas-visual-pack-v1", VISUAL_FILES, overrides, "i1")
  });
}

function applyPackVersions(swText, versions, audioManifestSha256) {
  let value = swText;
  for (const [name, pattern] of Object.entries(PACK_VERSION_PATTERNS)) {
    value = value.replace(pattern, `const ${name.toUpperCase()}_VERSION = "${versions[name]}";`);
  }
  return value.replace(AUDIO_MANIFEST_HASH_PATTERN, `const AUDIO_MANIFEST_SHA256 = "${audioManifestSha256}";`);
}

function expectedVersion(swText, narrationManifest, overrides) {
  assert(VERSION_PATTERN.test(swText), "sw.js has no CACHE_VERSION declaration");
  const normalizedWorker = swText.replace(VERSION_PATTERN, PLACEHOLDER_LINE);
  const digest = crypto.createHash("sha256");
  digest.update("daily-atlas-shell-v3\0");
  digest.update(normalizedWorker);
  for (const relative of SHELL_FILES) {
    digest.update(`\0${relative}\0`);
    digest.update(fileBytes(relative, overrides));
  }
  for (const entry of narrationManifest.items) digest.update(`\0${entry.path}\0${entry.sha256}`);
  return `v3-${digest.digest("hex").slice(0, 16)}`;
}

function main() {
  const manifest = validateNarrations();
  const currentRouting = fs.readFileSync(ASSET_ROUTING_PATH, "utf8");
  const revision = deploymentRevision(currentRouting);
  const expectedRouting = expectedAssetRouting(currentRouting, revision);
  const overrides = new Map([["asset-routing.js", Buffer.from(expectedRouting)]]);

  const currentWorker = fs.readFileSync(SW_PATH, "utf8");
  const normalizedShell = normalizeAppShell(currentWorker);
  const versions = expectedPackVersions(normalizedShell, manifest, overrides);
  const manifestHash = sha256(fileBytes("assets/audio/german/manifest.json", overrides));
  const versionedPacks = applyPackVersions(normalizedShell, versions, manifestHash);
  const releaseVersion = expectedVersion(versionedPacks, manifest, overrides);
  const expectedWorker = versionedPacks.replace(VERSION_PATTERN, `const CACHE_VERSION = "${releaseVersion}";`);

  if (CHECK_ONLY) {
    assert(currentRouting === expectedRouting, "asset-routing.js deployment revision or catalog verification metadata is stale");
    assert(currentWorker === expectedWorker, `sw.js pack declarations or release revision are stale; expected ${releaseVersion}`);
    console.log(`PASS: service-worker ${releaseVersion}; shell=${versions.shell}; content=${versions.content}; medical=${versions.medical}; audio=${versions.audio}; search=${versions.search}; visual=${versions.visual}`);
    return;
  }
  fs.writeFileSync(ASSET_ROUTING_PATH, expectedRouting, "utf8");
  fs.writeFileSync(SW_PATH, expectedWorker, "utf8");
  console.log(`PASS: wrote service-worker ${releaseVersion}; shell=${versions.shell}; content=${versions.content}; medical=${versions.medical}; audio=${versions.audio}; search=${versions.search}; visual=${versions.visual}`);
}

if (require.main === module) main();

module.exports = Object.freeze({
  APP_SHELL_PATTERN,
  APP_SHELL_FILES,
  AUDIO_METADATA_FILES,
  CATALOG_SPLIT,
  CONTENT_FILES,
  CORE_SHELL_FILES,
  MEDICAL_ASSET_FILES,
  VISUAL_ASSET_FILES,
  VISUAL_FILES,
  VISUAL_METADATA_FILES,
  SEARCH_FILES,
  SHELL_FILES,
  SHELL_PACK_FILES,
  applyPackVersions,
  expectedAssetRouting,
  expectedPackVersions,
  expectedVersion,
  loadMedicalAssetFiles,
  loadVisualAssetFiles,
  loadCatalogAssetFiles,
  normalizeAppShell,
  renderAppShellBlock
});
