const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Curation = require("../scripts/media-curation.cjs");

function fixture(id, overrides = {}) {
  return {
    id,
    titleZh: `中文标题 ${id}`,
    summary: "逐项编辑后的内容简介。",
    reason: "逐项编辑后的推荐理由。",
    audience: "适合愿意了解作品边界的读者。",
    genreRationale: "题材归类有明确的叙事依据。",
    series: null,
    installment: null,
    standaloneFriendly: true,
    prerequisite: null,
    contentNotes: ["暴力情节"],
    evidenceNote: "冻结来源与编辑核对说明。",
    ...overrides
  };
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(path.join(directory, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function withTempDirectory(task) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-atlas-curation-"));
  try {
    return task(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("curation loader accepts wrapped and legacy-array documents with explicit defaults", () => {
  withTempDirectory((directory) => {
    writeJson(directory, "books-history.json", { schemaVersion: 1, genre: "history", items: [fixture("/works/OL1W")] });
    writeJson(directory, "books-mystery.json", [fixture("/works/OL2W", { status: "reclassify", recommendedGenre: "scifi" })]);
    const loaded = Curation.loadCurationEntries(directory, "book");
    assert.equal(loaded.entries.length, 2);
    assert.deepEqual(
      loaded.entries.map((entry) => [entry.id, entry.status, entry.recommendedGenre]),
      [["/works/OL1W", "keep", "history"], ["/works/OL2W", "reclassify", "scifi"]]
    );
    assert.ok(loaded.files.every((file) => /^[A-F0-9]{64}$/.test(file.sha256)));
  });
});

test("coverage is atomic: a selected rejection blocks application until its replacement is selected", () => {
  withTempDirectory((directory) => {
    writeJson(directory, "books-history.json", {
      schemaVersion: 1,
      genre: "history",
      items: [
        fixture("/works/OL1W"),
        fixture("/works/OL2W", { status: "reject", recommendedGenre: null }),
        fixture("/works/OL3W")
      ]
    });
    const curation = Curation.loadCurationEntries(directory, "book");
    const original = { id: "/works/OL9W", curationLevel: "editorial-curated" };
    const selectedReject = Curation.applyCurationWhenComplete({
      items: [original, { id: "/works/OL1W" }, { id: "/works/OL2W" }],
      originalIds: new Set([original.id]),
      curation,
      expectedReviewed: 2
    });
    assert.equal(selectedReject.applied, false);
    assert.deepEqual(selectedReject.coverage.selectedRejected, ["/works/OL2W"]);

    const replacementSelected = Curation.applyCurationWhenComplete({
      items: [original, { id: "/works/OL1W", genres: ["history"], tags: ["来源筛选"] }, { id: "/works/OL3W", genres: ["history"] }],
      originalIds: new Set([original.id]),
      curation,
      expectedReviewed: 2,
      genreLabels: { history: "历史", mystery: "悬疑", scifi: "科幻" }
    });
    assert.equal(replacementSelected.applied, true);
    assert.equal(replacementSelected.items[0], original, "the original editorial item is preserved by identity");
    assert.ok(replacementSelected.items.slice(1).every((item) => item.curationLevel === "editorial-reviewed"));
    assert.ok(replacementSelected.items.every((item) => item.status !== "reject"));
    assert.equal(replacementSelected.items[1].title, "中文标题 /works/OL1W");
    assert.equal(replacementSelected.items[1].genreRationale, "题材归类有明确的叙事依据。");
    assert.deepEqual(replacementSelected.items[1].contentNotes, ["暴力情节"]);
    assert.equal(replacementSelected.items[1].editorialReview.sourceFile, "data/editorial/books-history.json");
  });
});

test("reclassification changes the primary genre while retaining secondary memberships", () => {
  const entry = Object.freeze({
    ...fixture("tt1234567", { status: "reclassify", recommendedGenre: "scifi" }),
    editorialSource: Object.freeze({ file: "movies-mystery.json", sha256: "A".repeat(64), sourceGenre: "mystery" })
  });
  const applied = Curation.applyEntry({
    id: entry.id,
    genre: "mystery",
    genres: ["mystery", "history"],
    tags: ["悬疑", "来源筛选"],
    metadataFlags: ["source-screened; not represented as fully watched"]
  }, entry, { history: "历史", mystery: "悬疑", scifi: "科幻" });
  assert.equal(applied.genre, "scifi");
  assert.deepEqual(applied.genres, ["scifi", "mystery", "history"]);
  assert.equal(applied.status, "reclassify");
  assert.equal(applied.recommendedGenre, "scifi");
  assert.ok(!applied.tags.includes("来源筛选"));
  assert.equal(applied.curationLevel, "editorial-reviewed");
});

test("malformed editorial decisions fail closed", () => {
  withTempDirectory((directory) => {
    const missingEvidence = fixture("/works/OL1W");
    delete missingEvidence.evidenceNote;
    writeJson(directory, "books-history.json", { schemaVersion: 1, genre: "history", items: [missingEvidence] });
    assert.throws(() => Curation.loadCurationEntries(directory, "book"), /evidenceNote/);
  });
  withTempDirectory((directory) => {
    writeJson(directory, "movies-mystery.json", [fixture("tt1234567")]);
    writeJson(directory, "movies-scifi.json", [fixture("tt1234567")]);
    assert.throws(() => Curation.loadCurationEntries(directory, "movie"), /appears in both/);
  });
});
