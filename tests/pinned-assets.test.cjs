"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const Pinned = require("../scripts/verify-pinned-assets.cjs");

const ROOT = path.resolve(__dirname, "..");

function localTree() {
  return {
    truncated: false,
    tree: Pinned.pinnedAssetPaths().map((relative) => {
      const bytes = fs.readFileSync(path.join(ROOT, ...relative.split("/")));
      return { path: relative, type: "blob", size: bytes.length, sha: Pinned.gitBlobSha1(bytes) };
    })
  };
}

test("pinned fallback inventory is exactly the 47 split-catalog assets and 500 German MP3s", () => {
  const paths = Pinned.pinnedAssetPaths();
  assert.equal(paths.length, 547);
  assert.equal(paths.filter((value) => value.startsWith("catalog-data/")).length, 47);
  assert.equal(paths.filter((value) => value.startsWith("assets/audio/german/")).length, 500);
  assert.equal(paths.includes("catalog.js"), false);
});

test("pinned Git tree verification accepts exact blobs and rejects missing, stale, or truncated trees", () => {
  const tree = localTree();
  assert.deepEqual(Pinned.verifyTree(tree), { assets: 547 });

  const missing = structuredClone(tree);
  missing.tree.pop();
  assert.throws(() => Pinned.verifyTree(missing), /differs from 1 local asset/);

  const stale = structuredClone(tree);
  stale.tree[0].sha = "0".repeat(40);
  assert.throws(() => Pinned.verifyTree(stale), /git-blob-sha1/);

  assert.throws(() => Pinned.verifyTree({ ...tree, truncated: true }), /truncated/);
});
