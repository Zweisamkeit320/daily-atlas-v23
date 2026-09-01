"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Deploy = require("../scripts/static-deploy-package.cjs");
const CityVisualContract = require("../scripts/city-visual-contract.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BASE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "daily-atlas-package-fixtures-"));
const BASES = new Map();

function projectPath(relative) {
  return path.join(PROJECT_ROOT, ...relative.split("/"));
}

function targetPath(root, relative) {
  return path.join(root, ...relative.split("/"));
}

function copyFile(relative, root) {
  const source = projectPath(relative);
  const target = targetPath(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyStaticInventory(root) {
  for (const relative of Deploy.FIXED_FILES) copyFile(relative, root);
  copyFile("package.json", root);
  for (const name of fs.readdirSync(projectPath("assets/audio/german"))) {
    if (name.toLowerCase().endsWith(".mp3")) copyFile(`assets/audio/german/${name}`, root);
  }
}

function copyReleaseEvidence(root) {
  for (const relative of Object.values(CityVisualContract.EVIDENCE_FILES)) copyFile(relative, root);
  const index = JSON.parse(fs.readFileSync(projectPath(CityVisualContract.EVIDENCE_FILES.contactIndex), "utf8"));
  for (const relative of index.pages) copyFile(relative, root);
  for (const name of fs.readdirSync(projectPath("assets/visuals/cities-staged"))) {
    if (name.toLowerCase().endsWith(".webp")) copyFile(`assets/visuals/cities-staged/${name}`, root);
  }
  const frozenEvidenceDirectory = projectPath("data/visuals/evidence/commons-city-pages");
  if (fs.existsSync(frozenEvidenceDirectory)) {
    for (const name of fs.readdirSync(frozenEvidenceDirectory)) {
      if (name.toLowerCase().endsWith(".html.gz")) {
        copyFile(`data/visuals/evidence/commons-city-pages/${name}`, root);
      }
    }
  }
}

function ensureBase(kind) {
  if (BASES.has(kind)) return BASES.get(kind);
  const root = path.join(BASE_ROOT, kind);
  fs.mkdirSync(root, { recursive: true });
  copyStaticInventory(root);
  if (kind === "release") {
    for (const relative of ["package-lock.json", "README.md", "requirements-assets.txt"]) copyFile(relative, root);
    copyReleaseEvidence(root);
    for (const directory of ["data", "docs", "scripts", "tests"]) fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "catalog.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(root, "docs", "REAL_DEVICE_MATRIX.md"), "# Real-device matrix\n\nNOT RUN\n", "utf8");
    fs.writeFileSync(path.join(root, "scripts", "fixture.cjs"), "\n", "utf8");
    fs.writeFileSync(path.join(root, "tests", "fixture.test.cjs"), "\n", "utf8");
  }
  BASES.set(kind, root);
  return root;
}

function cloneTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      cloneTree(from, to);
      continue;
    }
    if (!entry.isFile()) throw new Error(`fixture base contains a non-regular entry: ${from}`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try { fs.linkSync(from, to); }
    catch { fs.copyFileSync(from, to); }
  }
}

function cloneFixture(kind, prefix) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const root = path.join(temporary, "source");
  const output = path.join(temporary, "output");
  cloneTree(ensureBase(kind), root);
  fs.mkdirSync(output, { recursive: true });
  return { temporary, root, output };
}

// Fixture clones use hard links for speed. Always detach a file before mutation so
// a negative test cannot alter the shared base or the real project inventory.
function replaceFile(absolute, value, encoding) {
  fs.rmSync(absolute, { force: true });
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  if (encoding) fs.writeFileSync(absolute, value, encoding);
  else fs.writeFileSync(absolute, value);
}

function appendDetached(absolute, value) {
  const current = fs.readFileSync(absolute);
  const addition = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  replaceFile(absolute, Buffer.concat([current, addition]));
}

process.once("exit", () => {
  try { fs.rmSync(BASE_ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
});

module.exports = Object.freeze({
  PROJECT_ROOT,
  appendDetached,
  cloneFixture,
  replaceFile,
  targetPath
});
