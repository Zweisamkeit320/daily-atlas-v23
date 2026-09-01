"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
delete require.cache[require.resolve(path.join(root, "catalog.js"))];
require(path.join(root, "catalog.js"));
const medical = globalThis.DAILY_ATLAS_CATALOG.medical;
const byId = new Map(medical.map((item) => [item.id, item]));

const PRIORITY = Object.freeze({
  "medical-choking-adult": ["/first-aid-advice/choking/", /只移除口中明显可见/],
  "medical-major-bleeding": ["/first-aid-advice/severe-bleeding/", /持续压迫/],
  "medical-chemical-label": ["hazard_communication_standard-safety_data_sheets", /不要混合清洁剂/],
  "medical-v3-sepsis-recognition": ["/sepsis/about/index.html", /不要等待高热/],
  "medical-v3-cardiac-arrest-aed": ["/cardiac-arrest/", /不要因尝试摸脉搏而长时间延误按压/],
  "medical-v3-adult-choking": ["/first-aid-advice/choking/", /能有效咳嗽.*无法说话.*失去反应/],
  "medical-v3-major-burn": ["/first-aid-advice/severe-burn/", /至少 20 分钟.*避免全身过度降温/],
  "medical-v3-heat-stroke": ["/first-aid-advice/heatstroke/", /凉湿床单.*风扇.*冷水擦拭/],
  "medical-v3-severe-hypoglycemia": ["/diabetes/treatment/treatment-low-blood-sugar-hypoglycemia.html", /不要口服.*受过训练/],
  "medical-v3-opioid-overdose": ["/stop-overdose/caring/naloxone.html", /纳洛酮.*支持呼吸/],
  "medical-v3-suicide-immediate": ["/health/publications/suicide-faq", /不让其独处.*当地急救或危机服务/],
  "medical-v3-tooth-avulsion": ["/conditions/knocked-out-tooth/", /只拿牙冠.*乳牙不要复位/],
  "medical-v3-delirium-acute": ["/symptoms/confusion/", /突然混乱本身需要立即医疗评估/]
});

const CAUTION_CRISIS = Object.freeze([
  "medical-v3-head-injury-observe", "medical-burnout", "medical-v3-social-connection-quality",
  "medical-v3-mania-warning", "medical-v3-gambling-chasing", "medical-v3-caregiver-strain",
  "medical-v3-burn-cool-water", "medical-v3-insect-bite", "medical-v3-antibiotic-resistance-action",
  "medical-v3-barrier-methods", "medical-v3-climate-distress", "medical-v3-postpartum-mental"
]);

const SOURCE_REVIEW = Object.freeze([
  "medical-v3-probiotic-strain", "medical-v3-b12-plant-diet", "medical-v3-reflux-pattern",
  "medical-v3-skin-self-check", "medical-v3-pain-monitoring", "medical-v3-egfr-trend",
  "medical-v3-kidney-stone-fluid", "medical-v3-foodborne-clusters", "medical-v3-prenatal-continuity",
  "medical-v3-sti-window", "medical-v3-polypharmacy-goals"
]);

function item(id) {
  const found = byId.get(id);
  assert.ok(found, `missing medical item ${id}`);
  return found;
}

test("v2.4 priority medical fixes keep their reviewed source and safety action", () => {
  for (const [id, [sourcePath, wording]] of Object.entries(PRIORITY)) {
    const found = item(id);
    assert.ok(found.sourceUrl.includes(sourcePath), `${id} source drifted: ${found.sourceUrl}`);
    assert.match(`${found.action} ${found.limitsOrRedFlags}`, wording, `${id} lost reviewed wording`);
    assert.equal(found.sourceAccessedAt, "2026-08-30", `${id} access date drifted`);
  }
});

test("reviewed caution entries give an explicit emergency, crisis or safety branch", () => {
  const branch = /急救|危机|人身安全|立即|马上|性暴力支持|毒物咨询|紧急/;
  for (const id of CAUTION_CRISIS) {
    const found = item(id);
    assert.match(`${found.action} ${found.limitsOrRedFlags}`, branch, `${id} has no explicit escalation branch`);
    assert.equal(found.sourceAccessedAt, "2026-08-30", `${id} access date drifted`);
  }
});

test("source-specificity repairs remain narrow, dated and free of generator joins", () => {
  for (const id of SOURCE_REVIEW) {
    const found = item(id);
    assert.equal(found.sourceAccessedAt, "2026-08-30", `${id} access date drifted`);
    assert.doesNotMatch(`${found.title} ${found.summary} ${found.action} ${found.limitsOrRedFlags}`, /若出现若出现|若出现不要因|可以若/);
  }
  assert.equal(item("medical-v3-pain-monitoring").title, "开始活动时轻微酸痛可见，但持续、加重或影响功能的疼痛需要调整和评估");
  assert.equal(item("medical-v3-sti-window").title, "检测项目和采样部位取决于性史、暴露部位与症状");
  assert.equal(item("medical-v3-polypharmacy-goals").title, "同时使用多种药物会增加相互作用和管理难度，需要定期核对");
});

test("all medical catalog text is free of known malformed emergency joins", () => {
  for (const found of medical) {
    assert.doesNotMatch(`${found.title} ${found.summary} ${found.action} ${found.limitsOrRedFlags}`, /若出现若出现|若出现不要因|可以若/, found.id);
  }
});
