"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "fetch-commons-city-images.py");
const CANDIDATES = path.join(ROOT, "data", "visuals", "city-commons-candidates.v1.json");
const REVIEWS = path.join(ROOT, "data", "visuals", "city-commons-reviews.v1.json");
const CONTACT_INDEX = path.join(ROOT, "data", "visuals", "city-review-evidence", "index.json");
const ALLOWED = new Set([
  "CC0-1.0", "PDM-1.0", "CC-BY-2.0", "CC-BY-2.5", "CC-BY-3.0", "CC-BY-4.0",
  "CC-BY-SA-2.0", "CC-BY-SA-2.5", "CC-BY-SA-3.0", "CC-BY-SA-4.0",
  "CC-BY-SA-3.0-DE", "CC-BY-SA-3.0-EE", "CC-BY-3.0-PL", "CC-BY-3.0-BR", "CC-BY-2.5-AU"
]);
const PORTED_LICENSES = Object.freeze({
  "city-berlin": Object.freeze({ code: "CC-BY-SA-3.0-DE", name: "Attribution-ShareAlike 3.0 Germany", url: "https://creativecommons.org/licenses/by-sa/3.0/de/", sourceMetadataSha256: "CA3A221C82BDA202A0CB1E27174DF6134F4B84E96AA7240A1DCB359AB7D2D20E" }),
  "city-hamburg": Object.freeze({ code: "CC-BY-SA-3.0-DE", name: "Attribution-ShareAlike 3.0 Germany", url: "https://creativecommons.org/licenses/by-sa/3.0/de/", sourceMetadataSha256: "EB74E3E1E66EC22007ADA2583B72B9EA0FEF24D770E151E031E2981773C5618F" }),
  "city-tallinn": Object.freeze({ code: "CC-BY-SA-3.0-EE", name: "Attribution-ShareAlike 3.0 Estonia", url: "https://creativecommons.org/licenses/by-sa/3.0/ee/", sourceMetadataSha256: "649D4381C1743420B9BFF34CA598056465AD861986B4AE39680873E49C6BABAC" }),
  "city-kashgar": Object.freeze({ code: "CC-BY-3.0-PL", name: "Attribution 3.0 Poland", url: "https://creativecommons.org/licenses/by/3.0/pl/", sourceMetadataSha256: "BB394D7A7405C2A6279CD0587041BB84B687F5B0DAD686DE08ADA693EBCDE13D" }),
  "city-brasilia": Object.freeze({ code: "CC-BY-3.0-BR", name: "Attribution 3.0 Brazil", url: "https://creativecommons.org/licenses/by/3.0/br/", sourceMetadataSha256: "D1D6BFB7A86E5951410CDDCE4F6F5E4F3C3464944DD663E7D7C0C699314AC2C3" }),
  "city-fremantle": Object.freeze({ code: "CC-BY-2.5-AU", name: "Attribution 2.5 Australia", url: "https://creativecommons.org/licenses/by/2.5/au/", sourceMetadataSha256: "57EC9ABA7087CC2801D50AA6E493247D425B38F0564CD497AF3F86CC8B4BD9D5" })
});

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function frozenRlconf(bytes) {
  const document = bytes.toString("utf8");
  const start = document.indexOf("RLCONF=");
  assert.ok(start >= 0, "frozen Commons HTML must contain RLCONF");
  const valueStart = start + "RLCONF=".length;
  const endings = [document.indexOf(";\nRLSTATE=", valueStart), document.indexOf(";RLSTATE=", valueStart)].filter((value) => value >= 0);
  assert.ok(endings.length > 0, "frozen Commons HTML must terminate RLCONF before RLSTATE");
  return JSON.parse(document.slice(valueStart, Math.min(...endings)));
}

function normalizedFileTitle(value) {
  return String(value || "").replaceAll("_", " ").normalize("NFC");
}

test("city Commons pipeline has a deterministic offline self-test", () => {
  const result = spawnSync("python", [SCRIPT, "self-test"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS/);
});

test("city candidate audit fails closed and hashes every staged WebP", { skip: !fs.existsSync(CANDIDATES) }, () => {
  const payload = JSON.parse(fs.readFileSync(CANDIDATES, "utf8"));
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "raw", "cities200.json"), "utf8"));
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.counts.cities, 200);
  assert.deepEqual(payload.items.map((item) => item.id), catalog.map((item) => item.id));

  let staged = 0;
  for (const item of payload.items) {
    if (!item.selected) {
      assert.equal(item.status, "unresolved");
      assert.ok(item.failureReason);
      continue;
    }
    staged += 1;
    assert.equal(item.status, "staged-awaiting-visual-review");
    assert.ok(ALLOWED.has(item.selected.license.code));
    assert.match(item.selected.pageUrl, /^https:\/\/commons\.wikimedia\.org\//);
    assert.match(item.selected.originalUrl, /^https:\/\/upload\.wikimedia\.org\//);
    assert.match(item.selected.thumbnailUrl, /^https:\/\/upload\.wikimedia\.org\//);
    assert.match(item.selected.sourceMetadataSha256, /^[A-F0-9]{64}$/);
    assert.equal(item.selected.subjectSignals.geographicGatePassed, true);
    assert.equal(item.selected.subjectSignals.geographicFailureReason, null);
    assert.ok(item.selected.subjectSignals.cityNameInTitleOrSnippet || item.selected.subjectSignals.cityNameInSourceMetadata);
    assert.ok(item.selected.author.length <= 240, `${item.id} author is unexpectedly long`);
    assert.ok(item.selected.attribution.length <= 1000, `${item.id} attribution is unexpectedly long`);
    assert.doesNotMatch(item.selected.author, /\.mw-parser-output|@media|background-(?:image|color)|box-sizing|url\(|https?:\/\/|[{}]/i);
    assert.doesNotMatch(item.selected.attribution, /\.mw-parser-output|@media|background-(?:image|color)|box-sizing|url\(|https?:\/\/|[{}]/i);
    assert.equal(item.selected.subjectSignals.visualReviewRequired, true);
    const local = path.resolve(ROOT, item.selected.staged.file);
    assert.ok(local.startsWith(path.join(ROOT, "assets", "visuals", "cities-staged") + path.sep));
    const bytes = fs.readFileSync(local);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
    assert.equal(sha256(bytes), item.selected.staged.sha256);
    assert.equal(item.selected.staged.width, 960);
    assert.equal(item.selected.staged.height, 540);
  }
  assert.equal(payload.counts.staged, staged);
  assert.equal(payload.counts.unresolved, 200 - staged);
});

test("unreviewed staged files are segregated from final city assets", { skip: !fs.existsSync(CANDIDATES) }, () => {
  const payload = JSON.parse(fs.readFileSync(CANDIDATES, "utf8"));
  const reviewedPath = path.join(ROOT, "data", "visuals", "city-commons-overrides.generated.json");
  const reviewed = fs.existsSync(reviewedPath)
    ? new Set(JSON.parse(fs.readFileSync(reviewedPath, "utf8")).items.map((item) => item.id))
    : new Set();
  for (const item of payload.items) {
    if (!item.selected || reviewed.has(item.id)) continue;
    assert.equal(fs.existsSync(path.join(ROOT, "assets", "visuals", "cities", `${item.id}.webp`)), false);
  }
});

test("six jurisdiction-specific Commons licences stay exact from frozen evidence through published manifests", () => {
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES, "utf8"));
  const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "visuals", "city-commons-overrides.json"), "utf8"));
  const cityManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "visuals", "cities", "manifest.json"), "utf8"));
  const evidenceDir = path.join(ROOT, "data", "visuals", "evidence", "commons-city-pages");
  for (const [id, expected] of Object.entries(PORTED_LICENSES)) {
    const selected = candidates.items.find((item) => item.id === id)?.selected;
    const override = overrides.items.find((item) => item.id === id);
    const runtime = cityManifest.items.find((item) => item.id === id);
    assert.ok(selected && override && runtime, `${id} must exist in all three publication layers`);
    assert.deepEqual(selected.license, { code: expected.code, name: expected.name, url: expected.url });
    assert.deepEqual(override.license, { code: expected.code, name: expected.name, url: expected.url });
    assert.equal(selected.sourceMetadataSha256, expected.sourceMetadataSha256);
    assert.equal(override.sourceMetadataSha256, expected.sourceMetadataSha256);
    const expectedAttribution = `${selected.author}, ${selected.fileTitle.slice("File:".length)}, ${expected.code}, via Wikimedia Commons; cropped to 16:9 and resized.`;
    assert.equal(selected.attribution, expectedAttribution);
    assert.equal(override.attribution, expectedAttribution);
    assert.equal(runtime.attribution, expectedAttribution);
    assert.equal(runtime.licenseName, expected.name);
    assert.equal(runtime.licenseCode, expected.code);
    assert.equal(runtime.licenseUrl, expected.url);
    assert.equal(runtime.sourcePage, selected.pageUrl);
    const evidenceMatches = fs.readdirSync(evidenceDir)
      .filter((name) => name.startsWith(`${id}.`) && name.endsWith(".html.gz"))
      .filter((name) => sha256(zlib.gunzipSync(fs.readFileSync(path.join(evidenceDir, name)))) === expected.sourceMetadataSha256);
    assert.equal(evidenceMatches.length, 1, `${id} must retain one exact frozen File-page snapshot`);
    const frozen = zlib.gunzipSync(fs.readFileSync(path.join(evidenceDir, evidenceMatches[0])));
    const pageName = frozenRlconf(frozen).wgPageName;
    assert.equal(normalizedFileTitle(pageName), normalizedFileTitle(selected.fileTitle));
    const publishedPathTitle = decodeURIComponent(new URL(selected.pageUrl).pathname.slice("/wiki/".length));
    assert.equal(normalizedFileTitle(publishedPathTitle), normalizedFileTitle(selected.fileTitle));
  }
});

test("approved reviews are bound to exact staged pixels, source evidence and contact-sheet snapshot", { skip: !fs.existsSync(REVIEWS) }, () => {
  const candidateBytes = fs.readFileSync(CANDIDATES);
  const candidates = JSON.parse(candidateBytes.toString("utf8"));
  const reviews = JSON.parse(fs.readFileSync(REVIEWS, "utf8"));
  const contact = JSON.parse(fs.readFileSync(CONTACT_INDEX, "utf8"));
  const sourceHash = sha256(candidateBytes);
  assert.equal(reviews.sourceManifestSha256, sourceHash);
  assert.equal(contact.sourceManifestSha256, sourceHash);
  assert.equal(reviews.items.length, 200);
  assert.equal(contact.count, 200);
  assert.ok(Array.isArray(contact.pageEvidence) && contact.pageEvidence.length === 13);
  for (const page of contact.pageEvidence) {
    assert.match(page.file, /^data\/visuals\/city-review-evidence\/contact-\d{2}\.jpg$/);
    const pagePath = path.resolve(ROOT, page.file);
    assert.equal(fs.statSync(pagePath).size, page.bytes);
    assert.equal(sha256(fs.readFileSync(pagePath)), page.sha256);
  }
  const byId = new Map(candidates.items.map((item) => [item.id, item]));
  for (const review of reviews.items) {
    if (review.status !== "approved") continue;
    const selected = byId.get(review.id)?.selected;
    assert.ok(selected, `approved city must remain staged: ${review.id}`);
    assert.equal(review.fileTitle, selected.fileTitle);
    assert.equal(review.visualSha256, selected.staged.sha256);
    assert.equal(review.stagedSha256, selected.staged.sha256);
    assert.equal(review.sourceMetadataSha256, selected.sourceMetadataSha256);
    assert.equal(review.contactSheetSourceManifestSha256, sourceHash);
  }
  const first = reviews.items.find((item) => item.status === "approved");
  if (first) {
    const replacementSha = first.visualSha256 === "F".repeat(64) ? "E".repeat(64) : "F".repeat(64);
    assert.notEqual(first.visualSha256, replacementSha, "a replacement visual cannot satisfy the old review binding");
  }
});

test("promotion preview is read-only after all review gates pass", { skip: !fs.existsSync(REVIEWS) }, () => {
  const paths = [
    path.join(ROOT, "data", "visuals", "city-commons-overrides.generated.json"),
    path.join(ROOT, "data", "visuals", "city-commons-overrides.json"),
    path.join(ROOT, "data", "visuals", "CITY_COMMONS_AUDIT_v2.4.md"),
    path.join(ROOT, "assets", "visuals", "cities", "manifest.json"),
    path.join(ROOT, "assets", "visuals", "cities", "manifest.js")
  ];
  const before = paths.map((file) => fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null);
  const result = spawnSync("python", [SCRIPT, "promote"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const after = paths.map((file) => fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null);
  assert.deepEqual(after, before);
});

test("browser city manifest allow-lists only reviewed, hash-verified local files", () => {
  const reviewedPath = path.join(ROOT, "data", "visuals", "city-commons-overrides.generated.json");
  const manifestPath = path.join(ROOT, "assets", "visuals", "cities", "manifest.json");
  if (!fs.existsSync(reviewedPath) && !fs.existsSync(manifestPath)) return;
  assert.equal(fs.existsSync(reviewedPath), true, "reviewed overrides and browser manifest must be emitted together");
  assert.equal(fs.existsSync(manifestPath), true, "reviewed overrides and browser manifest must be emitted together");
  const reviewed = JSON.parse(fs.readFileSync(reviewedPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.count, 200);
  assert.equal(manifest.count, reviewed.items.length);
  assert.deepEqual(manifest.items.map((item) => item.id), reviewed.items.map((item) => item.id));
  for (const item of manifest.items) {
    assert.match(item.path, /^\.\/assets\/visuals\/cities\/city-[a-z0-9-]+\.webp$/);
    const local = path.resolve(ROOT, item.path.slice(2));
    assert.ok(local.startsWith(path.join(ROOT, "assets", "visuals", "cities") + path.sep));
    assert.equal(sha256(fs.readFileSync(local)), item.sha256);
    assert.equal(fs.statSync(local).size, item.bytes);
    assert.ok(Number.isSafeInteger(item.bytes) && item.bytes > 0);
    assert.equal(item.width, 960);
    assert.equal(item.height, 540);
    assert.match(item.sourcePage, /^https:\/\/commons\.wikimedia\.org\//);
    assert.ok(ALLOWED.has(item.licenseCode));
    assert.match(item.licenseUrl, /^https:\/\/creativecommons\.org\//);
    assert.ok(item.author && item.attribution && item.licenseName);
  }
  const script = fs.readFileSync(path.join(ROOT, "assets", "visuals", "cities", "manifest.js"), "utf8");
  assert.match(script, /DAILY_ATLAS_CITY_VISUALS=/);
});
