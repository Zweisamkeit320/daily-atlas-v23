const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const AUDIT_PATH = path.join(ROOT, "data", "CATALOG_AUDIT.md");

function bytes(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split("/")));
}

function sha256(relativePath) {
  return crypto.createHash("sha256").update(bytes(relativePath)).digest("hex").toUpperCase();
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const key = item[field];
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

test("the human-readable catalog audit matches the current generated release inputs", () => {
  const audit = fs.readFileSync(AUDIT_PATH, "utf8");
  const catalog = JSON.parse(bytes("data/catalog.source.json"));
  const booksRaw = JSON.parse(bytes("data/raw/books500.json"));
  const moviesRaw = JSON.parse(bytes("data/raw/movies500.json"));
  const trackedHashes = [
    "data/raw/books500.json",
    "data/raw/movies500.json",
    "data/raw/cities200.json",
    "data/raw/german500.json",
    "data/raw/medical500.json",
    "assets/audio/german/manifest.json",
    "data/catalog.source.json",
    "catalog.js"
  ];

  for (const relativePath of trackedHashes) {
    assert.ok(
      audit.includes(`| \`${relativePath}\` | \`${sha256(relativePath)}\` |`),
      `${relativePath} hash is stale or missing from CATALOG_AUDIT.md`
    );
  }

  assert.ok(
    audit.includes(`\`data/catalog.source.json\` 为 ${bytes("data/catalog.source.json").length.toLocaleString("en-US")} 字节，\`catalog.js\` 为 ${bytes("catalog.js").length.toLocaleString("en-US")} 字节`),
    "catalog byte counts are stale in CATALOG_AUDIT.md"
  );

  const swRevision = bytes("sw.js").toString("utf8").match(/v3-[a-f0-9]+/i)?.[0];
  assert.ok(swRevision, "sw.js has no content revision");
  assert.deepEqual([...audit.matchAll(/v3-[a-f0-9]+/gi)].map((match) => match[0]), [swRevision]);

  const bookGenres = countBy(catalog.books, "genre");
  const movieGenres = countBy(catalog.movies, "genre");
  assert.ok(audit.includes(`| 图书 | 500 | 500 | 历史 ${bookGenres.history}／悬疑 ${bookGenres.mystery}／科幻 ${bookGenres.scifi}（主分类） |`));
  assert.ok(audit.includes(`| 电影 | 500 | 500 | 历史 ${movieGenres.history}／悬疑 ${movieGenres.mystery}／科幻 ${movieGenres.scifi}（主分类） |`));

  const bookTiers = booksRaw.counts.popularityTier;
  assert.ok(audit.includes(`当前为 ${bookTiers.classic}／${bookTiers.mid}／${bookTiers.underseen}，classic 占 ${(bookTiers.classic / 5).toFixed(1)}%。`));
  assert.ok(audit.includes(`- 作者标签 ${booksRaw.counts.distinctAuthorLabels} 个，单一作者标签最多 ${booksRaw.counts.maximumBooksByOneAuthorLabel} 本。`));
  assert.ok(audit.includes(`- 导演标签 ${moviesRaw.counts.distinctDirectorLabels} 个，单一导演标签最多 ${moviesRaw.counts.maximumMoviesByOneDirectorLabel} 部。`));
  assert.ok(audit.includes(`- ${catalog.books.filter((item) => !(item.year > 0)).length} 条年份无法从冻结记录得到可信正数`));

  const themes = ["memory", "evidence", "journey", "community", "nature", "perception", "time"];
  for (const [key, label] of [["books", "图书"], ["movies", "电影"]]) {
    const counts = themes.map((theme) => catalog[key].filter((item) => item.themeTags.includes(theme)).length);
    assert.ok(audit.includes(`| ${label} | 0 | ${counts.join(" | ")} |`), `${label} theme row is stale`);
  }
});

test("the 500 medical entries use the audited 24-illustration manifest", () => {
  const manifest = JSON.parse(bytes("assets/medical/manifest.json"));
  const medical200 = JSON.parse(bytes("data/raw/medical200.json"));
  const medical500 = JSON.parse(bytes("data/raw/medical500.json"));
  const catalog = JSON.parse(bytes("data/catalog.source.json"));

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.items.length, 24);
  assert.equal(new Set(manifest.items.map((item) => item.key)).size, 24);
  assert.equal(new Set(manifest.items.map((item) => item.file)).size, 24);
  const visuals = new Map(manifest.items.map((item) => [item.key, item]));
  for (const visual of manifest.items) {
    assert.match(visual.file, /^assets\/medical\/[a-z0-9-]+\.webp$/);
    assert.ok(bytes(visual.file).length > 0, `${visual.key} image is empty`);
  }

  assert.equal(medical500.length, 500);
  assert.deepEqual(medical500.slice(0, medical200.length), medical200, "the retained 200-item prefix changed or moved");
  assert.deepEqual(catalog.medical.map((item) => item.id), medical500.map((item) => item.id), "runtime medical IDs/order differ from the raw pool");

  const illustrationCounts = countBy(medical500, "illustrationKey");
  assert.deepEqual(new Set(Object.keys(illustrationCounts)), new Set(visuals.keys()));
  for (const [key, count] of Object.entries(illustrationCounts)) {
    assert.ok(count >= 5 && count <= 40, `${key} is assigned to ${count} items`);
  }

  for (let index = 0; index < medical500.length; index += 1) {
    const raw = medical500[index];
    const runtime = catalog.medical[index];
    const visual = visuals.get(raw.illustrationKey);
    assert.ok(visual, `${raw.id} uses an unknown illustrationKey`);
    assert.equal(raw.topicGroup, visual.topicGroup, `${raw.id} topicGroup differs from its illustration`);
    assert.equal(raw.imageTheme, visual.imageTheme, `${raw.id} imageTheme differs from its illustration`);
    assert.equal(raw.alt, visual.alt, `${raw.id} raw alt differs from its illustration`);
    assert.equal(runtime.illustrationKey, raw.illustrationKey);
    assert.equal(runtime.image, `./${visual.file}`);
    assert.equal(runtime.alt, visual.alt);
  }
});
