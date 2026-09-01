const test = require("node:test");
const assert = require("node:assert/strict");

const State = require("../state.js");

const TYPES = ["book", "movie", "city", "german", "medical"];

test("sequence and revision values accept only non-negative safe integers", () => {
  assert.equal(State.safeSequence(0), 0);
  assert.equal(State.safeSequence(17), 17);
  for (const invalid of [-1, 1.5, Infinity, NaN, "3", null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(State.safeSequence(invalid), 0, String(invalid));
  }
});

test("string versions remain monotonic beyond Number.MAX_SAFE_INTEGER", () => {
  const max = String(Number.MAX_SAFE_INTEGER);
  const next = State.incrementVersion(max);
  assert.equal(next, "9007199254740992");
  assert.equal(State.compareVersions(next, max), 1);
  assert.equal(State.compareVersions(max, next), -1);
  assert.equal(State.compareVersions("00012", 12), 0);
  assert.equal(State.safeVersion("not-a-version"), "0");

  const nines128 = "9".repeat(128);
  const digits129 = `1${"0".repeat(128)}`;
  assert.equal(State.incrementVersion(nines128), digits129, "decimal increment has no fixed digit ceiling");
  assert.equal(State.safeVersion(digits129), digits129, "a valid 129-digit version remains valid after persistence repair");
  assert.equal(State.compareVersions(digits129, nines128), 1, "length-aware comparison stays monotonic across a digit boundary");
});

test("wrong-shaped v2 records are rejected so a valid v1 record can migrate", () => {
  assert.equal(State.validKnownV2([], TYPES), false);
  assert.equal(State.validKnownV2({ schemaVersion: 2, book: [] }, TYPES), false);
  assert.equal(State.validDailyV2("truthy", TYPES), false);
  assert.equal(State.validLegacyKnown({ book: ["/works/OL1W"], movie: [] }), true);
  assert.equal(State.validLegacyDaily({ date: "2026-08-11", bookId: "/works/OL1W" }), true);
  const validWithBrokenOrder = Object.fromEntries(TYPES.map((type) => [type, []]));
  validWithBrokenOrder.schemaVersion = 2;
  validWithBrokenOrder.order = { corrupted: true };
  assert.equal(State.validKnownV2(validWithBrokenOrder, TYPES), true, "order is repairable metadata, not the source of truth");
});

test("legacy order is deduplicated, invalid entries are removed and missing records are appended", () => {
  const known = {
    book: ["book-a", "book-b"],
    movie: ["movie-a"],
    city: [],
    german: [],
    medical: []
  };
  const normalized = State.normalizeLegacyOrder(known, [
    { type: "book", id: "book-b" },
    { type: "book", id: "book-b" },
    { type: "movie", id: "missing" },
    { type: "unknown", id: "anything" }
  ], TYPES);
  assert.deepEqual(normalized, [
    { type: "book", id: "book-b" },
    { type: "book", id: "book-a" },
    { type: "movie", id: "movie-a" }
  ]);
});

test("per-type known entries repair duplicates, timestamps and unknown IDs", () => {
  const normalized = State.normalizeKnownEntries([
    { id: "a", at: "2026-08-11T08:00:00.000Z" },
    { id: "missing", at: "2026-08-11T09:00:00.000Z" },
    { id: "b", at: "not-a-date" },
    { id: "a", at: "2026-08-11T10:00:00.000Z" }
  ], new Set(["a", "b"]));
  assert.deepEqual(normalized, [
    { id: "b", at: "1970-01-01T00:00:00.000Z" },
    { id: "a", at: "2026-08-11T10:00:00.000Z" }
  ]);
});

test("v3 state requires the intended type and array-backed collections", () => {
  const base = {
    schemaVersion: 3,
    type: "book",
    date: "2026-08-11",
    revision: 0,
    currentId: "/works/OL1W",
    sequence: 0,
    skipped: [],
    knownEntries: []
  };
  assert.equal(State.validTypeState(base, "book"), true);
  assert.equal(State.validTypeState({ ...base, type: "movie" }, "book"), false);
  assert.equal(State.validTypeState({ ...base, skipped: {} }, "book"), false);
  assert.equal(State.validTypeState({ ...base, knownEntries: null }, "book"), false);
});
