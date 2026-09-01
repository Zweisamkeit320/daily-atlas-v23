#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const Assets = require("../asset-routing.js");
const ServiceWorkerBuild = require("./build-service-worker.cjs");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_REPOSITORY = "Zweisamkeit320/daily-atlas-v23";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return crypto.createHash("sha1").update(header).update(bytes).digest("hex");
}

function pinnedAssetPaths(root = ROOT) {
  const audioManifest = JSON.parse(fs.readFileSync(path.join(root, "assets", "audio", "german", "manifest.json"), "utf8"));
  invariant(audioManifest.count === 500 && Array.isArray(audioManifest.items) && audioManifest.items.length === 500,
    "German audio manifest must contain exactly 500 items");
  const catalog = ServiceWorkerBuild.CATALOG_SPLIT;
  const catalogPaths = [catalog.selection, catalog.selectionData, catalog.search, ...catalog.details];
  const paths = [...catalogPaths, ...audioManifest.items.map((item) => item.path)].sort();
  invariant(paths.length === 547, `pinned fallback must contain exactly 547 assets; found ${paths.length}`);
  invariant(new Set(paths).size === paths.length, "pinned fallback contains duplicate paths");
  for (const relative of paths) {
    invariant(Assets.normalizeAssetPath(relative) === relative, `path is not eligible for pinned fallback: ${relative}`);
    const absolute = path.resolve(root, ...relative.split("/"));
    invariant(absolute.startsWith(`${path.resolve(root)}${path.sep}`), `asset escapes release root: ${relative}`);
    invariant(fs.existsSync(absolute) && fs.lstatSync(absolute).isFile() && !fs.lstatSync(absolute).isSymbolicLink(),
      `pinned fallback asset is missing or not a regular file: ${relative}`);
  }
  return paths;
}

function verifyTree(treePayload, options = {}) {
  const root = path.resolve(options.root || ROOT);
  invariant(treePayload && typeof treePayload === "object" && treePayload.truncated === false && Array.isArray(treePayload.tree),
    "GitHub tree response is missing, malformed, or truncated");
  const remote = new Map(treePayload.tree
    .filter((item) => item?.type === "blob" && typeof item.path === "string")
    .map((item) => [item.path, item]));
  const mismatches = [];
  for (const relative of pinnedAssetPaths(root)) {
    const bytes = fs.readFileSync(path.join(root, ...relative.split("/")));
    const entry = remote.get(relative);
    const expectedSha = gitBlobSha1(bytes);
    if (!entry) mismatches.push({ path: relative, reason: "missing" });
    else if (entry.size !== bytes.length) mismatches.push({ path: relative, reason: "bytes", local: bytes.length, remote: entry.size });
    else if (String(entry.sha || "").toLowerCase() !== expectedSha) {
      mismatches.push({ path: relative, reason: "git-blob-sha1", local: expectedSha, remote: entry.sha || null });
    }
  }
  invariant(mismatches.length === 0,
    `pinned GitHub revision differs from ${mismatches.length} local asset(s): ${mismatches.slice(0, 8).map((item) => `${item.path} (${item.reason})`).join(", ")}`);
  return { assets: 547 };
}

function githubTree(repository, revision) {
  invariant(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository), "repository must be owner/name");
  invariant(/^[a-f0-9]{40}$/.test(revision), "revision must be a full lowercase Git commit SHA");
  const result = spawnSync("gh", ["api", `repos/${repository}/git/trees/${revision}?recursive=1`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  });
  invariant(result.status === 0, `GitHub tree lookup failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  try { return JSON.parse(result.stdout); }
  catch { throw new Error("GitHub tree lookup returned invalid JSON"); }
}

function parseArguments(argv) {
  let repository = DEFAULT_REPOSITORY;
  let revision = Assets.DEPLOYMENT_REVISION;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repository") repository = argv[++index];
    else if (argv[index] === "--revision") revision = argv[++index];
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  invariant(repository && revision, "--repository and --revision require values");
  return { repository, revision };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = verifyTree(githubTree(options.repository, options.revision));
  process.stdout.write(`PASS pinned-assets=${result.assets} repository=${options.repository} revision=${options.revision}\n`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`FAIL: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  DEFAULT_REPOSITORY,
  gitBlobSha1,
  githubTree,
  parseArguments,
  pinnedAssetPaths,
  verifyTree
});
