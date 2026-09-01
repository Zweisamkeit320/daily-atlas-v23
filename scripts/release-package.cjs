#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");

const ServiceWorkerBuild = require("./build-service-worker.cjs");
const CityVisualContract = require("./city-visual-contract.cjs");
const ServiceWorkerContract = require("./service-worker-contract.cjs");

const ROOT = path.resolve(__dirname, "..");
const ARCHIVE_ROOT = "daily-duet";
const ROOT_FILES = Object.freeze([
  ".gitignore", ".nojekyll", ".node-version", "_headers", "app.js", "appearance.js", "asset-routing.js", "backup.js", "backup-crypto.js", "bootstrap.js", "catalog.js", "catalog-loader.js", "city-live.js",
  "city-credits.html", "city-credits.js", "diagnostics.css", "diagnostics.html", "diagnostics.js", "engine.js", "explore.js", "index.html", "legal.css", "lock.js",
  "manifest.webmanifest", "music.js", "package-lock.json", "package.json", "privacy.html", "profile.js", "public-config.js", "pwa.js", "README.md", "reminders.js", "requirements-assets.txt", "sources-and-licenses.html",
  "runtime-health.js", "runtime-foundation.js", "runtime-features.js", "search-worker.js", "speech.js", "state.js", "styles.css", "sw.js", "visuals.js", "weekly.js"
]);
const ROOT_DIRECTORIES = Object.freeze(["assets", "catalog-data", "data", "docs", "scripts", "tests"]);
const CATALOG_FILES = Object.freeze([
  ...ServiceWorkerBuild.CATALOG_SPLIT.pointer,
  ServiceWorkerBuild.CATALOG_SPLIT.selection,
  ServiceWorkerBuild.CATALOG_SPLIT.selectionData,
  ServiceWorkerBuild.CATALOG_SPLIT.search,
  ...ServiceWorkerBuild.CATALOG_SPLIT.details
]);
const EXCLUDED_NAMES = Object.freeze([".aris", ".git", ".playwright-cli", ".wrangler", "node_modules", "test-results", "review-stage", "work"]);
const ROOT_FILE_SET = new Set(ROOT_FILES);
const ROOT_DIRECTORY_SET = new Set(ROOT_DIRECTORIES);
const EXCLUDED_SET = new Set(EXCLUDED_NAMES);
const VERSIONED_ZIP = /^daily-duet-v(\d+\.\d+\.\d+)-r\d+-\d{8}-\d{6}\.zip$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function slash(value) {
  return value.split(path.sep).join("/");
}

function isReparsePoint(stats) {
  return stats.isSymbolicLink();
}

function validateRelativePath(relative) {
  assert(typeof relative === "string" && relative.length > 0, "release path is empty");
  assert(!relative.includes("\\") && !relative.includes("\0") && !relative.includes(":"), `release path is not slash-canonical: ${relative}`);
  assert(!relative.startsWith("/") && !/^[A-Za-z]:/.test(relative), `release path is absolute: ${relative}`);
  const parts = relative.split("/");
  assert(parts.every((part) => part && part !== "." && part !== ".."), `release path is not canonical: ${relative}`);
  assert(!parts.some((part) => EXCLUDED_SET.has(part)), `excluded directory appears in release path: ${relative}`);
  assert(ROOT_FILE_SET.has(parts[0]) || ROOT_DIRECTORY_SET.has(parts[0]), `path is outside the release whitelist: ${relative}`);
  if (ROOT_FILE_SET.has(parts[0])) assert(parts.length === 1, `root file has descendants: ${relative}`);
  return relative;
}

function parseMedicalManifest(bytes, fileMap, label) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  assert(manifest?.schemaVersion === 1 && Array.isArray(manifest.items) && manifest.items.length === 24,
    `${label} must use schemaVersion 1 and describe exactly 24 medical illustrations`);
  assert(fileMap.has("assets/medical/README.md"), `${label} package is missing assets/medical/README.md`);
  const keys = new Set();
  const expectedFiles = new Set();
  for (const item of manifest.items) {
    assert(item && /^[a-z0-9-]+$/.test(item.key || "") && !keys.has(item.key),
      `${label} contains an invalid or duplicate illustration key: ${item?.key}`);
    assert(/^assets\/medical\/[a-z0-9-]+\.webp$/.test(item.file || "") && !expectedFiles.has(item.file),
      `${label} contains an invalid or duplicate illustration file: ${item?.file}`);
    assert(typeof item.alt === "string" && item.alt.length >= 16, `${label} contains an invalid alt for ${item.key}`);
    const file = fileMap.get(item.file);
    assert(file && file.bytes > 0, `${label} references a missing or empty illustration: ${item.file}`);
    keys.add(item.key);
    expectedFiles.add(item.file);
  }
  const packagedFiles = [...fileMap.keys()].filter((relative) => /^assets\/medical\/[a-z0-9-]+\.webp$/.test(relative));
  assert(packagedFiles.length === 24, `${label} package must contain exactly 24 medical WebP files; found ${packagedFiles.length}`);
  assert(packagedFiles.every((relative) => expectedFiles.has(relative)), `${label} package contains a medical WebP absent from the manifest`);
  return [...expectedFiles].sort(ordinalCompare);
}

function inspectSource(root = ROOT) {
  const resolvedRoot = path.resolve(root);
  const topNames = fs.readdirSync(resolvedRoot).sort(ordinalCompare);
  const allowedTop = new Set([...ROOT_FILES, ...ROOT_DIRECTORIES, ...EXCLUDED_NAMES]);
  for (const name of topNames) assert(allowedTop.has(name), `unexpected top-level entry: ${name}`);
  for (const name of [...ROOT_FILES, ...ROOT_DIRECTORIES]) {
    assert(topNames.includes(name), `required release entry is missing: ${name}`);
  }

  const files = [];
  const visit = (absolute, relative) => {
    const stats = fs.lstatSync(absolute);
    assert(!isReparsePoint(stats), `reparse point is forbidden: ${relative}`);
    if (stats.isDirectory()) {
      if (relative) validateRelativePath(relative);
      for (const name of fs.readdirSync(absolute).sort(ordinalCompare)) {
        visit(path.join(absolute, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    assert(stats.isFile(), `non-regular release entry is forbidden: ${relative}`);
    validateRelativePath(relative);
    files.push({
      path: relative,
      absolute,
      bytes: stats.size,
      sha256: sha256(fs.readFileSync(absolute))
    });
  };

  for (const name of ROOT_FILES) visit(path.join(resolvedRoot, name), name);
  for (const name of ROOT_DIRECTORIES) visit(path.join(resolvedRoot, name), name);
  files.sort((left, right) => ordinalCompare(left.path, right.path));
  validateFileInventory(files);
  const fileMap = new Map(files.map((entry) => [entry.path, entry]));
  parseMedicalManifest(fs.readFileSync(fileMap.get("assets/medical/manifest.json").absolute), fileMap, "source medical manifest");
  CityVisualContract.validateCityVisualContract(fileMap, "full release source", { requireEvidence: true });
  ServiceWorkerContract.validateServiceWorkerContract(fileMap, "full release source");
  return files;
}

function validateFileInventory(files) {
  const seen = new Set();
  let previous = null;
  for (const entry of files) {
    validateRelativePath(entry.path);
    assert(/^[A-F0-9]{64}$/.test(entry.sha256), `invalid SHA-256 for ${entry.path}`);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `invalid byte length for ${entry.path}`);
    assert(previous === null || ordinalCompare(previous, entry.path) < 0, "tree manifest is not in strict ordinal order");
    assert(!seen.has(entry.path.toLowerCase()), `duplicate or case-colliding path: ${entry.path}`);
    seen.add(entry.path.toLowerCase());
    previous = entry.path;
  }
  for (const name of ROOT_FILES) assert(seen.has(name.toLowerCase()), `required root file is absent: ${name}`);
  const audioCount = files.filter((entry) => /^assets\/audio\/german\/[^/]+\.mp3$/.test(entry.path)).length;
  assert(audioCount === 500, `release must contain exactly 500 German MP3 files; found ${audioCount}`);
  assert(seen.has("sw.js"), "release must contain sw.js");
  assert(seen.has("assets/medical/manifest.json") && seen.has("assets/medical/readme.md"),
    "release must contain the medical illustration manifest and README");
  const medicalWebps = files.filter((entry) => /^assets\/medical\/[a-z0-9-]+\.webp$/.test(entry.path));
  assert(medicalWebps.length === 24, `release must contain exactly 24 medical WebP files; found ${medicalWebps.length}`);
  const catalogFiles = files.filter((entry) => entry.path.startsWith("catalog-data/")).map((entry) => entry.path);
  const expectedCatalogFiles = new Set(CATALOG_FILES);
  assert(catalogFiles.length === expectedCatalogFiles.size,
    `release catalog-data inventory must contain exactly ${expectedCatalogFiles.size} generated files; found ${catalogFiles.length}`);
  for (const relative of catalogFiles) assert(expectedCatalogFiles.has(relative), `unexpected generated catalog file: ${relative}`);
  for (const relative of expectedCatalogFiles) assert(seen.has(relative.toLowerCase()), `required generated catalog file is absent: ${relative}`);
}

function renderTreeManifest(files) {
  validateFileInventory(files);
  return `${files.map((entry) => `${entry.sha256}\t${entry.bytes}\t${entry.path}`).join("\n")}\n`;
}

function parseTreeManifest(bytes) {
  assert(!bytes.subarray(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])), "tree manifest must be UTF-8 without BOM");
  const text = bytes.toString("utf8");
  assert(!text.includes("\r"), "tree manifest must use LF line endings");
  assert(text.endsWith("\n"), "tree manifest must end with LF");
  const files = text.slice(0, -1).split("\n").map((line) => {
    const match = /^([A-F0-9]{64})\t(0|[1-9]\d*)\t([^\t\r\n]+)$/.exec(line);
    assert(match, `invalid tree manifest line: ${line}`);
    const bytesValue = Number(match[2]);
    assert(Number.isSafeInteger(bytesValue), `unsafe byte length in tree manifest: ${match[3]}`);
    return { sha256: match[1], bytes: bytesValue, path: match[3] };
  });
  validateFileInventory(files);
  assert(renderTreeManifest(files) === text, "tree manifest is not canonical");
  return files;
}

function sidecarPaths(zipPath) {
  const resolved = path.resolve(zipPath);
  assert(resolved.toLowerCase().endsWith(".zip"), "release archive must have a .zip extension");
  const base = resolved.slice(0, -4);
  return {
    zip: resolved,
    zipSha: `${resolved}.sha256`,
    tree: `${base}.tree-manifest.tsv`,
    treeSha: `${base}.tree.sha256`
  };
}

function packageVersionFromBytes(bytes, label = "package.json") {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  assert(parsed && typeof parsed === "object" && /^\d+\.\d+\.\d+$/.test(parsed.version), `${label} must contain a plain semantic version`);
  return parsed.version;
}

function assertZipMatchesPackage(zipPath, version) {
  const filename = path.basename(zipPath);
  const match = VERSIONED_ZIP.exec(filename);
  assert(match, "ZIP filename must be versioned: daily-duet-v<semver>-r<round>-YYYYMMDD-HHmmss.zip");
  assert(match[1] === version, `ZIP version ${match[1]} does not match package version ${version}`);
}

function parseHashSidecar(bytes, expectedName, label) {
  const text = bytes.toString("utf8");
  assert(!text.includes("\r") && text.endsWith("\n"), `${label} sidecar must use one LF-terminated line`);
  const match = /^([A-F0-9]{64})  ([^\r\n]+)\n$/.exec(text);
  assert(match && match[2] === expectedName, `${label} sidecar has an invalid filename or format`);
  return match[1];
}

function findEndOfCentralDirectory(buffer) {
  assert(buffer.length >= 22, "ZIP file is too short");
  const minimum = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054B50) return offset;
  }
  throw new Error("ZIP end-of-central-directory record is missing");
}

function readZipEntries(zipBytes) {
  const eocd = findEndOfCentralDirectory(zipBytes);
  const disk = zipBytes.readUInt16LE(eocd + 4);
  const centralDisk = zipBytes.readUInt16LE(eocd + 6);
  const entriesOnDisk = zipBytes.readUInt16LE(eocd + 8);
  const totalEntries = zipBytes.readUInt16LE(eocd + 10);
  const centralSize = zipBytes.readUInt32LE(eocd + 12);
  const centralOffset = zipBytes.readUInt32LE(eocd + 16);
  const commentLength = zipBytes.readUInt16LE(eocd + 20);
  assert(disk === 0 && centralDisk === 0 && entriesOnDisk === totalEntries, "multi-disk ZIP archives are forbidden");
  assert(totalEntries !== 0xFFFF && centralSize !== 0xFFFFFFFF && centralOffset !== 0xFFFFFFFF, "ZIP64 archives are not supported");
  assert(eocd + 22 + commentLength === zipBytes.length, "unexpected bytes follow the ZIP end record");
  assert(centralOffset + centralSize === eocd, "ZIP central directory bounds are inconsistent");

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    assert(cursor + 46 <= eocd && zipBytes.readUInt32LE(cursor) === 0x02014B50, `invalid ZIP central entry ${index}`);
    const flags = zipBytes.readUInt16LE(cursor + 8);
    const method = zipBytes.readUInt16LE(cursor + 10);
    const compressedBytes = zipBytes.readUInt32LE(cursor + 20);
    const bytes = zipBytes.readUInt32LE(cursor + 24);
    const nameLength = zipBytes.readUInt16LE(cursor + 28);
    const extraLength = zipBytes.readUInt16LE(cursor + 30);
    const commentBytes = zipBytes.readUInt16LE(cursor + 32);
    const localOffset = zipBytes.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentBytes;
    assert(end <= eocd, `ZIP central entry ${index} exceeds its directory`);
    const name = zipBytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    assert(!(flags & 0x0001), `encrypted ZIP entry is forbidden: ${name}`);
    assert(method === 0 || method === 8, `unsupported ZIP compression method ${method}: ${name}`);
    assert(localOffset + 30 <= centralOffset && zipBytes.readUInt32LE(localOffset) === 0x04034B50, `local ZIP header is missing: ${name}`);
    const localNameLength = zipBytes.readUInt16LE(localOffset + 26);
    const localExtraLength = zipBytes.readUInt16LE(localOffset + 28);
    const localName = zipBytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    assert(localName === name, `ZIP local and central names disagree: ${name}`);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    assert(dataOffset + compressedBytes <= centralOffset, `compressed ZIP data is out of bounds: ${name}`);
    const compressed = zipBytes.subarray(dataOffset, dataOffset + compressedBytes);
    const content = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
    assert(content.length === bytes, `ZIP entry byte length is invalid: ${name}`);
    entries.push({ name, bytes, content });
    cursor = end;
  }
  assert(cursor === eocd, "ZIP central directory contains unparsed bytes");
  return entries;
}

function canonicalizeZipPathSeparators(zipPath) {
  const zipBytes = fs.readFileSync(zipPath);
  const eocd = findEndOfCentralDirectory(zipBytes);
  const totalEntries = zipBytes.readUInt16LE(eocd + 10);
  let cursor = zipBytes.readUInt32LE(eocd + 16);
  for (let index = 0; index < totalEntries; index += 1) {
    assert(zipBytes.readUInt32LE(cursor) === 0x02014B50, `invalid ZIP central entry ${index}`);
    const nameLength = zipBytes.readUInt16LE(cursor + 28);
    const extraLength = zipBytes.readUInt16LE(cursor + 30);
    const commentBytes = zipBytes.readUInt16LE(cursor + 32);
    const localOffset = zipBytes.readUInt32LE(cursor + 42);
    assert(zipBytes.readUInt32LE(localOffset) === 0x04034B50, `local ZIP header is missing for central entry ${index}`);
    const localNameLength = zipBytes.readUInt16LE(localOffset + 26);
    assert(localNameLength === nameLength, `ZIP local and central name lengths disagree at entry ${index}`);
    for (let offset = 0; offset < nameLength; offset += 1) {
      if (zipBytes[cursor + 46 + offset] === 0x5C) zipBytes[cursor + 46 + offset] = 0x2F;
      if (zipBytes[localOffset + 30 + offset] === 0x5C) zipBytes[localOffset + 30 + offset] = 0x2F;
    }
    cursor += 46 + nameLength + extraLength + commentBytes;
  }
  fs.writeFileSync(zipPath, zipBytes);
}

function validateArchiveEntries(entries, manifestFiles) {
  const seen = new Set();
  const archiveFiles = new Map();
  for (const entry of entries) {
    const name = entry.name;
    assert(typeof name === "string" && name.length > 0, "ZIP contains an empty path");
    assert(!name.includes("\\") && !name.includes("\0") && !name.includes(":") && !name.startsWith("/"), `unsafe ZIP path: ${name}`);
    const parts = name.split("/");
    assert(parts[0] === ARCHIVE_ROOT, `ZIP has an unexpected root: ${name}`);
    assert(parts.slice(0, -1).every((part) => part && part !== "." && part !== ".."), `unsafe ZIP path: ${name}`);
    assert(!seen.has(name.toLowerCase()), `duplicate or case-colliding ZIP path: ${name}`);
    seen.add(name.toLowerCase());
    if (name.endsWith("/")) {
      assert(parts[parts.length - 1] === "", `invalid ZIP directory path: ${name}`);
      const relativeDirectory = parts.slice(1, -1).join("/");
      if (relativeDirectory) validateRelativePath(relativeDirectory);
      continue;
    }
    assert(parts.length >= 2, `ZIP file is outside ${ARCHIVE_ROOT}/: ${name}`);
    const relative = parts.slice(1).join("/");
    validateRelativePath(relative);
    archiveFiles.set(relative, entry);
  }
  const medicalManifest = archiveFiles.get("assets/medical/manifest.json");
  assert(medicalManifest, "ZIP is missing assets/medical/manifest.json");
  parseMedicalManifest(medicalManifest.content, archiveFiles, "archived medical manifest");
  CityVisualContract.validateCityVisualContract(archiveFiles, "archived full release", { requireEvidence: true });
  ServiceWorkerContract.validateServiceWorkerContract(archiveFiles, "archived full release");
  assert(archiveFiles.size === manifestFiles.length, `ZIP file count ${archiveFiles.size} differs from manifest count ${manifestFiles.length}`);
  for (const expected of manifestFiles) {
    const actual = archiveFiles.get(expected.path);
    assert(actual, `ZIP is missing ${expected.path}`);
    assert(actual.bytes === expected.bytes, `ZIP size mismatch: ${expected.path}`);
    assert(sha256(actual.content) === expected.sha256, `ZIP SHA-256 mismatch: ${expected.path}`);
  }
}

function verifyZipAgainstManifest(zipPath, manifestFiles) {
  const zipBytes = fs.readFileSync(zipPath);
  validateArchiveEntries(readZipEntries(zipBytes), manifestFiles);
  return sha256(zipBytes);
}

function verifyRelease(zipPath) {
  const paths = sidecarPaths(zipPath);
  for (const target of Object.values(paths)) assert(fs.existsSync(target), `release artifact is missing: ${target}`);
  const zipBytes = fs.readFileSync(paths.zip);
  const expectedZipHash = parseHashSidecar(fs.readFileSync(paths.zipSha), path.basename(paths.zip), "ZIP SHA-256");
  assert(sha256(zipBytes) === expectedZipHash, "ZIP SHA-256 sidecar does not match the archive");
  const treeBytes = fs.readFileSync(paths.tree);
  const expectedTreeHash = parseHashSidecar(fs.readFileSync(paths.treeSha), path.basename(paths.tree), "tree SHA-256");
  assert(sha256(treeBytes) === expectedTreeHash, "tree SHA-256 sidecar does not match the manifest");
  const files = parseTreeManifest(treeBytes);
  const entries = readZipEntries(zipBytes);
  validateArchiveEntries(entries, files);
  const packageEntry = entries.find((entry) => entry.name === `${ARCHIVE_ROOT}/package.json`);
  assert(packageEntry, "ZIP is missing package.json");
  assertZipMatchesPackage(paths.zip, packageVersionFromBytes(packageEntry.content, "archived package.json"));
  return { files: files.length, zipSha256: expectedZipHash, treeSha256: expectedTreeHash };
}

function copyInventory(files, sourceRoot, stagingRoot) {
  for (const directory of ROOT_DIRECTORIES) fs.mkdirSync(path.join(stagingRoot, directory), { recursive: true });
  for (const entry of files) {
    const destination = path.join(stagingRoot, ...entry.path.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, ...entry.path.split("/")), destination, fs.constants.COPYFILE_EXCL);
  }
}

function compressWithPowerShell(stagingRoot, outputZip) {
  assert(process.platform === "win32", "release ZIP creation requires Windows PowerShell");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$source = $env:DAILY_DUET_RELEASE_STAGE",
    "$destination = $env:DAILY_DUET_RELEASE_ZIP",
    "Compress-Archive -LiteralPath $source -DestinationPath $destination -CompressionLevel Optimal"
  ].join("\n");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, DAILY_DUET_RELEASE_STAGE: stagingRoot, DAILY_DUET_RELEASE_ZIP: outputZip }
  });
  assert(result.status === 0, `Compress-Archive failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
}

function createRelease(zipPath, root = ROOT) {
  const resolvedRoot = path.resolve(root);
  const paths = sidecarPaths(zipPath);
  const packageVersion = packageVersionFromBytes(fs.readFileSync(path.join(resolvedRoot, "package.json")), "source package.json");
  assertZipMatchesPackage(paths.zip, packageVersion);
  assert(!Object.values(paths).some((target) => fs.existsSync(target)), "refusing to overwrite an existing release artifact or sidecar");
  assert(!(`${paths.zip}${path.sep}`).startsWith(`${resolvedRoot}${path.sep}`), "release artifacts must be written outside the source tree");
  fs.mkdirSync(path.dirname(paths.zip), { recursive: true });
  const files = inspectSource(resolvedRoot);
  const treeBytes = Buffer.from(renderTreeManifest(files), "utf8");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "daily-duet-release-"));
  const stagingRoot = path.join(temporary, ARCHIVE_ROOT);
  const temporaryZip = path.join(temporary, path.basename(paths.zip));
  const created = [];
  try {
    fs.mkdirSync(stagingRoot, { recursive: true });
    copyInventory(files, resolvedRoot, stagingRoot);
    compressWithPowerShell(stagingRoot, temporaryZip);
    canonicalizeZipPathSeparators(temporaryZip);
    const zipHash = verifyZipAgainstManifest(temporaryZip, files);
    const zipSidecar = Buffer.from(`${zipHash}  ${path.basename(paths.zip)}\n`, "utf8");
    const treeHash = sha256(treeBytes);
    const treeSidecar = Buffer.from(`${treeHash}  ${path.basename(paths.tree)}\n`, "utf8");
    const payloads = [
      [paths.zip, fs.readFileSync(temporaryZip)],
      [paths.zipSha, zipSidecar],
      [paths.tree, treeBytes],
      [paths.treeSha, treeSidecar]
    ];
    for (const [target, payload] of payloads) {
      fs.writeFileSync(target, payload, { flag: "wx" });
      created.push(target);
    }
    const verified = verifyRelease(paths.zip);
    return { ...verified, paths };
  } catch (error) {
    for (const target of created.reverse()) {
      try { fs.rmSync(target, { force: true }); } catch { /* retain the original error */ }
    }
    throw error;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function parseCli(argv) {
  if (argv[0] === "--check-zip") return { command: "verify", zip: argv[1] };
  const command = argv[0];
  let zip = null;
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--zip") zip = argv[++index];
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  assert(command === "create" || command === "verify", "usage: release-package.cjs create|verify --zip <versioned.zip>");
  assert(zip, "--zip is required");
  return { command, zip };
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const result = options.command === "create" ? createRelease(options.zip) : verifyRelease(options.zip);
  console.log(`PASS: ${options.command} files=${result.files} zipSha256=${result.zipSha256} treeSha256=${result.treeSha256}`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  ARCHIVE_ROOT,
  CATALOG_FILES,
  EXCLUDED_NAMES,
  ROOT_DIRECTORIES,
  ROOT_FILES,
  createRelease,
  inspectSource,
  packageVersionFromBytes,
  parseMedicalManifest,
  parseTreeManifest,
  readZipEntries,
  renderTreeManifest,
  sidecarPaths,
  validateArchiveEntries,
  verifyRelease
});
