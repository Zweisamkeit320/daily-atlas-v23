"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const Visuals = require("../visuals.js");
delete globalThis.DAILY_ATLAS_CATALOG;
require("../catalog.js");
const Catalog = globalThis.DAILY_ATLAS_CATALOG;

test("all 500 books and 500 movies receive deterministic unique local editorial art", () => {
  const signatures = new Set();
  const families = new Map();
  for (const [type, items] of [["book", Catalog.books], ["movie", Catalog.movies]]) {
    assert.equal(items.length, 500);
    for (const item of items) {
      const first = Visuals.editorialArt(item, type);
      const second = Visuals.editorialArt({ ...item }, type);
      assert.ok(first, `${type}:${item.id} has no editorial art`);
      assert.deepEqual(first, second, `${type}:${item.id} is not deterministic`);
      assert.match(first.signature, new RegExp(`^${type}-[a-f0-9]{8}$`));
      assert.match(first.family, /^(archive|passage|terrain|labyrinth|threshold|evidence|orbit|signal|horizon)$/);
      assert.equal(signatures.has(first.signature), false, `duplicate visual signature ${first.signature}`);
      signatures.add(first.signature);
      families.set(first.family, (families.get(first.family) || 0) + 1);
      assert.match(first.markup, /^<svg class="editorial-art"/);
      assert.match(first.markup, new RegExp(`data-art-signature="${first.signature}"`));
      assert.match(first.markup, /aria-hidden="true"/);
      assert.doesNotMatch(first.markup, /(?:https?:|data:|javascript:|<script|<image|<foreignObject|onload=|onerror=)/i);
      assert.equal(first.markup.includes(item.title), false, `${type}:${item.id} embeds the title inside the artwork`);
      assert.ok(first.markup.length < 6000, `${type}:${item.id} artwork is unexpectedly heavy`);
    }
  }
  assert.equal(signatures.size, 1000);
  assert.deepEqual([...families.keys()].sort(), ["archive", "evidence", "horizon", "labyrinth", "orbit", "passage", "signal", "terrain", "threshold"]);
  assert.ok([...families.values()].every((count) => count >= 70), "every narrative family must be materially represented across the catalog");
});

test("editorial art families remain genre-led and books and movies keep distinct framing", () => {
  const fixtures = [
    [{ id: "history", genres: ["history"] }, "book", /^(archive|passage|terrain)$/],
    [{ id: "mystery", genres: ["mystery"] }, "movie", /^(labyrinth|threshold|evidence)$/],
    [{ id: "scifi", genres: ["scifi"] }, "book", /^(orbit|signal|horizon)$/]
  ];
  for (const [item, type, expectedFamily] of fixtures) {
    assert.match(Visuals.editorialArt(item, type).family, expectedFamily);
  }
  const book = Visuals.editorialArt({ id: "same", genres: ["history"] }, "book");
  const movie = Visuals.editorialArt({ id: "same", genres: ["history"] }, "movie");
  assert.notEqual(book.signature, movie.signature);
  assert.match(book.markup, /data-art-medium="book"/);
  assert.match(movie.markup, /data-art-medium="movie"/);
});

test("non-media or malformed items do not produce editorial art", () => {
  assert.equal(Visuals.editorialArt(null, "book"), null);
  assert.equal(Visuals.editorialArt({ id: "" }, "book"), null);
  assert.equal(Visuals.editorialArt({ id: "city-x" }, "city"), null);
});
