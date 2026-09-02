"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const Release = require("../scripts/release-package.cjs");
const { cloneFixture, replaceFile } = require("./package-fixture-helpers.cjs");
const FIXTURE_VERSION = "2.4.4";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function makeFixture() {
  const { temporary, root, output } = cloneFixture("release", "daily-duet-release-test-");
  for (const name of Release.EXCLUDED_NAMES) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, "must-not-ship.txt"), "excluded", "utf8");
  }
  const zip = path.join(output, `daily-duet-v${FIXTURE_VERSION}-r3-20260813-010203.zip`);
  return { temporary, root, output, zip };
}

test("release package has one root, canonical sidecars, exact hashes, 500 MP3s, 200 reviewed city visuals, fresh six-pack versions, and no excluded paths", (t) => {
  assert.ok(Release.EXCLUDED_NAMES.includes(".wrangler"), "local Wrangler deployment state must never enter an audit package");
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const expectedFileCount = Release.inspectSource(fixture.root).length;
  const created = Release.createRelease(fixture.zip, fixture.root);
  assert.equal(created.files, expectedFileCount);

  const paths = Release.sidecarPaths(fixture.zip);
  const treeBytes = fs.readFileSync(paths.tree);
  assert.equal(treeBytes[0] === 0xEF && treeBytes[1] === 0xBB && treeBytes[2] === 0xBF, false, "no UTF-8 BOM");
  assert.equal(treeBytes.includes(0x0D), false, "LF only");
  const lines = treeBytes.toString("utf8").trimEnd().split("\n");
  assert.ok(lines.every((line) => /^[A-F0-9]{64}\t\d+\t[^\t]+$/.test(line)));
  const manifestPaths = lines.map((line) => line.split("\t")[2]);
  assert.deepEqual(manifestPaths, [...manifestPaths].sort());

  const entries = Release.readZipEntries(fs.readFileSync(fixture.zip));
  assert.ok(entries.every((entry) => entry.name === "daily-duet/" || entry.name.startsWith("daily-duet/")));
  assert.equal(entries.filter((entry) => /^daily-duet\/assets\/audio\/german\/[^/]+\.mp3$/.test(entry.name)).length, 500);
  assert.ok(entries.some((entry) => entry.name === "daily-duet/sw.js"));
  for (const name of ["_headers", "bootstrap.js", "runtime-foundation.js", "runtime-features.js", "catalog-loader.js", "runtime-health.js", "search-worker.js", "diagnostics.html", "explore.js", "weekly.js", "backup-crypto.js", "asset-routing.js"]) {
    assert.ok(entries.some((entry) => entry.name === `daily-duet/${name}`));
  }
  for (const name of Release.CATALOG_FILES) assert.ok(entries.some((entry) => entry.name === `daily-duet/${name}`));
  assert.equal(entries.filter((entry) => /^daily-duet\/assets\/medical\/[a-z0-9-]+\.webp$/.test(entry.name)).length, 24);
  assert.ok(entries.some((entry) => entry.name === "daily-duet/assets/medical/manifest.json"));
  assert.ok(entries.some((entry) => entry.name === "daily-duet/assets/medical/README.md"));
  assert.equal(entries.filter((entry) => /^daily-duet\/assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/.test(entry.name)).length, 200);
  assert.equal(entries.filter((entry) => /^daily-duet\/assets\/visuals\/cities-mobile\/city-[a-z0-9-]+\.webp$/.test(entry.name)).length, 200);
  assert.ok(entries.some((entry) => entry.name === "daily-duet/assets/visuals/cities/manifest.json"));
  assert.ok(entries.some((entry) => entry.name === "daily-duet/assets/visuals/cities/manifest.js"));
  assert.ok(entries.some((entry) => entry.name === "daily-duet/data/visuals/city-commons-reviews.v1.json"));
  assert.equal(entries.filter((entry) => /^daily-duet\/data\/visuals\/city-review-evidence\/contact-\d{2}\.jpg$/.test(entry.name)).length, 13);
  assert.equal(entries.filter((entry) => /^daily-duet\/data\/visuals\/evidence\/commons-city-pages\/[^/]+\.html\.gz$/.test(entry.name)).length, 804);
  assert.ok(entries.some((entry) => entry.name === "daily-duet/docs/REAL_DEVICE_MATRIX.md"));
  assert.ok(entries.every((entry) => !Release.EXCLUDED_NAMES.some((name) => entry.name.split("/").includes(name))));
  assert.doesNotThrow(() => Release.verifyRelease(fixture.zip));
  const cli = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/release-package.cjs"), "--check-zip", fixture.zip], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /^PASS: verify files=/);

  const zipSidecar = fs.readFileSync(paths.zipSha, "utf8");
  assert.equal(zipSidecar, `${sha256(fs.readFileSync(fixture.zip))}  ${path.basename(fixture.zip)}\n`);
  const treeSidecar = fs.readFileSync(paths.treeSha, "utf8");
  assert.equal(treeSidecar, `${sha256(treeBytes)}  ${path.basename(paths.tree)}\n`);
});

test("release creation refuses overwrite and unexpected top-level entries", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fixture.root, "surprise.txt"), "unexpected", "utf8");
  assert.throws(() => Release.createRelease(fixture.zip, fixture.root), /unexpected top-level entry: surprise\.txt/);
  fs.rmSync(path.join(fixture.root, "surprise.txt"));
  const staleCatalog = path.join(fixture.root, "catalog-data", "details", "book-999.deadbeefdead.js");
  fs.mkdirSync(path.dirname(staleCatalog), { recursive: true });
  fs.writeFileSync(staleCatalog, "stale\n", "utf8");
  assert.throws(() => Release.createRelease(fixture.zip, fixture.root), /catalog-data inventory must contain exactly|unexpected generated catalog file/);
  fs.rmSync(staleCatalog);
  assert.doesNotThrow(() => Release.inspectSource(fixture.root));
  fs.writeFileSync(fixture.zip, "existing artifact", "utf8");
  assert.throws(() => Release.createRelease(fixture.zip, fixture.root), /refusing to overwrite/);
});

test("release creation refuses a ZIP version that differs from package.json", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const mismatched = path.join(fixture.output, "daily-duet-v2.0.0-r3-20260813-010203.zip");
  assert.throws(() => Release.createRelease(mismatched, fixture.root), /ZIP version 2\.0\.0 does not match package version 2\.4\.4/);
  assert.equal(fs.existsSync(mismatched), false);
});

test("source inspection rejects a reparse point", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const target = path.join(fixture.root, "assets", "target");
  const link = path.join(fixture.root, "assets", "linked");
  fs.mkdirSync(target);
  try {
    fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    t.skip(`cannot create a test reparse point: ${error.code || error.message}`);
    return;
  }
  assert.throws(() => Release.inspectSource(fixture.root), /reparse point is forbidden: assets\/linked/);
});

test("release source inspection rejects a medical manifest with fewer than 24 images", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const manifestPath = path.join(fixture.root, "assets", "medical", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.items.pop();
  replaceFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  assert.throws(() => Release.inspectSource(fixture.root), /describe exactly 24 medical illustrations/);
});

test("release source inspection rejects extra released and staged city WebP files", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const releasedDirectory = path.join(fixture.root, "assets", "visuals", "cities");
  const source = fs.readdirSync(releasedDirectory).find((name) => /^city-[a-z0-9-]+\.webp$/.test(name));
  fs.copyFileSync(path.join(releasedDirectory, source), path.join(releasedDirectory, "evil.webp"));
  assert.throws(
    () => Release.inspectSource(fixture.root),
    /exactly 200 city WebP files|non-canonical WebP path/
  );
  fs.rmSync(path.join(releasedDirectory, "evil.webp"));

  const stagedDirectory = path.join(fixture.root, "assets", "visuals", "cities-staged");
  fs.copyFileSync(path.join(stagedDirectory, source), path.join(stagedDirectory, "evil.webp"));
  assert.throws(
    () => Release.inspectSource(fixture.root),
    /staged city directory must contain exactly the 200 canonical WebP files/
  );
});

test("verification rejects a changed manifest and unsafe or duplicate ZIP names", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.temporary, { recursive: true, force: true }));
  const paths = Release.sidecarPaths(fixture.zip);
  const placeholderZip = Buffer.from("placeholder archive");
  const placeholderTree = Buffer.from("placeholder tree\n");
  fs.writeFileSync(paths.zip, placeholderZip);
  fs.writeFileSync(paths.zipSha, `${sha256(placeholderZip)}  ${path.basename(paths.zip)}\n`, "utf8");
  fs.writeFileSync(paths.tree, placeholderTree);
  fs.writeFileSync(paths.treeSha, `${sha256(placeholderTree)}  ${path.basename(paths.tree)}\n`, "utf8");
  fs.appendFileSync(paths.tree, "tampered\n", "utf8");
  assert.throws(() => Release.verifyRelease(fixture.zip), /tree SHA-256 sidecar does not match/);

  const manifest = Release.inspectSource(fixture.root);
  const content = Buffer.from("x");
  const entry = { name: "daily-duet/app.js", bytes: 1, content };
  assert.throws(() => Release.validateArchiveEntries([entry, { ...entry }], manifest), /duplicate or case-colliding ZIP path/);
  assert.throws(
    () => Release.validateArchiveEntries([{ name: "daily-duet/../escape.txt", bytes: 1, content }], manifest),
    /unsafe ZIP path/
  );
  assert.throws(
    () => Release.validateArchiveEntries([{ name: "daily-duet/assets/work/", bytes: 0, content: Buffer.alloc(0) }], manifest),
    /excluded directory appears in release path/
  );
});
