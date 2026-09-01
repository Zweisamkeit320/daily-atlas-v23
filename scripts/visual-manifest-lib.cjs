"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const RuntimeVisuals = require("../visuals.js");

const ROOT = path.resolve(__dirname, "..");
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const BOOK_ID = /^\/works\/OL\d+W$/;
const MOVIE_ID = /^tt\d{7,10}$/;
const CITY_ID = /^city-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[A-F0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const PATHS = Object.freeze({
  books: "data/raw/books500.json",
  movies: "data/raw/movies500.json",
  cities: "data/raw/cities200.json",
  cityOverrides: "data/visuals/city-commons-overrides.json",
  output: "data/visuals/visual-manifest.v1.json",
  browserOutput: "assets/visuals/manifest.js"
});

const CITY_LICENSES = Object.freeze({
  "CC0-1.0": Object.freeze({ name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" }),
  "PDM-1.0": Object.freeze({ name: "Public Domain Mark 1.0", url: "https://creativecommons.org/publicdomain/mark/1.0/" }),
  "CC-BY-2.0": Object.freeze({ name: "Creative Commons Attribution 2.0", url: "https://creativecommons.org/licenses/by/2.0/" }),
  "CC-BY-2.5": Object.freeze({ name: "Creative Commons Attribution 2.5", url: "https://creativecommons.org/licenses/by/2.5/" }),
  "CC-BY-3.0": Object.freeze({ name: "Creative Commons Attribution 3.0", url: "https://creativecommons.org/licenses/by/3.0/" }),
  "CC-BY-4.0": Object.freeze({ name: "Creative Commons Attribution 4.0", url: "https://creativecommons.org/licenses/by/4.0/" }),
  "CC-BY-SA-2.0": Object.freeze({ name: "Creative Commons Attribution-ShareAlike 2.0", url: "https://creativecommons.org/licenses/by-sa/2.0/" }),
  "CC-BY-SA-2.5": Object.freeze({ name: "Creative Commons Attribution-ShareAlike 2.5", url: "https://creativecommons.org/licenses/by-sa/2.5/" }),
  "CC-BY-SA-3.0": Object.freeze({ name: "Creative Commons Attribution-ShareAlike 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" }),
  "CC-BY-SA-4.0": Object.freeze({ name: "Creative Commons Attribution-ShareAlike 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" }),
  "CC-BY-SA-3.0-DE": Object.freeze({ name: "Attribution-ShareAlike 3.0 Germany", url: "https://creativecommons.org/licenses/by-sa/3.0/de/" }),
  "CC-BY-SA-3.0-EE": Object.freeze({ name: "Attribution-ShareAlike 3.0 Estonia", url: "https://creativecommons.org/licenses/by-sa/3.0/ee/" }),
  "CC-BY-3.0-PL": Object.freeze({ name: "Attribution 3.0 Poland", url: "https://creativecommons.org/licenses/by/3.0/pl/" }),
  "CC-BY-3.0-BR": Object.freeze({ name: "Attribution 3.0 Brazil", url: "https://creativecommons.org/licenses/by/3.0/br/" }),
  "CC-BY-2.5-AU": Object.freeze({ name: "Attribution 2.5 Australia", url: "https://creativecommons.org/licenses/by/2.5/au/" })
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function rejectDangerousKeys(value, label = "JSON") {
  if (value === null || typeof value !== "object") return;
  for (const key of Object.getOwnPropertyNames(value)) {
    invariant(!FORBIDDEN_KEYS.has(key), `${label} contains forbidden key ${key}`);
    rejectDangerousKeys(value[key], `${label}.${key}`);
  }
}

function parseJsonSafely(bytes, label) {
  const value = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes));
  rejectDangerousKeys(value, label);
  return value;
}

function isInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function resolveWorkspacePath(relativePath, options = {}) {
  invariant(typeof relativePath === "string" && relativePath.length > 0, "workspace path must be a non-empty string");
  invariant(!relativePath.includes("\0"), "workspace path must not contain NUL");
  invariant(!path.isAbsolute(relativePath), `absolute path is not allowed: ${relativePath}`);
  const normalized = relativePath.replaceAll("\\", "/");
  invariant(!normalized.split("/").includes(".."), `path traversal is not allowed: ${relativePath}`);
  const resolved = path.resolve(ROOT, relativePath);
  invariant(isInside(ROOT, resolved), `path escapes workspace: ${relativePath}`);

  // Existing ancestors must also resolve inside ROOT; this closes a symlink escape.
  let cursor = options.mustExist ? resolved : path.dirname(resolved);
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    invariant(parent !== cursor, `cannot resolve ancestor for ${relativePath}`);
    cursor = parent;
  }
  const realRoot = fs.realpathSync.native(ROOT);
  const realAncestor = fs.realpathSync.native(cursor);
  invariant(isInside(realRoot, realAncestor), `symlink path escapes workspace: ${relativePath}`);
  if (options.mustExist) invariant(fs.existsSync(resolved), `missing workspace file: ${relativePath}`);
  return resolved;
}

function readWorkspaceJson(relativePath) {
  const filePath = resolveWorkspacePath(relativePath, { mustExist: true });
  const bytes = fs.readFileSync(filePath);
  return { bytes, value: parseJsonSafely(bytes, relativePath) };
}

function httpsUrl(value, label, allowedHosts) {
  invariant(typeof value === "string" && value.length > 0, `${label} must be a non-empty URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  invariant(parsed.protocol === "https:", `${label} must use HTTPS`);
  if (allowedHosts) invariant(allowedHosts.includes(parsed.hostname), `${label} has unsupported host ${parsed.hostname}`);
  invariant(!parsed.username && !parsed.password, `${label} must not contain credentials`);
  return parsed;
}

function text(value, label) {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} must be non-empty text`);
  return value.trim();
}

function sourceDescriptor(relativePath, bytes, payload) {
  return {
    file: relativePath,
    sha256: sha256(bytes),
    schemaVersion: payload.schemaVersion ?? null,
    snapshotDate: payload.snapshotDate ?? null
  };
}

function bookEntry(item) {
  invariant(BOOK_ID.test(item.id), `invalid book ID ${item.id}`);
  const title = text(item.title, `${item.id}.title`);
  invariant(Number.isSafeInteger(item.coverId) && item.coverId > 0, `${item.id}.coverId must be a positive integer`);
  const sourceUrl = httpsUrl(item.sourceUrl, `${item.id}.sourceUrl`, ["openlibrary.org"]);
  invariant(sourceUrl.pathname === item.id || sourceUrl.pathname === `${item.id}/`, `${item.id}.sourceUrl must match its stable work ID`);
  const originalImage = httpsUrl(item.image, `${item.id}.image`, ["covers.openlibrary.org"]);
  invariant(originalImage.pathname.includes(String(item.coverId)), `${item.id}.image must contain its coverId`);

  const candidates = RuntimeVisuals.mediaCandidates(item);
  invariant(candidates.length === 3, `${item.id}.image cannot produce the runtime candidate chain`);
  return {
    id: item.id,
    type: "book",
    title,
    status: "remote-only",
    primary: candidates[0],
    candidates,
    sourcePage: item.sourceUrl,
    provider: "images.weserv.nl proxy → Open Library Covers",
    licenseName: "Item-level cover rights not established",
    licenseUrl: null,
    attribution: `Remote cover reference for Open Library work ${item.id}; cover ID ${item.coverId}.`,
    alt: `图书封面：《${title}》`,
    policyId: "open-library-cover-remote-reference",
    identityKey: `cover-id:${item.coverId}`,
    fallback: "procedural-editorial"
  };
}

function movieEntry(item) {
  invariant(MOVIE_ID.test(item.id), `invalid movie ID ${item.id}`);
  const title = text(item.title, `${item.id}.title`);
  const sourceUrl = httpsUrl(item.sourceUrl, `${item.id}.sourceUrl`, ["www.imdb.com", "imdb.com"]);
  invariant(sourceUrl.pathname.startsWith(`/title/${item.id}`), `${item.id}.sourceUrl must match its stable IMDb ID`);
  const originalImage = httpsUrl(item.image, `${item.id}.image`, ["images.metahub.space"]);
  invariant(originalImage.pathname.includes(item.id), `${item.id}.image must contain its IMDb ID`);

  const candidates = RuntimeVisuals.mediaCandidates(item);
  invariant(candidates.length === 3, `${item.id}.image cannot produce the runtime candidate chain`);
  return {
    id: item.id,
    type: "movie",
    title,
    status: "remote-only",
    primary: candidates[0],
    candidates,
    sourcePage: item.sourceUrl,
    provider: "images.weserv.nl proxy → MetaHub image service",
    licenseName: "Item-level poster rights not established",
    licenseUrl: null,
    attribution: `Remote poster reference keyed to IMDb title ${item.id}; IMDb is the identity landing page, not an asserted image licensor.`,
    alt: `电影海报：《${title}》`,
    policyId: "metahub-poster-remote-reference",
    identityKey: `imdb-id:${item.id}`,
    fallback: "procedural-editorial"
  };
}

function pendingCommonsMetadata() {
  return {
    reviewStatus: "pending",
    fileTitle: null,
    pageUrl: null,
    originalUrl: null,
    thumbnailUrl: null,
    author: null,
    attribution: null,
    license: null,
    sourceMetadataRetrievedAt: null,
    sourceMetadataSha256: null,
    subjectReview: null
  };
}

function validateCommonsOverride(override, expectedFile) {
  invariant(override && typeof override === "object" && !Array.isArray(override), "city override must be an object");
  invariant(override.reviewStatus === "approved", `${override.id}.reviewStatus must be approved`);
  text(override.fileTitle, `${override.id}.fileTitle`);
  invariant(override.fileTitle.startsWith("File:"), `${override.id}.fileTitle must start with File:`);
  httpsUrl(override.pageUrl, `${override.id}.pageUrl`, ["commons.wikimedia.org"]);
  httpsUrl(override.originalUrl, `${override.id}.originalUrl`, ["upload.wikimedia.org"]);
  httpsUrl(override.thumbnailUrl, `${override.id}.thumbnailUrl`, ["upload.wikimedia.org"]);
  text(override.author, `${override.id}.author`);
  text(override.attribution, `${override.id}.attribution`);
  invariant(override.license && typeof override.license === "object", `${override.id}.license is required`);
  invariant(Object.hasOwn(CITY_LICENSES, override.license.code), `${override.id}.license.code is not allow-listed`);
  invariant(override.license.url === CITY_LICENSES[override.license.code].url, `${override.id}.license.url does not match its code`);
  invariant(override.license.name === CITY_LICENSES[override.license.code].name, `${override.id}.license.name does not match its code`);
  invariant(ISO_INSTANT.test(override.sourceMetadataRetrievedAt), `${override.id}.sourceMetadataRetrievedAt must be an ISO instant`);
  invariant(SHA256.test(override.sourceMetadataSha256), `${override.id}.sourceMetadataSha256 must be uppercase SHA-256`);
  invariant(override.subjectReview && override.subjectReview.status === "approved", `${override.id}.subjectReview must be approved`);
  invariant(DATE.test(override.subjectReview.checkedAt), `${override.id}.subjectReview.checkedAt must be YYYY-MM-DD`);
  text(override.subjectReview.note, `${override.id}.subjectReview.note`);
  invariant(override.local && typeof override.local === "object", `${override.id}.local is required`);
  invariant(override.local.file === expectedFile, `${override.id}.local.file must equal ${expectedFile}`);
  invariant(SHA256.test(override.local.sha256), `${override.id}.local.sha256 must be uppercase SHA-256`);
  invariant(Number.isSafeInteger(override.local.bytes) && override.local.bytes > 0, `${override.id}.local.bytes must be a positive safe integer`);
  invariant(Number.isSafeInteger(override.local.width) && override.local.width >= 640, `${override.id}.local.width must be at least 640`);
  invariant(Number.isSafeInteger(override.local.height) && override.local.height >= 360, `${override.id}.local.height must be at least 360`);
  const localPath = resolveWorkspacePath(override.local.file, { mustExist: true });
  invariant(path.extname(localPath).toLowerCase() === ".webp", `${override.id}.local.file must be WebP`);
  const localBytes = fs.readFileSync(localPath);
  invariant(localBytes.length === override.local.bytes, `${override.id}.local.bytes does not match the file`);
  invariant(localBytes.length >= 12 && localBytes.subarray(0, 4).toString("ascii") === "RIFF"
    && localBytes.subarray(8, 12).toString("ascii") === "WEBP", `${override.id}.local.file is not a WebP payload`);
  invariant(sha256(localBytes) === override.local.sha256, `${override.id}.local.sha256 does not match the file`);
  return override;
}

function cityEntry(item, override) {
  invariant(CITY_ID.test(item.id), `invalid city ID ${item.id}`);
  const cityZh = text(item.cityZh, `${item.id}.cityZh`);
  const cityEn = text(item.cityEn, `${item.id}.cityEn`);
  const countryEn = text(item.countryEn, `${item.id}.countryEn`);
  const localFile = `assets/visuals/cities/${item.id}.webp`;
  resolveWorkspacePath(localFile);
  const commons = override ? validateCommonsOverride(override, localFile) : pendingCommonsMetadata();
  const approved = commons.reviewStatus === "approved";
  const query = `${cityEn} ${countryEn} cityscape`;
  const searchPage = `https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image&search=${encodeURIComponent(query)}`;
  return {
    id: item.id,
    type: "city",
    title: cityZh,
    status: approved ? "approved-open-license-local" : "pending-open-license-curation",
    primary: approved ? commons.local.file : null,
    candidates: approved ? [commons.local.file, commons.thumbnailUrl, commons.originalUrl] : [],
    sourcePage: approved ? commons.pageUrl : searchPage,
    provider: "Wikimedia Commons",
    licenseCode: approved ? commons.license.code : null,
    licenseName: approved ? commons.license.name : "Pending file-level Commons review",
    licenseUrl: approved ? commons.license.url : null,
    attribution: approved ? commons.attribution : null,
    localFile: approved ? commons.local.file : null,
    plannedLocalFile: localFile,
    alt: `城市风貌：${cityZh}`,
    policyId: "wikimedia-commons-reviewed-open-license",
    fallback: "procedural-city",
    discovery: {
      apiEndpoint: "https://commons.wikimedia.org/w/api.php",
      searchQuery: query,
      searchPage,
      note: "Search results are discovery candidates only and require file-level subject and licence review."
    },
    audit: approved ? {
      fileTitle: commons.fileTitle,
      originalUrl: commons.originalUrl,
      thumbnailUrl: commons.thumbnailUrl,
      author: commons.author,
      sourceMetadataRetrievedAt: commons.sourceMetadataRetrievedAt,
      sourceMetadataSha256: commons.sourceMetadataSha256,
      subjectReview: commons.subjectReview,
      local: commons.local
    } : null
  };
}

function assertUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    invariant(!ids.has(item.id), `${label} contains duplicate ID ${item.id}`);
    ids.add(item.id);
  }
}

function validateOverridePayload(payload, cityIds) {
  invariant(payload && typeof payload === "object" && !Array.isArray(payload), "city override payload must be an object");
  invariant(payload.schemaVersion === 1, "city override schemaVersion must be 1");
  invariant(Array.isArray(payload.items), "city override items must be an array");
  assertUniqueIds(payload.items, "city overrides");
  const map = new Map();
  for (const item of payload.items) {
    invariant(CITY_ID.test(item.id), `invalid city override ID ${item.id}`);
    invariant(cityIds.has(item.id), `city override has unknown ID ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

function buildManifest() {
  const booksInput = readWorkspaceJson(PATHS.books);
  const moviesInput = readWorkspaceJson(PATHS.movies);
  const citiesInput = readWorkspaceJson(PATHS.cities);
  const overridesInput = readWorkspaceJson(PATHS.cityOverrides);
  const booksPayload = booksInput.value;
  const moviesPayload = moviesInput.value;
  const citiesPayload = citiesInput.value;
  invariant(Array.isArray(booksPayload.books) && booksPayload.books.length === 500, "books500 must contain exactly 500 books");
  invariant(Array.isArray(moviesPayload.movies) && moviesPayload.movies.length === 500, "movies500 must contain exactly 500 movies");
  invariant(Array.isArray(citiesPayload) && citiesPayload.length === 200, "cities200 must contain exactly 200 cities");
  assertUniqueIds(booksPayload.books, "books500");
  assertUniqueIds(moviesPayload.movies, "movies500");
  assertUniqueIds(citiesPayload, "cities200");
  const cityIds = new Set(citiesPayload.map((item) => item.id));
  const overrides = validateOverridePayload(overridesInput.value, cityIds);

  const books = booksPayload.books.map(bookEntry).sort((a, b) => a.id.localeCompare(b.id, "en"));
  const movies = moviesPayload.movies.map(movieEntry).sort((a, b) => a.id.localeCompare(b.id, "en"));
  const cities = citiesPayload.map((item) => cityEntry(item, overrides.get(item.id))).sort((a, b) => a.id.localeCompare(b.id, "en"));
  const approvedCities = cities.filter((item) => item.status === "approved-open-license-local").length;
  const generatedAtCandidates = [
    booksPayload.retrievedAt,
    moviesPayload.retrievedAt,
    moviesPayload.expansionMetadataRetrievedAt,
    ...overridesInput.value.items.map((item) => item.sourceMetadataRetrievedAt)
  ].filter((value) => typeof value === "string" && ISO_INSTANT.test(value));
  invariant(generatedAtCandidates.length > 0, "at least one frozen source retrieval timestamp is required");
  const generatedAt = generatedAtCandidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const items = [...books, ...movies, ...cities];

  return {
    schemaVersion: 1,
    generatedAt,
    releaseTarget: "2.4.0",
    deterministic: true,
    scope: "Stable-ID visual routing for 500 books, 500 movies and 200 cities. This manifest does not grant rights beyond its explicit policies.",
    sources: {
      books: sourceDescriptor(PATHS.books, booksInput.bytes, booksPayload),
      movies: sourceDescriptor(PATHS.movies, moviesInput.bytes, moviesPayload),
      cities: sourceDescriptor(PATHS.cities, citiesInput.bytes, { schemaVersion: null, snapshotDate: null }),
      cityOverrides: sourceDescriptor(PATHS.cityOverrides, overridesInput.bytes, overridesInput.value)
    },
    policies: {
      "open-library-cover-remote-reference": {
        status: "item-level-rights-not-established",
        provider: "Open Library Covers",
        metadataTerms: "https://openlibrary.org/developers/licensing",
        deliveryProxy: "https://images.weserv.nl/",
        buildTimeDownloadAllowed: false,
        bundleRedistributionAllowed: false,
        note: "Open Library metadata licensing does not by itself establish copyright or redistribution permission for each cover image. The delivery proxy improves reachability but grants no image rights; origin URLs remain ordered fallbacks."
      },
      "metahub-poster-remote-reference": {
        status: "item-level-rights-not-established",
        provider: "MetaHub image service",
        metadataTerms: null,
        deliveryProxy: "https://images.weserv.nl/",
        buildTimeDownloadAllowed: false,
        bundleRedistributionAllowed: false,
        note: "The catalog supplies title-ID poster URLs, but no item-level poster license or commercial redistribution permission is encoded. The delivery proxy improves reachability but grants no image rights; origin URLs remain ordered fallbacks."
      },
      "wikimedia-commons-reviewed-open-license": {
        status: "allowed-only-after-file-level-review",
        provider: "Wikimedia Commons",
        metadataTerms: "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
        allowedLicenseCodes: Object.keys(CITY_LICENSES),
        buildTimeDownloadAllowed: true,
        bundleRedistributionAllowed: true,
        note: "A city image is eligible only after stable file-page capture, allow-listed license verification, attribution capture, city-subject review, conversion metadata and SHA-256 recording."
      }
    },
    counts: {
      books: books.length,
      movies: movies.length,
      cities: cities.length,
      total: books.length + movies.length + cities.length,
      remoteOnly: books.length + movies.length,
      approvedOpenLicenseCities: approvedCities,
      pendingOpenLicenseCities: cities.length - approvedCities
    },
    items
  };
}

function validateRemoteCandidates(item, originHost, policyId) {
  invariant(item.status === "remote-only", `${item.id} must be remote-only`);
  invariant(item.policyId === policyId, `${item.id} has wrong rights policy`);
  invariant(Array.isArray(item.candidates) && item.candidates.length === 3, `${item.id} must have the three runtime candidates`);
  invariant(item.primary === item.candidates[0], `${item.id}.primary must be the first candidate`);
  const proxy = httpsUrl(item.candidates[0], `${item.id}.candidates[0]`, ["images.weserv.nl"]);
  const proxiedOrigin = proxy.searchParams.get("url");
  invariant(proxiedOrigin === item.candidates[1], `${item.id} proxy must encode the first origin fallback exactly`);
  invariant(proxy.searchParams.get("w") === "480" && proxy.searchParams.get("fit") === "cover"
    && proxy.searchParams.get("output") === "webp" && !proxy.searchParams.has("h") && !proxy.searchParams.has("q"),
  `${item.id} proxy must request the audited 480px mobile WebP profile`);
  item.candidates.slice(1).forEach((candidate, index) => httpsUrl(candidate, `${item.id}.candidates[${index + 1}]`, [originHost]));
  invariant(new Set(item.candidates).size === item.candidates.length, `${item.id} candidates must be unique`);
  invariant(item.licenseUrl === null, `${item.id} must not imply an item-level image licence URL`);
  text(item.licenseName, `${item.id}.licenseName`);
  text(item.attribution, `${item.id}.attribution`);
  text(item.alt, `${item.id}.alt`);
}

function validateVisualManifest(manifest) {
  rejectDangerousKeys(manifest, "visual manifest");
  invariant(manifest && typeof manifest === "object" && !Array.isArray(manifest), "visual manifest must be an object");
  invariant(manifest.schemaVersion === 1, "visual manifest schemaVersion must be 1");
  invariant(ISO_INSTANT.test(manifest.generatedAt), "visual manifest generatedAt must be an ISO instant");
  invariant(manifest.releaseTarget === "2.4.0", "visual manifest releaseTarget must be 2.4.0");
  invariant(manifest.deterministic === true, "visual manifest must be deterministic");
  invariant(manifest.policies && typeof manifest.policies === "object", "visual manifest policies are required");
  invariant(Array.isArray(manifest.items) && manifest.items.length === 1200, "visual manifest must contain 1200 items");
  assertUniqueIds(manifest.items, "visual items");
  invariant(manifest.counts.total === 1200, "visual manifest total must be 1200");
  invariant(manifest.counts.remoteOnly === 1000, "visual manifest remoteOnly must be 1000");
  invariant(manifest.counts.approvedOpenLicenseCities + manifest.counts.pendingOpenLicenseCities === 200, "city visual counts must sum to 200");
  const books = manifest.items.filter((item) => item.type === "book");
  const movies = manifest.items.filter((item) => item.type === "movie");
  const cities = manifest.items.filter((item) => item.type === "city");
  invariant(books.length === 500 && manifest.counts.books === 500, "visual manifest must contain 500 books");
  invariant(movies.length === 500 && manifest.counts.movies === 500, "visual manifest must contain 500 movies");
  invariant(cities.length === 200 && manifest.counts.cities === 200, "visual manifest must contain 200 cities");

  for (const item of books) {
    invariant(BOOK_ID.test(item.id), `invalid visual book ${item.id}`);
    validateRemoteCandidates(item, "covers.openlibrary.org", "open-library-cover-remote-reference");
    invariant(item.identityKey.startsWith("cover-id:"), `${item.id} has invalid cover identity key`);
  }
  for (const item of movies) {
    invariant(MOVIE_ID.test(item.id), `invalid visual movie ${item.id}`);
    validateRemoteCandidates(item, "images.metahub.space", "metahub-poster-remote-reference");
    invariant(item.identityKey === `imdb-id:${item.id}`, `${item.id} has invalid movie identity key`);
  }
  for (const item of cities) {
    invariant(CITY_ID.test(item.id), `invalid visual city ${item.id}`);
    invariant(item.policyId === "wikimedia-commons-reviewed-open-license", `${item.id} city image has wrong rights policy`);
    const expectedFile = `assets/visuals/cities/${item.id}.webp`;
    invariant(item.plannedLocalFile === expectedFile, `${item.id} city planned path mismatch`);
    resolveWorkspacePath(item.plannedLocalFile);
    text(item.alt, `${item.id}.alt`);
    httpsUrl(item.sourcePage, `${item.id}.sourcePage`, ["commons.wikimedia.org"]);
    if (item.status === "approved-open-license-local") {
      invariant(Object.hasOwn(CITY_LICENSES, item.licenseCode), `${item.id}.licenseCode is not allow-listed`);
      invariant(CITY_LICENSES[item.licenseCode].name === item.licenseName, `${item.id}.licenseName does not match its code`);
      invariant(CITY_LICENSES[item.licenseCode].url === item.licenseUrl, `${item.id}.licenseUrl does not match its code`);
      invariant(item.localFile === expectedFile && item.primary === expectedFile, `${item.id} approved city local path mismatch`);
      invariant(item.candidates[0] === expectedFile, `${item.id} approved city local image must be first`);
      const audit = item.audit;
      validateCommonsOverride({
        id: item.id,
        reviewStatus: "approved",
        fileTitle: audit.fileTitle,
        pageUrl: item.sourcePage,
        originalUrl: audit.originalUrl,
        thumbnailUrl: audit.thumbnailUrl,
        author: audit.author,
        attribution: item.attribution,
        license: { code: item.licenseCode, name: item.licenseName, url: item.licenseUrl },
        sourceMetadataRetrievedAt: audit.sourceMetadataRetrievedAt,
        sourceMetadataSha256: audit.sourceMetadataSha256,
        subjectReview: audit.subjectReview,
        local: audit.local
      }, expectedFile);
    } else {
      invariant(item.status === "pending-open-license-curation", `${item.id} has unsupported city status`);
      invariant(item.primary === null && item.candidates.length === 0 && item.localFile === null, `${item.id} pending city must not expose an unreviewed image`);
      invariant(item.licenseCode === null && item.licenseUrl === null && item.attribution === null && item.audit === null, `${item.id} pending city must not invent rights metadata`);
    }
  }
  return true;
}

function manifestBytes(manifest) {
  validateVisualManifest(manifest);
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function browserManifestBytes(manifest) {
  validateVisualManifest(manifest);
  const payload = JSON.stringify(manifest).replaceAll("</script", "<\\/script");
  return Buffer.from(`(function(root){"use strict";root.DAILY_ATLAS_VISUAL_MANIFEST=${payload};})(typeof globalThis!=="undefined"?globalThis:this);\n`, "utf8");
}

module.exports = {
  CITY_LICENSES,
  PATHS,
  ROOT,
  browserManifestBytes,
  buildManifest,
  manifestBytes,
  parseJsonSafely,
  rejectDangerousKeys,
  resolveWorkspacePath,
  sha256,
  validateVisualManifest
};
