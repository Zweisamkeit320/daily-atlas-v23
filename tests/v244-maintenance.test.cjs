"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("v2.4.4 maintenance record keeps production and evidence boundaries explicit", () => {
  const maintenance = read("docs/MAINTENANCE_v2.4.4.md");
  assert.match(maintenance, /LOCAL_CANDIDATE/);
  assert.match(maintenance, /zweisamkeit320\.github\.io\/daily-atlas-v23/);
  assert.match(maintenance, /daily-atlas-mobile-cn\.pages\.dev/);
  assert.match(maintenance, /v2\.4\.3 → v2\.4\.4 同源 A→B/);
  assert.match(maintenance, /PASS — 用户真机确认/);
  assert.match(maintenance, /Android Chrome[\s\S]*BLOCKED/);
  assert.match(maintenance, /iPhone Safari[\s\S]*BLOCKED/);
  assert.match(maintenance, /3–7 天稳定观察[\s\S]*PENDING/);
  assert.match(maintenance, /封包前维护状态/);
  assert.match(maintenance, /包外证据侧车/);
});

test("v2.4.4 release documents the three visual source classes and no inferred media licence", () => {
  const sources = read("sources-and-licenses.html");
  const release = read("docs/RELEASE_v2.4.4.md");
  for (const label of ["同源开放许可图片", "第三方渐进图片", "本地编辑视觉"]) {
    assert.match(sources, new RegExp(label));
  }
  assert.match(sources, /同源缩略图准入规则/);
  assert.match(sources, /不会擅自复制第三方图片/);
  assert.match(release, /不改变 2,200 项候选池/);
  assert.match(release, /不改变[\s\S]*用户画像 schema/);
  assert.match(release, /封包前状态/);
  assert.match(release, /包外发布证据侧车/);
});

test("historical expansion audits cannot be mistaken for current asset truth", () => {
  const v2 = read("data/V2_EXTRAS_AUDIT.md");
  const v3 = read("data/V3_EXTRAS_AUDIT.md");
  assert.match(v2, /V3_EXTRAS_AUDIT\.md` 也是后续历史快照/);
  assert.match(v2, /assets\/medical\/manifest\.json/);
  assert.match(v3, /历史快照/);
  assert.match(v3, /下文“当前”仅指该批次当时的构建/);
  assert.match(v3, /现行医学图数量与哈希须读取 `assets\/medical\/manifest\.json`/);
  assert.match(v3, /历史文件摘要（2026-08-25）/);
});
