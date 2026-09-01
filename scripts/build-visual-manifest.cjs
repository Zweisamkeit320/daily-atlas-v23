#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  PATHS,
  browserManifestBytes,
  buildManifest,
  manifestBytes,
  resolveWorkspacePath,
  sha256
} = require("./visual-manifest-lib.cjs");

function usage() {
  return "Usage: node scripts/build-visual-manifest.cjs [--check]";
}

function main(argv) {
  const unknown = argv.filter((arg) => arg !== "--check");
  if (unknown.length) throw new Error(`${usage()}\nUnknown argument: ${unknown[0]}`);
  const check = argv.includes("--check");
  const outputPath = resolveWorkspacePath(PATHS.output);
  const browserOutputPath = resolveWorkspacePath(PATHS.browserOutput);
  const manifest = buildManifest();
  const bytes = manifestBytes(manifest);
  const browserBytes = browserManifestBytes(manifest);

  if (check) {
    if (!fs.existsSync(outputPath)) throw new Error(`Missing generated manifest: ${PATHS.output}`);
    if (!fs.existsSync(browserOutputPath)) throw new Error(`Missing generated browser manifest: ${PATHS.browserOutput}`);
    const existing = fs.readFileSync(outputPath);
    const existingBrowser = fs.readFileSync(browserOutputPath);
    if (!existing.equals(bytes)) {
      throw new Error(`${PATHS.output} is stale; run node scripts/build-visual-manifest.cjs`);
    }
    if (!existingBrowser.equals(browserBytes)) {
      throw new Error(`${PATHS.browserOutput} is stale; run node scripts/build-visual-manifest.cjs`);
    }
    process.stdout.write(`PASS ${PATHS.output} ${sha256(existing)} (${existing.length} bytes)\n`);
    process.stdout.write(`PASS ${PATHS.browserOutput} ${sha256(existingBrowser)} (${existingBrowser.length} bytes)\n`);
    return;
  }

  for (const [target, content] of [[outputPath, bytes], [browserOutputPath, browserBytes]]) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporaryPath = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, content, { flag: "wx" });
    fs.renameSync(temporaryPath, target);
  }
  process.stdout.write(`WROTE ${PATHS.output} ${sha256(bytes)} (${bytes.length} bytes)\n`);
  process.stdout.write(`WROTE ${PATHS.browserOutput} ${sha256(browserBytes)} (${browserBytes.length} bytes)\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
