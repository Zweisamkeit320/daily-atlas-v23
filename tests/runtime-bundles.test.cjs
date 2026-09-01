"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const Build = require("../scripts/build-runtime-bundles.cjs");
const ROOT = path.resolve(__dirname, "..");

test("generated runtime bundles exactly match their reviewed source modules", () => {
  for (const [output, sources] of Object.entries(Build.BUNDLES)) {
    const current = fs.readFileSync(path.join(ROOT, output), "utf8").replace(/\r\n/g, "\n");
    assert.equal(current, Build.renderBundle(output, sources));
  }
});

test("normal startup uses two runtime bundles while safe mode keeps its explicit module fallback", () => {
  const bootstrap = fs.readFileSync(path.join(ROOT, "bootstrap.js"), "utf8");
  assert.match(bootstrap, /loadScript\("\.\/runtime-foundation\.js"\)/);
  assert.match(bootstrap, /else await loadScript\("\.\/runtime-features\.js"\)/);
  assert.match(bootstrap, /safeFeaturePaths\.map/);
  assert.doesNotMatch(bootstrap, /foundationPaths\.map/);
});
