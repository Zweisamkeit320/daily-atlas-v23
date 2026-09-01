"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const ServiceWorkerBuild = require("./build-service-worker.cjs");

const CACHE_VERSION = /const CACHE_VERSION = "(v3-[a-f0-9]{16})";/;
const PACK_VERSIONS = Object.freeze({
  shell: /const SHELL_VERSION = "(s1-[a-f0-9]{16})";/,
  content: /const CONTENT_VERSION = "(c1-[a-f0-9]{16})";/,
  medical: /const MEDICAL_VERSION = "(m1-[a-f0-9]{16})";/,
  audio: /const AUDIO_VERSION = "(a1-[a-f0-9]{16})";/,
  search: /const SEARCH_VERSION = "(q1-[a-f0-9]{16})";/,
  visual: /const VISUAL_VERSION = "(i1-[a-f0-9]{16})";/
});
const AUDIO_HASH = /const AUDIO_MANIFEST_SHA256 = "([A-F0-9]{64})";/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function bytesOf(fileMap, relative, label) {
  const entry = fileMap.get(relative);
  assert(entry, `${label} is missing ${relative}`);
  if (Buffer.isBuffer(entry.content)) return entry.content;
  assert(typeof entry.absolute === "string", `${label} cannot read ${relative}`);
  return fs.readFileSync(entry.absolute);
}

function overridesFrom(fileMap, label) {
  const overrides = new Map();
  for (const relative of new Set([
    ...ServiceWorkerBuild.SHELL_FILES,
    ...ServiceWorkerBuild.SHELL_PACK_FILES,
    ...ServiceWorkerBuild.CONTENT_FILES,
    ...ServiceWorkerBuild.MEDICAL_ASSET_FILES,
    ...ServiceWorkerBuild.SEARCH_FILES,
    ...ServiceWorkerBuild.VISUAL_FILES,
    "assets/audio/german/manifest.json",
    "asset-routing.js"
  ])) overrides.set(relative, bytesOf(fileMap, relative, label));
  return overrides;
}

function expectedServiceWorkerContract(swBytes, fileMap, label = "release") {
  const swText = swBytes.toString("utf8");
  const manifestBytes = bytesOf(fileMap, "assets/audio/german/manifest.json", label);
  let narrationManifest;
  try { narrationManifest = JSON.parse(manifestBytes.toString("utf8")); }
  catch (error) { throw new Error(`${label} German audio manifest is invalid JSON: ${error.message}`); }
  assert(narrationManifest?.count === 500 && Array.isArray(narrationManifest.items)
    && narrationManifest.items.length === 500, `${label} German audio manifest must contain 500 items`);
  const overrides = overridesFrom(fileMap, label);
  const normalizedShell = ServiceWorkerBuild.normalizeAppShell(swText);
  const packs = ServiceWorkerBuild.expectedPackVersions(normalizedShell, narrationManifest, overrides);
  const cacheVersion = ServiceWorkerBuild.expectedVersion(swText, narrationManifest, overrides);
  const audioManifestSha256 = crypto.createHash("sha256").update(manifestBytes).digest("hex").toUpperCase();
  return Object.freeze({ cacheVersion, packs, audioManifestSha256 });
}

function validateServiceWorkerContract(fileMap, label = "release") {
  const swBytes = bytesOf(fileMap, "sw.js", label);
  const swText = swBytes.toString("utf8");
  const shell = ServiceWorkerBuild.APP_SHELL_PATTERN.exec(swText);
  assert(shell && shell[0] === ServiceWorkerBuild.renderAppShellBlock(),
    `${label} sw.js APP_SHELL does not match the generated application shell`);
  const expected = expectedServiceWorkerContract(swBytes, fileMap, label);
  const cacheMatch = CACHE_VERSION.exec(swText);
  assert(cacheMatch, `${label} sw.js has no valid CACHE_VERSION declaration`);
  assert(cacheMatch[1] === expected.cacheVersion,
    `${label} sw.js cache version is stale; expected ${expected.cacheVersion}`);
  for (const [name, pattern] of Object.entries(PACK_VERSIONS)) {
    const match = pattern.exec(swText);
    assert(match, `${label} sw.js has no valid ${name} pack version declaration`);
    assert(match[1] === expected.packs[name],
      `${label} sw.js ${name} pack version is stale; expected ${expected.packs[name]}`);
  }
  const audioHash = AUDIO_HASH.exec(swText);
  assert(audioHash && audioHash[1] === expected.audioManifestSha256,
    `${label} sw.js German audio manifest hash is stale; expected ${expected.audioManifestSha256}`);
  return expected;
}

module.exports = Object.freeze({
  AUDIO_HASH,
  CACHE_VERSION,
  PACK_VERSIONS,
  expectedServiceWorkerContract,
  validateServiceWorkerContract
});
