const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const Engine = require("../engine.js");
require("../catalog.js");

const Catalog = globalThis.DAILY_ATLAS_CATALOG;
const ROOT = path.resolve(__dirname, "..");
const COLLECTIONS = {
  book: Catalog.books,
  movie: Catalog.movies,
  city: Catalog.cities,
  german: Catalog.german,
  medical: Catalog.medical
};

test("all five built-in pools contain the exact v2.1 counts and unique qualified items", () => {
  const expectedCounts = { book: 500, movie: 500, city: 200, german: 500, medical: 500 };
  for (const [type, items] of Object.entries(COLLECTIONS)) {
    assert.equal(items.length, expectedCounts[type], `${type} count`);
    assert.equal(Engine.qualifiedItems(items).length, items.length, `${type} qualification`);
    assert.equal(new Set(items.map((item) => item.id)).size, items.length, `${type} IDs`);
    assert.ok(items.every((item) => item.type === type), `${type} field`);
    assert.ok(items.every((item) => /^https:\/\//.test(item.sourceUrl)), `${type} sources`);
  }
});

test("public books retain attributed ratings while public movies expose only the editorial quality gate", () => {
  assert.ok(Catalog.books.every((item) => item.rating.source === "Open Library" && item.rating.value >= 4 && item.rating.count >= 20));
  assert.ok(Catalog.books.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.rating.snapshot)));
  assert.ok(Catalog.books.every((item) => Array.isArray(item.ratings) && item.ratings.length === 1));
  assert.ok(Catalog.books.every((item) => !item.ratings.some((rating) => /douban|豆瓣/i.test(rating.source))));
  assert.ok(Catalog.movies.every((item) => item.qualityGate === "editorial-qualified"));
  assert.ok(Catalog.movies.every((item) => !Object.hasOwn(item, "rating") && !Object.hasOwn(item, "ratings")));
  assert.ok(Catalog.movies.every((item) => new URL(item.image).hostname === "images.metahub.space"));
  assert.ok(Catalog.movies.every((item) => !/IMDb|\d(?:\.\d+)?\s*\/\s*10|\d[\d,.]*\s*票|固定评分|固定口碑证据/iu.test(`${item.summary} ${item.reason} ${item.audience}`)));
});

test("private build evidence still enforces the frozen movie curation threshold without entering the public payload", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "raw", "movies500.json"), "utf8"));
  assert.equal(payload.movies.length, 500);
  assert.ok(payload.movies.every((item) => item.rating.source === "IMDb" && item.rating.value >= 7.5 && item.rating.count >= 30000));
  assert.ok(payload.movies.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.rating.snapshot)));
  assert.ok(payload.movies.every((item) => !/douban|豆瓣/i.test(item.rating.source)));
});

test("every expanded movie retains frozen release evidence outside the slim mobile runtime catalog", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "raw", "movies500.json"), "utf8"));
  const reviewed = payload.movies.filter((item) => ["editorial-reviewed", "evidence-reviewed"].includes(item.curationLevel));
  assert.equal(reviewed.length, 450);
  for (const item of reviewed) {
    const releasedAt = Date.parse(item.metadataAudit?.sourceReleasedAt);
    const cutoff = Date.parse(`${item.rating.snapshot}T23:59:59.999Z`);
    assert.ok(Number.isFinite(releasedAt), `${item.id} sourceReleasedAt`);
    assert.ok(releasedAt <= cutoff, `${item.id} release after snapshot`);
    assert.equal(item.metadataAudit.sourceReleaseCutoffDate, item.rating.snapshot, `${item.id} cutoff`);
  }
  assert.ok(Catalog.movies.every((item) => !Object.hasOwn(item, "metadataAudit") && !Object.hasOwn(item, "editorialReview")),
    "audit-only movie records stay in data/raw instead of the mobile catalog");
});

test("history, mystery and science fiction each retain a broad floor and popularity diversity", () => {
  for (const items of [Catalog.books, Catalog.movies]) {
    const genreCounts = Object.fromEntries(Engine.GENRES.map((genre) => [genre, items.filter((item) => item.genre === genre).length]));
    assert.ok(Object.values(genreCounts).every((count) => count >= 70), JSON.stringify(genreCounts));
    const classicShare = items.filter((item) => item.popularityTier === "classic").length / items.length;
    assert.ok(classicShare >= 0.2 && classicShare <= 0.35, `classic share ${classicShare}`);
    assert.ok(items.every((item) => ["classic", "mid", "underseen"].includes(item.popularityTier)));
  }
  assert.ok(Catalog.movies.filter((item) => item.popularityTier !== "classic").length >= 300);
});

test("stable IDs, images and generated medical assets are complete", () => {
  assert.ok(Catalog.books.every((item) => /^\/works\/OL\d+W$/.test(item.id)));
  assert.ok(Catalog.movies.every((item) => /^tt\d+$/.test(item.id)));
  assert.ok(Catalog.books.every((item) => /^https:\/\//.test(item.image)));
  assert.ok(Catalog.movies.every((item) => /^https:\/\//.test(item.image)));
  for (const item of Catalog.medical) {
    assert.match(item.image, /^\.\/assets\/medical\/.+\.webp$/);
    assert.ok(fs.existsSync(path.join(ROOT, item.image.slice(2))), item.image);
    assert.ok(item.alt.length >= 8);
  }
  const illustrationManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "medical", "manifest.json"), "utf8"));
  assert.equal(illustrationManifest.items.length, 24);
  assert.equal(new Set(illustrationManifest.items.map((item) => item.key)).size, 24);
  const allowedFiles = new Set(illustrationManifest.items.map((item) => path.basename(item.file)));
  assert.equal(allowedFiles.size, 24);
  assert.ok(illustrationManifest.items.every((item) => fs.existsSync(path.join(ROOT, item.file))));
  assert.ok(Catalog.medical.every((item) => allowedFiles.has(path.basename(item.image))));
  assert.ok(Catalog.medical.every((item) => item.alt.startsWith("插画：")));
});

test("new learning pools have broad geographic, language-level and medical-topic coverage", () => {
  assert.ok(new Set(Catalog.cities.map((item) => item.region)).size >= 6);
  assert.deepEqual(new Set(Catalog.german.map((item) => item.level)), new Set(["A1", "A2", "B1", "B2"]));
  assert.ok(new Set(Catalog.medical.map((item) => item.topicGroup)).size >= 12);
  assert.ok(Catalog.cities.every((item) => item.highlights.length >= 3 && item.summary.length >= 50));
  assert.ok(Catalog.medical.every((item) => /^https:\/\//.test(item.sourceUrl)));
});

test("the original 200 book and movie objects remain the ordered prefix of each 500-item audited source", () => {
  for (const [legacyName, expandedName, key] of [
    ["books200.json", "books500.json", "books"],
    ["movies200.json", "movies500.json", "movies"]
  ]) {
    const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "raw", legacyName), "utf8"))[key];
    const expanded = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "raw", expandedName), "utf8"))[key];
    assert.equal(legacy.length, 200, legacyName);
    assert.equal(expanded.length, 500, expandedName);
    assert.deepEqual(expanded.slice(0, 200), legacy, `${expandedName} preserves every legacy object and its order`);
  }
});

test("every daily theme has candidates in all five content types", () => {
  for (const themeId of Catalog.dailyThemeIds) {
    for (const [type, items] of Object.entries(COLLECTIONS)) {
      assert.ok(items.some((item) => Engine.itemThemes(item).includes(themeId)), `${themeId}/${type}`);
    }
  }
});

test("theme tags discriminate by item semantics instead of covering entire pools", () => {
  const targetedCounts = {
    city: {
      journey: Catalog.cities.filter((item) => item.themeTags.includes("journey")).length,
      community: Catalog.cities.filter((item) => item.themeTags.includes("community")).length
    },
    german: {
      memory: Catalog.german.filter((item) => item.themeTags.includes("memory")).length,
      perception: Catalog.german.filter((item) => item.themeTags.includes("perception")).length
    },
    medical: {
      evidence: Catalog.medical.filter((item) => item.themeTags.includes("evidence")).length,
      nature: Catalog.medical.filter((item) => item.themeTags.includes("nature")).length
    }
  };
  for (const [type, counts] of Object.entries(targetedCounts)) {
    const total = COLLECTIONS[type].length;
    assert.ok(Object.values(counts).every((count) => count > 0 && count < total), `${type}: ${JSON.stringify(counts)}`);
  }
  assert.ok(Catalog.german.some((item) => item.themeTags.length === 0), "German keeps honest untagged fallbacks");
  assert.ok(Catalog.medical.some((item) => item.themeTags.length === 0), "medical keeps honest untagged fallbacks");
  assert.ok(Catalog.cities.every((item) => item.themeTags.length > 0));
  for (const items of [Catalog.books, Catalog.movies, Catalog.cities, Catalog.german, Catalog.medical]) {
    assert.ok(items.every((item) => new Set(item.themeTags).size === item.themeTags.length));
  }
  for (const items of [Catalog.books, Catalog.movies]) {
    assert.ok(items.filter((item) => item.themeTags.includes("time")).length < items.length * 0.6,
      "a decade label alone must not turn nearly every media item into the time theme");
    assert.ok(items.filter((item) => item.themeTags.includes("journey")).length < items.length * 0.25,
      "genre membership alone must not turn nearly every media item into the journey theme");
  }
  assert.ok(Catalog.medical.filter((item) => item.themeTags.includes("choice")).length < Catalog.medical.length * 0.4,
    "generic risk wording must not make most medical items choice-themed");
});

test("the same local date returns the same initial item in every collection", () => {
  for (const [type, items] of Object.entries(COLLECTIONS)) {
    const settings = { dateKey: "2026-08-11", type, excludedIds: [] };
    const first = Engine.chooseInitial(items, settings);
    const second = Engine.chooseInitial(items, settings);
    assert.ok(first, type);
    assert.equal(first.id, second.id, type);
  }
});

test("daily initial selection stays stable even when manual shuffle options are present", () => {
  for (const [type, items] of Object.entries(COLLECTIONS)) {
    const ids = new Set();
    for (let index = 0; index < 100; index += 1) {
      ids.add(Engine.chooseInitial(items, {
        dateKey: "2026-08-31",
        type,
        excludedIds: [],
        manualShuffle: true,
        random: Math.random
      }).id);
    }
    assert.equal(ids.size, 1, type);
  }
});

test("book and movie daily selections follow the rotating genre preference", () => {
  const dateKey = "2026-08-11";
  for (const type of ["book", "movie"]) {
    const item = Engine.chooseInitial(COLLECTIONS[type], { dateKey, type, excludedIds: [] });
    assert.ok(Engine.itemGenres(item).includes(Engine.preferredGenre(dateKey, type, 0)));
    assert.equal(item.popularityTier, Engine.preferredPopularityTier(dateKey, type, 0));
  }
  assert.notEqual(Engine.preferredGenre(dateKey, "book", 0), Engine.preferredGenre(dateKey, "movie", 0));
});

test("replace returns a different item and respects both daily and long-term exclusions", () => {
  for (const [type, items] of Object.entries(COLLECTIONS)) {
    const dateKey = "2026-08-11";
    const current = Engine.chooseInitial(items, { dateKey, type, excludedIds: [] });
    const excluded = [current.id, items.find((item) => item.id !== current.id).id];
    const next = Engine.chooseNext(items, {
      dateKey,
      type,
      currentId: current.id,
      excludedIds: excluded,
      sequence: 1
    });
    assert.ok(next, type);
    assert.ok(!excluded.includes(next.id), type);
  }
});

test("manual replacement draws across eligible genres, popularity tiers and rotation groups", () => {
  for (const type of ["book", "movie", "city", "german", "medical"]) {
    const items = COLLECTIONS[type];
    const common = {
      dateKey: "2026-08-31",
      type,
      excludedIds: [],
      sequence: 1,
      themeId: null
    };
    const deterministic = Engine.curatedCandidates(items, [], common);
    const shuffled = Engine.curatedCandidates(items, [], { ...common, manualShuffle: true });
    assert.ok(shuffled.length > deterministic.length, `${type}: ${shuffled.length} <= ${deterministic.length}`);

    const first = Engine.chooseNext(items, { ...common, manualShuffle: true, random: () => 0 });
    const last = Engine.chooseNext(items, { ...common, manualShuffle: true, random: () => 1 - Number.EPSILON });
    assert.ok(first && last, type);
    assert.notEqual(first.id, last.id, type);
  }
});

test("manual replacement keeps theme, editorial-quality, preference-window and exclusion boundaries", () => {
  const dateKey = "2026-08-31";
  const themeId = Engine.dailyTheme(dateKey).id;
  const editorial = Catalog.books.filter((item) =>
    Engine.itemThemes(item).includes(themeId) &&
    ["editorial-curated", "editorial-reviewed"].includes(item.curationLevel)
  );
  assert.ok(editorial.length >= 5);
  const excludedIds = editorial.slice(0, 2).map((item) => item.id);
  const scores = new Map(editorial.map((item, index) => [item.id, index < 5 ? 10 : 1]));
  const settings = {
    dateKey,
    type: "book",
    sequence: 3,
    themeId,
    excludedIds,
    currentId: excludedIds[0],
    scoreItem: (item) => scores.get(item.id) || 0,
    manualShuffle: true
  };
  const candidates = Engine.curatedCandidates(Catalog.books, new Set(excludedIds), settings);
  const window = Engine.selectionWindow(candidates, settings);
  assert.ok(window.length >= 3);
  assert.ok(window.every((item) => Engine.itemThemes(item).includes(themeId)));
  assert.ok(window.every((item) => ["editorial-curated", "editorial-reviewed"].includes(item.curationLevel)));
  assert.ok(window.every((item) => !excludedIds.includes(item.id)));
  assert.ok(window.every((item) => (scores.get(item.id) || 0) >= 8));

  const picked = new Set();
  for (let index = 0; index < window.length; index += 1) {
    const value = (index + 0.5) / window.length;
    picked.add(Engine.chooseNext(Catalog.books, { ...settings, random: () => value }).id);
  }
  assert.deepEqual(picked, new Set(window.map((item) => item.id)));
});

test("manual replacement validates injected randomness and never draws when exhausted", () => {
  const base = {
    dateKey: "2026-08-31",
    type: "city",
    sequence: 1,
    themeId: null,
    manualShuffle: true
  };
  for (const invalid of [-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => Engine.chooseNext(Catalog.cities, { ...base, excludedIds: [], random: () => invalid }),
      { name: "RangeError" }
    );
  }

  let calls = 0;
  const result = Engine.chooseNext(Catalog.cities, {
    ...base,
    excludedIds: Catalog.cities.map((item) => item.id),
    random: () => {
      calls += 1;
      return 0;
    }
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("manual replacement requires an explicit random function and never falls back implicitly", () => {
  const base = {
    dateKey: "2026-08-31",
    type: "city",
    sequence: 1,
    themeId: null,
    manualShuffle: true
  };
  for (const random of [undefined, null, 0, "random", {}]) {
    assert.throws(
      () => Engine.chooseNext(Catalog.cities, { ...base, excludedIds: [], random }),
      (error) => error instanceof TypeError &&
        error.code === "MANUAL_RANDOM_REQUIRED" &&
        error.message === "MANUAL_RANDOM_REQUIRED"
    );
  }
  assert.throws(
    () => Engine.chooseNext(Catalog.cities, {
      ...base,
      excludedIds: Catalog.cities.map((item) => item.id)
    }),
    (error) => error instanceof TypeError && error.code === "MANUAL_RANDOM_REQUIRED"
  );
});

test("the production random source fails closed without Web Crypto", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const start = appSource.indexOf("  function randomUnit() {");
  const end = appSource.indexOf("\n\n  function bumpRecordVersion", start);
  assert.ok(start >= 0 && end > start, "randomUnit source is present");
  const randomSource = appSource.slice(start, end).trim();
  assert.doesNotMatch(randomSource, /Math\.random/, "production randomness has no implicit fallback");
  const randomUnit = Function("globalThis", `\"use strict\"; ${randomSource}; return randomUnit;`)({});
  assert.throws(
    () => randomUnit(),
    (error) => error.code === "WEB_CRYPTO_UNAVAILABLE" && error.message === "WEB_CRYPTO_UNAVAILABLE"
  );

  let calls = 0;
  const available = Function("globalThis", `\"use strict\"; ${randomSource}; return randomUnit;`)({
    crypto: {
      getRandomValues(value) {
        calls += 1;
        value[0] = 0x80000000;
        return value;
      }
    }
  });
  assert.equal(available(), 0.5);
  assert.equal(calls, 1);

  const broken = Function("globalThis", `\"use strict\"; ${randomSource}; return randomUnit;`)({
    crypto: { getRandomValues() { throw new Error("device failure"); } }
  });
  assert.throws(
    () => broken(),
    (error) => error.code === "WEB_CRYPTO_UNAVAILABLE" && error.message === "WEB_CRYPTO_UNAVAILABLE"
  );
  assert.match(appSource, /原推荐、偏好和今日跳过记录均已保留/, "the UI explains the failed transaction boundary");
});

test("manual replacement is approximately uniform inside the final candidate window", () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `city-uniform-${String(index).padStart(2, "0")}`,
    type: "city",
    title: `城市 ${index}`,
    countryZh: "测试国",
    summary: "这是一段用于验证随机抽样分布、长度足够并且不影响生产目录内容的城市介绍。",
    highlights: ["甲", "乙", "丙"],
    region: index % 2 ? "东" : "西",
    sourceUrl: `https://example.com/city-${index}`
  }));
  const settings = {
    dateKey: "2026-08-31",
    type: "city",
    sequence: 1,
    themeId: null,
    excludedIds: [],
    manualShuffle: true
  };
  const window = Engine.selectionWindow(Engine.curatedCandidates(items, [], settings), settings);
  assert.ok(window.length >= 10);

  let state = 0x9e3779b9;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
  const buckets = Array(10).fill(0);
  const samples = 100000;
  for (let index = 0; index < samples; index += 1) {
    const picked = Engine.chooseNext(items, { ...settings, random });
    const position = window.findIndex((item) => item.id === picked.id);
    assert.ok(position >= 0);
    buckets[Math.min(9, Math.floor((position / window.length) * 10))] += 1;
  }
  const expected = samples / buckets.length;
  const chiSquare = buckets.reduce((sum, count) => sum + ((count - expected) ** 2) / expected, 0);
  const maximumDeviation = Math.max(...buckets.map((count) => Math.abs(count - expected) / expected));
  assert.ok(chiSquare < 27.88, `chi-square ${chiSquare}; buckets ${buckets.join(",")}`);
  assert.ok(maximumDeviation < 0.03, `max deviation ${maximumDeviation}; buckets ${buckets.join(",")}`);
});

test("an exhausted catalog returns null instead of quietly repeating", () => {
  for (const [type, items] of Object.entries(COLLECTIONS)) {
    const allIds = items.map((item) => item.id);
    const next = Engine.chooseNext(items, {
      dateKey: "2026-08-11",
      type,
      currentId: allIds[0],
      excludedIds: allIds,
      sequence: allIds.length
    });
    assert.equal(next, null, type);
  }
});

test("chooseNext can traverse each expanded pool without repeats", () => {
  for (const type of ["book", "movie", "german", "medical"]) {
    const items = COLLECTIONS[type];
    const seen = [];
    let current = Engine.chooseInitial(items, { dateKey: "2026-08-12", type, excludedIds: [], themeId: null });
    assert.ok(current, type);
    seen.push(current.id);
    while (seen.length < items.length) {
      current = Engine.chooseNext(items, {
        dateKey: "2026-08-12",
        type,
        currentId: current.id,
        excludedIds: seen,
        sequence: seen.length,
        themeId: null
      });
      assert.ok(current, `${type} stopped at ${seen.length}`);
      assert.ok(!seen.includes(current.id), `${type} repeated ${current.id}`);
      seen.push(current.id);
    }
    assert.equal(new Set(seen).size, items.length, type);
    if (["book", "movie"].includes(type)) {
      assert.equal(items.filter((item) => item.curationLevel === "source-screened").length, 0, `${type} source-screened`);
      assert.deepEqual(new Set(seen), new Set(items.map((item) => item.id)), `${type} every editorial ID is reachable by default`);
      assert.deepEqual(new Set(items.map((item) => item.curationLevel)), new Set(["editorial-curated", "editorial-reviewed", "evidence-reviewed"]));
      assert.equal(items.filter((item) => item.curationLevel === "evidence-reviewed").length, 300, `${type} evidence expansion`);
    }
  }
});

test("default media recommendations include reviewed entries but exclude a future source-screened refresh", () => {
  for (const type of ["book", "movie"]) {
    const items = COLLECTIONS[type];
    const ordinary = Engine.chooseInitial(items, {
      dateKey: "2026-08-12",
      type,
      excludedIds: [],
      themeId: Engine.dailyTheme("2026-08-12").id,
      exploration: false
    });
    assert.ok(["editorial-curated", "editorial-reviewed"].includes(ordinary.curationLevel), type);

    const screened = { ...items[0], id: type === "book" ? "/works/OL999999999W" : "tt999999999", curationLevel: "source-screened" };
    const defaultCandidates = Engine.curatedCandidates([screened], [], {
      dateKey: "2026-08-14",
      type,
      themeId: null,
      exploration: true
    });
    assert.deepEqual(defaultCandidates, [], `${type} rejects source-screened by default`);
    const widened = Engine.curatedCandidates([screened], [], {
      dateKey: "2026-08-14",
      type,
      themeId: null,
      exploration: true,
      allowSourceScreened: true
    });
    assert.equal(widened[0].curationLevel, "source-screened", type);
  }
});

test("invalid and duplicate stored IDs are removed", () => {
  const valid = new Set(["a", "b"]);
  assert.deepEqual(Engine.uniqueValidIds(["a", "missing", "a", "b"], valid), ["a", "b"]);
});

test("rating counts, snapshots and local dates use Chinese-friendly formatting", () => {
  assert.equal(Engine.formatCount(1596665), "159.7 万");
  assert.equal(Engine.formatCount(121), "121");
  assert.equal(Engine.formatSnapshot("2026-08-11"), "2026.08.11");
  const localDate = new Date(2026, 7, 11, 23, 59, 59);
  assert.equal(Engine.localDateKey(localDate), "2026-08-11");
});

test("catalog.js is reproducible from the auditable JSON source", () => {
  const output = execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-catalog.cjs"), "--check"], { encoding: "utf8" });
  assert.match(output, /PASS:/);
});

test("high-stakes source links use the verified canonical NIMH and FDA pages", () => {
  const suicide = Catalog.medical.find((item) => item.id === "medical-suicide-warning");
  const interactions = Catalog.medical.find((item) => item.id === "medical-drug-interactions");
  assert.equal(suicide.sourceUrl, "https://www.nimh.nih.gov/health/publications/5-action-steps-to-help-someone-having-thoughts-of-suicide");
  assert.equal(interactions.sourceUrl, "https://www.fda.gov/drugs/resources-drugs/drug-interactions-what-you-should-know");
});
