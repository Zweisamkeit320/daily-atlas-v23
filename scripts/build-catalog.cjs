const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.join(ROOT, "data");
const SOURCE_PATH = path.join(DATA_ROOT, "catalog.source.json");
const OUTPUT_PATH = path.join(ROOT, "catalog.js");
const PACKAGE_PATH = path.join(ROOT, "package.json");
const SPLIT_OUTPUT_ROOT = path.join(ROOT, "catalog-data");
const MEDICAL_VISUAL_MANIFEST_PATH = path.join(ROOT, "assets", "medical", "manifest.json");
const CHECK_ONLY = process.argv.includes("--check");
const EXPECTED_COUNTS = Object.freeze({ books: 500, movies: 500, cities: 200, german: 500, medical: 500 });
const MEDIA_GENRES = Object.freeze(["history", "mystery", "scifi"]);
const PRIMARY_GENRE_MINIMUM = 40;
const POPULARITY_TIERS = Object.freeze(["classic", "mid", "underseen"]);
const CONTENT_TYPES = Object.freeze({ books: "book", movies: "movie", cities: "city", german: "german", medical: "medical" });
const COLLECTION_BY_TYPE = Object.freeze(Object.fromEntries(Object.entries(CONTENT_TYPES).map(([collection, type]) => [type, collection])));
const DETAIL_CHUNK_SIZE = 50;
const SPLIT_SCHEMA_VERSION = 1;

const catalog = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex").toUpperCase();
}

function resolveInside(base, relativePath, label) {
  assert(hasText(relativePath), `${label} path is missing`);
  const resolved = path.resolve(base, relativePath);
  assert(resolved === base || resolved.startsWith(`${base}${path.sep}`), `${label} path leaves its allowed directory`);
  return resolved;
}

function loadMedicalVisuals() {
  const manifest = JSON.parse(fs.readFileSync(MEDICAL_VISUAL_MANIFEST_PATH, "utf8"));
  assert(manifest.schemaVersion === 1, "medical illustration manifest must use schemaVersion 1");
  assert(Array.isArray(manifest.items) && manifest.items.length === 24, "medical illustration manifest must contain exactly 24 items");
  const visuals = new Map();
  const files = new Set();
  for (const item of manifest.items) {
    assert(/^[a-z0-9-]+$/.test(item.key || ""), "medical illustration key is invalid");
    assert(!visuals.has(item.key), `duplicate medical illustration key: ${item.key}`);
    assert(/^assets\/medical\/[a-z0-9-]+\.webp$/.test(item.file || ""), `${item.key}: invalid medical illustration file`);
    assert(!files.has(item.file), `${item.key}: duplicate medical illustration file`);
    assert([item.topicGroup, item.imageTheme, item.alt].every(hasText), `${item.key}: medical illustration metadata is incomplete`);
    const imagePath = resolveInside(ROOT, item.file, `${item.key} illustration`);
    assert(fs.existsSync(imagePath), `${item.key}: medical illustration file is missing`);
    visuals.set(item.key, item);
    files.add(item.file);
  }
  return visuals;
}

const MEDICAL_VISUALS = loadMedicalVisuals();

function normalizedText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function assertUnique(items, selector, label) {
  const values = items.map(selector);
  assert(values.every(hasText), `${label} contains an empty value`);
  assert(new Set(values).size === values.length, `${label} contains duplicates`);
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function expectedBookTier(count) {
  return count >= 80 ? "classic" : count >= 40 ? "mid" : "underseen";
}

function expectedMovieTier(count) {
  return count > 500000 ? "classic" : count > 100000 ? "mid" : "underseen";
}

function validateAuditFiles() {
  assert(catalog.sourceAudit && typeof catalog.sourceAudit === "object", "sourceAudit is required");
  for (const key of Object.keys(EXPECTED_COUNTS)) {
    const audit = catalog.sourceAudit[key];
    assert(audit && hasText(audit.file) && /^[A-F0-9]{64}$/.test(audit.sha256), `${key} source audit is invalid`);
    const rawPath = resolveInside(DATA_ROOT, audit.file, `${key} source`);
    assert(fs.existsSync(rawPath), `${key} source file is missing: ${audit.file}`);
    assert(sha256File(rawPath) === audit.sha256, `${key} source hash mismatch: ${audit.file}`);
  }

  const upstream = catalog.upstreamAudit;
  assert(upstream && hasText(upstream.pointerFile) && hasText(upstream.manifest), "upstreamAudit is incomplete");
  assert(/^[A-F0-9]{64}$/.test(upstream.pointerSha256), "upstream pointer hash is invalid");
  assert(/^[A-F0-9]{64}$/.test(upstream.manifestSha256), "upstream manifest hash is invalid");
  const pointerPath = resolveInside(DATA_ROOT, upstream.pointerFile, "upstream pointer");
  const manifestPath = resolveInside(ROOT, upstream.manifest, "upstream manifest");
  assert(fs.existsSync(pointerPath), "upstream pointer file is missing");
  assert(fs.existsSync(manifestPath), "upstream manifest file is missing");
  assert(sha256File(pointerPath) === upstream.pointerSha256, "upstream pointer hash mismatch");
  assert(sha256File(manifestPath) === upstream.manifestSha256, "upstream manifest hash mismatch");
  const pointer = JSON.parse(fs.readFileSync(pointerPath, "utf8"));
  assert(pointer.manifest === upstream.manifest && pointer.sha256 === upstream.manifestSha256, "upstream pointer and catalog audit disagree");

  const mediaExpansion = upstream.mediaExpansion;
  assert(mediaExpansion && hasText(mediaExpansion.pointerFile) && hasText(mediaExpansion.manifest), "media expansion upstream audit is incomplete");
  assert(/^[A-F0-9]{64}$/.test(mediaExpansion.pointerSha256), "media expansion pointer hash is invalid");
  assert(/^[A-F0-9]{64}$/.test(mediaExpansion.manifestSha256), "media expansion manifest hash is invalid");
  const mediaPointerPath = resolveInside(DATA_ROOT, mediaExpansion.pointerFile, "media expansion pointer");
  const mediaManifestPath = resolveInside(ROOT, mediaExpansion.manifest, "media expansion manifest");
  assert(fs.existsSync(mediaPointerPath), "media expansion pointer file is missing");
  assert(fs.existsSync(mediaManifestPath), "media expansion manifest file is missing");
  assert(sha256File(mediaPointerPath) === mediaExpansion.pointerSha256, "media expansion pointer hash mismatch");
  assert(sha256File(mediaManifestPath) === mediaExpansion.manifestSha256, "media expansion manifest hash mismatch");
  const mediaPointer = JSON.parse(fs.readFileSync(mediaPointerPath, "utf8"));
  assert(mediaPointer.manifest === mediaExpansion.manifest && mediaPointer.sha256 === mediaExpansion.manifestSha256,
    "media expansion pointer and catalog audit disagree");
}

function validateCommon() {
  assert(catalog.schemaVersion === 4, "catalog schemaVersion must be 4");
  assert(catalog.appVersion === packageJson.version,
    `catalog appVersion ${catalog.appVersion} must match package version ${packageJson.version}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(catalog.snapshotDate), "catalog snapshotDate is invalid");
  assert(Array.isArray(catalog.themes) && catalog.themes.length >= 7, "catalog themes are incomplete");
  assert(Array.isArray(catalog.dailyThemeIds) && catalog.dailyThemeIds.length >= 7, "daily theme cycle is incomplete");
  const themeIds = new Set(catalog.themes.map((theme) => theme.id));
  assert(themeIds.size === catalog.themes.length, "catalog themes contain duplicate IDs");
  assert(catalog.themes.every((theme) => hasText(theme.id) && hasText(theme.label) && hasText(theme.summary)), "catalog theme text is incomplete");
  assert(catalog.dailyThemeIds.every((id) => themeIds.has(id)), "daily theme cycle references an unknown theme");
  const runtimeBytes = Buffer.byteLength(JSON.stringify(catalog, null, 2), "utf8");
  assert(runtimeBytes <= 4 * 1024 * 1024,
    `runtime catalog exceeds the 4 MiB mobile parse budget (${runtimeBytes} bytes); keep audit-only fields in data/raw`);

  const allIds = [];
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    const items = catalog[key];
    assert(Array.isArray(items), `${key} must be an array`);
    assert(items.length === expected, `${key} must contain exactly ${expected} items; got ${items.length}`);
    assertUnique(items, (item) => item.id, `${key} IDs`);
    assert(items.every((item) => item.type === CONTENT_TYPES[key]), `${key} contains an invalid type`);
    assert(items.every((item) => /^https:\/\//.test(item.sourceUrl)), `${key} contains an invalid source URL`);
    assert(items.every((item) => Array.isArray(item.themeTags)
      && new Set(item.themeTags).size === item.themeTags.length
      && item.themeTags.every((tag) => themeIds.has(tag))), `${key} contains invalid theme tags`);
    allIds.push(...items.map((item) => item.id));
  }
  assert(new Set(allIds).size === allIds.length, "content IDs must be globally unique");

  for (const themeId of catalog.dailyThemeIds) {
    for (const key of Object.keys(EXPECTED_COUNTS)) {
      assert(catalog[key].some((item) => item.themeTags.includes(themeId)), `${key} has no item for daily theme ${themeId}`);
    }
  }

  for (const item of [...catalog.books, ...catalog.movies]) {
    assert(!Object.hasOwn(item, "metadataAudit") && !Object.hasOwn(item, "editorialReview") && !Object.hasOwn(item, "evidenceNote"),
      `${item.id} leaks audit-only metadata into the mobile runtime catalog`);
  }
}

function validateMedia(items, type) {
  const isBook = type === "book";
  const label = isBook ? "books" : "movies";
  const idPattern = isBook ? /^\/works\/OL\d+W$/ : /^tt\d{7,10}$/;

  for (const item of items) {
    assert(idPattern.test(item.id), `${label} has an invalid stable ID: ${item.id}`);
    assert(MEDIA_GENRES.includes(item.genre), `${item.id} has an invalid primary genre`);
    assert(Array.isArray(item.genres) && item.genres.includes(item.genre) && item.genres.every((genre) => MEDIA_GENRES.includes(genre)), `${item.id} has invalid genres`);
    assert(hasText(item.title) && hasText(item.creator) && hasText(item.summary) && hasText(item.reason) && hasText(item.audience), `${item.id} is missing editorial text`);
    assert(Array.isArray(item.tags) && item.tags.length >= 2, `${item.id} needs at least two tags`);
    assert(["editorial-curated", "editorial-reviewed", "evidence-reviewed"].includes(item.curationLevel), `${item.id} has an invalid curation boundary`);
    if (isBook) {
      assert(item.rating && item.rating.source === "Open Library" && item.rating.max === 5, `${item.id} has an invalid book rating source or scale`);
      assert(Number.isFinite(item.rating.value) && item.rating.value >= 4, `${item.id} fails the book rating threshold`);
      assert(Number.isInteger(item.rating.count) && item.rating.count >= 20, `${item.id} fails the book rating-count threshold`);
      assert(/^\d{4}-\d{2}-\d{2}$/.test(item.rating.snapshot), `${item.id} has an invalid book rating snapshot`);
      assert(item.popularityTier === expectedBookTier(item.rating.count), `${item.id} has an inconsistent book popularity tier`);
      assert(Array.isArray(item.ratings) && item.ratings.length === 1 && item.ratings[0].source === "Open Library", `${item.id} book ratings array is inconsistent`);
      assert(!item.ratings.some((rating) => /douban|豆瓣/i.test(String(rating.source))), `${item.id} contains unauthorized Douban data`);
      assert(/^https:\/\//.test(item.image), `${item.id} has no book-cover reference`);
    } else {
      assert(item.qualityGate === "editorial-qualified", `${item.id} has no frozen editorial qualification`);
      assert(!Object.hasOwn(item, "rating") && !Object.hasOwn(item, "ratings"), `${item.id} exposes restricted movie rating data`);
      assert(new URL(item.image).hostname === "images.metahub.space" && new URL(item.image).pathname === `/poster/medium/${item.id}/img`,
        `${item.id} has a non-canonical dormant movie-poster reference`);
      assert(["classic", "mid", "underseen"].includes(item.popularityTier), `${item.id} has an invalid editorial visibility tier`);
    }
    if (["editorial-reviewed", "evidence-reviewed"].includes(item.curationLevel)) {
      assert(typeof item.standaloneFriendly === "boolean", `${item.id} is missing its standalone-reading/viewing assessment`);
    }
    assert(item.series !== "系列关系待核", `${item.id} exposes an unresolved series placeholder`);
    if (item.series != null) {
      assert(hasText(item.series), `${item.id} has an invalid series name`);
      assert(item.installment == null || (Number.isInteger(item.installment) && item.installment > 0) || hasText(item.installment),
        `${item.id} has an invalid series installment`);
      assert(typeof item.standaloneFriendly === "boolean", `${item.id} has series metadata without a standalone assessment`);
      if (!item.standaloneFriendly) assert(hasText(item.prerequisite), `${item.id} needs a series prerequisite`);
    } else {
      assert(item.installment == null, `${item.id} has an installment without a series`);
      assert(item.standaloneFriendly !== false, `${item.id} is marked non-standalone without a resolved series`);
    }
  }

  const primaryCounts = countBy(items, (item) => item.genre);
  for (const genre of MEDIA_GENRES) {
    assert((primaryCounts[genre] || 0) >= PRIMARY_GENRE_MINIMUM, `${label} primary ${genre} count must be at least ${PRIMARY_GENRE_MINIMUM}`);
  }
  const curationCounts = countBy(items, (item) => item.curationLevel);
  assert(curationCounts["editorial-curated"] === 50 && curationCounts["editorial-reviewed"] === 150
    && curationCounts["evidence-reviewed"] === 300 && !curationCounts["source-screened"],
  `${label} curation boundary must be 50 editorial-curated + 150 editorial-reviewed + 300 evidence-reviewed`);
  assertUnique(items, (item) => `${normalizedText(item.title)}|${normalizedText(item.creator)}`, `${label} title/creator pairs`);
  assertUnique(items, (item) => normalizedText(item.summary), `${label} summaries`);
  const editorialReviewed = items.filter((item) => item.curationLevel === "editorial-reviewed");
  const reviewed = items.filter((item) => ["editorial-reviewed", "evidence-reviewed"].includes(item.curationLevel));
  assertUnique(reviewed, (item) => normalizedText(item.reason), `${label} reviewed reasons`);
  assert(!editorialReviewed.some((item) => /^Open Library\b/i.test(item.summary) || /\bCinemeta\b/i.test(item.summary) || /\bCinemeta\b/i.test(item.reason)),
    `${label} reviewed copy contains a source-screening template`);

  const creatorCounts = countBy(items, (item) => normalizedText(item.creator));
  assert(Object.keys(creatorCounts).length >= 130, `${label} needs at least 130 distinct creator labels`);
  const creatorMaximum = isBook ? 11 : 10;
  assert(Math.max(...Object.values(creatorCounts)) <= creatorMaximum, `${label} has more than ${creatorMaximum} items from one creator label`);
  const popularityCounts = countBy(items, (item) => item.popularityTier);
  assert(POPULARITY_TIERS.every((tier) => popularityCounts[tier] > 0), `${label} is missing a popularity tier`);
  if (!isBook) {
    assert(popularityCounts.underseen >= 40 && popularityCounts.mid >= 80, "movies are too concentrated in mainstream titles");
  }
}

function validateCities() {
  const regions = new Set();
  for (const item of catalog.cities) {
    assert(/^city-[a-z0-9-]+$/.test(item.id), `invalid city ID: ${item.id}`);
    assert([item.cityZh, item.cityEn, item.countryZh, item.countryEn, item.countryCode, item.region, item.summary, item.bestFor, item.seasonNote, item.culturalTip].every(hasText), `${item.id} is missing city text`);
    assert(/^[A-Z]{2}$/.test(item.countryCode), `${item.id} has an invalid country code`);
    assert(Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90, `${item.id} has an invalid latitude`);
    assert(Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180, `${item.id} has an invalid longitude`);
    assert(hasText(item.timezone), `${item.id} is missing a time zone`);
    try { new Intl.DateTimeFormat("en", { timeZone: item.timezone }).format(); } catch { assert(false, `${item.id} has an invalid IANA time zone`); }
    assert(Array.isArray(item.highlights) && item.highlights.length === 3 && item.highlights.every(hasText), `${item.id} must have three highlights`);
    assert(item.visual?.type === "procedural-svg" && Array.isArray(item.visual.palette) && item.visual.palette.length >= 2, `${item.id} has an invalid local visual`);
    regions.add(item.region);
  }
  assert(regions.size >= 6, "cities must cover at least six world regions");
  assertUnique(catalog.cities, (item) => normalizedText(`${item.cityEn}|${item.countryEn}`), "city/country pairs");
}

function validateGerman() {
  const levels = new Set();
  const kinds = new Set();
  const narrationManifestPath = path.join(ROOT, "assets", "audio", "german", "manifest.json");
  const narrationLicensePath = path.join(ROOT, "assets", "audio", "german", "LICENSE-M-AILABS.txt");
  assert(fs.existsSync(narrationManifestPath), "German narration manifest is missing");
  assert(fs.existsSync(narrationLicensePath) && fs.statSync(narrationLicensePath).size > 100, "German narration data-license notice is missing");
  const narrationManifest = JSON.parse(fs.readFileSync(narrationManifestPath, "utf8"));
  assert(narrationManifest.count === 500 && Array.isArray(narrationManifest.items) && narrationManifest.items.length === 500, "German narration manifest must contain exactly 500 items");
  assert(narrationManifest.voice?.model === "de_DE-eva_k-x_low" && narrationManifest.voice?.speakerPresentation === "female", "German narration voice declaration is invalid");
  assert(narrationManifest.source?.lessonsSha256 === catalog.sourceAudit.german.sha256, "German narration was built from a different lesson-pool revision");
  assert(narrationManifest.source?.field === "exampleGerman", "German narration manifest names the wrong spoken field");
  assert(narrationManifest.items.every((entry, index) => entry.id === catalog.german[index].id), "German narration order/IDs do not match the lesson pool");
  const narrationById = new Map(narrationManifest.items.map((entry) => [entry.id, entry]));
  let narrationBytes = 0;
  let narrationDurationMs = 0;
  for (const item of catalog.german) {
    assert(/^de-[a-z0-9-]+$/.test(item.id), `invalid German ID: ${item.id}`);
    assert([item.kind, item.german, item.chinese, item.explanation, item.exampleGerman, item.exampleChinese, item.level].every(hasText), `${item.id} is missing German lesson text`);
    assert(["词汇", "表达", "语法"].includes(item.kind), `${item.id} has an invalid lesson kind`);
    assert(["A1", "A2", "B1", "B2"].includes(item.level), `${item.id} has an invalid CEFR level`);
    assert(/[A-Za-zÄÖÜäöüß]/.test(item.exampleGerman) && /[\u3400-\u9fff]/u.test(item.exampleChinese), `${item.id} example pair is invalid`);
    assert(item.narration?.kind === "bundled-synthetic-female" && item.narration.voice === "de_DE-eva_k-x_low", `${item.id} has an invalid narration declaration`);
    assert(item.narration.src === `./assets/audio/german/${item.id}.mp3`, `${item.id} narration path is invalid`);
    const narrationEntry = narrationById.get(item.id);
    assert(narrationEntry && narrationEntry.path === item.narration.src.replace(/^\.\//, ""), `${item.id} is absent from the narration manifest`);
    assert(narrationEntry.textSha256 === sha256Text(item.exampleGerman.trim()), `${item.id} narration text hash does not match its visible German example`);
    assert(Number.isInteger(narrationEntry.durationMs) && narrationEntry.durationMs >= 250 && narrationEntry.durationMs <= 30000, `${item.id} narration duration is implausible`);
    const narrationPath = resolveInside(ROOT, item.narration.src.replace(/^\.\//, ""), `${item.id} narration`);
    assert(fs.existsSync(narrationPath), `${item.id} narration file is missing`);
    assert(fs.statSync(narrationPath).size === narrationEntry.bytes && sha256File(narrationPath) === narrationEntry.sha256, `${item.id} narration integrity check failed`);
    narrationBytes += narrationEntry.bytes;
    narrationDurationMs += narrationEntry.durationMs;
    levels.add(item.level);
    kinds.add(item.kind);
  }
  assert(narrationBytes === narrationManifest.totalBytes && narrationDurationMs === narrationManifest.totalDurationMs, "German narration manifest totals are inconsistent");
  assert(levels.size === 4 && kinds.size === 3, "German pool must cover A1-B2 and vocabulary/expression/grammar");
  assertUnique(catalog.german, (item) => normalizedText(item.german), "German lesson prompts");
  assertUnique(catalog.german, (item) => normalizedText(item.exampleGerman), "German example sentences");
}

function validateMedical() {
  const topicGroups = new Set();
  const riskLevels = new Set(["general", "caution", "urgent"]);
  const illustrationCounts = new Map();
  for (const item of catalog.medical) {
    assert(/^medical-[a-z0-9-]+$/.test(item.id), `invalid medical ID: ${item.id}`);
    assert([item.topicGroup, item.topic, item.title, item.summary, item.action, item.limitsOrRedFlags, item.sourceName, item.alt, item.imageTheme, item.illustrationKey].every(hasText), `${item.id} is missing a medical safety field`);
    assert(riskLevels.has(item.riskLevel), `${item.id} has an invalid risk level`);
    const visual = MEDICAL_VISUALS.get(item.illustrationKey);
    assert(visual, `${item.id} uses an illustrationKey absent from the manifest`);
    assert(visual.topicGroup === item.topicGroup && visual.imageTheme === item.imageTheme, `${item.id} illustration metadata does not match its medical group`);
    assert(item.image === `./${visual.file}`, `${item.id} image path does not match the illustration manifest`);
    assert(item.alt === visual.alt, `${item.id} alt does not match the illustration manifest`);
    const imagePath = resolveInside(ROOT, item.image.replace(/^\.\//, ""), `${item.id} image`);
    assert(fs.existsSync(imagePath), `${item.id} image is missing`);
    illustrationCounts.set(item.illustrationKey, (illustrationCounts.get(item.illustrationKey) || 0) + 1);
    topicGroups.add(item.topicGroup);
  }
  assert(topicGroups.size >= 12, "medical pool must cover at least 12 topic groups");
  assert(illustrationCounts.size === 24, `medical pool must use all 24 illustrations, got ${illustrationCounts.size}`);
  for (const [key, count] of illustrationCounts) {
    assert(count >= 5 && count <= 40, `${key} must be used by 5-40 medical items, got ${count}`);
  }
  assertUnique(catalog.medical, (item) => normalizedText(item.title), "medical titles");
  assertUnique(catalog.medical, (item) => normalizedText(item.summary), "medical summaries");
}

function validate() {
  validateAuditFiles();
  validateCommon();
  validateMedia(catalog.books, "book");
  validateMedia(catalog.movies, "movie");
  validateCities();
  validateGerman();
  validateMedical();
}

function buildOutput() {
  const payload = JSON.stringify(catalog, null, 2);
  return `/* Generated from data/catalog.source.json. Run node scripts/build-catalog.cjs to rebuild. */\n(function (global) {\n  "use strict";\n  const catalog = ${payload};\n  global.DAILY_ATLAS_CATALOG = Object.freeze(catalog);\n  global.DAILY_DUET_CATALOG = global.DAILY_ATLAS_CATALOG;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
}

function sha384Integrity(value) {
  return `sha384-${crypto.createHash("sha384").update(value).digest("base64")}`;
}

function assetRecord(relativePath, content, extra = {}) {
  const bytes = Buffer.from(content, "utf8");
  return Object.freeze({
    path: relativePath.replaceAll(path.sep, "/"),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    integrity: sha384Integrity(bytes),
    ...extra
  });
}

function contentNamedPath(prefix, content, extension = "js") {
  const digest = crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 12);
  return `${prefix}.${digest}.${extension}`;
}

function renderDetailChunk(chunkId, items, contentVersion) {
  return `/* Generated detail chunk ${chunkId}; do not edit. */\n(function (root, factory) {\n  "use strict";\n  const value = factory();\n  if (typeof module === "object" && module.exports) module.exports = value;\n  const versions = root.DAILY_ATLAS_DETAIL_CHUNKS || (root.DAILY_ATLAS_DETAIL_CHUNKS = Object.create(null));\n  const registry = versions[${JSON.stringify(contentVersion)}] || (versions[${JSON.stringify(contentVersion)}] = Object.create(null));\n  registry[${JSON.stringify(chunkId)}] = value;\n})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n  "use strict";\n  return Object.freeze(${JSON.stringify(items)}.map(Object.freeze));\n});\n`;
}

function buildDetailChunks(contentVersion) {
  const files = new Map();
  const chunks = [];
  const chunkByKey = new Map();
  for (const [collection, type] of Object.entries(CONTENT_TYPES)) {
    const items = catalog[collection];
    for (let offset = 0; offset < items.length; offset += DETAIL_CHUNK_SIZE) {
      const index = Math.floor(offset / DETAIL_CHUNK_SIZE);
      const chunkItems = items.slice(offset, offset + DETAIL_CHUNK_SIZE);
      const chunkId = `${type}-${String(index).padStart(3, "0")}`;
      const content = renderDetailChunk(chunkId, chunkItems, contentVersion);
      const relativePath = contentNamedPath(`details/${chunkId}`, content);
      const record = assetRecord(relativePath, content, {
        id: chunkId,
        type,
        count: chunkItems.length,
        firstId: chunkItems[0].id,
        lastId: chunkItems.at(-1).id
      });
      files.set(relativePath, content);
      chunks.push(record);
      for (const item of chunkItems) chunkByKey.set(`${type}:${item.id}`, chunkId);
    }
  }
  return { files, chunks, chunkByKey };
}

function buildSelectionRows(chunkByKey) {
  const mediaVisualRef = (item, type) => {
    if (type === "book") {
      const match = /^https:\/\/covers\.openlibrary\.org\/b\/id\/(\d+)-(?:S|M|L)\.jpg(?:\?.*)?$/i.exec(item.image);
      assert(match, `${item.id} cannot provide a compact Open Library cover reference`);
      return match[1];
    }
    return null;
  };
  return Object.freeze({
    book: catalog.books.map((item) => Object.freeze([
      item.id, item.title, item.year, item.genres, item.tags, item.themeTags,
      item.popularityTier, item.curationLevel, item.rating.value, item.rating.count,
      chunkByKey.get(`book:${item.id}`), mediaVisualRef(item, "book")
    ])),
    movie: catalog.movies.map((item) => Object.freeze([
      item.id, item.title, item.year, item.genres, item.tags, item.themeTags,
      item.popularityTier, item.curationLevel, null, null,
      chunkByKey.get(`movie:${item.id}`), mediaVisualRef(item, "movie")
    ])),
    city: catalog.cities.map((item) => Object.freeze([
      item.id, item.title, item.countryZh, item.region, item.themeTags,
      chunkByKey.get(`city:${item.id}`)
    ])),
    german: catalog.german.map((item) => Object.freeze([
      item.id, item.german, item.kind, item.level, item.themeTags,
      chunkByKey.get(`german:${item.id}`)
    ])),
    medical: catalog.medical.map((item) => Object.freeze([
      item.id, item.title, item.topicGroup, item.topic, item.themeTags,
      chunkByKey.get(`medical:${item.id}`)
    ]))
  });
}

function renderSelectionModule(rows, selectionVersion, contentVersion) {
  const metadata = {
    schemaVersion: catalog.schemaVersion,
    splitSchemaVersion: SPLIT_SCHEMA_VERSION,
    snapshotDate: catalog.snapshotDate,
    contentVersion,
    selectionVersion,
    themes: catalog.themes,
    dailyThemeIds: catalog.dailyThemeIds,
    selectionPolicy: catalog.selectionPolicy
  };
  return `/* Generated compact selection catalog; detail text lives in catalog-data/details. */\n(function (root, factory) {\n  "use strict";\n  const value = factory();\n  if (typeof module === "object" && module.exports) module.exports = value;\n  root.DAILY_ATLAS_SELECTION_CATALOG = value;\n})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n  "use strict";\n  const metadata = ${JSON.stringify(metadata)};\n  const rows = ${JSON.stringify(rows)};\n  const placeholder = ".";\n  function media(type, row) {\n    const isBook = type === "book";\n    return Object.freeze({ id: row[0], type, title: row[1], year: row[2], genres: Object.freeze(row[3]), genre: row[3][0],\n      tags: Object.freeze(row[4]), themeTags: Object.freeze(row[5]), popularityTier: row[6], curationLevel: row[7],\n      rating: Object.freeze({ source: isBook ? "Open Library" : "IMDb", value: row[8], max: isBook ? 5 : 10, count: row[9] }),\n      sourceUrl: "https://selection.invalid/", image: placeholder, detailChunk: row[10], selectionOnly: true });\n  }\n  function city(row) {\n    return Object.freeze({ id: row[0], type: "city", title: row[1], countryZh: row[2], region: row[3],\n      themeTags: Object.freeze(row[4]), sourceUrl: "https://selection.invalid/", summary: placeholder,\n      highlights: Object.freeze([placeholder, placeholder, placeholder]), detailChunk: row[5], selectionOnly: true });\n  }\n  function german(row) {\n    return Object.freeze({ id: row[0], type: "german", title: row[1], german: row[1], kind: row[2], level: row[3],\n      themeTags: Object.freeze(row[4]), sourceUrl: "https://selection.invalid/", chinese: placeholder, explanation: placeholder,\n      exampleGerman: placeholder, exampleChinese: placeholder, detailChunk: row[5], selectionOnly: true });\n  }\n  function medical(row) {\n    return Object.freeze({ id: row[0], type: "medical", title: row[1], topicGroup: row[2], topic: row[3],\n      themeTags: Object.freeze(row[4]), sourceUrl: "https://selection.invalid/", summary: placeholder, action: placeholder,\n      limitsOrRedFlags: placeholder, image: placeholder, alt: placeholder, detailChunk: row[5], selectionOnly: true });\n  }\n  const value = { ...metadata,\n    books: Object.freeze(rows.book.map((row) => media("book", row))),\n    movies: Object.freeze(rows.movie.map((row) => media("movie", row))),\n    cities: Object.freeze(rows.city.map(city)),\n    german: Object.freeze(rows.german.map(german)),\n    medical: Object.freeze(rows.medical.map(medical))\n  };\n  return Object.freeze(value);\n});\n`;
}

function addCompactMediaVisuals(source) {
  const qualificationMarker = 'rating: Object.freeze({ source: isBook ? "Open Library" : "IMDb", value: row[8], max: isBook ? 5 : 10, count: row[9] }),';
  const qualificationReplacement = '...(isBook ? { rating: Object.freeze({ source: "Open Library", value: row[8], max: 5, count: row[9] }) } : { qualityGate: "editorial-qualified" } ),';
  const marker = 'sourceUrl: "https://selection.invalid/", image: placeholder, detailChunk: row[10], selectionOnly: true';
  const replacement = 'sourceUrl: "https://selection.invalid/", image: isBook ? "https://covers.openlibrary.org/b/id/" + row[11] + "-M.jpg?default=false" : "https://images.metahub.space/poster/medium/" + row[0] + "/img", detailChunk: row[10], selectionOnly: true';
  assert(source.includes(qualificationMarker), "compact media qualification injection marker is missing");
  assert(source.includes(marker), "compact media visual injection marker is missing");
  return source.replace(qualificationMarker, qualificationReplacement).replace(marker, replacement);
}

function buildSearchRows(chunkByKey) {
  const Engine = require(path.join(ROOT, "engine.js"));
  const Explore = require(path.join(ROOT, "explore.js"));
  const index = Explore.buildIndex(catalog, Engine);
  assert(index.entries.length === 2200, `search source must contain 2,200 qualified items; got ${index.entries.length}`);
  const rows = Object.fromEntries(Object.values(CONTENT_TYPES).map((type) => [type, []]));
  for (const entry of index.entries) {
    rows[entry.type].push(Object.freeze([
      entry.item.id, entry.title, entry.normalizedTitle, entry.text, entry.genres,
      entry.era, entry.region, entry.ratingPercent, entry.level, entry.medicalTopic,
      Number(entry.item.year) || 0, chunkByKey.get(entry.key)
    ]));
  }
  return Object.freeze(rows);
}

function renderSearchModule(rows, searchVersion, contentVersion) {
  return `/* Generated delayed search index; loaded only when exploration begins. */\n(function (root, factory) {\n  "use strict";\n  const value = factory();\n  if (typeof module === "object" && module.exports) module.exports = value;\n  root.DAILY_ATLAS_SEARCH_INDEX = value;\n})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n  "use strict";\n  const rows = ${JSON.stringify(rows)};\n  const order = Object.freeze({ book: 0, movie: 1, city: 2, german: 3, medical: 4 });\n  const entries = [];\n  const counts = {};\n  for (const type of Object.keys(order)) {\n    counts[type] = rows[type].length;\n    for (const row of rows[type]) entries.push(Object.freeze({\n      key: type + ":" + row[0], type, typeOrder: order[type], item: Object.freeze({ id: row[0], year: row[10] }),\n      title: row[1], normalizedTitle: row[2], text: row[3], genres: Object.freeze(row[4]), era: row[5], region: row[6],\n      ratingPercent: row[7], level: row[8], medicalTopic: row[9], detailChunk: row[11]\n    }));\n  }\n  return Object.freeze({ schemaVersion: ${SPLIT_SCHEMA_VERSION}, contentVersion: ${JSON.stringify(contentVersion)},\n    searchVersion: ${JSON.stringify(searchVersion)}, count: entries.length, counts: Object.freeze(counts), entries: Object.freeze(entries) });\n});\n`;
}

function buildSplitOutputs() {
  const files = new Map();
  const contentVersion = sha256Text(JSON.stringify({
    schemaVersion: catalog.schemaVersion,
    snapshotDate: catalog.snapshotDate,
    themes: catalog.themes,
    dailyThemeIds: catalog.dailyThemeIds,
    selectionPolicy: catalog.selectionPolicy,
    books: catalog.books,
    movies: catalog.movies,
    cities: catalog.cities,
    german: catalog.german,
    medical: catalog.medical
  })).slice(0, 16).toLowerCase();
  const detail = buildDetailChunks(contentVersion);
  for (const [relativePath, content] of detail.files) files.set(relativePath, content);

  const selectionRows = buildSelectionRows(detail.chunkByKey);
  const selectionVersion = sha256Text(JSON.stringify({ contentVersion, rows: selectionRows })).slice(0, 16).toLowerCase();
  const selectionContent = addCompactMediaVisuals(renderSelectionModule(selectionRows, selectionVersion, contentVersion));
  const selectionPath = contentNamedPath("selection", selectionContent);
  files.set(selectionPath, selectionContent);
  const selectionAsset = assetRecord(selectionPath, selectionContent, { version: selectionVersion, count: 2200 });
  const selectionDataContent = `${JSON.stringify({
    metadata: {
      schemaVersion: catalog.schemaVersion,
      splitSchemaVersion: SPLIT_SCHEMA_VERSION,
      snapshotDate: catalog.snapshotDate,
      contentVersion,
      selectionVersion,
      themes: catalog.themes,
      dailyThemeIds: catalog.dailyThemeIds,
      selectionPolicy: catalog.selectionPolicy
    },
    rows: selectionRows
  })}\n`;
  const selectionDataPath = contentNamedPath("selection-data", selectionDataContent, "json");
  files.set(selectionDataPath, selectionDataContent);
  const selectionDataAsset = assetRecord(selectionDataPath, selectionDataContent, { version: selectionVersion, count: 2200 });

  const searchRows = buildSearchRows(detail.chunkByKey);
  const searchVersion = sha256Text(JSON.stringify(searchRows)).slice(0, 16).toLowerCase();
  const searchContent = renderSearchModule(searchRows, searchVersion, contentVersion);
  const searchPath = contentNamedPath("search", searchContent);
  files.set(searchPath, searchContent);
  const searchAsset = assetRecord(searchPath, searchContent, { version: searchVersion, count: 2200 });

  const detailsVersion = sha256Text(detail.chunks.map((chunk) => `${chunk.id}:${chunk.sha256}`).join("\n")).slice(0, 16).toLowerCase();
  const manifest = Object.freeze({
    schemaVersion: SPLIT_SCHEMA_VERSION,
    appVersion: catalog.appVersion,
    snapshotDate: catalog.snapshotDate,
    contentVersion,
    selectionVersion,
    searchVersion,
    detailsVersion,
    chunkSize: DETAIL_CHUNK_SIZE,
    total: 2200,
    counts: Object.freeze(Object.fromEntries(Object.entries(EXPECTED_COUNTS).map(([collection, count]) => [CONTENT_TYPES[collection], count]))),
    selection: selectionAsset,
    selectionData: selectionDataAsset,
    search: searchAsset,
    details: Object.freeze({ count: detail.chunks.length, chunks: Object.freeze(detail.chunks) })
  });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestScript = `/* Generated split-catalog manifest; do not edit. */\n(function (root, factory) {\n  "use strict";\n  const value = factory();\n  if (typeof module === "object" && module.exports) module.exports = value;\n  root.DAILY_ATLAS_SPLIT_MANIFEST = value;\n})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n  "use strict";\n  return Object.freeze(${JSON.stringify(manifest)});\n});\n`;
  files.set("manifest.json", manifestJson);
  files.set("manifest.js", manifestScript);
  return { files, manifest };
}

function walkFiles(directory, prefix = "") {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(absolutePath, relativePath));
    else if (entry.isFile()) output.push(relativePath);
  }
  return output;
}

function isManagedSplitFile(relativePath) {
  return relativePath === "manifest.js" || relativePath === "manifest.json" ||
    /^(?:selection|search)\.[a-f0-9]{12}\.js$/.test(relativePath) ||
    /^selection-data\.[a-f0-9]{12}\.json$/.test(relativePath) ||
    /^details\/(?:book|movie|city|german|medical)-\d{3}\.[a-f0-9]{12}\.js$/.test(relativePath);
}

function checkSplitOutputs(split) {
  for (const [relativePath, expected] of split.files) {
    const absolutePath = resolveInside(SPLIT_OUTPUT_ROOT, relativePath, `split output ${relativePath}`);
    assert(fs.existsSync(absolutePath), `${relativePath} is missing; run node scripts/build-catalog.cjs`);
    assert(fs.readFileSync(absolutePath, "utf8") === expected, `${relativePath} is out of date; run node scripts/build-catalog.cjs`);
  }
  const extras = walkFiles(SPLIT_OUTPUT_ROOT).filter((relativePath) => isManagedSplitFile(relativePath) && !split.files.has(relativePath));
  assert(extras.length === 0, `stale split catalog files exist: ${extras.join(", ")}`);
}

function writeSplitOutputs(split) {
  fs.mkdirSync(SPLIT_OUTPUT_ROOT, { recursive: true });
  for (const relativePath of walkFiles(SPLIT_OUTPUT_ROOT)) {
    if (!isManagedSplitFile(relativePath) || split.files.has(relativePath)) continue;
    const absolutePath = resolveInside(SPLIT_OUTPUT_ROOT, relativePath, `stale split output ${relativePath}`);
    fs.unlinkSync(absolutePath);
  }
  for (const [relativePath, content] of split.files) {
    const absolutePath = resolveInside(SPLIT_OUTPUT_ROOT, relativePath, `split output ${relativePath}`);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
}

function compressedBytes(content) {
  return zlib.gzipSync(Buffer.from(content, "utf8"), { level: 9 }).length;
}

validate();
const generated = buildOutput();
const split = buildSplitOutputs();

if (CHECK_ONLY) {
  const existing = fs.readFileSync(OUTPUT_PATH, "utf8");
  assert(existing === generated, "catalog.js is out of date; run node scripts/build-catalog.cjs");
  checkSplitOutputs(split);
} else {
  fs.writeFileSync(OUTPUT_PATH, generated, "utf8");
  writeSplitOutputs(split);
}

const selectionContent = split.files.get(split.manifest.selection.path);
const selectionDataContent = split.files.get(split.manifest.selectionData.path);
const searchContent = split.files.get(split.manifest.search.path);
console.log(`PASS: ${Object.entries(EXPECTED_COUNTS).map(([key, count]) => `${key}=${count}`).join(", ")}; audits and v2 constraints verified; split chunks=${split.manifest.details.count}; selection=${Buffer.byteLength(selectionContent)} bytes (${compressedBytes(selectionContent)} gzip); selection-data=${Buffer.byteLength(selectionDataContent)} bytes (${compressedBytes(selectionDataContent)} gzip); search=${Buffer.byteLength(searchContent)} bytes (${compressedBytes(searchContent)} gzip)${CHECK_ONLY ? "; generated files are current" : ""}`);
