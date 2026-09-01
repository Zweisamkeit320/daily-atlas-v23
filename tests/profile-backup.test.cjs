const assert = require("node:assert/strict");
const test = require("node:test");

const Engine = require("../engine.js");
const Profile = require("../profile.js");
const Backup = require("../backup.js");

class MemoryStorage {
  constructor(entries) {
    this.values = new Map(Object.entries(entries || {}));
    this.failOn = null;
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (key === this.failOn) throw new Error("quota");
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

const validIds = Object.fromEntries(Profile.TYPES.map((type) => [type, new Set([`${type}-1`, `${type}-2`])]));

test("profile keeps likes, favorites and unsuitable feedback semantically separate", () => {
  let profile = Profile.emptyProfile();
  profile = Profile.setFeedback(profile, "book", "book-1", "favorite", true, new Date("2026-08-12T00:00:00Z"));
  profile = Profile.setFeedback(profile, "book", "book-1", "liked", true, new Date("2026-08-12T00:00:01Z"));
  assert.deepEqual(Profile.feedbackFor(profile, "book", "book-1"), { liked: true, favorite: true, unsuitable: false });
  profile = Profile.setFeedback(profile, "book", "book-1", "unsuitable", true, new Date("2026-08-12T00:00:02Z"));
  assert.deepEqual(Profile.feedbackFor(profile, "book", "book-1"), { liked: false, favorite: true, unsuitable: true });
  assert.deepEqual(Profile.unsuitableIds(profile, "book"), ["book-1"]);
  assert.equal(Profile.favoriteEntries(profile)[0].id, "book-1");
});

test("profile normalization removes unknown IDs and merges concurrent feedback by timestamp", () => {
  let left = Profile.setFeedback(Profile.emptyProfile(), "movie", "movie-1", "liked", true, new Date("2026-08-12T01:00:00Z"));
  let right = Profile.setFeedback(Profile.emptyProfile(), "city", "city-1", "favorite", true, new Date("2026-08-12T01:00:01Z"));
  right.feedback.book.unknown = { liked: true, favorite: false, unsuitable: false, updatedAt: "2026-08-12T01:00:02Z" };
  const merged = Profile.merge(left, right, validIds);
  assert.equal(Profile.feedbackFor(merged, "movie", "movie-1").liked, true);
  assert.equal(Profile.feedbackFor(merged, "city", "city-1").favorite, true);
  assert.equal(Object.hasOwn(merged.feedback.book, "unknown"), false);
});

test("concurrent feedback on the same item merges each action independently", () => {
  const base = Profile.emptyProfile();
  const liked = Profile.setFeedback(base, "book", "book-1", "liked", true, new Date("2026-08-12T01:00:00Z"));
  const favorited = Profile.setFeedback(base, "book", "book-1", "favorite", true, new Date("2026-08-12T01:00:01Z"));
  const merged = Profile.merge(liked, favorited, validIds);
  assert.deepEqual(Profile.feedbackFor(merged, "book", "book-1"), { liked: true, favorite: true, unsuitable: false });
});

test("personalization only scores qualified candidates and exploration can ignore the score", () => {
  const base = {
    type: "book",
    genre: "history",
    genres: ["history"],
    themeTags: ["time"],
    popularityTier: "mid",
    year: 1999,
    rating: { source: "Open Library", value: 4.2, max: 5, count: 30 },
    image: "https://example.com/cover.jpg",
    sourceUrl: "https://openlibrary.org/works/example"
  };
  const first = { ...base, id: "book-1", title: "One", curationLevel: "editorial-curated" };
  const second = { ...base, id: "book-2", title: "Two", year: 2020, curationLevel: "editorial-curated" };
  let profile = Profile.setExplicit(Profile.emptyProfile(), "book", "eras", ["recent"], new Date());
  const score = (item) => Profile.scoreItem(item, "book", profile, [first, second]);
  const ranked = Engine.curatedCandidates([first, second], [], { type: "book", dateKey: "2026-08-12", genre: null, popularityTier: "mid", scoreItem: score });
  assert.equal(ranked[0].id, "book-2");
  const exploration = Engine.curatedCandidates([first, second], [], { type: "book", dateKey: "2026-08-12", genre: null, popularityTier: "mid", scoreItem: score, exploration: true });
  assert.deepEqual(exploration.map((item) => item.id), ["book-1", "book-2"]);
});

test("media recommendations exhaust the editorial tier before the evidence expansion and keep source screening opt-in", () => {
  const shared = {
    type: "book",
    genre: "history",
    genres: ["history"],
    themeTags: ["time"],
    popularityTier: "mid",
    year: 2000,
    rating: { source: "Open Library", value: 4.2, max: 5, count: 40 },
    image: "https://example.com/cover.jpg",
    sourceUrl: "https://openlibrary.org/works/example"
  };
  const editorial = { ...shared, id: "book-1", title: "Editorial", curationLevel: "editorial-curated" };
  const evidence = { ...shared, id: "book-2", title: "Evidence", curationLevel: "evidence-reviewed" };
  const screened = { ...shared, id: "book-3", title: "Screened", curationLevel: "source-screened" };

  const ordinary = Engine.curatedCandidates([screened, evidence, editorial], [], {
    type: "book",
    dateKey: "2026-08-12",
    genre: "history",
    popularityTier: "mid"
  });
  assert.deepEqual(ordinary.map((item) => item.id), ["book-1"]);

  const evidenceFallback = Engine.curatedCandidates([screened, evidence, editorial], ["book-1"], {
    type: "book",
    dateKey: "2026-08-12",
    genre: "history",
    popularityTier: "mid"
  });
  assert.deepEqual(evidenceFallback.map((item) => item.id), ["book-2"]);

  const sourceStillClosed = Engine.curatedCandidates([screened, evidence, editorial], ["book-1", "book-2"], {
    type: "book",
    dateKey: "2026-08-12",
    genre: "history",
    popularityTier: "mid"
  });
  assert.deepEqual(sourceStillClosed, []);

  const exploration = Engine.curatedCandidates([screened, evidence, editorial], [], {
    type: "book",
    dateKey: "2026-08-12",
    genre: "history",
    popularityTier: "mid",
    exploration: true,
    allowSourceScreened: true
  });
  assert.deepEqual(exploration.map((item) => item.id), ["book-1", "book-2", "book-3"]);
});

test("non-media preferences are applied before rotation groups without defeating the daily theme", () => {
  const items = [
    { type: "city", id: "city-1", title: "A", countryZh: "甲", region: "亚洲", summary: "摘要", highlights: ["a", "b", "c"], themeTags: ["journey"], sourceUrl: "https://example.com/a" },
    { type: "city", id: "city-2", title: "B", countryZh: "乙", region: "欧洲", summary: "摘要", highlights: ["a", "b", "c"], themeTags: ["journey"], sourceUrl: "https://example.com/b" },
    { type: "city", id: "city-3", title: "C", countryZh: "丙", region: "欧洲", summary: "摘要", highlights: ["a", "b", "c"], themeTags: ["memory"], sourceUrl: "https://example.com/c" }
  ];
  const profile = Profile.setExplicit(Profile.emptyProfile(), "city", "regions", ["亚洲"], new Date());
  const candidates = Engine.curatedCandidates(items, [], {
    type: "city",
    dateKey: "2026-08-12",
    themeId: "journey",
    scoreItem: (item) => Profile.scoreItem(item, "city", profile, items)
  });
  assert.equal(candidates[0].id, "city-1");
  assert.ok(candidates.every((item) => item.themeTags.includes("journey")));
});

test("daily themes are deterministic and theme filtering has an explicit fallback", () => {
  const theme = Engine.dailyTheme("2026-08-12");
  assert.equal(Engine.dailyTheme("2026-08-12").id, theme.id);
  assert.ok(Engine.THEMES.some((entry) => entry.id === theme.id));
  const items = [
    { type: "city", id: "city-1", title: "A", countryZh: "甲", summary: "摘要", highlights: ["a", "b", "c"], themeTags: [theme.id], sourceUrl: "https://example.com/a" },
    { type: "city", id: "city-2", title: "B", countryZh: "乙", summary: "摘要", highlights: ["a", "b", "c"], themeTags: [], sourceUrl: "https://example.com/b" }
  ];
  assert.deepEqual(Engine.curatedCandidates(items, [], { type: "city", dateKey: "2026-08-12", themeId: theme.id }).map((item) => item.id), ["city-1"]);
  const fallback = Engine.curatedCandidates(items, [], { type: "city", dateKey: "2026-08-12", themeId: "future" });
  assert.ok(fallback.length >= 1);
  assert.ok(fallback.every((item) => !Engine.itemThemes(item).includes("future")), "fallback items stay honestly marked as theme extensions");
  assert.ok(fallback.some((item) => Engine.itemThemes(item).length === 0), "an untagged item remains selectable only through explicit fallback");
});

test("backup exports only allowlisted state and settings keys", () => {
  const state = { schemaVersion: 3, type: "book", date: "2026-08-12", revision: 1, version: "1", currentId: "book-1", sequence: 0, skipped: [], knownEntries: [] };
  const storage = new MemoryStorage({
    "dailyAtlas.state.v3.book": JSON.stringify(state),
    "dailyAtlas.profile.v1": JSON.stringify(Profile.emptyProfile()),
    "dailyAtlas.appearance.v1": JSON.stringify({
      schemaVersion: 1,
      color: "sky",
      style: "aurora",
      density: "compact",
      dataSaver: true,
      textSize: "large",
      contrast: "high",
      motion: "reduce",
      secret: "must-not-export"
    }),
    "unrelated.secret": "must-not-export"
  });
  const payload = JSON.parse(Backup.serialize(storage, { appVersion: "2.0.0", catalogSnapshot: "2026-08-12" }));
  assert.equal(payload.states.book.currentId, "book-1");
  assert.equal(Object.hasOwn(payload.optional, "dailyAtlas.profile.v1"), true);
  assert.deepEqual(payload.optional["dailyAtlas.appearance.v1"], {
    schemaVersion: 1,
    color: "sky",
    style: "aurora",
    density: "compact",
    dataSaver: true,
    textSize: "large",
    contrast: "high",
    motion: "reduce"
  });
  assert.equal(JSON.stringify(payload).includes("must-not-export"), false);
});

test("backup appearance normalizer repairs invalid display fields to safe defaults", () => {
  const payload = {
    format: Backup.FORMAT,
    schemaVersion: 1,
    states: {},
    optional: {
      "dailyAtlas.appearance.v1": JSON.parse('{"schemaVersion":9,"color":"unsafe","style":"unsafe","density":"tiny","dataSaver":"true","textSize":"huge","contrast":"maximum","motion":"none","secret":"DROP","__proto__":{"polluted":true}}')
    }
  };
  const checked = Backup.validate(payload, validIds);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.normalized.optional["dailyAtlas.appearance.v1"], {
    schemaVersion: 1,
    color: "paper",
    style: "editorial",
    density: "comfortable",
    dataSaver: false,
    textSize: "default",
    contrast: "default",
    motion: "system"
  });
  assert.equal(Object.prototype.polluted, undefined);
});

test("backup validation repairs unknown IDs before any write", () => {
  const payload = {
    format: Backup.FORMAT,
    schemaVersion: 1,
    states: {
      book: { schemaVersion: 3, type: "book", date: "2026-08-12", revision: 2, version: "2", currentId: "unknown", sequence: 1, skipped: ["book-2", "unknown"], knownEntries: [{ id: "book-1", at: "bad" }, { id: "unknown", at: "2026-01-01" }] },
      movie: null, city: null, german: null, medical: null
    },
    optional: {}
  };
  const checked = Backup.validate(payload, validIds);
  assert.equal(checked.ok, true);
  assert.equal(checked.normalized.states.book.currentId, null);
  assert.deepEqual(checked.normalized.states.book.skipped, ["book-2"]);
  assert.deepEqual(checked.normalized.states.book.knownEntries, [{ id: "book-1", at: "1970-01-01T00:00:00.000Z" }]);
  assert.ok(checked.warnings.length);
});

test("invalid or oversized backup text is rejected without touching storage", () => {
  assert.equal(Backup.parseText("{", validIds).ok, false);
  assert.equal(Backup.parseText("x".repeat(Backup.MAX_BYTES + 1), validIds).ok, false);
});

test("transactional backup apply rolls every key back when a write fails", () => {
  const original = { schemaVersion: 3, type: "book", date: "2026-08-12", revision: 1, version: "1", currentId: "book-1", sequence: 0, skipped: [], knownEntries: [] };
  const storage = new MemoryStorage({ "dailyAtlas.state.v3.book": JSON.stringify(original), "dailyAtlas.profile.v1": "{\"old\":true}" });
  storage.failOn = "dailyAtlas.state.v3.movie";
  const normalized = {
    states: {
      book: { ...original, currentId: "book-2" },
      movie: { schemaVersion: 3, type: "movie", date: "2026-08-12", revision: 1, version: "1", currentId: "movie-1", sequence: 0, skipped: [], knownEntries: [] }
    },
    optional: {}
  };
  assert.throws(() => Backup.apply(storage, normalized), /quota/);
  assert.equal(JSON.parse(storage.getItem("dailyAtlas.state.v3.book")).currentId, "book-1");
  assert.equal(storage.getItem("dailyAtlas.profile.v1"), '{"old":true}');
  assert.equal(storage.getItem(Backup.PENDING_KEY), null);
});

test("backup restore uses replace semantics for omitted allowlisted keys", () => {
  const storage = new MemoryStorage({
    "dailyAtlas.audio.v2": '{"volume":0.8}',
    "dailyAtlas.reminder.v1": '{"enabled":true}'
  });
  Backup.apply(storage, { states: {}, optional: {} });
  assert.equal(storage.getItem("dailyAtlas.audio.v2"), null);
  assert.equal(storage.getItem("dailyAtlas.reminder.v1"), null);
  assert.equal(storage.getItem(Backup.PENDING_KEY), null);
});
