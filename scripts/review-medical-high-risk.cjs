#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const REVIEW_VERSION = "2.5.0";
const REVIEW_DATE = "2026-09-02";
const JSON_PATH = path.join(ROOT, "data", `medical-high-risk-screen.v${REVIEW_VERSION}.json`);
const MARKDOWN_PATH = path.join(ROOT, "data", `MEDICAL_HIGH_RISK_SCREEN_v${REVIEW_VERSION}.md`);
const MEDICAL_SOURCE_PATH = path.join(ROOT, "data", "raw", "medical500.json");

const ALLOWED_HOSTS = new Set([
  "medlineplus.gov", "ods.od.nih.gov", "stacks.cdc.gov", "www.ahrq.gov", "www.airnow.gov",
  "www.cancer.gov", "www.cdc.gov", "www.england.nhs.uk", "www.epa.gov", "www.fda.gov",
  "www.fsis.usda.gov", "www.hhs.gov", "www.hse.gov.uk", "www.nei.nih.gov", "www.nhlbi.nih.gov",
  "www.nccih.nih.gov", "www.nhs.uk", "www.nia.nih.gov", "www.niaaa.nih.gov", "www.niams.nih.gov", "www.nidcr.nih.gov",
  "www.niddk.nih.gov", "www.nimh.nih.gov", "www.osha.gov", "www.ready.gov", "www.samhsa.gov",
  "www.sja.org.uk", "www.uspreventiveservicestaskforce.org", "www.who.int", "wwwnc.cdc.gov"
]);

const ESCALATION_PATTERN = /急救|紧急|立即|马上|立刻|呼叫|毒物|危机热线|急诊|当地医疗|专业评估|就医/;
const DIAGNOSIS_OVERREACH = /你(?:已经|就是|一定|肯定)?(?:患有|得了)|即可诊断|(?:可以|可|建议|应当|应该|直接)自行确诊|无需就医|保证治愈|包治/;
const UNSAFE_SELF_DOSING = /(?:可以|可|建议|应当|应该|不妨|直接)自行(?:加量|减量|停药|换药)|随意(?:加量|减量|停药|换药)/;
const REQUIRED_FIELDS = Object.freeze([
  "id", "title", "summary", "action", "limitsOrRedFlags", "riskLevel", "sourceName", "sourceUrl", "sourceAccessedAt"
]);

function loadMedicalCatalog() {
  delete require.cache[require.resolve(path.join(ROOT, "catalog.js"))];
  require(path.join(ROOT, "catalog.js"));
  const medical = globalThis.DAILY_ATLAS_CATALOG?.medical;
  if (!Array.isArray(medical)) throw new Error("catalog.js has no medical collection");
  return medical;
}

function assessItem(item) {
  const issues = [];
  for (const field of REQUIRED_FIELDS) {
    if (typeof item[field] !== "string" || item[field].trim() === "") issues.push(`missing:${field}`);
  }
  if (!["general", "caution", "urgent"].includes(item.riskLevel)) issues.push("risk:invalid-level");

  let sourceHost = "";
  try {
    const source = new URL(item.sourceUrl);
    sourceHost = source.hostname.toLowerCase();
    if (source.protocol !== "https:") issues.push("source:not-https");
    if (!ALLOWED_HOSTS.has(sourceHost)) issues.push(`source:unapproved-host:${sourceHost}`);
  } catch (_error) {
    issues.push("source:invalid-url");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.sourceAccessedAt || "") || item.sourceAccessedAt > REVIEW_DATE) {
    issues.push("source:invalid-access-date");
  }
  const combined = `${item.title || ""} ${item.summary || ""} ${item.action || ""} ${item.limitsOrRedFlags || ""}`;
  if (DIAGNOSIS_OVERREACH.test(combined)) issues.push("wording:diagnosis-overreach");
  if (UNSAFE_SELF_DOSING.test(combined)) issues.push("wording:unsafe-self-dosing");
  if (item.riskLevel === "urgent" && !ESCALATION_PATTERN.test(`${item.action || ""} ${item.limitsOrRedFlags || ""}`)) {
    issues.push("urgent:missing-escalation-language");
  }

  return {
    id: item.id,
    title: item.title,
    riskLevel: item.riskLevel,
    topicGroup: item.topicGroup,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourceAccessedAt: item.sourceAccessedAt,
    sourceHost,
    automatedStatus: issues.length ? "flagged" : "pass",
    issues
  };
}

function buildReport(medical = loadMedicalCatalog()) {
  const assessed = medical.map(assessItem);
  const reviewed = assessed.filter((item) => item.riskLevel === "urgent" || item.riskLevel === "caution");
  const ids = new Set();
  const duplicateIds = [];
  for (const item of assessed) {
    if (ids.has(item.id)) duplicateIds.push(item.id);
    ids.add(item.id);
  }
  const contentKeys = new Map();
  const duplicateContent = [];
  for (const item of medical) {
    const key = `${item.summary}\n${item.action}\n${item.limitsOrRedFlags}`;
    if (contentKeys.has(key)) duplicateContent.push([contentKeys.get(key), item.id]);
    else contentKeys.set(key, item.id);
  }
  const structuralFlags = assessed.flatMap((item) => item.issues.map((issue) => ({ id: item.id, issue })));
  for (const id of duplicateIds) structuralFlags.push({ id, issue: "duplicate:id" });
  for (const pair of duplicateContent) structuralFlags.push({ id: pair[1], issue: `duplicate:content:${pair[0]}` });

  return {
    schemaVersion: 1,
    appVersion: REVIEW_VERSION,
    reviewDate: REVIEW_DATE,
    medicalSource: "data/raw/medical500.json",
    medicalSourceSha256: crypto.createHash("sha256").update(fs.readFileSync(MEDICAL_SOURCE_PATH)).digest("hex").toUpperCase(),
    scope: "automated structural, source and dangerous-wording screen for all 500 medical entries, with high-risk counts for caution/urgent and escalation enforcement for urgent entries",
    result: structuralFlags.length === 0 ? "AUTOMATED_SAFETY_SCREEN_PASS" : "AUTOMATED_SAFETY_SCREEN_FLAGGED",
    professionalBoundary: "GENERAL_EDUCATION_ONLY_NO_CLINICIAN_SIGNOFF_CLAIMED",
    boundaries: [
      "All entries are checked for structure, approved source hosts, access dates and dangerous wording; urgent entries also require emergency escalation language.",
      "It does not claim clinician review, diagnosis, treatment validation or real-time source freshness.",
      "The separate v2.4.0 independent high-risk review records semantic and live-source checks; neither artifact is presented as a clinician signature."
    ],
    counts: {
      catalog: medical.length,
      assessed: assessed.length,
      reviewed: reviewed.length,
      caution: reviewed.filter((item) => item.riskLevel === "caution").length,
      urgent: reviewed.filter((item) => item.riskLevel === "urgent").length,
      automatedPass: assessed.filter((item) => item.automatedStatus === "pass").length,
      automatedFlagged: assessed.filter((item) => item.automatedStatus === "flagged").length,
      uniqueSourceHosts: new Set(assessed.map((item) => item.sourceHost)).size,
      urgentReviewed: reviewed.filter((item) => item.riskLevel === "urgent").length
    },
    structuralFlags,
    urgentItems: reviewed.filter((item) => item.riskLevel === "urgent"),
    reviewed,
    assessed
  };
}

function markdown(report) {
  const urgentRows = report.urgentItems.map((item) =>
    `| ${item.id} | ${item.title.replace(/\|/g, "\\|")} | ${item.sourceName.replace(/\|/g, "\\|")} | ${item.automatedStatus} | 已纳入独立高风险复核 |`
  ).join("\n");
  return `# 今日万象 v${REVIEW_VERSION} 医学内容自动安全筛查\n\n` +
    `筛查日期：${REVIEW_DATE}  \n` +
    `医学源文件 SHA-256：\`${report.medicalSourceSha256}\`  \n` +
    `自动化结论：\`${report.result}\`  \n` +
    `边界：\`${report.professionalBoundary}\`\n\n` +
    `## 复核范围与结果\n\n` +
    `本轮对全部 ${report.counts.assessed} 条医学内容执行必填结构、来源域名、访问日期、诊断越界和危险自行用药表达扫描；其中 ${report.counts.reviewed} 条 caution／urgent 纳入高风险统计，caution ${report.counts.caution} 条、urgent ${report.counts.urgent} 条，且 urgent 必须包含升级就医语言。全库自动通过 ${report.counts.automatedPass} 条，标记 ${report.counts.automatedFlagged} 条。\n\n` +
    `本报告是自动结构筛查，不是医生签名，也不证明来源页面此刻仍未更新。当前哈希的语义抽查与历史问题闭环另见独立的 v2.5.0 高风险审查报告；应用继续限定为一般科普，不提供诊断或个体化治疗。\n\n` +
    `## 自动化异常\n\n${report.structuralFlags.length ? report.structuralFlags.map((entry) => `- ${entry.id}: ${entry.issue}`).join("\n") : "- 无。"}\n\n` +
    `## urgent 条目覆盖\n\n| ID | 标题 | 来源 | 自动扫描 | 独立复核状态 |\n|---|---|---|---|---|\n${urgentRows}\n`;
}

function writeReports(report = buildReport()) {
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(MARKDOWN_PATH, markdown(report), "utf8");
  return report;
}

if (require.main === module) {
  const report = writeReports();
  console.log(JSON.stringify({
    result: report.result,
    professionalBoundary: report.professionalBoundary,
    counts: report.counts,
    json: path.relative(ROOT, JSON_PATH),
    markdown: path.relative(ROOT, MARKDOWN_PATH)
  }, null, 2));
  if (report.structuralFlags.length) process.exitCode = 1;
}

module.exports = Object.freeze({
  ALLOWED_HOSTS,
  REVIEW_DATE,
  REVIEW_VERSION,
  assessItem,
  buildReport,
  writeReports
});
