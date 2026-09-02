"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const Deploy = require("../scripts/static-deploy-package.cjs");
const Release = require("../scripts/release-package.cjs");
const ServiceWorkerBuild = require("../scripts/build-service-worker.cjs");
const ServiceWorkerContract = require("../scripts/service-worker-contract.cjs");
const { appendDetached, cloneFixture, replaceFile } = require("./package-fixture-helpers.cjs");
const FIXTURE_VERSION = "2.5.0";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function runtimeCatalog(bytes) {
  const sandbox = Object.create(null);
  sandbox.globalThis = sandbox;
  vm.runInNewContext(Buffer.from(bytes).toString("utf8"), sandbox, { timeout: 2000 });
  return JSON.parse(JSON.stringify(sandbox.DAILY_ATLAS_CATALOG));
}

function fixtureCatalogScript(options = {}, baseCatalog = null) {
  const appVersion = options.appVersion || FIXTURE_VERSION;
  const bookCount = options.bookCount ?? 500;
  const media = Array.from({ length: 500 }, (_, index) => ({
    id: `item-${index + 1}`,
    curationLevel: index < 50 ? "editorial-curated" : index < 200 ? "editorial-reviewed" : "evidence-reviewed"
  }));
  const medicalImages = Deploy.ASSET_FILES.filter((name) => /^assets\/medical\/[a-z0-9-]+\.webp$/.test(name));
  const catalog = baseCatalog ? JSON.parse(JSON.stringify(baseCatalog)) : {
    schemaVersion: 4,
    appVersion,
    snapshotDate: "2026-08-25",
    books: media.slice(0, bookCount),
    movies: media.map((item) => ({ ...item, id: `movie-${item.id}`, qualityGate: "editorial-qualified" })),
    cities: Array.from({ length: 200 }, (_, index) => ({ id: `city-${index + 1}` })),
    german: Array.from({ length: 500 }, (_, index) => ({ id: `de-${index + 1}` })),
    medical: Array.from({ length: 500 }, (_, index) => ({ id: `medical-${index + 1}`, image: `./${medicalImages[index % medicalImages.length]}` }))
  };
  catalog.appVersion = appVersion;
  catalog.books = catalog.books.slice(0, bookCount);
  return `(function (global) {\n  "use strict";\n  const catalog = ${JSON.stringify(catalog, null, 2)};\n  global.DAILY_ATLAS_CATALOG = Object.freeze(catalog);\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
}

function fixtureMusicScript(count = 100) {
  const tracks = Array.from({ length: count }, (_, index) => ({
    id: `track-${index + 1}`,
    sourceKind: index < 80 ? "original-procedural" : "public-domain-arrangement"
  }));
  return `module.exports = { TRACKS: ${JSON.stringify(tracks)} };\n`;
}

function refreshFixtureServiceWorker(root) {
  const swPath = path.join(root, "sw.js");
  let worker = ServiceWorkerBuild.normalizeAppShell(fs.readFileSync(swPath, "utf8"));
  const fileMap = new Map(Deploy.FIXED_FILES.map((relative) => {
    const content = fs.readFileSync(path.join(root, ...relative.split("/")));
    return [relative, { path: relative, bytes: content.length, content }];
  }));
  const manifestBytes = fileMap.get("assets/audio/german/manifest.json").content;
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const overrides = new Map([...fileMap].map(([relative, entry]) => [relative, entry.content]));
  const packs = ServiceWorkerBuild.expectedPackVersions(worker, manifest, overrides);
  worker = ServiceWorkerBuild.applyPackVersions(worker, packs, sha256(manifestBytes));
  const cacheVersion = ServiceWorkerBuild.expectedVersion(worker, manifest, overrides);
  worker = worker.replace(/const CACHE_VERSION = "[^"]+";/, `const CACHE_VERSION = "${cacheVersion}";`);
  replaceFile(swPath, worker, "utf8");
  const refreshed = new Map(Deploy.FIXED_FILES.map((relative) => {
    const content = fs.readFileSync(path.join(root, ...relative.split("/")));
    return [relative, { path: relative, bytes: content.length, content }];
  }));
  assert.doesNotThrow(() => ServiceWorkerContract.validateServiceWorkerContract(refreshed, "refreshed static fixture"));
}

function makeFixture() {
  const { temporary, root, output } = cloneFixture("static", "daily-atlas-static-test-");

  const extras = [
    "secret.env",
    "data/private-upstream.json",
    "upstream/raw-response.json",
    "scripts/private-build.cjs",
    "tests/private.test.cjs",
    "assets/medical/medical-themes-sprite.png",
    "assets/medical/not-used.webp",
    "catalog-data/details/book-999.deadbeefdead.js",
    "assets/audio/german/private.key"
  ];
  for (const relative of extras) {
    const absolute = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, "MUST NOT SHIP", "utf8");
  }
  const zip = path.join(output, `daily-atlas-static-v${FIXTURE_VERSION}-r1-20260825-010203.zip`);
  return { temporary, root, output, zip, extras };
}

test("service-worker and static-deploy manifests share the 2.4 runtime, generated catalog, medical assets, and both city sizes", () => {
  assert.deepEqual([...Deploy.SERVICE_WORKER_SHELL_FILES], [...ServiceWorkerBuild.SHELL_FILES]);
  for (const name of ["bootstrap.js", "runtime-foundation.js", "runtime-features.js", "catalog-loader.js", "runtime-health.js", "search-worker.js", "explore.js", "weekly.js", "backup-crypto.js", "asset-routing.js"]) {
    assert.ok(Deploy.ROOT_FILES.includes(name), `${name} is absent from the static root whitelist`);
    assert.ok(Deploy.SERVICE_WORKER_SHELL_FILES.includes(name), `${name} is absent from the application shell`);
  }
  for (const name of ["_headers", "LICENSE.txt", "NOTICE.txt", "diagnostics.css", "diagnostics.html", "diagnostics.js"]) {
    assert.ok(Deploy.ROOT_FILES.includes(name), `${name} is absent from the static deploy whitelist`);
  }
  assert.deepEqual(Deploy.CATALOG_FILES, [
    ...ServiceWorkerBuild.CATALOG_SPLIT.pointer,
    ServiceWorkerBuild.CATALOG_SPLIT.selection,
    ServiceWorkerBuild.CATALOG_SPLIT.selectionData,
    ServiceWorkerBuild.CATALOG_SPLIT.search,
    ...ServiceWorkerBuild.CATALOG_SPLIT.details
  ]);
  assert.equal(Deploy.CATALOG_FILES.length, 49);
  assert.equal(Deploy.ASSET_FILES.filter((name) => /^assets\/medical\/[a-z0-9-]+\.webp$/.test(name)).length, 24);
  assert.ok(Deploy.ASSET_FILES.includes("assets/medical/manifest.json"));
  assert.ok(Deploy.ASSET_FILES.includes("assets/medical/README.md"));
  assert.equal(Deploy.ASSET_FILES.filter((name) => /^assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(name)).length, 200);
  assert.equal(Deploy.ASSET_FILES.filter((name) => /^assets\/visuals\/cities-mobile\/city-[a-z0-9-]+\.webp$/.test(name)).length, 200);
  assert.ok(Deploy.ASSET_FILES.includes("assets/visuals/cities/manifest.json"));
  assert.ok(Deploy.ASSET_FILES.includes("assets/visuals/cities/manifest.js"));
});

test("static deploy ZIP has one root, 24 medical images, two city sizes, 500 MP3s, fresh six-pack versions, and a valid SHA-256 sidecar", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const created = Deploy.createStaticDeploy(fixture.zip, fixture.root);
  assert.equal(created.files, Deploy.FIXED_FILES.length + 500);
  assert.equal(created.audio, 500);

  const zipBytes = fs.readFileSync(fixture.zip);
  const entries = Release.readZipEntries(zipBytes);
  assert.ok(entries.length > created.files, "real ZIP includes directory records as well as files");
  assert.ok(entries.every((entry) => entry.name === `${Deploy.ARCHIVE_ROOT}/` || entry.name.startsWith(`${Deploy.ARCHIVE_ROOT}/`)));
  const archivedFiles = entries.filter((entry) => !entry.name.endsWith("/")).map((entry) => entry.name.slice(Deploy.ARCHIVE_ROOT.length + 1));
  assert.equal(archivedFiles.filter((name) => /^assets\/audio\/german\/[^/]+\.mp3$/.test(name)).length, 500);
  for (const extra of fixture.extras) assert.equal(archivedFiles.includes(extra), false, `extra source file leaked: ${extra}`);
  assert.ok(archivedFiles.includes("index.html"));
  assert.ok(archivedFiles.includes("catalog.js"));
  assert.ok(archivedFiles.includes("sw.js"));
  for (const name of ["_headers", "bootstrap.js", "runtime-foundation.js", "runtime-features.js", "catalog-loader.js", "runtime-health.js", "search-worker.js", "diagnostics.css", "diagnostics.html", "diagnostics.js", "explore.js", "weekly.js", "backup-crypto.js", "asset-routing.js"]) {
    assert.ok(archivedFiles.includes(name));
  }
  for (const name of Deploy.CATALOG_FILES) assert.ok(archivedFiles.includes(name));
  assert.equal(archivedFiles.filter((name) => /^assets\/medical\/[a-z0-9-]+\.webp$/.test(name)).length, 24);
  assert.ok(archivedFiles.includes("assets/medical/manifest.json"));
  assert.ok(archivedFiles.includes("assets/medical/README.md"));
  assert.equal(archivedFiles.filter((name) => /^assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(name)).length, 200);
  assert.equal(archivedFiles.filter((name) => /^assets\/visuals\/cities-mobile\/city-[a-z0-9-]+\.webp$/.test(name)).length, 200);
  assert.ok(archivedFiles.includes("assets/visuals/cities/manifest.json"));
  assert.ok(archivedFiles.includes("assets/visuals/cities/manifest.js"));
  assert.ok(!archivedFiles.includes("package.json"));

  const sidecar = fs.readFileSync(`${fixture.zip}.sha256`, "utf8");
  assert.equal(sidecar, `${sha256(zipBytes)}  ${path.basename(fixture.zip)}\n`);
  assert.deepEqual(Deploy.verifyStaticDeploy(fixture.zip).files, created.files);
  replaceFile(path.join(fixture.root, "package.json"), '{"name":"daily-atlas","version":"9.9.9"}\n', "utf8");
  assert.equal(Deploy.verifyStaticDeploy(fixture.zip).appVersion, FIXTURE_VERSION, "verification must use the archived version, not an external source tree");

  const cli = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/static-deploy-package.cjs"), "verify", "--zip", fixture.zip], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /^PASS: verify files=\d+ audio=500 zipSha256=[A-F0-9]{64}/);

  const renamed = path.join(fixture.output, "daily-atlas-static-v2.1.0-r1-20260825-010203.zip");
  fs.copyFileSync(fixture.zip, renamed);
  fs.writeFileSync(`${renamed}.sha256`, `${sha256(fs.readFileSync(renamed))}  ${path.basename(renamed)}\n`, "utf8");
  assert.throws(() => Deploy.verifyStaticDeploy(renamed), /ZIP version 2\.1\.0 does not match package version 2\.5\.0/);

  fs.appendFileSync(fixture.zip, Buffer.from([0x00]));
  assert.throws(() => Deploy.verifyStaticDeploy(fixture.zip), /SHA-256 sidecar does not match/);
});

test("static deploy creation rejects a ZIP version different from package.json and creates no artifact", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const wrong = path.join(fixture.output, "daily-atlas-static-v2.0.0-r1-20260825-010203.zip");
  assert.throws(() => Deploy.createStaticDeploy(wrong, fixture.root), /ZIP version 2\.0\.0 does not match package version 2\.5\.0/);
  assert.equal(fs.existsSync(wrong), false);
  assert.equal(fs.existsSync(`${wrong}.sha256`), false);
});

test("static deploy source inspection rejects stale catalog, music, and service-worker runtime contracts", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  assert.doesNotThrow(() => Deploy.inspectSource(fixture.root));

  const catalogPath = path.join(fixture.root, "catalog.js");
  const originalCatalogBytes = fs.readFileSync(catalogPath);
  const originalCatalog = runtimeCatalog(originalCatalogBytes);
  replaceFile(catalogPath, fixtureCatalogScript({ appVersion: "2.0.0" }, originalCatalog), "utf8");
  assert.throws(() => Deploy.inspectSource(fixture.root), /catalog\.js version 2\.0\.0 does not match package version 2\.5\.0/);

  replaceFile(catalogPath, fixtureCatalogScript({ bookCount: 499 }, originalCatalog), "utf8");
  assert.throws(() => Deploy.inspectSource(fixture.root), /exactly 500 books; found 499/);

  replaceFile(catalogPath, originalCatalogBytes);
  refreshFixtureServiceWorker(fixture.root);
  replaceFile(path.join(fixture.root, "music.js"), fixtureMusicScript(99), "utf8");
  assert.throws(() => Deploy.inspectSource(fixture.root), /must export exactly 100 tracks/);

  replaceFile(path.join(fixture.root, "music.js"), fixtureMusicScript(), "utf8");
  refreshFixtureServiceWorker(fixture.root);
  appendDetached(path.join(fixture.root, "styles.css"), "changed\n");
  assert.throws(() => Deploy.inspectSource(fixture.root), /sw\.js cache version is stale/);
});

test("static deploy rejects a medical manifest that no longer accounts for all 24 WebP files", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const manifestPath = path.join(fixture.root, "assets", "medical", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.items.pop();
  replaceFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  assert.throws(() => Deploy.inspectSource(fixture.root), /describe exactly 24 medical illustrations/);
});

test("static deploy source inspection rejects an extra non-canonical city WebP before packaging", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const source = fs.readdirSync(path.join(fixture.root, "assets", "visuals", "cities"))
    .find((name) => /^city-[a-z0-9-]+\.webp$/.test(name));
  fs.copyFileSync(
    path.join(fixture.root, "assets", "visuals", "cities", source),
    path.join(fixture.root, "assets", "visuals", "cities", "evil.webp")
  );
  assert.throws(
    () => Deploy.inspectSource(fixture.root),
    /exactly 200 city WebP files|non-canonical WebP path/
  );
});

test("static deploy verification rejects non-whitelisted entries, and source extras never enter a real ZIP", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  Deploy.createStaticDeploy(fixture.zip, fixture.root);
  const entries = Release.readZipEntries(fs.readFileSync(fixture.zip));
  const content = Buffer.from("secret");
  const injected = [...entries, { name: `${Deploy.ARCHIVE_ROOT}/data/private.json`, bytes: content.length, content }];
  assert.throws(() => Deploy.validateArchiveEntries(injected), /outside the static deploy whitelist|file count/);
  assert.doesNotThrow(() => Deploy.validateArchiveEntries(entries));
});

test("static archive verification fails closed when movie numeric evidence enters any public runtime layer", () => {
  const source = Deploy.inspectSource(path.resolve(__dirname, ".."));
  const baseEntries = source.map((entry) => ({
    name: `${Deploy.ARCHIVE_ROOT}/${entry.path}`,
    bytes: entry.content.length,
    content: Buffer.from(entry.content)
  }));
  assert.doesNotThrow(() => Deploy.validateArchiveEntries(baseEntries));

  const mutate = (relative, transform) => baseEntries.map((entry) => {
    if (entry.name !== `${Deploy.ARCHIVE_ROOT}/${relative}`) return entry;
    const before = entry.content.toString("utf8");
    const after = transform(before);
    assert.notEqual(after, before, `mutation marker was not found in ${relative}`);
    const content = Buffer.from(after, "utf8");
    return { ...entry, bytes: content.length, content };
  });
  const rejectsAsPublicMovieData = (entries, pattern) => {
    assert.throws(() => Deploy.validateArchiveEntries(entries), pattern);
  };

  rejectsAsPublicMovieData(mutate("catalog.js", (text) => text.replace(
    '"qualityGate": "editorial-qualified"',
    '"qualityGate": "editorial-qualified",\n      "rating": { "source": "IMDb", "value": 8.8 }'
  )), /public catalog\.js movie .*forbidden public movie field: rating/);

  rejectsAsPublicMovieData(mutate(ServiceWorkerBuild.CATALOG_SPLIT.selection, (text) => text.replace(
    '{ qualityGate: "editorial-qualified" }',
    '{ qualityGate: "editorial-qualified", rating: Object.freeze({ source: "IMDb", value: 8.8 }) }'
  )), /public compact selection movie .*forbidden public movie field: rating/);

  rejectsAsPublicMovieData(mutate(ServiceWorkerBuild.CATALOG_SPLIT.selectionData, (text) => {
    const payload = JSON.parse(text);
    payload.rows.movie[0][8] = 8.8;
    return `${JSON.stringify(payload)}\n`;
  }), /public selection data movie .*numeric rating or vote data/);

  const firstMovieDetail = ServiceWorkerBuild.CATALOG_SPLIT.details.find((relative) => relative.includes("/movie-"));
  rejectsAsPublicMovieData(mutate(firstMovieDetail, (text) => text.replace(
    '"qualityGate":"editorial-qualified"',
    '"qualityGate":"editorial-qualified","voteCount":123456'
  )), /public movie detail .*forbidden public movie field: voteCount/);

  rejectsAsPublicMovieData(mutate(ServiceWorkerBuild.CATALOG_SPLIT.search, (text) => text.replace(
    "ratingPercent: row[7]",
    'ratingPercent: type === "movie" ? 0.88 : row[7]'
  )), /public search movie .*ratingPercent must be null/);
});

test("static deploy output cannot use a dot-dot-prefixed in-tree directory or a junction back into the source", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const inTree = path.join(fixture.root, "..evil", path.basename(fixture.zip));
  assert.throws(() => Deploy.createStaticDeploy(inTree, fixture.root), /must be written outside the source tree/);
  assert.equal(fs.existsSync(inTree), false);

  const target = path.join(fixture.root, "inside");
  const link = path.join(fixture.temporary, "outside-link");
  fs.mkdirSync(target);
  try {
    fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    t.diagnostic(`output-junction assertion skipped because the host denied link creation: ${error.code || error.message}`);
    return;
  }
  const throughJunction = path.join(link, path.basename(fixture.zip));
  assert.throws(() => Deploy.createStaticDeploy(throughJunction, fixture.root), /resolves inside the source tree through a symbolic link or junction/);
  assert.equal(fs.existsSync(throughJunction), false);
});

test("static deploy refuses overwrite, a selected symbolic link, and a manifest hash mismatch", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  fs.writeFileSync(fixture.zip, "existing artifact", "utf8");
  assert.throws(() => Deploy.createStaticDeploy(fixture.zip, fixture.root), /refusing to overwrite/);

  const second = makeFixture();
  t.after(() => fs.rmSync(second.temporary, { recursive: true, force: true }));
  const icons = path.join(second.root, "assets", "icons");
  const target = path.join(second.root, "linked-icons-target");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "icon-192.png"), "target-192", "utf8");
  fs.writeFileSync(path.join(target, "icon-512.png"), "target-512", "utf8");
  fs.rmSync(icons, { recursive: true });
  try {
    fs.symlinkSync(target, icons, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    t.diagnostic(`symbolic-link assertion skipped because the host denied link creation: ${error.code || error.message}`);
  }
  if (fs.existsSync(icons) && fs.lstatSync(icons).isSymbolicLink()) {
    assert.throws(() => Deploy.inspectSource(second.root), /symbolic link is forbidden/);
  }

  const third = makeFixture();
  t.after(() => fs.rmSync(third.temporary, { recursive: true, force: true }));
  const audioManifest = JSON.parse(fs.readFileSync(path.join(third.root, "assets", "audio", "german", "manifest.json"), "utf8"));
  const firstMp3 = path.join(third.root, ...audioManifest.items[0].path.split("/"));
  appendDetached(firstMp3, "tampered");
  assert.throws(() => Deploy.inspectSource(third.root), /byte length differs from manifest|SHA-256 differs from manifest/);
});
