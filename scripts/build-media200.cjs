const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const zlib = require("node:zlib");

const Curation = require("./media-curation.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const RAW = path.join(DATA, "raw");
const LATEST_PATH = path.join(DATA, "upstream", "latest.json");
const BOOKS50_PATH = path.join(RAW, "books50.json");
const MOVIES50_PATH = path.join(RAW, "movies50.json");
const BOOKS200_PATH = path.join(RAW, "books200.json");
const MOVIES200_PATH = path.join(RAW, "movies200.json");
const AUDIT_PATH = path.join(DATA, "MEDIA200_AUDIT.md");
const EDITORIAL_PATH = path.join(DATA, "editorial");

const TARGET_PRIMARY = Object.freeze({ history: 67, mystery: 67, scifi: 66 });
const MIN_PRIMARY_GENRE_COUNT = 40;
const GENRE_LABEL = Object.freeze({ history: "历史", mystery: "悬疑", scifi: "科幻" });
const BOOK_RATING_MIN = 4;
const BOOK_COUNT_MIN = 20;
const MOVIE_RATING_MIN = 7.5;
const MOVIE_COUNT_MIN = 30000;
const MOVIE_SKIPS = Object.freeze([0, 50, 100, 150, 200, 250, 300, 350, 400, 450]);
const POPULARITY_TAG = Object.freeze({ classic: "高样本", mid: "中等样本", underseen: "相对少评" });
const MOVIE_ADDITION_TIER_TARGETS = Object.freeze({
  history: Object.freeze({ underseen: 17, mid: 28, classic: 4 }),
  mystery: Object.freeze({ underseen: 14, mid: 26, classic: 10 }),
  scifi: Object.freeze({ underseen: 5, mid: 12, classic: 34 })
});

const MOVIE_DISPLAY_YEAR_OVERRIDES = Object.freeze({
  tt0056058: Object.freeze({
    expectedUpstreamYear: 1964,
    expectedSourceReleasedAt: "1964-08-04T00:00:00.000Z",
    correctedYear: 1962,
    title: "Harakiri",
    rationale: "The work year is 1962; the frozen source's later released value remains preserved as upstream evidence.",
    referenceUrl: "https://www.criterionchannel.com/harakiri",
    secondaryReferenceUrl: "https://v2.sg.media-imdb.com/suggestion/t/tt0056058.json"
  }),
  tt31514146: Object.freeze({
    expectedUpstreamYear: 2026,
    expectedSourceReleasedAt: "2026-04-24T00:00:00.000Z",
    correctedYear: 2025,
    title: "I Swear",
    rationale: "The verified work year is 2025; the frozen source's 2026 released value remains preserved as upstream evidence.",
    referenceUrl: "https://www.ifco.ie/en/ifco/pages/2E441B46003C04FD",
    secondaryReferenceUrl: "https://v2.sg.media-imdb.com/suggestion/t/tt31514146.json"
  }),
  tt17009710: Object.freeze({
    expectedUpstreamYear: 2024,
    expectedSourceReleasedAt: "2024-03-22T00:00:00.000Z",
    correctedYear: 2023,
    title: "Anatomy of a Fall",
    rationale: "Festival de Cannes records the production year as 2023; the frozen source's 2024 regional released value remains preserved as upstream evidence.",
    referenceUrl: "https://www.festival-cannes.com/en/f/anatomie-d-une-chute/",
    secondaryReferenceUrl: "https://www.festival-cannes.com/en/2023/justine-triet-dissects-relationships-in-anatomie-dune-chute-anatomy-of-a-fall/"
  })
});

// The lists below are editorial inclusion decisions over the immutable Open
// Library search snapshot. They intentionally avoid silently turning a subject
// search result into a genre fact. The generated copy remains source-screened,
// not represented as a completed reading assessment.
const BOOK_ADDITIONS = Object.freeze({
  history: Object.freeze([
    "/works/OL36287W", "/works/OL3506116W", "/works/OL16509148W", "/works/OL98459W",
    "/works/OL114967W", "/works/OL18020192W", "/works/OL1868110W", "/works/OL276798W",
    "/works/OL17332150W", "/works/OL273644W", "/works/OL1063588W", "/works/OL18012166W",
    "/works/OL21435W", "/works/OL1815447W", "/works/OL5781992W", "/works/OL1846074W",
    "/works/OL274518W", "/works/OL8193478W", "/works/OL267096W", "/works/OL29983W",
    "/works/OL23166W", "/works/OL267171W", "/works/OL27778127W", "/works/OL1807144W",
    "/works/OL1503145W", "/works/OL1856675W", "/works/OL2746369W", "/works/OL1003040W",
    "/works/OL3261155W", "/works/OL50565W", "/works/OL1253285W", "/works/OL74504W",
    "/works/OL1388028W", "/works/OL2941508W", "/works/OL17635834W", "/works/OL36861W",
    "/works/OL5730339W", "/works/OL8702048W", "/works/OL257663W", "/works/OL15382656W",
    "/works/OL38495W", "/works/OL39360W", "/works/OL784051W", "/works/OL38483W",
    "/works/OL1719794W", "/works/OL23286W", "/works/OL69630W", "/works/OL4092569W",
    "/works/OL17812650W", "/works/OL2746372W"
  ]),
  mystery: Object.freeze([
    "/works/OL166894W", "/works/OL81630W", "/works/OL262426W", "/works/OL262438W",
    "/works/OL262463W", "/works/OL472165W", "/works/OL278437W", "/works/OL41059W",
    "/works/OL1673205W", "/works/OL2625431W", "/works/OL14973266W", "/works/OL471895W",
    "/works/OL167166W", "/works/OL84778W", "/works/OL41016W", "/works/OL276728W",
    "/works/OL1911336W", "/works/OL11374287W", "/works/OL16806525W", "/works/OL471771W",
    "/works/OL1948704W", "/works/OL19345264W", "/works/OL41072W", "/works/OL167189W",
    "/works/OL2163628W", "/works/OL84766W", "/works/OL5947682W", "/works/OL80761W",
    "/works/OL17081803W", "/works/OL176092W", "/works/OL19800082W", "/works/OL14727W",
    "/works/OL84774W", "/works/OL84767W", "/works/OL39275W", "/works/OL76972W",
    "/works/OL48035W", "/works/OL1963316W", "/works/OL20759125W", "/works/OL81634W",
    "/works/OL110971W", "/works/OL3464570W", "/works/OL8514692W", "/works/OL17358795W",
    "/works/OL20073906W", "/works/OL2172356W", "/works/OL675722W", "/works/OL2897797W",
    "/works/OL2950903W", "/works/OL14911626W"
  ]),
  scifi: Object.freeze([
    "/works/OL21745884W", "/works/OL2897798W", "/works/OL17091839W", "/works/OL49488W",
    "/works/OL1168083W", "/works/OL19800273W", "/works/OL17610507W", "/works/OL16114008W",
    "/works/OL16117275W", "/works/OL46241W", "/works/OL38494W", "/works/OL1168007W",
    "/works/OL16809836W", "/works/OL20735675W", "/works/OL46881W", "/works/OL1975705W",
    "/works/OL1963268W", "/works/OL100779W", "/works/OL19650409W", "/works/OL19747311W",
    "/works/OL17365W", "/works/OL5734647W", "/works/OL46125W", "/works/OL17417W",
    "/works/OL16314245W", "/works/OL19753589W", "/works/OL19340986W", "/works/OL21704818W",
    "/works/OL19075470W", "/works/OL38501W", "/works/OL17914663W", "/works/OL17074648W",
    "/works/OL1846076W", "/works/OL103134W", "/works/OL271163W", "/works/OL18191919W",
    "/works/OL15936512W", "/works/OL17716925W", "/works/OL2252098W", "/works/OL52267W",
    "/works/OL19332006W", "/works/OL17897265W", "/works/OL49580W", "/works/OL13646905W",
    "/works/OL1099280W", "/works/OL59704W", "/works/OL261794W", "/works/OL20157046W",
    "/works/OL15000756W", "/works/OL1737320W"
  ])
});

// These are deliberately narrow, Work-ID-specific bibliographic corrections.
// The immutable Open Library search rows are preserved in metadataAudit; the
// corrected value is used only for display and decade tagging. A future source
// refresh that changes an expected raw value must be reviewed explicitly rather
// than being "fixed" by a broad year heuristic.
const BOOK_FIRST_PUBLISH_YEAR_OVERRIDES = Object.freeze({
  "/works/OL176092W": Object.freeze({
    expectedUpstreamYear: 1800,
    correctedYear: 1868,
    workTitle: "The Moonstone",
    rationale: "Bibliographic correction for Wilkie Collins's The Moonstone, published in 1868.",
    referenceUrl: "https://search.worldcat.org/title/The-Moonstone/oclc/49727789"
  }),
  "/works/OL1815447W": Object.freeze({
    expectedUpstreamYear: 1861,
    correctedYear: 1976,
    workTitle: "Roots",
    rationale: "Bibliographic correction for Alex Haley's Roots, first edition published in 1976.",
    referenceUrl: "https://search.worldcat.org/title/Roots/oclc/2188350"
  }),
  "/works/OL2746369W": Object.freeze({
    expectedUpstreamYear: 1900,
    correctedYear: 1980,
    workTitle: "The Clan of the Cave Bear",
    rationale: "Bibliographic correction for Jean M. Auel's The Clan of the Cave Bear, first edition published in 1980.",
    referenceUrl: "https://search.worldcat.org/title/6277166"
  }),
  "/works/OL1253285W": Object.freeze({
    expectedUpstreamYear: 1900,
    correctedYear: 1905,
    workTitle: "The Scarlet Pimpernel",
    rationale: "Bibliographic correction for Baroness Orczy's The Scarlet Pimpernel novel, first published in 1905.",
    referenceUrl: "https://search.worldcat.org/title/Scarlet-Pimpernel-The/oclc/1078570373"
  }),
  "/works/OL1846074W": Object.freeze({
    expectedUpstreamYear: 1901,
    correctedYear: 1989,
    workTitle: "Number the Stars",
    rationale: "Bibliographic correction for Lois Lowry's Number the Stars, published by Houghton Mifflin in 1989.",
    referenceUrl: "https://search.worldcat.org/title/Number-the-stars/oclc/755033504"
  }),
  "/works/OL98459W": Object.freeze({
    expectedUpstreamYear: 1956,
    correctedYear: 1969,
    workTitle: "Slaughterhouse-Five",
    rationale: "Bibliographic correction for Kurt Vonnegut's Slaughterhouse-Five, published in 1969.",
    referenceUrl: "https://www.loc.gov/exhibits/america-reads/1950-to-2009.html#obj052"
  }),
  "/works/OL41059W": Object.freeze({
    expectedUpstreamYear: 1958,
    correctedYear: 1843,
    workTitle: "The Tell-Tale Heart",
    rationale: "Bibliographic correction to the story's first printing in The Pioneer in January 1843.",
    referenceUrl: "https://www.eapoe.org/works/info/pt043.htm"
  }),
  "/works/OL2941508W": Object.freeze({
    expectedUpstreamYear: 2000,
    correctedYear: 2002,
    workTitle: "The Secret Life of Bees",
    rationale: "The author's official bibliography and Library of Congress identify the Viking novel as published in 2002; a 2001 date belongs to a separately cataloged audiobook, so it is not used for the novel.",
    referenceUrl: "https://suemonkkidd.com/books/the-secret-life-of-bees/",
    secondaryReferenceUrl: "https://www.loc.gov/static/managed-content/uploads/sites/22/2024/07/nbf09_monk_kidd.pdf"
  }),
  "/works/OL114967W": Object.freeze({
    expectedUpstreamYear: 1791,
    correctedYear: 1906,
    workTitle: "The Jungle",
    rationale: "Bibliographic correction for Upton Sinclair's The Jungle, first published in 1906.",
    referenceUrl: "https://www.loc.gov/exhibits/america-reads/1900-to-1949.html#obj014"
  }),
  "/works/OL2746372W": Object.freeze({
    expectedUpstreamYear: 1611,
    correctedYear: 1985,
    workTitle: "The Mammoth Hunters",
    rationale: "Bibliographic correction for Jean M. Auel's The Mammoth Hunters, first published in 1985.",
    referenceUrl: "https://search.worldcat.org/title/The-mammoth-hunters/oclc/12371377"
  }),
  "/works/OL36287W": Object.freeze({
    expectedUpstreamYear: 1830,
    correctedYear: 1844,
    workTitle: "The Count of Monte Cristo",
    rationale: "Bibliographic correction to the start of The Count of Monte Cristo's original publication in 1844.",
    referenceUrl: "https://etc.usf.edu/lit2go/180/the-count-of-monte-cristo/"
  }),
  "/works/OL8193478W": Object.freeze({
    expectedUpstreamYear: 1822,
    correctedYear: 1837,
    workTitle: "Oliver Twist",
    rationale: "Bibliographic correction to the start of Oliver Twist's monthly serial publication in 1837 (book form followed in 1838).",
    referenceUrl: "https://www.vam.ac.uk/articles/charles-dickens"
  }),
  "/works/OL273644W": Object.freeze({
    expectedUpstreamYear: 1976,
    correctedYear: 1982,
    workTitle: "The Color Purple",
    rationale: "Bibliographic correction for Alice Walker's The Color Purple, first edition published in 1982.",
    referenceUrl: "https://search.worldcat.org/title/The-color-purple-%3A-a-novel/oclc/8221433"
  }),
  "/works/OL81634W": Object.freeze({
    expectedUpstreamYear: 1978,
    correctedYear: 1987,
    workTitle: "Misery",
    rationale: "Bibliographic correction for Stephen King's Misery, published by Viking in 1987.",
    referenceUrl: "https://search.worldcat.org/title/Misery/oclc/979456670"
  }),
  "/works/OL675722W": Object.freeze({
    expectedUpstreamYear: 2002,
    correctedYear: 2003,
    workTitle: "Oryx and Crake",
    rationale: "Bibliographic correction for Margaret Atwood's Oryx and Crake, first U.S. edition published in 2003.",
    referenceUrl: "https://search.worldcat.org/title/Oryx-and-Crake-%3A-a-novel/oclc/50774561"
  }),
  "/works/OL15936512W": Object.freeze({
    expectedUpstreamYear: 2008,
    correctedYear: 2011,
    workTitle: "Ready Player One",
    rationale: "Bibliographic correction for Ernest Cline's Ready Player One, first published in hardcover in 2011.",
    referenceUrl: "https://www.penguinrandomhouse.com/books/209887/ready-player-one-by-ernest-cline/9780307887450/"
  }),
  "/works/OL16114008W": Object.freeze({
    expectedUpstreamYear: 2009,
    correctedYear: 2011,
    workTitle: "Leviathan Wakes",
    rationale: "Bibliographic correction for James S. A. Corey's Leviathan Wakes, first edition published by Orbit in 2011.",
    referenceUrl: "https://search.worldcat.org/title/Leviathan-wakes/oclc/668192559"
  }),
  "/works/OL19800273W": Object.freeze({
    expectedUpstreamYear: 2018,
    correctedYear: 2019,
    workTitle: "Tiamat's Wrath",
    rationale: "Bibliographic correction for James S. A. Corey's Tiamat's Wrath, released by Orbit on March 26, 2019.",
    referenceUrl: "https://www.hachettebookgroup.com/titles/james-s-a-corey/tiamats-wrath/9780316332866/"
  }),
  "/works/OL1737320W": Object.freeze({
    expectedUpstreamYear: 1972,
    correctedYear: 1967,
    workTitle: "I Have No Mouth and I Must Scream",
    rationale: "Bibliographic correction for Harlan Ellison's story collection, originally published by Pyramid in 1967; 1972 is a later printing.",
    referenceUrl: "https://search.worldcat.org/title/I-have-no-mouth-and-I-must-scream-%3A-stories/oclc/3886746"
  }),
  "/works/OL2625431W": Object.freeze({
    expectedUpstreamYear: 2001,
    correctedYear: 2002,
    workTitle: "Kafka on the Shore",
    rationale: "Bibliographic correction for Haruki Murakami's Japanese first edition, published by Shinchosha in 2002.",
    referenceUrl: "https://search.worldcat.org/zh-tw/title/50764038"
  }),
  "/works/OL38483W": Object.freeze({
    expectedUpstreamYear: 2003,
    correctedYear: 2004,
    workTitle: "The Confusion",
    rationale: "Bibliographic correction for Neal Stephenson's The Confusion, first edition published by William Morrow in 2004.",
    referenceUrl: "https://search.worldcat.org/title/confusion/oclc/52727987/lists"
  }),
  "/works/OL267171W": Object.freeze({
    expectedUpstreamYear: 1864,
    correctedYear: 1865,
    workTitle: "War and Peace",
    rationale: "Bibliographic correction to the start of the work's serial publication in 1865; the complete revised book followed in 1869.",
    referenceUrl: "https://www.cambridge.org/core/books/abs/war-and-peace/conclusion-war-and-peace/A16B195EAF0C9D1AA94E5D3FB0DBC852"
  })
});

// These stable Work IDs have genuine work/edition or serial/collection date
// ambiguity. Their upstream values are retained for audit but not displayed as
// definitive first-publication years until an editorial policy chooses which
// bibliographic event the product means.
const BOOK_FIRST_PUBLISH_YEAR_REVIEW_NOTES = Object.freeze({
  "/works/OL1388028W": "该作品合并了跨年份出版的多个分卷；单一首版年取决于按分卷还是按 1958 年合集计算。",
  "/works/OL257663W": "该作品分两部分于 1941 和 1945 年出版；冻结上游的 1943 不作为确定作品年份展示。",
  "/works/OL110971W": "该文集存在 1941、1944 及后续扩充版等不同作品边界；冻结上游的 1945 需要进一步编辑裁定。",
  "/works/OL2897797W": "该作品先有早期连载，后有 DC 合集；冻结上游的 1988 取决于采用哪一种版本边界。",
  "/works/OL13646905W": "该作品有 2006 年自出版版与 2009 年 Dutton 商业版；产品需要先明确采用哪一种版本口径。"
});

const MOVIE_SCIFI_EXCLUDE = new Set([
  "tt0096874", // Back to the Future Part II: reduce same-series concentration.
  "tt0099088", // Back to the Future Part III: reduce same-series concentration.
  "tt1408101"  // Star Trek Into Darkness: reduce same-series concentration.
]);
const MOVIE_MYSTERY_EXCLUDE = new Set([
  "tt0078788", // Apocalypse Now: retained as a possible history candidate instead.
  "tt0783233", // Atonement: history/drama signal is stronger than mystery here.
  "tt0976051", // The Reader: history/drama signal is stronger than mystery here.
  "tt0056058", // Harakiri: retained in the history pool.
  "tt0268978"  // A Beautiful Mind: biography/drama signal is stronger than mystery here.
]);
const MOVIE_ID_REPLACEMENTS = Object.freeze({
  tt12361974: Object.freeze({ id: "tt16277242", genre: "history" }),
  tt4154796: Object.freeze({ id: "tt14961016", genre: "history" }),
  tt4154756: Object.freeze({ id: "tt0074119", genre: "history" }),
  tt3498820: Object.freeze({ id: "tt0042876", genre: "mystery" }),
  tt0848228: Object.freeze({ id: "tt0338564", genre: "mystery" }),
  tt1431045: Object.freeze({ id: "tt7668870", genre: "mystery" }),
  tt1270798: Object.freeze({ id: "tt1136608", genre: "scifi" }),
  tt0080684: Object.freeze({ id: "tt0114746", genre: "scifi" })
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}

function stableColor(key) {
  const digest = crypto.createHash("sha256").update(String(key)).digest();
  const channels = [digest[0], digest[1], digest[2]].map((value) => 38 + (value % 72));
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function popularityTier(count, type) {
  if (type === "book") {
    if (count >= 80) return "classic";
    if (count >= 40) return "mid";
    return "underseen";
  }
  if (count > 500000) return "classic";
  if (count > 100000) return "mid";
  return "underseen";
}

function decadeTag(year) {
  const numeric = Number(year);
  return Number.isInteger(numeric) && numeric > 0 ? `${Math.floor(numeric / 10) * 10}年代` : "年代待核";
}

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizedText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function assertUniqueNormalized(items, field, label) {
  const seen = new Map();
  for (const item of items) {
    const value = normalizedText(item[field]);
    assert(value, `${label} has empty ${field}: ${item.id}`);
    assert(!seen.has(value), `${label} has duplicate normalized ${field}: ${seen.get(value)} and ${item.id}`);
    seen.set(value, item.id);
  }
}

function assertPrimaryGenreCoverage(items, label) {
  const counts = countBy(items, (item) => item.genre);
  for (const genre of Object.keys(TARGET_PRIMARY)) {
    assert((counts[genre] || 0) >= MIN_PRIMARY_GENRE_COUNT,
      `${label} primary ${genre} count must be at least ${MIN_PRIMARY_GENRE_COUNT}; got ${counts[genre] || 0}`);
  }
  return counts;
}

function resolveMovieDisplayYear(meta) {
  const upstreamYear = Number.parseInt(String(meta.year || meta.releaseInfo || "0"), 10) || 0;
  const sourceReleasedAt = String(meta.released || "");
  const override = MOVIE_DISPLAY_YEAR_OVERRIDES[meta.id] || null;
  if (!override) return { upstreamYear, displayYear: upstreamYear, override: null };
  assert(upstreamYear === override.expectedUpstreamYear,
    `movie year override needs review: ${meta.id}; expected upstream ${override.expectedUpstreamYear}, got ${upstreamYear}`);
  assert(sourceReleasedAt === override.expectedSourceReleasedAt,
    `movie release evidence changed for year override: ${meta.id}; expected ${override.expectedSourceReleasedAt}, got ${sourceReleasedAt}`);
  return { upstreamYear, displayYear: override.correctedYear, override };
}

function resolveBookFirstPublishYear(row) {
  const upstreamYear = Number.isInteger(Number(row.first_publish_year)) ? Number(row.first_publish_year) : null;
  const override = BOOK_FIRST_PUBLISH_YEAR_OVERRIDES[row.key];
  const reviewNote = BOOK_FIRST_PUBLISH_YEAR_REVIEW_NOTES[row.key] || null;
  assert(!(override && reviewNote), `book year cannot be both overridden and pending review: ${row.key}`);
  if (!override) return { upstreamYear, displayYear: reviewNote ? null : upstreamYear, override: null, reviewNote };
  assert(
    upstreamYear === override.expectedUpstreamYear,
    `book year override needs review: ${row.key}; expected upstream ${override.expectedUpstreamYear}, got ${upstreamYear}`
  );
  assert(Number.isInteger(override.correctedYear) && override.correctedYear > 0, `invalid corrected book year: ${row.key}`);
  return { upstreamYear, displayYear: override.correctedYear, override, reviewNote: null };
}

function snapshotDateEndTimestamp(snapshotDate) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(String(snapshotDate)), `invalid snapshot date: ${snapshotDate}`);
  const timestamp = Date.parse(`${snapshotDate}T23:59:59.999Z`);
  assert(Number.isFinite(timestamp), `unparseable snapshot date: ${snapshotDate}`);
  return timestamp;
}

function isReleasedBySnapshot(meta, snapshotDate) {
  const sourceReleasedAt = String(meta && meta.released || "").trim();
  const releasedTimestamp = Date.parse(sourceReleasedAt);
  return Boolean(sourceReleasedAt) && Number.isFinite(releasedTimestamp) && releasedTimestamp <= snapshotDateEndTimestamp(snapshotDate);
}

function verifyManifest() {
  assert(fs.existsSync(LATEST_PATH), "data/upstream/latest.json is missing; refresh sources first");
  const pointer = readJson(LATEST_PATH);
  const manifestPath = path.resolve(ROOT, pointer.manifest);
  assert(manifestPath.startsWith(`${DATA}${path.sep}`), "upstream manifest leaves data directory");
  assert(fs.existsSync(manifestPath), `upstream manifest is missing: ${pointer.manifest}`);
  assert(fileSha256(manifestPath) === pointer.sha256, "upstream manifest SHA-256 mismatch");
  const manifest = readJson(manifestPath);
  assert(Array.isArray(manifest.entries) && manifest.entries.length === 34, "combined upstream manifest must contain 34 entries");
  const byId = new Map();
  for (const entry of manifest.entries) {
    const filePath = path.resolve(ROOT, entry.file);
    assert(filePath.startsWith(`${DATA}${path.sep}`), `upstream entry leaves data directory: ${entry.id}`);
    assert(fs.existsSync(filePath), `upstream file missing: ${entry.file}`);
    assert(fileSha256(filePath) === entry.sha256, `upstream SHA-256 mismatch: ${entry.id}`);
    byId.set(entry.id, { ...entry, filePath });
  }
  for (const genre of Object.keys(TARGET_PRIMARY)) {
    assert(byId.has(`open-library-${genre}`), `missing Open Library ${genre} snapshot`);
    for (const skip of MOVIE_SKIPS) {
      assert(byId.has(`cinemeta-${genre}-${skip}`), `missing Cinemeta ${genre}-${skip} snapshot`);
    }
  }
  assert(byId.has("imdb-title-ratings"), "missing IMDb title.ratings snapshot");
  return { pointer, manifest, manifestPath, byId };
}

function loadOpenLibraryEvidence(audit) {
  const byWork = new Map();
  for (const genre of Object.keys(TARGET_PRIMARY)) {
    const entry = audit.byId.get(`open-library-${genre}`);
    const payload = readJson(entry.filePath);
    assert(Array.isArray(payload.docs), `Open Library ${genre} payload has no docs array`);
    for (const row of payload.docs) {
      if (!/^\/works\/OL\d+W$/.test(String(row.key || ""))) continue;
      if (!byWork.has(row.key)) byWork.set(row.key, { row, sourceGenres: [], evidenceEntries: [] });
      const record = byWork.get(row.key);
      if (!record.sourceGenres.includes(genre)) record.sourceGenres.push(genre);
      record.evidenceEntries.push(entry);
    }
  }
  return byWork;
}

function makeBook(rowEvidence, genre, snapshotDate, retrievedAt) {
  const row = rowEvidence.row;
  const author = Array.isArray(row.author_name) && row.author_name.length ? String(row.author_name[0]) : "作者待核";
  const yearResolution = resolveBookFirstPublishYear(row);
  const year = yearResolution.displayYear;
  const pages = Number.isInteger(Number(row.number_of_pages_median)) ? Number(row.number_of_pages_median) : null;
  const ratingValue = Number(row.ratings_average);
  const ratingCount = Number(row.ratings_count);
  const coverId = Number(row.cover_i);
  const evidence = rowEvidence.evidenceEntries[0];
  const crossGenres = [genre, ...rowEvidence.sourceGenres.filter((value) => value !== genre)];
  const uniqueGenres = [...new Set(crossGenres)].filter((value) => Object.hasOwn(TARGET_PRIMARY, value));
  const palette = stableColor(row.key);
  const yearText = year || "年份待核";
  return {
    id: row.key,
    type: "book",
    genre,
    genreLabel: `${GENRE_LABEL[genre]}·来源筛选`,
    title: String(row.title),
    originalTitle: String(row.title),
    year: year || 0,
    creator: author,
    detail: pages ? `约 ${pages} 页` : "页数因版本而异",
    summary: `Open Library 书目快照记录《${row.title}》由 ${author} 创作，首次出版年份约为 ${yearText}。本条依据书目、题材检索与评分证据入池，不把来源筛选表述成通读后的情节评价。`,
    reason: `《${row.title}》在 ${snapshotDate} Open Library 快照中的 Work 评分为 ${ratingValue.toFixed(2)}/5（${ratingCount} 人评分），达到候选池门槛；本轮按${GENRE_LABEL[genre]}主类收录，后续仍可做深度编辑复核。`,
    image: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
    sourceUrl: `https://openlibrary.org${row.key}`,
    genres: uniqueGenres,
    author: { zh: author, common: author },
    pagesEstimate: pages,
    coverId,
    palette,
    visual: palette,
    tags: [GENRE_LABEL[genre], decadeTag(year), POPULARITY_TAG[popularityTier(ratingCount, "book")], "来源筛选"],
    audience: `希望从评分合格的${GENRE_LABEL[genre]}书目中继续探索，并愿意在阅读前核对译本、版本和内容提示的读者`,
    metadataFlags: [
      "source-screened; not represented as fully read",
      "display title follows the Open Library work record and may not be a localized Chinese title",
      ...(yearResolution.reviewNote ? ["first-publication year withheld pending work/edition boundary review"] : [])
    ],
    rating: {
      source: "Open Library",
      value: Number(ratingValue.toFixed(6)),
      max: 5,
      count: ratingCount,
      snapshot: snapshotDate,
      endpoint: evidence.effectiveUrl || evidence.requestedUrl
    },
    popularityTier: popularityTier(ratingCount, "book"),
    metadataAudit: {
      checkedAt: retrievedAt,
      evidenceFile: evidence.file,
      evidenceSha256: evidence.sha256,
      evidenceRecordType: "Open Library Search API work row",
      openLibraryTitle: String(row.title),
      openLibraryFirstPublishYear: yearResolution.upstreamYear,
      displayFirstPublishYear: year,
      ...(yearResolution.override ? {
        firstPublishYearOverride: {
          workId: row.key,
          upstreamValue: yearResolution.upstreamYear,
          correctedValue: yearResolution.override.correctedYear,
          workTitle: yearResolution.override.workTitle,
          rationale: yearResolution.override.rationale,
          referenceUrl: yearResolution.override.referenceUrl,
          ...(yearResolution.override.secondaryReferenceUrl ? {
            secondaryReferenceUrl: yearResolution.override.secondaryReferenceUrl
          } : {})
        }
      } : {}),
      ...(yearResolution.reviewNote ? {
        firstPublishYearReview: {
          status: "display-withheld",
          upstreamValue: yearResolution.upstreamYear,
          note: yearResolution.reviewNote
        }
      } : {}),
      searchSubjectMembership: rowEvidence.sourceGenres,
      coverIdPresentInSearchRow: Boolean(coverId)
    },
    pagesEstimateSource: "Open Library Search API number_of_pages_median; edition-aggregated and approximate",
    curationLevel: "source-screened"
  };
}

function buildBooks(audit, snapshotDate) {
  const original = readJson(BOOKS50_PATH);
  assert(Array.isArray(original.books) && original.books.length === 50, "books50 source must contain 50 books");
  const originalIds = new Set(original.books.map((item) => item.id));
  const evidence = loadOpenLibraryEvidence(audit);
  const additions = [];
  for (const [genre, ids] of Object.entries(BOOK_ADDITIONS)) {
    assert(ids.length === 50, `${genre} must specify exactly 50 book additions`);
    for (const id of ids) {
      assert(!originalIds.has(id), `book addition duplicates original pool: ${id}`);
      const rowEvidence = evidence.get(id);
      assert(rowEvidence, `selected book is absent from current Open Library snapshot: ${id}`);
      const row = rowEvidence.row;
      assert(Number(row.ratings_average) >= BOOK_RATING_MIN, `book rating below threshold: ${id}`);
      assert(Number(row.ratings_count) >= BOOK_COUNT_MIN, `book rating count below threshold: ${id}`);
      assert(Number(row.cover_i) > 0, `selected book has no cover ID: ${id}`);
      assert(Array.isArray(row.author_name) && row.author_name.length, `selected book has no author: ${id}`);
      additions.push(makeBook(rowEvidence, genre, snapshotDate, audit.manifest.completedAt));
    }
  }
  assert(new Set(additions.map((item) => item.id)).size === 150, "book additions contain duplicate Work IDs");
  for (const [workId, override] of Object.entries(BOOK_FIRST_PUBLISH_YEAR_OVERRIDES)) {
    const item = additions.find((candidate) => candidate.id === workId);
    assert(item, `book year override Work ID is not in the additions: ${workId}`);
    assert(item.year === override.correctedYear, `book year override was not applied: ${workId}`);
    assert(item.metadataAudit.openLibraryFirstPublishYear === override.expectedUpstreamYear,
      `book year override lost the upstream value: ${workId}`);
    assert(item.metadataAudit.firstPublishYearOverride.correctedValue === override.correctedYear,
      `book year override audit is incomplete: ${workId}`);
  }
  for (const [workId, note] of Object.entries(BOOK_FIRST_PUBLISH_YEAR_REVIEW_NOTES)) {
    const item = additions.find((candidate) => candidate.id === workId);
    assert(item, `book year review Work ID is not in the additions: ${workId}`);
    assert(item.year === 0, `book year under review must not be displayed as definitive: ${workId}`);
    assert(item.metadataAudit.firstPublishYearReview.status === "display-withheld" && item.metadataAudit.firstPublishYearReview.note === note,
      `book year review audit is incomplete: ${workId}`);
  }

  const preserved = original.books.map((item) => ({ ...item, curationLevel: item.curationLevel || "editorial-curated" }));
  const baselineBooks = [...preserved, ...additions];
  const editorialCuration = Curation.applyCurationWhenComplete({
    items: baselineBooks,
    originalIds,
    curation: Curation.loadCurationEntries(EDITORIAL_PATH, "book"),
    genreLabels: GENRE_LABEL,
    expectedReviewed: 150
  });
  assert(editorialCuration.applied,
    `book editorial coverage is incomplete; refusing to publish source-screened additions: ${JSON.stringify(editorialCuration.coverage)}`);
  const books = editorialCuration.items;
  assert(!books.some((item) => item.curationLevel === "source-screened"),
    "book pool must not publish a source-screened addition");
  validateMediaPool(books, "book", snapshotDate);
  const primaryGenreCounts = assertPrimaryGenreCoverage(books, "book");
  const authorCounts = countBy(books, (item) => item.author && item.author.common || item.creator);
  const distinctAuthorLabels = Object.keys(authorCounts).length;
  const maximumBooksByOneAuthorLabel = Math.max(...Object.values(authorCounts));
  assert(distinctAuthorLabels >= 140, `book pool needs at least 140 author labels; got ${distinctAuthorLabels}`);
  assert(maximumBooksByOneAuthorLabel <= 7, `book pool over-concentrates one author label: ${maximumBooksByOneAuthorLabel}`);

  const payload = {
    schemaVersion: 3,
    snapshotDate,
    retrievedAt: audit.manifest.completedAt,
    source: {
      name: "Open Library",
      manifest: relative(audit.manifestPath),
      manifestSha256: audit.pointer.sha256,
      licensing: "https://openlibrary.org/developers/licensing",
      apiGuidelines: "https://openlibrary.org/developers/api"
    },
    selectionRules: {
      ratingMinimum: BOOK_RATING_MIN,
      ratingMaximum: 5,
      ratingCountMinimum: BOOK_COUNT_MIN,
      targetPrimaryGenres: TARGET_PRIMARY,
      finalPrimaryGenreMinimum: MIN_PRIMARY_GENRE_COUNT,
      firstPublishYearOverrides: Object.fromEntries(Object.entries(BOOK_FIRST_PUBLISH_YEAR_OVERRIDES).map(([workId, override]) => [workId, {
        upstreamValue: override.expectedUpstreamYear,
        correctedValue: override.correctedYear,
        referenceUrl: override.referenceUrl,
        ...(override.secondaryReferenceUrl ? { secondaryReferenceUrl: override.secondaryReferenceUrl } : {})
      }])),
      firstPublishYearReviewPending: Object.keys(BOOK_FIRST_PUBLISH_YEAR_REVIEW_NOTES),
      curationBoundary: editorialCuration.applied
        ? "All 150 additions have an item-level editorial decision and are marked editorial-reviewed; explicit rejects are absent from the pool."
        : "The editorial overlay is incomplete, so all 150 additions remain source-screened and are excluded from ordinary recommendations.",
      editorialCuration: {
        applied: editorialCuration.applied,
        files: editorialCuration.files,
        coverage: editorialCuration.coverage
      },
      popularityTierMethod: {
        basis: "Open Library rating count at each row's declared snapshot; platform-relative only",
        classic: "count >= 80",
        mid: "40 <= count <= 79",
        underseen: "20 <= count <= 39"
      }
    },
    counts: {
      total: books.length,
      preservedEditorialPool: preserved.length,
      editorialReviewedAdditions: books.filter((item) => item.curationLevel === "editorial-reviewed").length,
      sourceScreenedAdditions: books.filter((item) => item.curationLevel === "source-screened").length,
      primaryGenre: primaryGenreCounts,
      genreMembership: countBy(books.flatMap((item) => item.genres.map((genre) => ({ genre }))), (item) => item.genre),
      popularityTier: countBy(books, (item) => item.popularityTier),
      distinctAuthorLabels,
      maximumBooksByOneAuthorLabel
    },
    books
  };
  return payload;
}

function loadCinemeta(audit) {
  const byGenre = {};
  const byId = new Map();
  for (const genre of Object.keys(TARGET_PRIMARY)) {
    const ordered = [];
    const seen = new Set();
    for (const skip of MOVIE_SKIPS) {
      const entry = audit.byId.get(`cinemeta-${genre}-${skip}`);
      const payload = readJson(entry.filePath);
      assert(Array.isArray(payload.metas), `Cinemeta ${genre}-${skip} payload has no metas array`);
      for (const meta of payload.metas) {
        const id = String(meta.id || meta.imdb_id || "");
        if (!/^tt\d+$/.test(id)) continue;
        if (!byId.has(id)) byId.set(id, { meta, sourceGenres: [], evidenceEntries: [] });
        const record = byId.get(id);
        if (!record.sourceGenres.includes(genre)) record.sourceGenres.push(genre);
        if (!record.evidenceEntries.some((candidate) => candidate.id === entry.id)) record.evidenceEntries.push(entry);
        if (!seen.has(id)) {
          ordered.push(id);
          seen.add(id);
        }
      }
    }
    byGenre[genre] = ordered;
  }
  return { byGenre, byId };
}

async function readImdbRatings(filePath, wantedIds) {
  const ratings = new Map();
  const input = fs.createReadStream(filePath).pipe(zlib.createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headerSeen = false;
  for await (const line of lines) {
    if (!headerSeen) {
      assert(line === "tconst\taverageRating\tnumVotes", "unexpected IMDb ratings header");
      headerSeen = true;
      continue;
    }
    const [id, ratingRaw, countRaw] = line.split("\t");
    if (!wantedIds.has(id)) continue;
    ratings.set(id, { value: Number(ratingRaw), count: Number(countRaw), rawLine: line });
  }
  assert(headerSeen, "IMDb ratings snapshot is empty");
  return ratings;
}

function qualifiedMovie(id, evidence, ratings, originalIds, usedIds, snapshotDate) {
  if (originalIds.has(id) || usedIds.has(id)) return false;
  const record = evidence.byId.get(id);
  const rating = ratings.get(id);
  if (!record || !rating) return false;
  if (record.meta.type !== "movie") return false;
  if (!isReleasedBySnapshot(record.meta, snapshotDate)) return false;
  if (rating.value < MOVIE_RATING_MIN || rating.count < MOVIE_COUNT_MIN) return false;
  if (!String(record.meta.name || "").trim()) return false;
  if (!Array.isArray(record.meta.director) || !record.meta.director.length) return false;
  if (!String(record.meta.description || "").trim()) return false;
  return true;
}

function assertMovieReleaseGuard(snapshotDate) {
  const id = "tt999999999";
  const baseMeta = {
    id,
    type: "movie",
    name: "Release guard fixture",
    director: ["Test Director"],
    description: "A deterministic in-process fixture for the release-date boundary."
  };
  const rating = { value: MOVIE_RATING_MIN, count: MOVIE_COUNT_MIN };
  const ratings = new Map([[id, rating]]);
  const originalIds = new Set();
  const usedIds = new Set();
  const evidenceFor = (released) => ({ byId: new Map([[id, { meta: { ...baseMeta, released } }]]) });
  const sameDay = `${snapshotDate}T23:59:59.999Z`;
  const nextInstant = new Date(snapshotDateEndTimestamp(snapshotDate) + 1).toISOString();
  assert(qualifiedMovie(id, evidenceFor(sameDay), ratings, originalIds, usedIds, snapshotDate),
    "movie released on the snapshot date must remain eligible");
  assert(!qualifiedMovie(id, evidenceFor(nextInstant), ratings, originalIds, usedIds, snapshotDate),
    "movie released after the snapshot date must be rejected");
  assert(!qualifiedMovie(id, evidenceFor(""), ratings, originalIds, usedIds, snapshotDate),
    "movie without an auditable source release time must be rejected");
}

function selectMovieIds(evidence, ratings, originalMovies, snapshotDate) {
  const originalIds = new Set(originalMovies.map((item) => item.id));
  const used = new Set();
  const selected = { history: [], mystery: [], scifi: [] };
  const directorCounts = countBy(originalMovies, (item) => item.creatorOriginal || item.creator);
  for (const genre of ["scifi", "mystery", "history"]) {
    const excluded = genre === "scifi" ? MOVIE_SCIFI_EXCLUDE : genre === "mystery" ? MOVIE_MYSTERY_EXCLUDE : new Set();
    const targets = MOVIE_ADDITION_TIER_TARGETS[genre];
    for (const tier of ["underseen", "mid", "classic"]) {
      let selectedInTier = 0;
      for (const id of evidence.byGenre[genre]) {
        if (selectedInTier === targets[tier]) break;
        if (excluded.has(id) || !qualifiedMovie(id, evidence, ratings, originalIds, used, snapshotDate)) continue;
        if (popularityTier(ratings.get(id).count, "movie") !== tier) continue;
        const director = evidence.byId.get(id).meta.director.map(String).join(" / ");
        if ((directorCounts[director] || 0) >= 6) continue;
        selected[genre].push(id);
        used.add(id);
        directorCounts[director] = (directorCounts[director] || 0) + 1;
        selectedInTier += 1;
      }
      assert(selectedInTier === targets[tier], `expected ${targets[tier]} ${tier} ${genre} additions, got ${selectedInTier}`);
    }
  }
  assert(used.size === 150, "movie additions contain duplicate IMDb IDs");
  for (const [rejectedId, replacement] of Object.entries(MOVIE_ID_REPLACEMENTS)) {
    const sourceGenre = Object.keys(selected).find((genre) => selected[genre].includes(rejectedId));
    assert(sourceGenre, `movie replacement target is not in the selected additions: ${rejectedId}`);
    selected[sourceGenre] = selected[sourceGenre].filter((id) => id !== rejectedId);
    used.delete(rejectedId);
    assert(Object.hasOwn(TARGET_PRIMARY, replacement.genre), `movie replacement has invalid genre: ${replacement.id}`);
    assert(qualifiedMovie(replacement.id, evidence, ratings, originalIds, used, snapshotDate),
      `movie replacement no longer meets frozen source/rating/release requirements: ${replacement.id}`);
    selected[replacement.genre].push(replacement.id);
    used.add(replacement.id);
  }
  assert(used.size === 150, "movie replacements changed the 150-item addition count");
  assert(new Set(Object.values(selected).flat()).size === 150, "movie replacements produced duplicate IMDb IDs");
  return selected;
}

function makeMovie(record, rating, genre, snapshotDate, retrievedAt, imdbEntry) {
  const meta = record.meta;
  const director = meta.director.map(String).join(" / ");
  const yearResolution = resolveMovieDisplayYear(meta);
  const year = yearResolution.displayYear;
  const sourceGenres = record.sourceGenres.filter((value) => Object.hasOwn(TARGET_PRIMARY, value));
  const appGenres = [...new Set([genre, ...sourceGenres])];
  const metadataGenres = Array.isArray(meta.genres) ? meta.genres.map(String).filter(Boolean) : [];
  const evidenceFiles = record.evidenceEntries.map((entry) => entry.file);
  const evidenceHashes = record.evidenceEntries.map((entry) => entry.sha256);
  const palette = stableColor(meta.id);
  return {
    id: meta.id,
    type: "movie",
    genre,
    genreLabel: `${GENRE_LABEL[genre]}·来源筛选`,
    title: String(meta.name),
    originalTitle: String(meta.name),
    year,
    creator: director,
    creatorOriginal: director,
    detail: String(meta.runtime || "片长待核"),
    summary: `《${meta.name}》由 ${director} 执导，于 ${year || "年份待核"} 年前后推出。Cinemeta 元数据将其标记为 ${metadataGenres.slice(0, 4).join("、") || "类型待核"}；本条使用来源简介进行入池筛查，但不把第三方简介改写成已完整观看后的判断。`,
    reason: `《${meta.name}》在 IMDb ${snapshotDate} 官方非商业评分快照中记录为 ${rating.value.toFixed(1)}/10（${rating.count} 票），达到本池门槛；Cinemeta 的导演、片长、类型和来源简介字段完整，因此进入${GENRE_LABEL[genre]}来源筛选层。`,
    rating: {
      source: "IMDb",
      value: rating.value,
      max: 10,
      count: rating.count,
      snapshot: snapshotDate
    },
    image: `https://images.metahub.space/poster/medium/${meta.id}/img`,
    visual: palette,
    sourceUrl: `https://www.imdb.com/title/${meta.id}/`,
    genres: appGenres,
    tags: [GENRE_LABEL[genre], decadeTag(year), ...metadataGenres.slice(0, 2), POPULARITY_TAG[popularityTier(rating.count, "movie")], "来源筛选"],
    audience: `希望从 IMDb 评分合格的${GENRE_LABEL[genre]}影片中继续探索，并愿意在观看前核对分级、地区版本与内容提示的观众。`,
    popularityTier: popularityTier(rating.count, "movie"),
    curationLevel: "source-screened",
    metadataAudit: {
      checkedAt: retrievedAt,
      cinemetaEvidenceFiles: evidenceFiles,
      cinemetaEvidenceSha256: evidenceHashes,
      cinemetaDescriptionSha256: sha256(String(meta.description)),
      cinemetaDescriptionUsedForScreening: true,
      cinemetaDescriptionRepublished: false,
      imdbEvidenceFile: imdbEntry.file,
      imdbEvidenceSha256: imdbEntry.sha256,
      imdbRatingRecord: rating.rawLine,
      sourceGenreMembership: sourceGenres,
      sourceMetadataGenres: metadataGenres,
      sourceCountry: String(meta.country || ""),
      sourceReleasedAt: String(meta.released),
      sourceReleaseCutoffDate: snapshotDate,
      sourceDisplayYear: yearResolution.upstreamYear,
      ...(yearResolution.override ? {
        displayYearOverride: {
          imdbId: meta.id,
          title: yearResolution.override.title,
          upstreamValue: yearResolution.upstreamYear,
          upstreamReleasedAt: String(meta.released),
          correctedValue: yearResolution.override.correctedYear,
          rationale: yearResolution.override.rationale,
          referenceUrl: yearResolution.override.referenceUrl,
          secondaryReferenceUrl: yearResolution.override.secondaryReferenceUrl
        }
      } : {})
    }
  };
}

async function buildMovies(audit, snapshotDate) {
  const original = readJson(MOVIES50_PATH);
  assert(Array.isArray(original.movies) && original.movies.length === 50, "movies50 source must contain 50 movies");
  const originalIds = new Set(original.movies.map((item) => item.id));
  const evidence = loadCinemeta(audit);
  const wantedIds = new Set([...originalIds, ...evidence.byId.keys()]);
  const imdbEntry = audit.byId.get("imdb-title-ratings");
  const ratings = await readImdbRatings(imdbEntry.filePath, wantedIds);
  for (const id of originalIds) assert(ratings.has(id), `original movie is absent from current IMDb ratings snapshot: ${id}`);

  const selected = selectMovieIds(evidence, ratings, original.movies, snapshotDate);
  const additions = [];
  for (const genre of ["history", "mystery", "scifi"]) {
    for (const id of selected[genre]) {
      additions.push(makeMovie(evidence.byId.get(id), ratings.get(id), genre, snapshotDate, audit.manifest.completedAt, imdbEntry));
    }
  }

  const preserved = original.movies.map((item) => {
    const currentRating = ratings.get(item.id);
    assert(currentRating.value >= MOVIE_RATING_MIN, `preserved movie fell below rating threshold: ${item.id}`);
    assert(currentRating.count >= MOVIE_COUNT_MIN, `preserved movie fell below vote threshold: ${item.id}`);
    return {
      ...item,
      rating: { source: "IMDb", value: currentRating.value, max: 10, count: currentRating.count, snapshot: snapshotDate },
      curationLevel: item.curationLevel || "editorial-curated",
      metadataAudit: {
        ...(item.metadataAudit || {}),
        checkedAt: audit.manifest.completedAt,
        imdbEvidenceFile: imdbEntry.file,
        imdbEvidenceSha256: imdbEntry.sha256,
        imdbRatingRecord: currentRating.rawLine
      }
    };
  });
  const baselineMovies = [...preserved, ...additions];
  const editorialCuration = Curation.applyCurationWhenComplete({
    items: baselineMovies,
    originalIds,
    curation: Curation.loadCurationEntries(EDITORIAL_PATH, "movie"),
    genreLabels: GENRE_LABEL,
    expectedReviewed: 150
  });
  assert(editorialCuration.applied,
    `movie editorial coverage is incomplete; refusing to publish source-screened additions: ${JSON.stringify(editorialCuration.coverage)}`);
  const movies = editorialCuration.items;
  assert(!movies.some((item) => item.curationLevel === "source-screened"),
    "movie pool must not publish a source-screened addition");
  validateMediaPool(movies, "movie", snapshotDate);
  const primaryGenreCounts = assertPrimaryGenreCoverage(movies, "movie");
  for (const [id, override] of Object.entries(MOVIE_DISPLAY_YEAR_OVERRIDES)) {
    const item = movies.find((candidate) => candidate.id === id);
    assert(item, `movie year override IMDb ID is not in the final pool: ${id}`);
    assert(item.year === override.correctedYear, `movie year override was not applied: ${id}`);
    assert(item.metadataAudit.sourceReleasedAt === override.expectedSourceReleasedAt,
      `movie year override lost frozen released evidence: ${id}`);
    assert(item.metadataAudit.displayYearOverride?.upstreamValue === override.expectedUpstreamYear,
      `movie year override lost frozen display-year evidence: ${id}`);
  }
  const directorCounts = countBy(movies, (item) => item.creatorOriginal || item.creator);
  const distinctDirectorLabels = Object.keys(directorCounts).length;
  const maximumMoviesByOneDirectorLabel = Math.max(...Object.values(directorCounts));
  assert(distinctDirectorLabels >= 130, `movie pool needs at least 130 director labels; got ${distinctDirectorLabels}`);
  assert(maximumMoviesByOneDirectorLabel <= 6, `movie pool over-concentrates one director label: ${maximumMoviesByOneDirectorLabel}`);
  const movieTierCounts = countBy(movies, (item) => item.popularityTier);
  assert(movieTierCounts.underseen >= 40 && movieTierCounts.mid >= 80 && movieTierCounts.classic > 0,
    `movie popularity mix lost its mainstream/underseen balance: ${JSON.stringify(movieTierCounts)}`);

  return {
    schemaVersion: 3,
    snapshotDate,
    retrievedAt: audit.manifest.completedAt,
    source: {
      manifest: relative(audit.manifestPath),
      manifestSha256: audit.pointer.sha256,
      imdbDataset: imdbEntry.file,
      imdbDatasetSha256: imdbEntry.sha256,
      imdbLicense: "https://developer.imdb.com/non-commercial-datasets/",
      imdbAcknowledgement: "Information courtesy of IMDb (https://www.imdb.com). Used with permission.",
      cinemetaBoundary: "Cinemeta metadata and descriptions were screening evidence; descriptions are hashed rather than republished verbatim. The service has no project-level availability or commercial-use guarantee."
    },
    threshold: { source: "IMDb", minRating: MOVIE_RATING_MIN, minVotes: MOVIE_COUNT_MIN },
    popularityDefinition: {
      classic: "numVotes > 500000",
      mid: "100000 < numVotes <= 500000",
      underseen: "30000 <= numVotes <= 100000",
      note: "仅表示 IMDb 投票量，不是作品价值判断。"
    },
    selectionRules: {
      targetPrimaryGenres: TARGET_PRIMARY,
      finalPrimaryGenreMinimum: MIN_PRIMARY_GENRE_COUNT,
      sourceScreenedPopularityTargets: MOVIE_ADDITION_TIER_TARGETS,
      sourceReleaseRequirement: `Cinemeta released must be parseable and no later than ${snapshotDate}`,
      preservedEditorialPool: 50,
      sourceScreenedAdditions: editorialCuration.applied ? 0 : 150,
      editorialReviewedAdditions: editorialCuration.applied ? 150 : 0,
      curationBoundary: editorialCuration.applied
        ? "All 150 additions have an item-level editorial decision and are marked editorial-reviewed; explicit rejects are absent from the pool."
        : "The editorial overlay is incomplete, so all 150 additions remain source-screened and are excluded from ordinary recommendations.",
      editorialCuration: {
        applied: editorialCuration.applied,
        files: editorialCuration.files,
        coverage: editorialCuration.coverage
      },
      displayYearOverrides: Object.fromEntries(Object.entries(MOVIE_DISPLAY_YEAR_OVERRIDES).map(([id, override]) => [id, {
        upstreamValue: override.expectedUpstreamYear,
        upstreamReleasedAt: override.expectedSourceReleasedAt,
        correctedValue: override.correctedYear,
        referenceUrl: override.referenceUrl,
        secondaryReferenceUrl: override.secondaryReferenceUrl
      }]))
    },
    counts: {
      total: movies.length,
      preservedEditorialPool: preserved.length,
      editorialReviewedAdditions: movies.filter((item) => item.curationLevel === "editorial-reviewed").length,
      sourceScreenedAdditions: movies.filter((item) => item.curationLevel === "source-screened").length,
      primaryGenre: primaryGenreCounts,
      genreMembership: countBy(movies.flatMap((item) => item.genres.map((genre) => ({ genre }))), (item) => item.genre),
      popularityTier: movieTierCounts,
      distinctDirectorLabels,
      maximumMoviesByOneDirectorLabel
    },
    movies
  };
}

function validateMediaPool(items, type, expectedSnapshotDate) {
  assert(items.length === 200, `${type} pool must contain exactly 200 items`);
  assert(new Set(items.map((item) => item.id)).size === 200, `${type} pool contains duplicate IDs`);
  const idPattern = type === "book" ? /^\/works\/OL\d+W$/ : /^tt\d+$/;
  for (const item of items) {
    assert(item.type === type, `${type} item has wrong type: ${item.id}`);
    assert(idPattern.test(item.id), `${type} item has invalid ID: ${item.id}`);
    assert(Object.hasOwn(TARGET_PRIMARY, item.genre), `${type} item has invalid primary genre: ${item.id}`);
    assert(Array.isArray(item.genres) && item.genres.includes(item.genre), `${type} item omits its primary genre: ${item.id}`);
    assert(String(item.title || "").trim(), `${type} item has no title: ${item.id}`);
    assert(String(item.creator || "").trim(), `${type} item has no creator: ${item.id}`);
    assert(String(item.summary || "").trim(), `${type} item has no summary: ${item.id}`);
    assert(String(item.reason || "").trim(), `${type} item has no reason: ${item.id}`);
    assert(String(item.audience || "").trim(), `${type} item has no audience: ${item.id}`);
    assert(Array.isArray(item.tags) && item.tags.length >= 2, `${type} item has too few tags: ${item.id}`);
    assert(/^https:\/\//.test(item.sourceUrl), `${type} item has invalid source URL: ${item.id}`);
    assert(["editorial-curated", "editorial-reviewed", "source-screened"].includes(item.curationLevel),
      `${type} item has an invalid curation level: ${item.id}`);
    if (item.curationLevel === "editorial-reviewed") {
      for (const field of ["titleZh", "genreRationale", "evidenceNote"]) {
        assert(String(item[field] || "").trim(), `${type} editorial-reviewed item has no ${field}: ${item.id}`);
      }
      assert(["keep", "reclassify"].includes(item.status), `${type} reviewed item has an invalid decision: ${item.id}`);
      assert(item.recommendedGenre === item.genre, `${type} reviewed item did not apply its recommended genre: ${item.id}`);
      assert(typeof item.standaloneFriendly === "boolean", `${type} reviewed item has no standalone assessment: ${item.id}`);
      assert(String(item.summary).length >= 30 && String(item.reason).length >= 30,
        `${type} reviewed item has implausibly short editorial copy: ${item.id}`);
      assert(item.editorialReview && /^[A-F0-9]{64}$/.test(item.editorialReview.sourceSha256),
        `${type} reviewed item has no immutable editorial source hash: ${item.id}`);
    }
    if (type === "book") {
      assert(item.rating.source === "Open Library" && item.rating.max === 5, `invalid book rating source: ${item.id}`);
      assert(item.rating.value >= BOOK_RATING_MIN && item.rating.count >= BOOK_COUNT_MIN, `book threshold failed: ${item.id}`);
      assert(item.popularityTier === popularityTier(item.rating.count, type), `book popularity tier mismatch: ${item.id}`);
    } else {
      assert(item.rating.source === "IMDb" && item.rating.max === 10, `invalid movie rating source: ${item.id}`);
      assert(item.rating.value >= MOVIE_RATING_MIN && item.rating.count >= MOVIE_COUNT_MIN, `movie threshold failed: ${item.id}`);
      assert(item.popularityTier === popularityTier(item.rating.count, type), `movie popularity tier mismatch: ${item.id}`);
      assert(item.rating.snapshot === expectedSnapshotDate, `movie rating snapshot mismatch: ${item.id}`);
      if (item.curationLevel !== "editorial-curated") {
        assert(item.metadataAudit && String(item.metadataAudit.sourceReleasedAt || "").trim(),
          `added movie has no frozen source release time: ${item.id}`);
        assert(item.metadataAudit.sourceReleaseCutoffDate === expectedSnapshotDate,
          `added movie release cutoff does not match its rating snapshot: ${item.id}`);
        assert(isReleasedBySnapshot({ released: item.metadataAudit.sourceReleasedAt }, expectedSnapshotDate),
          `added movie was released after its snapshot date: ${item.id}`);
      }
    }
  }

  const reviewed = items.filter((item) => item.curationLevel === "editorial-reviewed");
  if (reviewed.length) {
    assert(!reviewed.some((item) => /^Open Library\b/i.test(item.summary) || /\bCinemeta\b/i.test(item.summary)),
      `${type} reviewed summaries still contain a source-screening template`);
    assert(!reviewed.some((item) => /\bCinemeta\b/i.test(item.reason)),
      `${type} reviewed reasons still contain a source-screening template`);
    assertUniqueNormalized(reviewed, "summary", `${type} editorial-reviewed additions`);
    assertUniqueNormalized(reviewed, "reason", `${type} editorial-reviewed additions`);
  }
}

function markdownAudit(audit, booksPayload, moviesPayload) {
  const bookHash = fileSha256(BOOKS200_PATH);
  const movieHash = fileSha256(MOVIES200_PATH);
  const generatedAt = audit.manifest.completedAt;
  const yearCorrections = booksPayload.books
    .filter((item) => item.metadataAudit && item.metadataAudit.firstPublishYearOverride)
    .map((item) => {
      const correction = item.metadataAudit.firstPublishYearOverride;
      const references = `[依据](${correction.referenceUrl})${correction.secondaryReferenceUrl ? `、[补充依据](${correction.secondaryReferenceUrl})` : ""}`;
      return `| \`${item.id}\` | ${correction.workTitle} | ${correction.upstreamValue} | ${correction.correctedValue} | ${references} |`;
    })
    .join("\n");
  const yearReviewPending = booksPayload.books
    .filter((item) => item.metadataAudit && item.metadataAudit.firstPublishYearReview)
    .map((item) => `- \`${item.id}\` ${item.title}：${item.metadataAudit.firstPublishYearReview.note}`)
    .join("\n");
  return `# 书影音 200 条扩池证据说明\n\n` +
    `生成时间（固定为上游快照完成时间，保证字节级复现）：${generatedAt}  \n` +
    `上游联合清单：\`${relative(audit.manifestPath)}\`  \n` +
    `上游联合清单 SHA-256：\`${audit.pointer.sha256}\`\n\n` +
    `## 已确认结果\n\n` +
    `- 图书严格 200 本；主分类为历史／悬疑／科幻 ${booksPayload.counts.primaryGenre.history}／${booksPayload.counts.primaryGenre.mystery}／${booksPayload.counts.primaryGenre.scifi}。\n` +
    `- 电影严格 200 部；主分类为历史／悬疑／科幻 ${moviesPayload.counts.primaryGenre.history}／${moviesPayload.counts.primaryGenre.mystery}／${moviesPayload.counts.primaryGenre.scifi}。\n` +
    `- 原有 50 个 Open Library Work ID 和 50 个 IMDb title ID 全部保留。\n` +
    `- 新增图书 150 本全部满足 Open Library 评分不低于 4.0/5、评分人数不少于 20；新增电影与原有电影均逐 ID 对照本次 IMDb 官方 \`title.ratings.tsv.gz\`，满足 7.5/10、30,000 票门槛。\n` +
    `- 新增电影还要求 Cinemeta \`released\` 可解析且不晚于 ${moviesPayload.snapshotDate}；原始上映时间逐条保存在 \`metadataAudit.sourceReleasedAt\`。\n` +
    `- ${Object.keys(BOOK_FIRST_PUBLISH_YEAR_OVERRIDES).length} 个可可靠确认的 Open Library 首版年份按稳定 Work ID 显式校正；上游原值和校正依据均保留在 \`metadataAudit.firstPublishYearOverride\`。另有 ${Object.keys(BOOK_FIRST_PUBLISH_YEAR_REVIEW_NOTES).length} 个作品／版本边界存在实质歧义，展示年份置为“待核”，不套用通用猜测规则。\n` +
    `- 图书热度层：${JSON.stringify(booksPayload.counts.popularityTier)}；电影热度层：${JSON.stringify(moviesPayload.counts.popularityTier)}。热度只表示平台评分人数。\n` +
    `- 图书作者标签 ${booksPayload.counts.distinctAuthorLabels} 个，单一作者标签最多 ${booksPayload.counts.maximumBooksByOneAuthorLabel} 本；电影导演标签 ${moviesPayload.counts.distinctDirectorLabels} 个，单一导演标签最多 ${moviesPayload.counts.maximumMoviesByOneDirectorLabel} 部。\n\n` +
    `## 图书年份加固\n\n` +
    `| Open Library Work ID | 作品 | 冻结上游值 | 展示校正值 | 外部依据 |\n| --- | --- | ---: | ---: | --- |\n${yearCorrections}\n\n` +
    `### 暂不显示确定年份\n\n${yearReviewPending}\n\n` +
    `《The Secret Life of Bees》采用 2002，而不是 2001：[作者官网](https://suemonkkidd.com/books/the-secret-life-of-bees/)和[美国国会图书馆](https://www.loc.gov/static/managed-content/uploads/sites/22/2024/07/nbf09_monk_kidd.pdf)均把 Viking 小说列为 2002；WorldCat 的 2001 记录是单独的有声书记录，不能据此提前小说的出版年。\n\n` +
    `## 策展证据等级\n\n` +
    `原有各 50 条保留为 \`editorial-curated\`。新增各 150 条均有逐项中文简介、推荐理由、题材依据、适读／适看边界、内容提示和证据说明，并标为 \`editorial-reviewed\`；编辑决定为 reject 的候选不会进入成品池。评分只证明达到来源门槛，逐项策展也不等于作品适合所有人。\n\n` +
    `Cinemeta 的英文简介用于判定元数据完整性和候选相关性；为避免把第三方文字批量再发布，生成数据只保存简介 SHA-256 及证据文件引用，不逐字复制简介。中文展示文案只陈述导演、年份、类型、评分与筛选层级。\n\n` +
    `## 上游证据\n\n` +
    `- Open Library：3 份不可变 Search API 响应，分别对应历史、悬疑和科幻查询；新增条目逐项记录证据文件与 SHA-256。Search API 的 Work 级评分字段用于本轮来源筛选，但不等同于保存每个 \`/ratings.json\` 的单条 HTTP 原始响应。\n` +
    `- IMDb：官方非商业 \`title.ratings.tsv.gz\`，SHA-256 \`${audit.byId.get("imdb-title-ratings").sha256}\`。每部电影在 \`metadataAudit.imdbRatingRecord\` 中保存实际匹配行。Information courtesy of IMDb (https://www.imdb.com). Used with permission. IMDb 数据限个人、非商业使用，公开商业运营必须重新取得适用许可。\n` +
    `- Cinemeta：30 份分类页响应（每个题材从 skip 0 到 450），提供候选影片的导演、年份、片长、类型和简介存在性；它不是 IMDb 官方数据，也没有服务可用性或商业授权保证。评分真值不采用 Cinemeta 的 \`imdbRating\`。\n` +
    `- 海报：新增影片沿用基于 IMDb ID 的 MetaHub 远程海报端点，只是可失败的展示增强；端点没有商业许可或长期可用性保证，不应被 PWA 静默批量预缓存，应用必须保留文字视觉回退。\n` +
    `- 豆瓣：未抓取、复制或展示豆瓣评分。\n\n` +
    `## 文件哈希\n\n` +
    `- \`data/raw/books200.json\`：\`${bookHash}\`\n` +
    `- \`data/raw/movies200.json\`：\`${movieHash}\`\n\n` +
    `## 可重复验证\n\n` +
    `\`\`\`powershell\nnode scripts/build-media200.cjs --check\n\`\`\`\n\n` +
    `检查模式会重新读取并计算联合清单及 ${audit.manifest.entries.length} 个上游文件的 SHA-256，重建两个 200 条池，并将结果与已交付 JSON 和本审计文档逐字节比较。脚本不联网，不会用当前变化中的分数覆盖固定快照。\n`;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const audit = verifyManifest();
  const snapshotDate = String(audit.manifest.completedAt || audit.manifest.startedAt).slice(0, 10);
  assertMovieReleaseGuard(snapshotDate);
  const booksPayload = buildBooks(audit, snapshotDate);
  const moviesPayload = await buildMovies(audit, snapshotDate);
  const booksText = `${JSON.stringify(booksPayload, null, 2)}\n`;
  const moviesText = `${JSON.stringify(moviesPayload, null, 2)}\n`;

  if (checkOnly) {
    assert(fs.readFileSync(BOOKS200_PATH, "utf8") === booksText, "books200.json is out of date");
    assert(fs.readFileSync(MOVIES200_PATH, "utf8") === moviesText, "movies200.json is out of date");
    const auditText = markdownAudit(audit, booksPayload, moviesPayload);
    assert(fs.readFileSync(AUDIT_PATH, "utf8") === auditText, "MEDIA200_AUDIT.md is out of date");
  } else {
    fs.writeFileSync(BOOKS200_PATH, booksText, "utf8");
    fs.writeFileSync(MOVIES200_PATH, moviesText, "utf8");
    fs.writeFileSync(AUDIT_PATH, markdownAudit(audit, booksPayload, moviesPayload), "utf8");
  }

  console.log(`PASS: books=${booksPayload.books.length} ${JSON.stringify(booksPayload.counts.primaryGenre)}`);
  console.log(`PASS: movies=${moviesPayload.movies.length} ${JSON.stringify(moviesPayload.counts.primaryGenre)}`);
  console.log(`PASS: manifest=${audit.pointer.sha256}${checkOnly ? "; generated files are current" : ""}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
