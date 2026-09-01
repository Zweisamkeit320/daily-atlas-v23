"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const CityVisualContract = require("../scripts/city-visual-contract.cjs");
const Deploy = require("../scripts/static-deploy-package.cjs");
const ServiceWorkerBuild = require("../scripts/build-service-worker.cjs");
const ServiceWorkerContract = require("../scripts/service-worker-contract.cjs");
const { PROJECT_ROOT } = require("./package-fixture-helpers.cjs");

const CITY_GLOBAL = "DAILY_ATLAS_CITY_VISUALS";
const COMBINED_GLOBAL = "DAILY_ATLAS_VISUAL_MANIFEST";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function cloneMap(fileMap) {
  return new Map(fileMap);
}

function setBytes(fileMap, relative, content) {
  const bytes = Buffer.from(content);
  fileMap.set(relative, { path: relative, bytes: bytes.length, sha256: sha256(bytes), content: bytes });
}

function json(fileMap, relative) {
  return JSON.parse(fileMap.get(relative).content.toString("utf8"));
}

function setJson(fileMap, relative, value) {
  setBytes(fileMap, relative, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
}

function globalValue(fileMap, relative, name) {
  const sandbox = Object.create(null);
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fileMap.get(relative).content.toString("utf8"), sandbox, { timeout: 2000 });
  return JSON.parse(JSON.stringify(sandbox[name]));
}

function setGlobal(fileMap, relative, name, value) {
  setBytes(fileMap, relative, Buffer.from(`globalThis.${name} = ${JSON.stringify(value)};\n`, "utf8"));
}

function moduleValue(fileMap, relative) {
  const sandbox = Object.create(null);
  sandbox.globalThis = sandbox;
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(fileMap.get(relative).content.toString("utf8"), sandbox, { timeout: 2000 });
  return JSON.parse(JSON.stringify(sandbox.module.exports));
}

function setModule(fileMap, relative, value) {
  setBytes(fileMap, relative, Buffer.from(`module.exports = ${JSON.stringify(value)};\n`, "utf8"));
}

function setCityManifest(fileMap, manifest) {
  setJson(fileMap, CityVisualContract.CITY_JSON, manifest);
  setGlobal(fileMap, CityVisualContract.CITY_JS, CITY_GLOBAL, manifest);
}

function baseMap(requireEvidence = false) {
  const key = requireEvidence ? "evidence" : "public";
  if (!baseMap.cache.has(key)) {
    const fileMap = CityVisualContract.sourceFileMap(PROJECT_ROOT, { requireEvidence });
    if (requireEvidence) {
      const directory = path.join(PROJECT_ROOT, "data", "visuals", "evidence", "commons-city-pages");
      for (const name of fs.readdirSync(directory)) {
        if (!name.toLowerCase().endsWith(".html.gz")) continue;
        const relative = `data/visuals/evidence/commons-city-pages/${name}`;
        if (!fileMap.has(relative)) setBytes(fileMap, relative, fs.readFileSync(path.join(directory, name)));
      }
    }
    baseMap.cache.set(key, fileMap);
  }
  return cloneMap(baseMap.cache.get(key));
}
baseMap.cache = new Map();

function staticMap() {
  const fileMap = new Map();
  for (const relative of Deploy.FIXED_FILES) {
    const content = fs.readFileSync(path.join(PROJECT_ROOT, ...relative.split("/")));
    fileMap.set(relative, { path: relative, bytes: content.length, sha256: sha256(content), content });
  }
  return fileMap;
}

function oneByOneWebp() {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  return bytes;
}

function updateReleasedCity(fileMap, id, content) {
  const relative = `assets/visuals/cities/${id}.webp`;
  const bytes = Buffer.from(content);
  const digest = sha256(bytes);
  setBytes(fileMap, relative, bytes);
  const manifest = json(fileMap, CityVisualContract.CITY_JSON);
  const city = manifest.items.find((item) => item.id === id);
  city.bytes = bytes.length;
  city.sha256 = digest;
  setCityManifest(fileMap, manifest);
  const combined = globalValue(fileMap, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  const item = combined.items.find((candidate) => candidate.id === id && candidate.type === "city");
  item.audit.local.bytes = bytes.length;
  item.audit.local.sha256 = digest;
  setGlobal(fileMap, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, combined);
  return { bytes, digest };
}

function refreshCandidateSourceBindings(fileMap) {
  const sourceHash = sha256(fileMap.get(CityVisualContract.EVIDENCE_FILES.candidates).content);
  const reviews = json(fileMap, CityVisualContract.EVIDENCE_FILES.reviews);
  reviews.sourceManifestSha256 = sourceHash;
  for (const review of reviews.items) review.contactSheetSourceManifestSha256 = sourceHash;
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.reviews, reviews);
  const contact = json(fileMap, CityVisualContract.EVIDENCE_FILES.contactIndex);
  contact.sourceManifestSha256 = sourceHash;
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.contactIndex, contact);
}

test("v2.4 city visual contract accepts the real 200-city public and review-evidence inventories", () => {
  assert.equal(CityVisualContract.validateCityVisualContract(baseMap(false), "public baseline").count, 200);
  assert.equal(CityVisualContract.validateCityVisualContract(baseMap(true), "evidence baseline", { requireEvidence: true }).count, 200);
});

test("v2.4 city visual contract rejects a 199-item manifest and an inventory reduced to two city images", () => {
  const shortManifestMap = baseMap(false);
  const manifest = json(shortManifestMap, CityVisualContract.CITY_JSON);
  manifest.items.pop();
  manifest.count = 199;
  setCityManifest(shortManifestMap, manifest);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(shortManifestMap, "199 cities"),
    /exactly 200 items/
  );

  const twoImagesMap = baseMap(false);
  const cityPaths = [...twoImagesMap.keys()].filter((relative) => /^assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(relative));
  for (const relative of cityPaths.slice(2)) twoImagesMap.delete(relative);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(twoImagesMap, "two city files"),
    /missing assets\/visuals\/cities\/|exactly 200 city WebP files/
  );
});

test("v2.4 city visual contract rejects any extra non-canonical WebP in the city directory", () => {
  const fileMap = baseMap(false);
  setBytes(fileMap, "assets/visuals/cities/evil.webp", oneByOneWebp());
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(fileMap, "extra city WebP"),
    /exactly 200 city WebP files|non-canonical WebP path/
  );
});

test("v2.4 city visual contract rejects JSON/JS drift and a wrong catalog city ID at unchanged count", () => {
  const drift = baseMap(false);
  const manifest = json(drift, CityVisualContract.CITY_JSON);
  manifest.generatedAt = "2099-01-01T00:00:00.000Z";
  setJson(drift, CityVisualContract.CITY_JSON, manifest);
  assert.throws(() => CityVisualContract.validateCityVisualContract(drift, "JSON JS drift"), /JSON and JS differ/);

  const wrongId = baseMap(false);
  const catalog = json(wrongId, "catalog-data/manifest.json");
  const selectionPath = `catalog-data/${catalog.selectionData.path}`;
  const selection = json(wrongId, selectionPath);
  selection.rows.city[0][0] = "city-not-in-released-manifest";
  setJson(wrongId, selectionPath, selection);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(wrongId, "wrong city ID"),
    /IDs do not match the catalog city IDs exactly/
  );
});

test("v2.4 city visual contract rejects changed bytes/hash and actual 1x1 content declared as 960x540", () => {
  const tampered = baseMap(false);
  const manifest = json(tampered, CityVisualContract.CITY_JSON);
  const relative = manifest.items[0].path.slice(2);
  setBytes(tampered, relative, Buffer.concat([tampered.get(relative).content, Buffer.from("tampered") ]));
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(tampered, "tampered image"),
    /byte length mismatch|SHA-256 mismatch/
  );

  const tiny = baseMap(false);
  updateReleasedCity(tiny, json(tiny, CityVisualContract.CITY_JSON).items[0].id, oneByOneWebp());
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(tiny, "one pixel city"),
    /actual WebP dimensions must be 960x540; found 1x1/
  );
});

test("v2.4 combined manifest rejects pending/stale cities and malicious book/movie hosts or routes", () => {
  const pending = baseMap(false);
  const pendingCombined = globalValue(pending, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  pendingCombined.counts.approvedOpenLicenseCities = 199;
  pendingCombined.counts.pendingOpenLicenseCities = 1;
  pendingCombined.items.find((item) => item.type === "city").status = "pending-open-license-review";
  setGlobal(pending, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, pendingCombined);
  assert.throws(() => CityVisualContract.validateCityVisualContract(pending, "pending city"), /approve exactly 200 cities/);

  const stale = baseMap(false);
  const staleCombined = globalValue(stale, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  staleCombined.items.find((item) => item.type === "city").audit.local.sha256 = "0".repeat(64);
  setGlobal(stale, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, staleCombined);
  assert.throws(() => CityVisualContract.validateCityVisualContract(stale, "stale city audit"), /local audit does not match/);

  const badBook = baseMap(false);
  const badBookCombined = globalValue(badBook, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  const book = badBookCombined.items.find((item) => item.type === "book");
  book.candidates[0] = book.candidates[0].replace("images.weserv.nl", "evil.invalid");
  book.primary = book.candidates[0];
  setGlobal(badBook, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, badBookCombined);
  assert.throws(() => CityVisualContract.validateCityVisualContract(badBook, "malicious book host"), /unsupported book image route/);

  const badMovie = baseMap(false);
  const badMovieCombined = globalValue(badMovie, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  const movie = badMovieCombined.items.find((item) => item.type === "movie");
  movie.candidates[1] = movie.candidates[1].replace("/poster/medium/", "/poster/original/");
  movie.candidates[0] = `https://images.weserv.nl/?url=${encodeURIComponent(movie.candidates[1])}&w=480&fit=cover&output=webp`;
  movie.primary = movie.candidates[0];
  setGlobal(badMovie, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, badMovieCombined);
  assert.throws(() => CityVisualContract.validateCityVisualContract(badMovie, "malicious movie route"), /unsupported movie image route/);
});

test("v2.4 remote visual contract binds book/movie IDs and cover routes to the packaged catalogs", () => {
  const externalBook = baseMap(false);
  const externalBookCombined = globalValue(externalBook, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  const book = externalBookCombined.items.find((item) => item.type === "book");
  book.id = "/works/OL999999999W";
  book.sourcePage = "https://openlibrary.org/works/OL999999999W";
  setGlobal(externalBook, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, externalBookCombined);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(externalBook, "pool-external book"),
    /IDs do not match/
  );

  const externalMovie = baseMap(false);
  const externalMovieCombined = globalValue(externalMovie, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  const movie = externalMovieCombined.items.find((item) => item.type === "movie");
  const externalMovieId = "tt9999999999";
  movie.id = externalMovieId;
  movie.identityKey = `imdb-id:${externalMovieId}`;
  movie.sourcePage = `https://www.imdb.com/title/${externalMovieId}/`;
  movie.candidates[1] = `https://images.metahub.space/poster/medium/${externalMovieId}/img`;
  movie.candidates[2] = `https://images.metahub.space/poster/small/${externalMovieId}/img`;
  movie.candidates[0] = `https://images.weserv.nl/?url=${encodeURIComponent(movie.candidates[1])}&w=480&fit=cover&output=webp`;
  movie.primary = movie.candidates[0];
  setGlobal(externalMovie, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, externalMovieCombined);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(externalMovie, "pool-external movie"),
    /IDs do not match/
  );

  const wrongCover = baseMap(false);
  const wrongCoverCombined = globalValue(wrongCover, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  const wrongBook = wrongCoverCombined.items.find((item) => item.type === "book");
  const originalCoverId = Number(/cover-id:(\d+)/.exec(wrongBook.identityKey)[1]);
  const wrongCoverId = String(originalCoverId + 1);
  wrongBook.identityKey = `cover-id:${wrongCoverId}`;
  wrongBook.candidates[1] = `https://covers.openlibrary.org/b/id/${wrongCoverId}-M.jpg?default=false`;
  wrongBook.candidates[2] = `https://covers.openlibrary.org/b/id/${wrongCoverId}-L.jpg?default=false`;
  wrongBook.candidates[0] = `https://images.weserv.nl/?url=${encodeURIComponent(wrongBook.candidates[1])}&w=480&fit=cover&output=webp`;
  wrongBook.primary = wrongBook.candidates[0];
  setGlobal(wrongCover, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, wrongCoverCombined);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(wrongCover, "wrong catalog cover"),
    /audited candidates diverge from packaged visuals\.js/
  );
});

test("v2.4 remote visual contract rejects real detail-chunk image/source drift while IDs and counts remain valid", () => {
  const manifest = json(baseMap(false), "catalog-data/manifest.json");

  const bookMap = baseMap(false);
  const bookRecord = manifest.details.chunks.find((record) => record.type === "book");
  const bookPath = `catalog-data/${bookRecord.path}`;
  const books = moduleValue(bookMap, bookPath);
  books[0].image = `${books[0].image}#detail-drift`;
  setModule(bookMap, bookPath, books);
  assert.equal(books.length, bookRecord.count);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(bookMap, "book detail drift"),
    /book detail visual identity diverges from catalog\.js/
  );

  const movieMap = baseMap(false);
  const movieRecord = manifest.details.chunks.find((record) => record.type === "movie");
  const moviePath = `catalog-data/${movieRecord.path}`;
  const movies = moduleValue(movieMap, moviePath);
  movies[0].sourceUrl = `${movies[0].sourceUrl}?detail-drift=1`;
  setModule(movieMap, moviePath, movies);
  assert.equal(movies.length, movieRecord.count);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(movieMap, "movie detail drift"),
    /movie detail visual identity diverges from catalog\.js/
  );
});

test("v2.4 city evidence rejects a Commons sourcePage switched to a different File across release layers", () => {
  const fileMap = baseMap(true);
  const manifest = json(fileMap, CityVisualContract.CITY_JSON);
  const city = manifest.items[0];
  const id = city.id;
  const otherFilePage = "https://commons.wikimedia.org/wiki/File:Different_city_visual.jpg";
  city.sourcePage = otherFilePage;
  setCityManifest(fileMap, manifest);

  const combined = globalValue(fileMap, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  combined.items.find((item) => item.type === "city" && item.id === id).sourcePage = otherFilePage;
  setGlobal(fileMap, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, combined);

  const candidates = json(fileMap, CityVisualContract.EVIDENCE_FILES.candidates);
  candidates.items.find((item) => item.id === id).selected.pageUrl = otherFilePage;
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.candidates, candidates);
  refreshCandidateSourceBindings(fileMap);

  const overrides = json(fileMap, CityVisualContract.EVIDENCE_FILES.overrides);
  overrides.items.find((item) => item.id === id).pageUrl = otherFilePage;
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.overrides, overrides);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(fileMap, "different Commons File", { requireEvidence: true }),
    /source page or attribution does not match its frozen file identity|does not match frozen Commons evidence/
  );
});

const JURISDICTION_DOWNGRADES = [
  ["city-berlin", "CC-BY-SA-3.0", "Creative Commons Attribution-ShareAlike 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"],
  ["city-hamburg", "CC-BY-SA-3.0", "Creative Commons Attribution-ShareAlike 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"],
  ["city-tallinn", "CC-BY-SA-3.0", "Creative Commons Attribution-ShareAlike 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"],
  ["city-kashgar", "CC-BY-3.0", "Creative Commons Attribution 3.0", "https://creativecommons.org/licenses/by/3.0/"],
  ["city-brasilia", "CC-BY-3.0", "Creative Commons Attribution 3.0", "https://creativecommons.org/licenses/by/3.0/"],
  ["city-fremantle", "CC-BY-2.5", "Creative Commons Attribution 2.5", "https://creativecommons.org/licenses/by/2.5/"]
];

for (const [id, code, name, url] of JURISDICTION_DOWNGRADES) {
  test(`v2.4 evidence rejects ${id} jurisdiction licence downgraded to ${code}`, () => {
    const fileMap = baseMap(true);
    const manifest = json(fileMap, CityVisualContract.CITY_JSON);
    const city = manifest.items.find((item) => item.id === id);
    assert.ok(city, `fixture must contain ${id}`);
    city.licenseName = name;
    city.licenseUrl = url;
    city.attribution = city.attribution.replace(/CC-BY(?:-SA)?-[0-9.]+-[A-Z]+/, code);
    setCityManifest(fileMap, manifest);

    const combined = globalValue(fileMap, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
    const combinedCity = combined.items.find((item) => item.type === "city" && item.id === id);
    combinedCity.licenseName = name;
    combinedCity.licenseUrl = url;
    combinedCity.attribution = city.attribution;
    setGlobal(fileMap, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, combined);

    const candidates = json(fileMap, CityVisualContract.EVIDENCE_FILES.candidates);
    const selected = candidates.items.find((item) => item.id === id).selected;
    selected.license = { code, name, url };
    selected.attribution = city.attribution;
    setJson(fileMap, CityVisualContract.EVIDENCE_FILES.candidates, candidates);
    refreshCandidateSourceBindings(fileMap);

    const overrides = json(fileMap, CityVisualContract.EVIDENCE_FILES.overrides);
    const override = overrides.items.find((item) => item.id === id);
    override.license = { code, name, url };
    override.attribution = city.attribution;
    setJson(fileMap, CityVisualContract.EVIDENCE_FILES.overrides, overrides);
    assert.throws(
      () => CityVisualContract.validateCityVisualContract(fileMap, `${id} generic licence downgrade`, { requireEvidence: true }),
      /does not match frozen Commons evidence|jurisdiction-specific licence/
    );
  });
}

test("v2.4 full-release evidence rejects a stale approval after released/staged bytes change", () => {
  const fileMap = baseMap(true);
  const manifest = json(fileMap, CityVisualContract.CITY_JSON);
  const id = manifest.items[0].id;
  const released = fileMap.get(`assets/visuals/cities/${id}.webp`).content;
  const changed = Buffer.concat([released, Buffer.from("review-revision")]);
  const { digest, bytes } = updateReleasedCity(fileMap, id, changed);
  setBytes(fileMap, `assets/visuals/cities-staged/${id}.webp`, bytes);

  const candidates = json(fileMap, CityVisualContract.EVIDENCE_FILES.candidates);
  const candidate = candidates.items.find((item) => item.id === id);
  candidate.selected.staged.sha256 = digest;
  candidate.selected.staged.bytes = bytes.length;
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.candidates, candidates);
  const sourceHash = sha256(fileMap.get(CityVisualContract.EVIDENCE_FILES.candidates).content);

  const overrides = json(fileMap, CityVisualContract.EVIDENCE_FILES.overrides);
  const override = overrides.items.find((item) => item.id === id);
  override.local.sha256 = digest;
  override.local.bytes = bytes.length;
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.overrides, overrides);

  const reviews = json(fileMap, CityVisualContract.EVIDENCE_FILES.reviews);
  reviews.sourceManifestSha256 = sourceHash;
  for (const review of reviews.items) review.contactSheetSourceManifestSha256 = sourceHash;
  // Deliberately retain this city's prior visualSha256/stagedSha256 approval.
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.reviews, reviews);

  const contact = json(fileMap, CityVisualContract.EVIDENCE_FILES.contactIndex);
  contact.sourceManifestSha256 = sourceHash;
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.contactIndex, contact);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(fileMap, "stale review", { requireEvidence: true }),
    /review approval is stale or not bound/
  );
});

test("v2.4 full-release evidence rejects staged-file tampering and missing/wrong contact-sheet evidence", () => {
  const staged = baseMap(true);
  const id = json(staged, CityVisualContract.CITY_JSON).items[0].id;
  const stagedPath = `assets/visuals/cities-staged/${id}.webp`;
  setBytes(staged, stagedPath, Buffer.concat([staged.get(stagedPath).content, Buffer.from("tampered") ]));
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(staged, "tampered staged image", { requireEvidence: true }),
    /staged city image does not match/
  );

  const missingContact = baseMap(true);
  const contact = json(missingContact, CityVisualContract.EVIDENCE_FILES.contactIndex);
  missingContact.delete(contact.pages[0]);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(missingContact, "missing contact sheet", { requireEvidence: true }),
    /is missing data\/visuals\/city-review-evidence\/contact-01\.jpg/
  );

  const wrongContactHash = baseMap(true);
  const wrongContact = json(wrongContactHash, CityVisualContract.EVIDENCE_FILES.contactIndex);
  wrongContact.pageEvidence[0].sha256 = "0".repeat(64);
  setJson(wrongContactHash, CityVisualContract.EVIDENCE_FILES.contactIndex, wrongContact);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(wrongContactHash, "wrong contact hash", { requireEvidence: true }),
    /contact-sheet bytes\/hash mismatch/
  );
});

test("v2.4 full-release evidence binds each selected city to one frozen Commons payload and rejects frozen inventory drift", () => {
  const missingSelected = baseMap(true);
  const candidates = json(missingSelected, CityVisualContract.EVIDENCE_FILES.candidates);
  const selectedHash = candidates.items[0].selected.sourceMetadataSha256;
  const selectedHashes = new Set(candidates.items.map((item) => item.selected.sourceMetadataSha256));
  const frozenPaths = [...missingSelected.keys()].filter((relative) => /^data\/visuals\/evidence\/commons-city-pages\/[^/]+\.html\.gz$/.test(relative));
  const selectedPath = frozenPaths.find((relative) => sha256(zlib.gunzipSync(missingSelected.get(relative).content)) === selectedHash);
  assert.ok(selectedPath, "test fixture must contain the selected city's frozen File-page payload");
  const replacementPath = frozenPaths.find((relative) => {
    const hash = sha256(zlib.gunzipSync(missingSelected.get(relative).content));
    return relative !== selectedPath && !selectedHashes.has(hash);
  });
  assert.ok(replacementPath, "test fixture must contain an unselected frozen File-page payload");
  setBytes(missingSelected, selectedPath, missingSelected.get(replacementPath).content);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(missingSelected, "missing selected frozen payload", { requireEvidence: true }),
    /must match exactly one frozen Commons File-page payload; found 0/
  );

  const extraFrozen = baseMap(true);
  setBytes(extraFrozen, "data/visuals/evidence/commons-city-pages/unexpected.html.gz", extraFrozen.get(frozenPaths[0]).content);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(extraFrozen, "extra frozen payload", { requireEvidence: true }),
    /exactly 804 frozen Commons HTML evidence files; found 805/
  );
});

test("v2.4 full-release evidence rejects coordinated released-author drift not supported by candidate/frozen evidence", () => {
  const fileMap = baseMap(true);
  const manifest = json(fileMap, CityVisualContract.CITY_JSON);
  const city = manifest.items[0];
  const id = city.id;
  city.author = "Forged Attribution";
  city.attribution = city.attribution.replace(/^[^,]+/, "Forged Attribution");
  setCityManifest(fileMap, manifest);

  const combined = globalValue(fileMap, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL);
  const combinedCity = combined.items.find((item) => item.type === "city" && item.id === id);
  combinedCity.audit.author = city.author;
  combinedCity.attribution = city.attribution;
  setGlobal(fileMap, CityVisualContract.COMBINED_JS, COMBINED_GLOBAL, combined);

  const overrides = json(fileMap, CityVisualContract.EVIDENCE_FILES.overrides);
  const override = overrides.items.find((item) => item.id === id);
  override.author = city.author;
  override.attribution = city.attribution;
  setJson(fileMap, CityVisualContract.EVIDENCE_FILES.overrides, overrides);
  assert.throws(
    () => CityVisualContract.validateCityVisualContract(fileMap, "forged released author", { requireEvidence: true }),
    /candidate evidence is stale|does not match frozen Commons evidence/
  );
});

test("v2.4 service-worker contract rejects stale VISUAL_VERSION even when CACHE_VERSION was refreshed", () => {
  const fileMap = staticMap();
  assert.doesNotThrow(() => ServiceWorkerContract.validateServiceWorkerContract(fileMap, "service-worker baseline"));
  const manifest = json(fileMap, CityVisualContract.CITY_JSON);
  manifest.generatedAt = "2099-12-31T23:59:59.000Z";
  setCityManifest(fileMap, manifest);
  assert.doesNotThrow(() => CityVisualContract.validateCityVisualContract(fileMap, "city metadata changed"));

  const currentWorker = fileMap.get("sw.js").content.toString("utf8");
  const priorVisual = ServiceWorkerContract.PACK_VERSIONS.visual.exec(currentWorker)[1];
  const expected = ServiceWorkerContract.expectedServiceWorkerContract(Buffer.from(currentWorker), fileMap, "cache-only refresh");
  const freshExceptVisual = ServiceWorkerBuild.applyPackVersions(
    currentWorker,
    { ...expected.packs, visual: priorVisual },
    expected.audioManifestSha256
  );
  const cacheVersion = ServiceWorkerContract.expectedServiceWorkerContract(
    Buffer.from(freshExceptVisual),
    fileMap,
    "cache-only refresh"
  ).cacheVersion;
  const cacheOnly = freshExceptVisual.replace(
    /const CACHE_VERSION = "v3-[a-f0-9]{16}";/,
    `const CACHE_VERSION = "${cacheVersion}";`
  );
  setBytes(fileMap, "sw.js", Buffer.from(cacheOnly, "utf8"));
  assert.throws(
    () => ServiceWorkerContract.validateServiceWorkerContract(fileMap, "cache-only refresh"),
    /visual pack version is stale/
  );
});
