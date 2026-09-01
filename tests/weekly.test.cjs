"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Weekly = require("../weekly.js");

function iso(year, month, day, hour = 12) {
  return new Date(year, month - 1, day, hour).toISOString();
}

function feedback(kind, value, at) {
  return {
    liked: kind === "liked" ? value : false,
    favorite: kind === "favorite" ? value : false,
    unsuitable: false,
    updatedAt: at,
    updatedAtByKind: {
      liked: kind === "liked" ? at : "1970-01-01T00:00:00.000Z",
      favorite: kind === "favorite" ? at : "1970-01-01T00:00:00.000Z",
      unsuitable: "1970-01-01T00:00:00.000Z"
    }
  };
}

test("weekly range uses local Monday-through-Sunday calendar boundaries across months and years", () => {
  assert.deepEqual(Weekly.weekRange(new Date(2026, 7, 24, 12)), {
    weekStartsOn: 1,
    startMs: new Date(2026, 7, 24).getTime(),
    endMs: new Date(2026, 7, 31).getTime(),
    startDate: "2026-08-24",
    endDate: "2026-08-30"
  });
  const year = Weekly.weekRange(new Date(2026, 11, 31, 12));
  assert.equal(year.startDate, "2026-12-28");
  assert.equal(year.endDate, "2027-01-03");
});

test("weekly report derives privacy-safe current-week signals and deduplicates topic activity", () => {
  const current = new Date(2026, 7, 27, 12);
  const thisWeek = iso(2026, 8, 26);
  const priorWeek = iso(2026, 8, 20);
  const catalog = {
    books: [
      { id: "b1", genres: ["history", "mystery"] },
      { id: "b2", genre: "scifi" }
    ],
    movies: [{ id: "m1", genres: ["history"] }],
    cities: [{ id: "c1", region: "欧洲" }],
    german: [{ id: "g1", level: "B1" }, { id: "g2", level: "A2" }],
    medical: [{ id: "med1", topicGroup: "睡眠" }, { id: "med2", topicGroup: "急救" }]
  };
  const profile = {
    feedback: {
      book: {
        b1: feedback("liked", true, thisWeek),
        b2: feedback("liked", false, thisWeek)
      },
      movie: { m1: feedback("favorite", true, thisWeek) },
      city: { c1: feedback("liked", true, priorWeek) },
      german: { g1: feedback("favorite", true, thisWeek) },
      medical: { med1: feedback("liked", true, thisWeek) }
    }
  };
  const typeStates = {
    book: { knownEntries: [{ id: "b1", at: thisWeek }, { id: "b2", at: "1970-01-01T00:00:00.000Z" }] },
    movie: { knownEntries: [] },
    city: { knownEntries: [] },
    german: { knownEntries: [{ id: "g1", at: thisWeek }, { id: "g2", at: priorWeek }] },
    medical: { knownEntries: [{ id: "med1", at: thisWeek }, { id: "med2", at: priorWeek }] }
  };

  const report = Weekly.buildReport({ catalog, profile, typeStates, now: current });
  assert.equal(report.knownCount, 3);
  assert.equal(report.likedCount, 2);
  assert.equal(report.favoriteCount, 2);
  assert.equal(report.activityCount, 4);
  assert.deepEqual(report.byType, [
    { id: "book", label: "book", count: 1 },
    { id: "german", label: "german", count: 1 },
    { id: "medical", label: "medical", count: 1 },
    { id: "movie", label: "movie", count: 1 }
  ]);
  assert.deepEqual(report.genres, [
    { id: "history", label: "历史", count: 1 },
    { id: "mystery", label: "悬疑", count: 1 }
  ]);
  assert.deepEqual(report.germanLevels, [{ id: "B1", label: "B1", count: 1 }]);
  assert.deepEqual(report.medicalTopics, [{ id: "睡眠", label: "睡眠", count: 1 }]);
  assert.equal(report.empty, false);
  assert.match(report.privacyNote, /本机.*不上传/);
  assert.match(report.scopeNote, /仍有效/);
});

test("weekly report excludes canceled, stale, migrated and unknown records and has an honest empty state", () => {
  const report = Weekly.buildReport({
    catalog: { books: [{ id: "b1", genre: "history" }] },
    profile: { feedback: { book: { b1: feedback("liked", false, iso(2026, 8, 26)) } } },
    typeStates: {
      book: { knownEntries: [
        { id: "b1", at: "1970-01-01T00:00:00.000Z" },
        { id: "unknown", at: iso(2026, 8, 26) }
      ] }
    },
    now: new Date(2026, 7, 27, 12)
  });
  assert.equal(report.knownCount, 0);
  assert.equal(report.likedCount, 0);
  assert.equal(report.favoriteCount, 0);
  assert.equal(report.activityCount, 0);
  assert.equal(report.empty, true);
  assert.deepEqual(report.genres, []);
});

test("weekly report is deterministic and leaves caller data unchanged", () => {
  const input = {
    catalog: { german: [{ id: "g1", level: "A1" }] },
    profile: { feedback: {} },
    typeStates: { german: { knownEntries: [{ id: "g1", at: iso(2026, 8, 26) }] } },
    now: new Date(2026, 7, 27, 12)
  };
  const before = JSON.stringify(input);
  assert.deepEqual(Weekly.buildReport(input), Weekly.buildReport(input));
  assert.equal(JSON.stringify(input), before);
});
