"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const sha256 = (relative) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex").toUpperCase();

delete globalThis.DAILY_ATLAS_CATALOG;
require("../catalog.js");
const Catalog = globalThis.DAILY_ATLAS_CATALOG;

test("v2.6.0 LTS Visual Edition version and maintenance policy are consistent across release surfaces", () => {
  assert.equal(json("package.json").version, "2.6.0");
  assert.equal(json("package-lock.json").version, "2.6.0");
  assert.equal(json("package-lock.json").packages[""].version, "2.6.0");
  assert.equal(json("data/catalog.source.json").appVersion, "2.6.0");
  assert.equal(json("manifest.webmanifest").start_url, "./");
  assert.equal(Catalog.appVersion, "2.6.0");
  assert.match(read("app.js"), /APP_VERSION = "2\.6\.0"/);
  assert.match(read("diagnostics.html"), /content="2\.6\.0"/);
  const config = read("public-config.js");
  assert.match(config, /appVersion: "2\.6\.0"/);
  assert.match(config, /releaseChannel: "lts"/);
  assert.match(config, /featureFreeze: true/);
  assert.match(config, /supportPolicy: "maintenance-only"/);
  assert.match(read("docs/LTS_POLICY_v2.6.0.md"), /视觉功能基线/);
  assert.match(read("docs/LTS_POLICY_v2.6.0.md"), /不继续增加书、电影、城市、德语、医学或音乐数量/);
});

test("public LTS media payload is safe by default and keeps the curated 500 plus 500 pools", () => {
  const config = read("public-config.js");
  assert.match(config, /publicSafeMode: true/);
  assert.match(config, /remoteBookMovieImages: false/);
  assert.match(config, /visualPolicy: "public-original-local-editorial-art-with-open-license-city-images"/);
  assert.match(config, /ratingUse: "public-book-rating-private-movie-curation-audit"/);
  assert.equal(Catalog.books.length, 500);
  assert.equal(Catalog.movies.length, 500);
  assert.ok(Catalog.books.every((item) => item.rating?.source === "Open Library" && /^https:\/\//.test(item.image)));
  assert.ok(Catalog.movies.every((item) => item.qualityGate === "editorial-qualified"));
  assert.ok(Catalog.movies.every((item) => !Object.hasOwn(item, "rating") && !Object.hasOwn(item, "ratings")));
  assert.ok(Catalog.movies.every((item) => new URL(item.image).hostname === "images.metahub.space"));
  assert.ok(Catalog.movies.every((item) => !/IMDb|\d(?:\.\d+)?\s*\/\s*10|\d[\d,.]*\s*票|固定评分|固定口碑证据/iu.test(`${item.summary} ${item.reason} ${item.audience}`)));
  assert.match(read("index.html"), /公开数值评分（图书）/);
});

test("public settings and data notes describe original local art and the movie-rating boundary", () => {
  const index = read("index.html");
  const app = read("app.js");
  assert.match(index, /v2\.6\.0 LTS Visual Edition/);
  assert.match(index, /原创本地主题插画/);
  assert.match(index, /公开电影卡、搜索和离线包不分发这些数值/);
  assert.match(index, /公开评分快照仅指图书评分/);
  assert.match(index, /公开 LTS 不包含、也不联网请求第三方书封／海报/);
  assert.match(app, /公开 LTS 中书与电影始终使用原创本地主题插画/);
  assert.match(app, /公开 LTS 不建立第三方书封／海报缓存/);
  assert.match(app, /detail-preview-visual[\s\S]{0,400}editorialArtHtml\(item, type\)/, "detail placeholders use the same local artwork generator");
  assert.match(app, /visual-fallback[\s\S]{0,160}editorialArtHtml\(item, type\)/, "today cards use the local artwork generator");
  assert.match(app, /editorialVisual = type === "book" \|\| type === "movie" \? editorialArtHtml\(item, type\)/, "explore cards use the local artwork generator");
  for (const stale of [
    "v2.4 默认按需显示有来源说明的远程书封／电影海报",
    "远程书封／海报仍需联网",
    "书封和电影海报仍是在线渐进视觉",
    "浏览器自行管理的远程书封／海报 HTTP 缓存"
  ]) {
    assert.equal(index.includes(stale) || app.includes(stale), false, `stale public wording remains: ${stale}`);
  }
});

test("private movie curation evidence remains qualified but is not listed by the static deployment packager", () => {
  const raw = json("data/raw/movies500.json").movies;
  assert.equal(raw.length, 500);
  assert.ok(raw.every((item) => item.rating?.source === "IMDb" && item.rating.value >= 7.5 && item.rating.count >= 30000));
  const staticPackager = read("scripts/static-deploy-package.cjs");
  assert.doesNotMatch(staticPackager.match(/const ROOT_FILES[\s\S]*?const ASSET_FILES/)?.[0] || "", /data\/raw|movies500/);
  assert.match(read("sources-and-licenses.html"), /公开运行目录、搜索分片和静态部署包不分发 IMDb 数值评分或票数/);
});

test("licence, privacy and source disclosures ship in both package contracts", () => {
  for (const relative of ["LICENSE.txt", "NOTICE.txt", "privacy.html", "sources-and-licenses.html"]) {
    assert.ok(fs.existsSync(path.join(root, relative)), relative);
  }
  assert.match(read("LICENSE.txt"), /第三方书目、评分、封面、海报/);
  assert.match(read("NOTICE.txt"), /公开配置不请求或复制第三方书封/);
  assert.match(read("privacy.html"), /不会向 <code>images\.weserv\.nl<\/code>、<code>covers\.openlibrary\.org<\/code> 或 <code>images\.metahub\.space<\/code> 请求书封／海报/);
  assert.match(read("sources-and-licenses.html"), /MetaHub Terms of Use/);
  for (const packager of ["scripts/release-package.cjs", "scripts/static-deploy-package.cjs"]) {
    const text = read(packager);
    assert.match(text, /LICENSE\.txt/);
    assert.match(text, /NOTICE\.txt/);
  }
});

test("unchanged medical content inherits the v2.5 signed review bound to the current 500-item hash", () => {
  const expected = sha256("data/raw/medical500.json");
  const screen = json("data/medical-high-risk-screen.v2.5.0.json");
  const review = json("data/medical-high-risk-review.v2.5.0.json");
  assert.equal(screen.appVersion, "2.5.0");
  assert.equal(screen.medicalSourceSha256, expected);
  assert.equal(screen.counts.assessed, 500);
  assert.equal(screen.counts.automatedPass, 500);
  assert.equal(screen.result, "AUTOMATED_SAFETY_SCREEN_PASS");
  assert.equal(review.appVersion, "2.5.0");
  assert.equal(review.input.catalogSha256, expected);
  assert.equal(review.result, "INDEPENDENT_CONTENT_SAFETY_REVIEW_PASS");
  assert.equal(review.professionalBoundary, "GENERAL_EDUCATION_ONLY_NO_CLINICIAN_SIGNOFF_CLAIMED");
  assert.equal(review.releaseDecision.blockingIssues, 0);
  assert.ok(review.reviewedExamples.includes("medical-v3-suicide-immediate"));
});

test("v2.4.4 user data and backup identifiers remain unchanged for the same-origin A to B update", () => {
  assert.match(read("profile.js"), /STORAGE_KEY = "dailyAtlas\.profile\.v1"/);
  assert.match(read("app.js"), /statePrefix: "dailyAtlas\.state\.v3\."/);
  assert.match(read("backup.js"), /STATE_PREFIX = "dailyAtlas\.state\.v3\."/);
  assert.match(read("backup.js"), /const SCHEMA_VERSION = 1/);
  assert.match(read("docs/RELEASE_v2.6.0.md"), /备份 JSON／加密备份格式不变/);
});
