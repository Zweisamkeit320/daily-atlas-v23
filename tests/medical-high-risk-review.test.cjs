"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const Review = require("../scripts/review-medical-high-risk.cjs");

test("all 500 medical entries pass the deterministic safety screen and high-risk counts remain explicit", () => {
  const report = Review.buildReport();
  assert.equal(report.counts.catalog, 500);
  assert.equal(report.counts.assessed, 500);
  assert.equal(report.counts.caution, 273);
  assert.equal(report.counts.urgent, 74);
  assert.equal(report.counts.reviewed, 347);
  assert.equal(report.counts.automatedPass, 500);
  assert.equal(report.counts.automatedFlagged, 0);
  assert.equal(report.counts.urgentReviewed, 74);
  assert.equal(report.result, "AUTOMATED_SAFETY_SCREEN_PASS");
  assert.equal(report.professionalBoundary, "GENERAL_EDUCATION_ONLY_NO_CLINICIAN_SIGNOFF_CLAIMED");
});

test("a dangerous self-dosing phrase in a general item cannot escape the full-pool screen", () => {
  delete require.cache[require.resolve("../catalog.js")];
  require("../catalog.js");
  const medical = globalThis.DAILY_ATLAS_CATALOG.medical.map((item) => ({ ...item }));
  const generalIndex = medical.findIndex((item) => item.riskLevel === "general");
  assert.ok(generalIndex >= 0);
  medical[generalIndex].action = "可以自行停药。";
  const report = Review.buildReport(medical);
  assert.equal(report.result, "AUTOMATED_SAFETY_SCREEN_FLAGGED");
  assert.ok(report.structuralFlags.some((entry) => entry.id === medical[generalIndex].id && entry.issue === "wording:unsafe-self-dosing"));
});

test("published automated screen remains honest about the professional boundary", () => {
  const jsonPath = path.join(root, "data", "medical-high-risk-screen.v2.5.0.json");
  const markdownPath = path.join(root, "data", "MEDICAL_HIGH_RISK_SCREEN_v2.5.0.md");
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const markdown = fs.readFileSync(markdownPath, "utf8");
  assert.equal(report.result, "AUTOMATED_SAFETY_SCREEN_PASS");
  assert.equal(report.counts.assessed, 500);
  assert.equal(report.counts.automatedPass, 500);
  assert.equal(report.professionalBoundary, "GENERAL_EDUCATION_ONLY_NO_CLINICIAN_SIGNOFF_CLAIMED");
  const sourceHash = require("node:crypto").createHash("sha256")
    .update(fs.readFileSync(path.join(root, report.medicalSource))).digest("hex").toUpperCase();
  assert.equal(report.medicalSourceSha256, sourceHash);
  assert.match(markdown, /不是医生签名/);
  assert.match(markdown, /urgent 条目覆盖/);
});

test("the medical screen flags an unapproved source, unsafe self-dosing and missing escalation", () => {
  const assessed = Review.assessItem({
    id: "medical-test-unsafe",
    title: "测试条目",
    summary: "你一定患有这种疾病。",
    action: "可以自行停药。",
    limitsOrRedFlags: "继续观察。",
    riskLevel: "urgent",
    sourceName: "非官方来源",
    sourceUrl: "http://example.com/advice",
    sourceAccessedAt: "2099-01-01"
  });
  assert.equal(assessed.automatedStatus, "flagged");
  for (const issue of [
    "source:not-https",
    "source:unapproved-host:example.com",
    "source:invalid-access-date",
    "wording:diagnosis-overreach",
    "wording:unsafe-self-dosing",
    "urgent:missing-escalation-language"
  ]) assert.ok(assessed.issues.includes(issue), `missing expected issue ${issue}`);
});
