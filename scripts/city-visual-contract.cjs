"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const CITY_JSON = "assets/visuals/cities/manifest.json";
const CITY_JS = "assets/visuals/cities/manifest.js";
const COMBINED_JS = "assets/visuals/manifest.js";
const CATALOG_MANIFEST = "catalog-data/manifest.json";
const EVIDENCE_FILES = Object.freeze({
  candidates: "data/visuals/city-commons-candidates.v1.json",
  overrides: "data/visuals/city-commons-overrides.json",
  reviews: "data/visuals/city-commons-reviews.v1.json",
  contactIndex: "data/visuals/city-review-evidence/index.json"
});
const CITY_PATH = /^assets\/visuals\/cities\/(city-[a-z0-9-]+)\.webp$/;
const SHA256 = /^[A-F0-9]{64}$/;
const CITY_LICENSES = Object.freeze({
  "https://creativecommons.org/licenses/by/2.0/": Object.freeze({ code: "CC-BY-2.0", name: "Creative Commons Attribution 2.0" }),
  "https://creativecommons.org/licenses/by/2.5/": Object.freeze({ code: "CC-BY-2.5", name: "Creative Commons Attribution 2.5" }),
  "https://creativecommons.org/licenses/by/2.5/au/": Object.freeze({ code: "CC-BY-2.5-AU", name: "Attribution 2.5 Australia" }),
  "https://creativecommons.org/licenses/by/3.0/": Object.freeze({ code: "CC-BY-3.0", name: "Creative Commons Attribution 3.0" }),
  "https://creativecommons.org/licenses/by/3.0/br/": Object.freeze({ code: "CC-BY-3.0-BR", name: "Attribution 3.0 Brazil" }),
  "https://creativecommons.org/licenses/by/3.0/pl/": Object.freeze({ code: "CC-BY-3.0-PL", name: "Attribution 3.0 Poland" }),
  "https://creativecommons.org/licenses/by/4.0/": Object.freeze({ code: "CC-BY-4.0", name: "Creative Commons Attribution 4.0" }),
  "https://creativecommons.org/licenses/by-sa/2.0/": Object.freeze({ code: "CC-BY-SA-2.0", name: "Creative Commons Attribution-ShareAlike 2.0" }),
  "https://creativecommons.org/licenses/by-sa/3.0/": Object.freeze({ code: "CC-BY-SA-3.0", name: "Creative Commons Attribution-ShareAlike 3.0" }),
  "https://creativecommons.org/licenses/by-sa/3.0/de/": Object.freeze({ code: "CC-BY-SA-3.0-DE", name: "Attribution-ShareAlike 3.0 Germany" }),
  "https://creativecommons.org/licenses/by-sa/3.0/ee/": Object.freeze({ code: "CC-BY-SA-3.0-EE", name: "Attribution-ShareAlike 3.0 Estonia" }),
  "https://creativecommons.org/licenses/by-sa/4.0/": Object.freeze({ code: "CC-BY-SA-4.0", name: "Creative Commons Attribution-ShareAlike 4.0" })
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function entryBytes(fileMap, relative, label) {
  const entry = fileMap.get(relative);
  assert(entry, `${label} is missing ${relative}`);
  if (Buffer.isBuffer(entry.content)) return entry.content;
  assert(typeof entry.absolute === "string", `${label} cannot read ${relative}`);
  return fs.readFileSync(entry.absolute);
}

function parseJson(fileMap, relative, label) {
  try {
    return JSON.parse(entryBytes(fileMap, relative, label).toString("utf8"));
  } catch (error) {
    throw new Error(`${label} ${relative} is not valid JSON: ${error.message}`);
  }
}

function parseGlobalScript(fileMap, relative, globalName, label) {
  const sandbox = Object.create(null);
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(entryBytes(fileMap, relative, label).toString("utf8"), sandbox, {
      filename: `${label}:${relative}`,
      timeout: 2000
    });
  } catch (error) {
    throw new Error(`${label} ${relative} cannot be evaluated: ${error.message}`);
  }
  assert(sandbox[globalName] && typeof sandbox[globalName] === "object",
    `${label} ${relative} did not publish ${globalName}`);
  return JSON.parse(JSON.stringify(sandbox[globalName]));
}

function parseModuleScript(fileMap, relative, label) {
  const sandbox = Object.create(null);
  sandbox.globalThis = sandbox;
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  try {
    vm.runInNewContext(entryBytes(fileMap, relative, label).toString("utf8"), sandbox, {
      filename: `${label}:${relative}`,
      timeout: 2000
    });
  } catch (error) {
    throw new Error(`${label} ${relative} cannot be evaluated: ${error.message}`);
  }
  return JSON.parse(JSON.stringify(sandbox.module.exports));
}

function webpDimensions(bytes) {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 20
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP", "payload is not RIFF/WEBP");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.subarray(offset, offset + 4).toString("ascii");
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    assert(end <= bytes.length, `truncated WebP ${type} chunk`);
    if (type === "VP8X") {
      assert(size >= 10, "invalid VP8X chunk");
      return { width: 1 + bytes.readUIntLE(start + 4, 3), height: 1 + bytes.readUIntLE(start + 7, 3) };
    }
    if (type === "VP8L") {
      assert(size >= 5 && bytes[start] === 0x2F, "invalid VP8L chunk");
      const b1 = bytes[start + 1];
      const b2 = bytes[start + 2];
      const b3 = bytes[start + 3];
      const b4 = bytes[start + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3F) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0F) << 10)
      };
    }
    if (type === "VP8 ") {
      assert(size >= 10 && bytes[start + 3] === 0x9D && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2A,
        "invalid VP8 key frame");
      return { width: bytes.readUInt16LE(start + 6) & 0x3FFF, height: bytes.readUInt16LE(start + 8) & 0x3FFF };
    }
    offset = end + (size & 1);
  }
  throw new Error("WebP has no supported image chunk");
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function assertExactIds(actual, expected, label) {
  const actualSorted = sorted(actual);
  const expectedSorted = sorted(expected);
  assert(actualSorted.length === expectedSorted.length && actualSorted.every((value, index) => value === expectedSorted[index]),
    `${label} IDs do not match the catalog city IDs exactly`);
}

function runtimeVisuals(fileMap, label) {
  const sandbox = Object.create(null);
  sandbox.globalThis = sandbox;
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  sandbox.URL = URL;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.DAILY_ATLAS_PUBLIC_CONFIG = Object.freeze({ remoteBookMovieImages: true, localCityImages: true });
  try {
    vm.runInNewContext(entryBytes(fileMap, "visuals.js", label).toString("utf8"), sandbox, {
      filename: `${label}:visuals.js`,
      timeout: 2000
    });
  } catch (error) {
    throw new Error(`${label} visuals.js cannot be evaluated: ${error.message}`);
  }
  const api = sandbox.module.exports;
  assert(api && typeof api.mediaCandidates === "function", `${label} visuals.js does not export the runtime media resolver`);
  return api;
}

function validateRemoteRoutes(fileMap, label, combined, catalog, selection, catalogManifest) {
  const books = combined.items.filter((item) => item?.type === "book");
  const movies = combined.items.filter((item) => item?.type === "movie");
  assert(combined.counts?.books === 500 && combined.counts?.movies === 500
    && combined.counts?.remoteOnly === 1000 && combined.counts?.total === 1200
    && books.length === 500 && movies.length === 500,
  `${label} combined visual manifest must contain 500 books, 500 movies and 1000 remote-only items`);
  const allIds = [...books, ...movies].map((item) => item?.id);
  assert(new Set(allIds).size === 1000, `${label} combined visual manifest has duplicate book/movie IDs`);
  assert(Array.isArray(catalog?.books) && catalog.books.length === 500
    && Array.isArray(catalog?.movies) && catalog.movies.length === 500,
  `${label} runtime catalog must contain 500 books and 500 movies`);
  const catalogBooks = new Map(catalog.books.map((item) => [item?.id, item]));
  const catalogMovies = new Map(catalog.movies.map((item) => [item?.id, item]));
  assert(catalogBooks.size === 500 && catalogMovies.size === 500, `${label} runtime catalog has duplicate book/movie IDs`);
  const selectionBookIds = selection.rows.book?.map((row) => row?.[0]);
  const selectionMovieIds = selection.rows.movie?.map((row) => row?.[0]);
  assert(Array.isArray(selectionBookIds) && selectionBookIds.length === 500
    && Array.isArray(selectionMovieIds) && selectionMovieIds.length === 500,
  `${label} selection data must contain 500 book and 500 movie IDs`);
  assertExactIds(books.map((item) => item.id), catalogBooks.keys(), `${label} visual books vs runtime catalog`);
  assertExactIds(movies.map((item) => item.id), catalogMovies.keys(), `${label} visual movies vs runtime catalog`);
  assertExactIds(books.map((item) => item.id), selectionBookIds, `${label} visual books vs selection data`);
  assertExactIds(movies.map((item) => item.id), selectionMovieIds, `${label} visual movies vs selection data`);
  const detailBooks = new Map();
  const detailMovies = new Map();
  const mediaChunks = catalogManifest.details?.chunks?.filter((record) => record?.type === "book" || record?.type === "movie") || [];
  assert(mediaChunks.length === 20
    && mediaChunks.filter((record) => record.type === "book").length === 10
    && mediaChunks.filter((record) => record.type === "movie").length === 10,
  `${label} split catalog must contain 10 book and 10 movie detail chunks`);
  for (const record of mediaChunks) {
    const relative = `catalog-data/${record.path}`;
    const values = parseModuleScript(fileMap, relative, label);
    assert(Array.isArray(values) && values.length === record.count, `${label} ${relative} has an invalid detail payload`);
    const target = record.type === "book" ? detailBooks : detailMovies;
    for (const item of values) {
      assert(item?.type === record.type && !target.has(item.id), `${label} ${relative} has an invalid or duplicate detail ID: ${item?.id}`);
      target.set(item.id, item);
    }
  }
  assert(detailBooks.size === 500 && detailMovies.size === 500, `${label} split details must contain 500 books and 500 movies`);
  assertExactIds(detailBooks.keys(), catalogBooks.keys(), `${label} book details vs runtime catalog`);
  assertExactIds(detailMovies.keys(), catalogMovies.keys(), `${label} movie details vs runtime catalog`);
  for (const [id, item] of catalogBooks) {
    const detail = detailBooks.get(id);
    assert(detail.title === item.title && detail.sourceUrl === item.sourceUrl && detail.image === item.image,
      `${label} ${id} book detail visual identity diverges from catalog.js`);
  }
  for (const [id, item] of catalogMovies) {
    const detail = detailMovies.get(id);
    assert(detail.title === item.title && detail.sourceUrl === item.sourceUrl && detail.image === item.image,
      `${label} ${id} movie detail visual identity diverges from catalog.js`);
  }
  const resolver = runtimeVisuals(fileMap, label);
  for (const item of books) {
    const catalogItem = catalogBooks.get(item.id);
    assert(/^\/works\/OL\d+W$/.test(item.id || "") && item.status === "remote-only"
      && item.policyId === "open-library-cover-remote-reference" && item.licenseUrl === null,
    `${label} has an invalid remote book visual: ${item?.id}`);
    assert(Array.isArray(item.candidates) && item.candidates.length === 3 && item.primary === item.candidates[0],
      `${label} ${item.id} must have exactly three ordered candidates`);
    const proxy = new URL(item.candidates[0]);
    const medium = new URL(item.candidates[1]);
    const large = new URL(item.candidates[2]);
    const match = /^\/b\/id\/(\d+)-M\.jpg$/.exec(medium.pathname);
    assert(proxy.protocol === "https:" && proxy.hostname === "images.weserv.nl" && proxy.pathname === "/"
      && medium.protocol === "https:" && medium.hostname === "covers.openlibrary.org" && match
      && medium.search === "?default=false"
      && large.protocol === "https:" && large.hostname === "covers.openlibrary.org"
      && large.pathname === `/b/id/${match?.[1]}-L.jpg` && large.search === "?default=false"
      && proxy.searchParams.get("url") === item.candidates[1]
      && proxy.searchParams.get("w") === "480" && proxy.searchParams.get("fit") === "cover"
      && proxy.searchParams.get("output") === "webp"
      && item.identityKey === `cover-id:${match?.[1]}`,
    `${label} ${item.id} has a non-canonical or unsupported book image route`);
    const source = new URL(item.sourcePage);
    assert(source.protocol === "https:" && source.hostname === "openlibrary.org"
      && source.pathname.replace(/\/$/, "") === item.id,
    `${label} ${item.id} has an invalid Open Library identity page`);
    assert(catalogItem?.title === item.title && catalogItem.sourceUrl === item.sourcePage,
      `${label} ${item.id} visual identity does not match the runtime catalog`);
    const runtime = Array.from(resolver.mediaCandidates(catalogItem));
    assert(JSON.stringify(runtime) === JSON.stringify(item.candidates),
      `${label} ${item.id} audited candidates diverge from packaged visuals.js`);
  }
  for (const item of movies) {
    const catalogItem = catalogMovies.get(item.id);
    assert(/^tt\d{7,10}$/.test(item.id || "") && item.status === "remote-only"
      && item.policyId === "metahub-poster-remote-reference" && item.licenseUrl === null
      && item.identityKey === `imdb-id:${item.id}`,
    `${label} has an invalid remote movie visual: ${item?.id}`);
    assert(Array.isArray(item.candidates) && item.candidates.length === 3 && item.primary === item.candidates[0],
      `${label} ${item.id} must have exactly three ordered candidates`);
    const proxy = new URL(item.candidates[0]);
    const medium = new URL(item.candidates[1]);
    const small = new URL(item.candidates[2]);
    assert(proxy.protocol === "https:" && proxy.hostname === "images.weserv.nl" && proxy.pathname === "/"
      && medium.protocol === "https:" && medium.hostname === "images.metahub.space"
      && medium.pathname === `/poster/medium/${item.id}/img` && !medium.search
      && small.protocol === "https:" && small.hostname === "images.metahub.space"
      && small.pathname === `/poster/small/${item.id}/img` && !small.search
      && proxy.searchParams.get("url") === item.candidates[1]
      && proxy.searchParams.get("w") === "480" && proxy.searchParams.get("fit") === "cover"
      && proxy.searchParams.get("output") === "webp",
    `${label} ${item.id} has a non-canonical or unsupported movie image route`);
    const source = new URL(item.sourcePage);
    assert(source.protocol === "https:" && (source.hostname === "www.imdb.com" || source.hostname === "imdb.com")
      && source.pathname.replace(/\/$/, "") === `/title/${item.id}`,
    `${label} ${item.id} has an invalid IMDb identity page`);
    assert(catalogItem?.title === item.title && catalogItem.sourceUrl === item.sourcePage,
      `${label} ${item.id} visual identity does not match the runtime catalog`);
    const runtime = Array.from(resolver.mediaCandidates(catalogItem));
    assert(JSON.stringify(runtime) === JSON.stringify(item.candidates),
      `${label} ${item.id} audited candidates diverge from packaged visuals.js`);
  }
}

function decodeHtml(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isSafeInteger(code) ? String.fromCodePoint(code) : whole;
    }
    return named[entity.toLowerCase()] ?? whole;
  });
}

function plainText(value) {
  return decodeHtml(String(value || "")
    .replace(/<(?:br|p|div|li)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function cleanUrl(value) {
  const url = new URL(decodeHtml(value));
  url.search = "";
  url.hash = "";
  return url.href;
}

function canonicalCreativeCommonsLicense(value) {
  const url = new URL(decodeHtml(value));
  assert(url.protocol === "https:" && url.hostname === "creativecommons.org", `unsupported Creative Commons license host: ${value}`);
  const match = /^\/licenses\/(by|by-sa)\/(2\.0|2\.5|3\.0|4\.0)(?:\/([a-z]{2}))?(?:\/deed(?:\.[a-z-]+)?)?\/?$/i.exec(url.pathname);
  assert(match, `unsupported Creative Commons license path: ${value}`);
  return `https://creativecommons.org/licenses/${match[1].toLowerCase()}/${match[2]}/${match[3] ? `${match[3].toLowerCase()}/` : ""}`;
}

function commonsFileTitleFromUrl(value) {
  const url = new URL(value);
  assert(url.protocol === "https:" && url.hostname === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/File:"),
    `invalid Commons File-page URL: ${value}`);
  return decodeURIComponent(url.pathname.slice("/wiki/".length)).replace(/_/g, " ");
}

function parseRlc(document, label) {
  const startMarker = "RLCONF=";
  const start = document.indexOf(startMarker);
  assert(start >= 0, `${label} frozen Commons page has no RLCONF`);
  const valueStart = start + startMarker.length;
  const endings = [document.indexOf(";\nRLSTATE=", valueStart), document.indexOf(";RLSTATE=", valueStart)]
    .filter((value) => value >= 0);
  assert(endings.length, `${label} frozen Commons page has no RLCONF terminator`);
  try { return JSON.parse(document.slice(valueStart, Math.min(...endings))); }
  catch (error) { throw new Error(`${label} frozen Commons RLCONF is invalid: ${error.message}`); }
}

function frozenCommonsMetadata(pageBytes, label) {
  const document = pageBytes.toString("utf8");
  const jsonLd = [...document.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let imageObject = null;
  for (const match of jsonLd) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]));
      const values = Array.isArray(parsed) ? parsed : [parsed];
      imageObject = values.find((item) => item && typeof item === "object" && item["@type"] === "ImageObject" && item.contentUrl) || null;
    } catch (_error) { /* try the next JSON-LD block */ }
    if (imageObject) break;
  }
  assert(imageObject, `${label} frozen Commons page has no ImageObject JSON-LD`);
  const rlc = parseRlc(document, label);
  const marker = /id=["']fileinfotpl(?:&#95;|_)(?:aut)["'][^>]*>/i.exec(document);
  let author = "";
  if (marker) {
    const tail = document.slice(marker.index + marker[0].length);
    const next = /id=["']fileinfotpl(?:&#95;|_)(?:perm|ver|src|desc|date)["'][^>]*>/i.exec(tail);
    const segment = tail.slice(0, next ? next.index : 100000);
    const names = [...segment.matchAll(/<span[^>]*class=["'][^"']*\bfn\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
      .map((match) => plainText(match[1])).filter(Boolean);
    if (names.length) author = [...new Set(names)].join(", ");
    else {
      const legacy = /<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(segment);
      author = legacy ? plainText(legacy[1]) : "";
    }
  }
  if (!author) {
    const statements = rlc?.wbEntity?.statements?.P170;
    const names = [];
    for (const statement of Array.isArray(statements) ? statements : []) {
      for (const qualifier of Array.isArray(statement?.qualifiers?.P2093) ? statement.qualifiers.P2093 : []) {
        const value = qualifier?.datavalue?.value;
        if (typeof value === "string" && value.trim()) names.push(value.trim());
      }
    }
    author = [...new Set(names)].join(", ");
  }
  if (!author) author = "Unknown creator (as stated on the Commons file page)";
  const licences = Array.isArray(imageObject.license) ? imageObject.license : [imageObject.license];
  const rawTitle = String(rlc.wgTitle || rlc.wgPageName || "").replace(/_/g, " ");
  return Object.freeze({
    fileTitle: rawTitle.startsWith("File:") ? rawTitle : `File:${rawTitle}`,
    author,
    originalUrl: cleanUrl(imageObject.contentUrl),
    licenseUrls: licences.filter(Boolean).map((value) => canonicalCreativeCommonsLicense(String(value)))
  });
}

function validateReviewEvidence(fileMap, label, cityById, combinedById) {
  const candidatesBytes = entryBytes(fileMap, EVIDENCE_FILES.candidates, label);
  const candidates = parseJson(fileMap, EVIDENCE_FILES.candidates, label);
  const overrides = parseJson(fileMap, EVIDENCE_FILES.overrides, label);
  const reviews = parseJson(fileMap, EVIDENCE_FILES.reviews, label);
  const contact = parseJson(fileMap, EVIDENCE_FILES.contactIndex, label);
  const sourceHash = sha256(candidatesBytes);
  const frozenPaths = [...fileMap.keys()].filter((relative) => /^data\/visuals\/evidence\/commons-city-pages\/[^/]+\.html\.gz$/.test(relative));
  assert(frozenPaths.length === 804, `${label} must contain exactly 804 frozen Commons HTML evidence files; found ${frozenPaths.length}`);
  const frozenByHash = new Map();
  for (const relative of frozenPaths) {
    let pageBytes;
    try { pageBytes = zlib.gunzipSync(entryBytes(fileMap, relative, label)); }
    catch (error) { throw new Error(`${label} frozen Commons evidence is not valid gzip: ${relative}: ${error.message}`); }
    const hash = sha256(pageBytes);
    const records = frozenByHash.get(hash) || [];
    records.push({ relative, pageBytes });
    frozenByHash.set(hash, records);
  }
  assert(candidates?.schemaVersion === 1 && Array.isArray(candidates.items) && candidates.items.length === 200,
    `${label} city candidate evidence must contain 200 items`);
  assert(overrides?.schemaVersion === 1 && Array.isArray(overrides.items) && overrides.items.length === 200,
    `${label} city overrides must contain 200 items`);
  assert(reviews?.schemaVersion === 1 && Array.isArray(reviews.items) && reviews.items.length === 200,
    `${label} city reviews must contain 200 items`);
  assert(reviews.sourceManifestSha256 === sourceHash, `${label} city reviews belong to a different candidate manifest`);
  assert(contact?.schemaVersion === 1 && contact.count === 200 && contact.sourceManifestSha256 === sourceHash,
    `${label} city contact-sheet index belongs to a different candidate manifest`);
  assert(Array.isArray(contact.pages) && Array.isArray(contact.pageEvidence)
    && contact.pages.length === 13 && contact.pageEvidence.length === 13,
  `${label} city contact-sheet evidence must contain exactly 13 pages`);
  const evidenceByFile = new Map(contact.pageEvidence.map((item) => [item?.file, item]));
  assert(evidenceByFile.size === 13, `${label} city contact-sheet evidence contains duplicate paths`);
  for (const relative of contact.pages) {
    assert(/^data\/visuals\/city-review-evidence\/contact-\d{2}\.jpg$/.test(relative || ""),
      `${label} has an invalid city contact-sheet path: ${relative}`);
    const evidence = evidenceByFile.get(relative);
    assert(evidence && SHA256.test(evidence.sha256 || "") && Number.isSafeInteger(evidence.bytes) && evidence.bytes > 0,
      `${label} has invalid city contact-sheet metadata: ${relative}`);
    const bytes = entryBytes(fileMap, relative, label);
    assert(bytes.length === evidence.bytes && sha256(bytes) === evidence.sha256,
      `${label} city contact-sheet bytes/hash mismatch: ${relative}`);
  }
  const candidatesById = new Map(candidates.items.map((item) => [item?.id, item]));
  const overridesById = new Map(overrides.items.map((item) => [item?.id, item]));
  const reviewsById = new Map(reviews.items.map((item) => [item?.id, item]));
  assert(candidatesById.size === 200 && overridesById.size === 200 && reviewsById.size === 200,
    `${label} city evidence contains duplicate IDs`);
  assertExactIds(candidatesById.keys(), cityById.keys(), `${label} city candidates`);
  assertExactIds(overridesById.keys(), cityById.keys(), `${label} city overrides`);
  assertExactIds(reviewsById.keys(), cityById.keys(), `${label} city reviews`);
  for (const [id, city] of cityById) {
    const combined = combinedById.get(id);
    const candidate = candidatesById.get(id);
    const override = overridesById.get(id);
    const review = reviewsById.get(id);
    const stagedRelative = `assets/visuals/cities-staged/${id}.webp`;
    const selected = candidate?.selected;
    const frozenMatches = frozenByHash.get(selected?.sourceMetadataSha256) || [];
    assert(frozenMatches.length === 1, `${label} ${id} must match exactly one frozen Commons File-page payload; found ${frozenMatches.length}`);
    const frozen = frozenCommonsMetadata(frozenMatches[0].pageBytes, `${label} ${id}`);
    const license = CITY_LICENSES[city.licenseUrl];
    assert(license, `${label} ${id} has an unsupported released city licence URL`);
    assert(candidate?.selected?.fileTitle === combined.audit.fileTitle
      && selected.pageUrl === city.sourcePage
      && selected.author === city.author && selected.attribution === city.attribution
      && selected.license?.name === city.licenseName && selected.license.url === city.licenseUrl
      && selected.originalUrl === combined.audit.originalUrl
      && selected.thumbnailUrl === combined.audit.thumbnailUrl
      && selected.sourceMetadataRetrievedAt === combined.audit.sourceMetadataRetrievedAt
      && selected.sourceMetadataSha256 === combined.audit.sourceMetadataSha256
      && selected.staged?.file === stagedRelative
      && selected.staged.sha256 === city.sha256
      && selected.staged.bytes === city.bytes
      && selected.staged.width === city.width
      && selected.staged.height === city.height,
    `${label} ${id} candidate evidence is stale`);
    assert(frozen.fileTitle === selected.fileTitle && frozen.author === selected.author
      && commonsFileTitleFromUrl(selected.pageUrl) === frozen.fileTitle
      && frozen.originalUrl === cleanUrl(selected.originalUrl)
      && frozen.licenseUrls.includes(selected.license.url)
      && selected.license.code === license.code && selected.license.name === license.name
      && selected.attribution === `${selected.author}, ${selected.fileTitle.slice(5)}, ${license.code}, via Wikimedia Commons; cropped to 16:9 and resized.`,
    `${label} ${id} released author/licence/source does not match frozen Commons evidence`);
    const stagedBytes = entryBytes(fileMap, stagedRelative, label);
    const stagedDimensions = webpDimensions(stagedBytes);
    assert(stagedBytes.length === city.bytes && sha256(stagedBytes) === city.sha256
      && stagedDimensions.width === city.width && stagedDimensions.height === city.height,
    `${label} ${id} staged city image does not match the approved released image`);
    assert(override?.reviewStatus === "approved" && override.fileTitle === combined.audit.fileTitle
      && override.pageUrl === city.sourcePage && override.author === city.author
      && override.attribution === city.attribution && override.license?.name === city.licenseName
      && override.license.url === city.licenseUrl && override.originalUrl === combined.audit.originalUrl
      && override.thumbnailUrl === combined.audit.thumbnailUrl
      && override.sourceMetadataRetrievedAt === combined.audit.sourceMetadataRetrievedAt
      && override.sourceMetadataSha256 === combined.audit.sourceMetadataSha256
      && override.subjectReview?.status === combined.audit.subjectReview?.status
      && override.subjectReview.checkedAt === combined.audit.subjectReview.checkedAt
      && override.subjectReview.note === combined.audit.subjectReview.note
      && override.local?.file === city.path.slice(2) && override.local.sha256 === city.sha256
      && override.local.bytes === city.bytes && override.local.width === city.width && override.local.height === city.height,
    `${label} ${id} override does not match the released city image`);
    assert(review?.status === "approved" && review.fileTitle === combined.audit.fileTitle
      && review.checkedAt === override.subjectReview.checkedAt && review.note === override.subjectReview.note
      && review.visualSha256 === city.sha256 && review.stagedSha256 === city.sha256
      && review.sourceMetadataSha256 === combined.audit.sourceMetadataSha256
      && review.contactSheetSourceManifestSha256 === sourceHash,
    `${label} ${id} review approval is stale or not bound to the released image`);
  }
  const stagedWebps = [...fileMap.keys()].filter((relative) => relative.startsWith("assets/visuals/cities-staged/") && /\.webp$/i.test(relative));
  assert(stagedWebps.length === 200 && stagedWebps.every((relative) => /^assets\/visuals\/cities-staged\/city-[a-z0-9-]+\.webp$/.test(relative)),
    `${label} staged city directory must contain exactly the 200 canonical WebP files`);
  assertExactIds(stagedWebps.map((relative) => /^assets\/visuals\/cities-staged\/(city-[a-z0-9-]+)\.webp$/.exec(relative)[1]),
    cityById.keys(), `${label} staged city directory`);
}

function validateCityVisualContract(fileMap, label = "release", options = {}) {
  assert(fileMap instanceof Map, `${label} city visual input must be a Map`);
  const cityJson = parseJson(fileMap, CITY_JSON, label);
  const cityScript = parseGlobalScript(fileMap, CITY_JS, "DAILY_ATLAS_CITY_VISUALS", label);
  assert(JSON.stringify(cityJson) === JSON.stringify(cityScript), `${label} city manifest JSON and JS differ`);
  assert(cityJson?.schemaVersion === 1 && cityJson.count === 200
    && Array.isArray(cityJson.items) && cityJson.items.length === 200,
  `${label} city manifest must use schemaVersion 1 and contain exactly 200 items`);
  const catalogManifest = parseJson(fileMap, CATALOG_MANIFEST, label);
  assert(catalogManifest?.schemaVersion === 1 && catalogManifest.counts?.city === 200,
    `${label} split catalog manifest must declare 200 cities`);
  const selectionPath = `catalog-data/${catalogManifest.selectionData?.path || ""}`;
  assert(/^catalog-data\/selection-data\.[a-f0-9]{12}\.json$/.test(selectionPath),
    `${label} split catalog has an invalid selection-data path`);
  const selection = parseJson(fileMap, selectionPath, label);
  assert(Array.isArray(selection?.rows?.city) && selection.rows.city.length === 200,
    `${label} selection data must contain 200 city rows`);
  const catalogIds = selection.rows.city.map((row) => row?.[0]);
  assert(new Set(catalogIds).size === 200 && catalogIds.every((id) => /^city-[a-z0-9-]+$/.test(id || "")),
    `${label} selection data has invalid or duplicate city IDs`);
  const cityById = new Map();
  const cityHashes = new Set();
  const citySources = new Set();
  let totalBytes = 0;
  for (const item of cityJson.items) {
    assert(item && /^city-[a-z0-9-]+$/.test(item.id || "") && !cityById.has(item.id),
      `${label} city manifest has an invalid or duplicate ID: ${item?.id}`);
    const relative = `assets/visuals/cities/${item.id}.webp`;
    assert(item.path === `./${relative}`, `${label} ${item.id} has a non-canonical image path`);
    assert(SHA256.test(item.sha256 || "") && Number.isSafeInteger(item.bytes) && item.bytes > 0,
      `${label} ${item.id} has invalid image hash/bytes`);
    assert(item.width === 960 && item.height === 540, `${label} ${item.id} must declare 960x540`);
    const license = CITY_LICENSES[item.licenseUrl];
    assert(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(item.sourcePage || "")
      && typeof item.author === "string" && item.author.trim()
      && license && item.licenseName === license.name
      && typeof item.attribution === "string" && item.attribution.trim(),
    `${label} ${item.id} lacks approved Commons source/author/licence/attribution`);
    const bytes = entryBytes(fileMap, relative, label);
    assert(bytes.length === item.bytes, `${label} ${item.id} image byte length mismatch`);
    assert(sha256(bytes) === item.sha256, `${label} ${item.id} image SHA-256 mismatch`);
    let dimensions;
    try { dimensions = webpDimensions(bytes); }
    catch (error) { throw new Error(`${label} ${item.id} ${error.message}`); }
    assert(dimensions.width === 960 && dimensions.height === 540,
      `${label} ${item.id} actual WebP dimensions must be 960x540; found ${dimensions.width}x${dimensions.height}`);
    totalBytes += bytes.length;
    assert(!cityHashes.has(item.sha256), `${label} ${item.id} reuses another city's released image bytes`);
    assert(!citySources.has(item.sourcePage), `${label} ${item.id} reuses another city's Commons source page`);
    cityHashes.add(item.sha256);
    citySources.add(item.sourcePage);
    cityById.set(item.id, item);
  }
  assertExactIds(cityById.keys(), catalogIds, `${label} city manifest`);
  const packagedWebps = [...fileMap.keys()].filter((relative) => relative.startsWith("assets/visuals/cities/") && /\.webp$/i.test(relative));
  assert(packagedWebps.length === 200, `${label} must contain exactly 200 city WebP files; found ${packagedWebps.length}`);
  assert(packagedWebps.every((relative) => CITY_PATH.test(relative)), `${label} city directory contains a non-canonical WebP path`);
  assertExactIds(packagedWebps.map((relative) => CITY_PATH.exec(relative)[1]), cityById.keys(), `${label} city WebP directory`);

  const combined = parseGlobalScript(fileMap, COMBINED_JS, "DAILY_ATLAS_VISUAL_MANIFEST", label);
  assert(combined?.schemaVersion === 1 && combined.releaseTarget === "2.4.0" && Array.isArray(combined.items),
    `${label} combined visual manifest is invalid`);
  const catalog = parseGlobalScript(fileMap, "catalog.js", "DAILY_ATLAS_CATALOG", label);
  validateRemoteRoutes(fileMap, label, combined, catalog, selection, catalogManifest);
  assert(combined.counts?.cities === 200 && combined.counts.approvedOpenLicenseCities === 200
    && combined.counts.pendingOpenLicenseCities === 0,
  `${label} combined visual manifest must approve exactly 200 cities and leave none pending`);
  const combinedCities = combined.items.filter((item) => item?.type === "city");
  const combinedById = new Map(combinedCities.map((item) => [item?.id, item]));
  assert(combinedCities.length === 200 && combinedById.size === 200, `${label} combined visual manifest has invalid/duplicate cities`);
  assertExactIds(combinedById.keys(), cityById.keys(), `${label} combined visual manifest`);
  for (const [id, city] of cityById) {
    const item = combinedById.get(id);
    const relative = city.path.slice(2);
    assert(item.status === "approved-open-license-local" && item.primary === relative
      && item.localFile === relative && item.plannedLocalFile === relative
      && Array.isArray(item.candidates) && item.candidates[0] === relative,
    `${label} ${id} combined visual path/status is not approved and local`);
    assert(item.sourcePage === city.sourcePage && item.licenseName === city.licenseName
      && item.licenseUrl === city.licenseUrl && item.attribution === city.attribution
      && item.audit?.author === city.author,
    `${label} ${id} combined visual source/author/licence does not match the city manifest`);
    assert(item.audit?.local?.file === relative && item.audit.local.sha256 === city.sha256
      && item.audit.local.bytes === city.bytes && item.audit.local.width === city.width
      && item.audit.local.height === city.height,
    `${label} ${id} combined visual local audit does not match the city manifest`);
    const license = CITY_LICENSES[city.licenseUrl];
    assert(commonsFileTitleFromUrl(city.sourcePage) === item.audit.fileTitle
      && city.attribution === `${city.author}, ${item.audit.fileTitle.slice(5)}, ${license.code}, via Wikimedia Commons; cropped to 16:9 and resized.`,
    `${label} ${id} released city source page or attribution does not match its frozen file identity`);
  }
  if (options.requireEvidence) validateReviewEvidence(fileMap, label, cityById, combinedById);
  return Object.freeze({ count: cityById.size, totalBytes, manifestSha256: sha256(entryBytes(fileMap, CITY_JSON, label)) });
}

function addRegularFile(fileMap, root, relative) {
  const absolute = path.resolve(root, ...relative.split("/"));
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  assert(absolute.startsWith(rootPrefix), `city visual path leaves source root: ${relative}`);
  const stats = fs.lstatSync(absolute);
  assert(stats.isFile() && !stats.isSymbolicLink(), `city visual contract requires a regular file: ${relative}`);
  const content = fs.readFileSync(absolute);
  fileMap.set(relative, { path: relative, absolute, content, bytes: content.length, sha256: sha256(content) });
}

function sourceFileMap(root, options = {}) {
  const resolved = path.resolve(root);
  const fileMap = new Map();
  for (const relative of [CITY_JSON, CITY_JS, COMBINED_JS, CATALOG_MANIFEST, "visuals.js", "catalog.js"]) addRegularFile(fileMap, resolved, relative);
  const catalog = parseJson(fileMap, CATALOG_MANIFEST, "source city visual contract");
  addRegularFile(fileMap, resolved, `catalog-data/${catalog.selectionData?.path || ""}`);
  for (const record of catalog.details?.chunks || []) addRegularFile(fileMap, resolved, `catalog-data/${record.path || ""}`);
  const cityDirectory = path.join(resolved, "assets", "visuals", "cities");
  const stats = fs.lstatSync(cityDirectory);
  assert(stats.isDirectory() && !stats.isSymbolicLink(), "city visual directory must be a regular directory");
  for (const name of fs.readdirSync(cityDirectory)) {
    if (/\.webp$/i.test(name)) addRegularFile(fileMap, resolved, `assets/visuals/cities/${name}`);
  }
  if (options.requireEvidence) {
    for (const relative of Object.values(EVIDENCE_FILES)) addRegularFile(fileMap, resolved, relative);
    const contact = parseJson(fileMap, EVIDENCE_FILES.contactIndex, "source city visual contract");
    for (const relative of contact.pages || []) addRegularFile(fileMap, resolved, relative);
    const stagedDirectory = path.join(resolved, "assets", "visuals", "cities-staged");
    const stagedStats = fs.lstatSync(stagedDirectory);
    assert(stagedStats.isDirectory() && !stagedStats.isSymbolicLink(), "staged city visual directory must be a regular directory");
    for (const name of fs.readdirSync(stagedDirectory)) {
      if (/\.webp$/i.test(name)) addRegularFile(fileMap, resolved, `assets/visuals/cities-staged/${name}`);
    }
    const frozenDirectory = path.join(resolved, "data", "visuals", "evidence", "commons-city-pages");
    const frozenStats = fs.lstatSync(frozenDirectory);
    assert(frozenStats.isDirectory() && !frozenStats.isSymbolicLink(), "frozen Commons evidence directory must be a regular directory");
    for (const name of fs.readdirSync(frozenDirectory)) {
      if (/\.html\.gz$/i.test(name)) addRegularFile(fileMap, resolved, `data/visuals/evidence/commons-city-pages/${name}`);
    }
  }
  return fileMap;
}

function validateSourceRoot(root, options = {}) {
  const fileMap = sourceFileMap(root, options);
  return validateCityVisualContract(fileMap, options.label || "source", options);
}

module.exports = Object.freeze({
  CITY_JS,
  CITY_JSON,
  COMBINED_JS,
  EVIDENCE_FILES,
  entryBytes,
  frozenCommonsMetadata,
  sha256,
  sourceFileMap,
  validateCityVisualContract,
  validateReviewEvidence,
  validateSourceRoot,
  webpDimensions
});
