const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const GENRES = Object.freeze(["history", "mystery", "scifi"]);
const STATUSES = Object.freeze(["keep", "reclassify", "reject"]);
const TYPE_PREFIX = Object.freeze({ book: "books", movie: "movies" });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function inferredGenre(fileName) {
  const match = /-(history|mystery|scifi)\.json$/i.exec(fileName);
  return match ? match[1].toLowerCase() : null;
}

function normalizeDocument(payload, fileName) {
  if (Array.isArray(payload)) {
    return { schemaVersion: 1, genre: inferredGenre(fileName), items: payload };
  }
  assert(payload && typeof payload === "object", `${fileName} must contain an object or array`);
  assert(payload.schemaVersion === 1, `${fileName} schemaVersion must be 1`);
  assert(Array.isArray(payload.items), `${fileName} must contain an items array`);
  const genre = payload.genre == null ? inferredGenre(fileName) : payload.genre;
  assert(genre == null || GENRES.includes(genre), `${fileName} has an invalid document genre`);
  return { schemaVersion: payload.schemaVersion, genre, items: payload.items };
}

function validateNullableText(value, label) {
  assert(value == null || hasText(value), `${label} must be null or non-empty text`);
}

function validateEntry(rawEntry, context) {
  const { type, fileName, sourceGenre, index, fileSha256 } = context;
  const label = `${fileName} item ${index + 1}`;
  assert(rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry), `${label} must be an object`);
  const idPattern = type === "book" ? /^\/works\/OL\d+W$/ : /^tt\d{7,10}$/;
  assert(idPattern.test(String(rawEntry.id || "")), `${label} has an invalid ${type} ID`);

  for (const field of ["titleZh", "summary", "reason", "audience", "genreRationale", "evidenceNote"]) {
    assert(hasText(rawEntry[field]), `${label} is missing ${field}`);
  }
  validateNullableText(rawEntry.series, `${label}.series`);
  assert(
    rawEntry.installment == null || hasText(rawEntry.installment) || (Number.isInteger(rawEntry.installment) && rawEntry.installment > 0),
    `${label}.installment must be null, non-empty text, or a positive integer`
  );
  assert(typeof rawEntry.standaloneFriendly === "boolean", `${label}.standaloneFriendly must be boolean`);
  validateNullableText(rawEntry.prerequisite, `${label}.prerequisite`);
  assert(
    hasText(rawEntry.contentNotes) || (
      Array.isArray(rawEntry.contentNotes) && rawEntry.contentNotes.length > 0 && rawEntry.contentNotes.every(hasText)
    ),
    `${label}.contentNotes must be non-empty text or a non-empty text array`
  );

  const status = rawEntry.status == null ? "keep" : rawEntry.status;
  assert(STATUSES.includes(status), `${label} has an invalid status`);
  const recommendedGenre = rawEntry.recommendedGenre == null
    ? (status === "reject" ? null : sourceGenre)
    : rawEntry.recommendedGenre;
  if (status === "reject") {
    assert(recommendedGenre == null, `${label} rejects must not declare a recommended genre`);
  } else {
    assert(GENRES.includes(recommendedGenre), `${label} needs a valid recommendedGenre`);
  }
  if (status === "reclassify" && sourceGenre) {
    assert(recommendedGenre !== sourceGenre, `${label} reclassify must change the document genre`);
  }

  for (const optionalField of ["region", "language"]) {
    if (Object.hasOwn(rawEntry, optionalField)) validateNullableText(rawEntry[optionalField], `${label}.${optionalField}`);
  }

  return Object.freeze({
    ...rawEntry,
    status,
    recommendedGenre,
    editorialSource: Object.freeze({ file: fileName, sha256: fileSha256, sourceGenre })
  });
}

function loadCurationEntries(directory, type) {
  assert(Object.hasOwn(TYPE_PREFIX, type), `unsupported curation type: ${type}`);
  if (!fs.existsSync(directory)) return Object.freeze({ type, files: [], entries: [] });
  const prefix = `${TYPE_PREFIX[type]}-`;
  const fileNames = fs.readdirSync(directory)
    .filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith(".json"))
    .sort();
  const entries = [];
  const files = [];
  const byId = new Map();
  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const document = normalizeDocument(payload, fileName);
    const fileSha256 = sha256File(filePath);
    files.push(Object.freeze({ file: fileName, sha256: fileSha256, genre: document.genre, count: document.items.length }));
    document.items.forEach((rawEntry, index) => {
      const entry = validateEntry(rawEntry, { type, fileName, sourceGenre: document.genre, index, fileSha256 });
      assert(!byId.has(entry.id), `${entry.id} appears in both ${byId.get(entry.id)?.editorialSource.file} and ${fileName}`);
      byId.set(entry.id, entry);
      entries.push(entry);
    });
  }
  return Object.freeze({ type, files: Object.freeze(files), entries: Object.freeze(entries) });
}

function coverageFor(items, originalIds, curation, expectedReviewed = 150) {
  assert(Array.isArray(items), "items must be an array");
  const originals = originalIds instanceof Set ? originalIds : new Set(originalIds || []);
  const additions = items.filter((item) => !originals.has(item.id));
  const additionIds = new Set(additions.map((item) => item.id));
  assert(additionIds.size === additions.length, "addition IDs must be unique before applying curation");
  const byId = new Map(curation.entries.map((entry) => [entry.id, entry]));
  const accepted = curation.entries.filter((entry) => entry.status !== "reject");
  const missing = additions.filter((item) => !byId.has(item.id) || byId.get(item.id).status === "reject").map((item) => item.id);
  const extraAccepted = accepted.filter((entry) => !additionIds.has(entry.id)).map((entry) => entry.id);
  const selectedRejected = additions
    .filter((item) => byId.get(item.id)?.status === "reject")
    .map((item) => item.id);
  const ready = additions.length === expectedReviewed
    && missing.length === 0
    && extraAccepted.length === 0
    && selectedRejected.length === 0
    && accepted.length === expectedReviewed;
  return Object.freeze({
    ready,
    expectedReviewed,
    additionCount: additions.length,
    acceptedCount: accepted.length,
    rejectedCount: curation.entries.length - accepted.length,
    missing: Object.freeze(missing),
    extraAccepted: Object.freeze(extraAccepted),
    selectedRejected: Object.freeze(selectedRejected)
  });
}

function applyEntry(item, entry, genreLabels) {
  assert(entry.status !== "reject", `cannot apply rejected curation entry: ${entry.id}`);
  const genre = entry.recommendedGenre;
  const genres = [genre, ...(Array.isArray(item.genres) ? item.genres : [])]
    .filter((value, index, values) => GENRES.includes(value) && values.indexOf(value) === index);
  const tags = (Array.isArray(item.tags) ? item.tags : [])
    .filter((tag) => !/source-screened|来源筛选/i.test(String(tag)));
  const genreLabel = genreLabels && genreLabels[genre];
  if (hasText(genreLabel) && !tags.includes(genreLabel)) tags.unshift(genreLabel);
  if (!tags.includes("编辑复核")) tags.push("编辑复核");
  const metadataFlags = (Array.isArray(item.metadataFlags) ? item.metadataFlags : [])
    .filter((flag) => !/source-screened|display title follows the Open Library/i.test(String(flag)));

  return {
    ...item,
    genre,
    ...(hasText(genreLabel) ? { genreLabel: `${genreLabel}·编辑复核` } : {}),
    genres,
    title: entry.titleZh.trim(),
    titleZh: entry.titleZh.trim(),
    summary: entry.summary.trim(),
    reason: entry.reason.trim(),
    audience: entry.audience.trim(),
    genreRationale: entry.genreRationale.trim(),
    series: entry.series,
    installment: entry.installment,
    standaloneFriendly: entry.standaloneFriendly,
    prerequisite: entry.prerequisite,
    contentNotes: entry.contentNotes,
    evidenceNote: entry.evidenceNote.trim(),
    status: entry.status,
    recommendedGenre: genre,
    ...(Object.hasOwn(entry, "region") ? { region: entry.region } : {}),
    ...(Object.hasOwn(entry, "language") ? { language: entry.language } : {}),
    tags,
    ...(metadataFlags.length ? { metadataFlags } : { metadataFlags: undefined }),
    curationLevel: "editorial-reviewed",
    editorialReview: {
      sourceFile: `data/editorial/${entry.editorialSource.file}`,
      sourceSha256: entry.editorialSource.sha256,
      sourceGenre: entry.editorialSource.sourceGenre,
      status: entry.status,
      recommendedGenre: genre
    }
  };
}

function applyCurationWhenComplete(options) {
  const { items, originalIds, curation, genreLabels, expectedReviewed = 150 } = options;
  const coverage = coverageFor(items, originalIds, curation, expectedReviewed);
  if (!coverage.ready) return Object.freeze({ applied: false, items, coverage, files: curation.files });
  const byId = new Map(curation.entries.filter((entry) => entry.status !== "reject").map((entry) => [entry.id, entry]));
  const originals = originalIds instanceof Set ? originalIds : new Set(originalIds || []);
  const reviewedItems = items.map((item) => originals.has(item.id) ? item : applyEntry(item, byId.get(item.id), genreLabels));
  assert(reviewedItems.filter((item) => item.curationLevel === "editorial-reviewed").length === expectedReviewed,
    `expected ${expectedReviewed} editorial-reviewed items after applying curation`);
  assert(!reviewedItems.some((item) => item.status === "reject"), "a rejected item reached the final pool");
  return Object.freeze({ applied: true, items: reviewedItems, coverage, files: curation.files });
}

module.exports = Object.freeze({
  GENRES,
  STATUSES,
  loadCurationEntries,
  coverageFor,
  applyEntry,
  applyCurationWhenComplete
});
