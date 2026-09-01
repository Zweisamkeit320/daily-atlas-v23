"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

global.DAILY_ATLAS_CATALOG = require("../data/catalog.source.json");
const Engine = require("../engine.js");
const Explore = require("../explore.js");

const catalog = global.DAILY_ATLAS_CATALOG;
const index = Explore.buildIndex(catalog, Engine);

test("explore indexes all 2,200 qualified records with stable composite IDs", () => {
  assert.deepEqual(index.counts, { book: 500, movie: 500, city: 200, german: 500, medical: 500 });
  assert.equal(index.entries.length, 2200);
  assert.equal(new Set(index.entries.map((entry) => entry.key)).size, 2200);
  assert.equal(index.entries.every((entry) => Engine.isQualified(entry.item)), true);
});

test("explore normalizes multilingual search and applies all type-specific facets", () => {
  const street = Explore.buildIndex({
    german: [{
      id: "g-1", type: "german", german: "die Straße", chinese: "街道", explanation: "城市道路",
      exampleGerman: "Die Straße ist ruhig.", exampleChinese: "这条街很安静。", level: "A2", sourceUrl: "https://example.com/g"
    }],
    cities: [{
      id: "c-1", type: "city", title: "慕尼黑", cityZh: "慕尼黑", cityEn: "München", countryZh: "德国",
      region: "欧洲", summary: "博物馆与城市生活", highlights: ["艺术", "建筑", "公园"], sourceUrl: "https://example.com/c"
    }]
  }, Engine);
  assert.equal(Explore.query(street, { q: "strasse" }).items[0].key, "german:g-1");
  assert.equal(Explore.query(street, { q: "munchen" }).items[0].key, "city:c-1");

  const mystery = Explore.query(index, { genre: "mystery", pageSize: 100 });
  assert.ok(mystery.total > 0);
  assert.ok(mystery.items.every((entry) => ["book", "movie"].includes(entry.type) && entry.genres.includes("mystery")));

  const unknown = Explore.query(index, { type: "book", era: "unknown", pageSize: 100 });
  assert.equal(unknown.total, catalog.books.filter((item) => Number(item.year) <= 0).length);
  assert.ok(unknown.items.every((entry) => Number(entry.item.year) <= 0));

  const europe = Explore.query(index, { region: "欧洲", pageSize: 100 });
  assert.ok(europe.total > 0);
  assert.ok(europe.items.every((entry) => entry.type === "city" && entry.region === "欧洲"));

  const b2 = Explore.query(index, { level: "B2", pageSize: 100 });
  assert.equal(b2.total, catalog.german.filter((item) => item.level === "B2").length);
  assert.ok(b2.items.every((entry) => entry.type === "german" && entry.level === "B2"));

  const topic = catalog.medical[0].topicGroup;
  const medical = Explore.query(index, { medicalTopic: topic, pageSize: 100 });
  assert.equal(medical.total, catalog.medical.filter((item) => item.topicGroup === topic).length);
  assert.ok(medical.items.every((entry) => entry.type === "medical" && entry.medicalTopic === topic));
});

test("explore compares ratings by source scale and keeps pagination bounded and stable", () => {
  const synthetic = Explore.buildIndex({
    books: [
      { id: "b-1", type: "book", title: "Beta", year: 2020, genres: ["history"], rating: { value: 4.5, max: 5 }, sourceUrl: "https://example.com/b1" },
      { id: "b-2", type: "book", title: "Alpha", year: 0, genres: ["history"], rating: { value: 4, max: 5 }, sourceUrl: "https://example.com/b2" }
    ],
    movies: [
      { id: "m-1", type: "movie", title: "Gamma", year: 2024, genres: ["history"], rating: { value: 8.5, max: 10 }, sourceUrl: "https://example.com/m1" }
    ]
  });
  const high = Explore.query(synthetic, { ratingPercent: 85, sort: "rating", pageSize: 1 });
  assert.equal(high.total, 2);
  assert.equal(high.pageCount, 2);
  assert.equal(high.items.length, 1);
  assert.equal(high.items[0].key, "book:b-1");
  assert.equal(Explore.query(synthetic, { ratingPercent: 0.85, sort: "rating", page: 99, pageSize: 1 }).page, 2);
  assert.equal(Explore.query(synthetic, { era: "unknown" }).items[0].key, "book:b-2");
});

test("explore rejects malformed filters, does not mutate catalog items, and returns an honest empty page", () => {
  const before = JSON.stringify(catalog.books[0]);
  const filters = Explore.normalizeFilters({
    type: "secret", genre: "romance", era: "future", ratingPercent: "bad", level: "C9",
    sort: "random", page: -4, pageSize: 1000, q: "x".repeat(300)
  });
  assert.equal(filters.type, "all");
  assert.equal(filters.genre, "");
  assert.equal(filters.era, "");
  assert.equal(filters.ratingPercent, null);
  assert.equal(filters.level, "");
  assert.equal(filters.sort, "relevance");
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, 100);
  assert.equal(filters.q.length, 200);

  const empty = Explore.query(index, { q: "a phrase that cannot exist 9d69535d" });
  assert.deepEqual({ total: empty.total, page: empty.page, pageCount: empty.pageCount, items: empty.items.length }, {
    total: 0, page: 1, pageCount: 1, items: 0
  });
  assert.equal(JSON.stringify(catalog.books[0]), before);
});
