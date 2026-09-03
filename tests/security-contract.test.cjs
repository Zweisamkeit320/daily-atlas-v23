"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("production headers declare the security and cache policy", () => {
  const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
  const sectionFor = (route) => {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = headers.match(new RegExp(`(?:^|\\n)${escaped}\\r?\\n([\\s\\S]*?)(?=\\r?\\n/|$)`));
    assert.ok(match, `missing header rule: ${route}`);
    return match[1];
  };
  for (const required of [
    "Content-Security-Policy:",
    "Referrer-Policy: no-referrer",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Permissions-Policy:",
    "Cross-Origin-Opener-Policy: same-origin",
    "Strict-Transport-Security:",
    "Service-Worker-Allowed: /"
  ]) assert.ok(headers.includes(required), `missing security header: ${required}`);
  assert.match(headers, /\/sw\.js[\s\S]*?max-age=0, must-revalidate/);
  for (const immutableRule of ["/catalog-data/selection.*.js", "/catalog-data/selection-data.*.json", "/catalog-data/search.*.js", "/catalog-data/details/*"]) {
    assert.match(headers, new RegExp(`${immutableRule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?max-age=31536000, immutable`));
  }
  assert.equal(headers.includes("/catalog-data/*\n"), false, "stable manifest pointers must not overlap an immutable wildcard");
  assert.match(headers, /img-src 'self' data: https:\/\/images\.weserv\.nl https:\/\/covers\.openlibrary\.org https:\/\/archive\.org https:\/\/\*\.us\.archive\.org https:\/\/images\.metahub\.space;/,
    "visual CSP must allow only the reviewed image hosts and Open Library's observed Archive redirect backend");
  assert.match(headers, /script-src 'self' https:\/\/cdn\.jsdelivr\.net;/,
    "the fixed-commit CDN script fallback must be allowed by the production CSP");
  assert.doesNotMatch(headers, /img-src[^;\n]*https:\/\/\*(?!\.)/, "visual CSP must not contain a global wildcard host");
  for (const route of [
    "/city-credits.html",
    "/city-credits.js",
    "/assets/visuals/cities/manifest.json",
    "/assets/visuals/cities/manifest.js",
    "/assets/visuals/cities/*.webp",
    "/assets/visuals/cities-mobile/manifest.json",
    "/assets/visuals/cities-mobile/manifest.js",
    "/assets/visuals/cities-mobile/*.webp"
  ]) {
    const section = sectionFor(route);
    assert.match(section, /max-age=0, must-revalidate/, `${route} must revalidate mutable publication metadata or city bytes`);
    assert.doesNotMatch(section, /immutable/, `${route} must not be immutable because city filenames are stable across releases`);
  }
  for (const route of ["/assets/audio/german/*.mp3", "/assets/medical/*.webp"]) {
    assert.match(sectionFor(route), /max-age=31536000, immutable/, `${route} must retain immutable caching`);
  }
});

test("application and diagnostics pages use external scripts under a CSP", () => {
  for (const filename of ["index.html", "diagnostics.html"]) {
    const html = fs.readFileSync(path.join(root, filename), "utf8");
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.doesNotMatch(html, /<script(?:\s[^>]*)?>\s*(?!<\/script>)[\s\S]*?<\/script>/i, `${filename} must not contain inline script bodies`);
    assert.doesNotMatch(html, /\bon[a-z]+\s*=/i, `${filename} must not contain inline event handlers`);
  }
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, /img-src 'self' data: https:\/\/images\.weserv\.nl https:\/\/covers\.openlibrary\.org https:\/\/archive\.org https:\/\/\*\.us\.archive\.org https:\/\/images\.metahub\.space;/,
    "the page-level CSP must allow Open Library's observed Archive redirect backend");
});

test("diagnostics page stays independent from the 2,200-item catalog", () => {
  const html = fs.readFileSync(path.join(root, "diagnostics.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "diagnostics.js"), "utf8");
  for (const forbidden of ["catalog.js", "catalog-loader.js", "app.js", "engine.js", "profile.js", "backup.js"]) {
    assert.equal(html.includes(`src=\"./${forbidden}\"`), false, `diagnostics must not execute ${forbidden}`);
  }
  assert.match(script, /elements\.overall\.dataset\.status = status;/, "a completed degraded result must not retain the running state");
  assert.match(script, /Assets\?\.deploymentMatches\?\.\(location\)/, "the optional CDN probe must stay scoped to the pinned deployment");
});

test("the independent diagnostics page remains available in the light offline shell", () => {
  const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  for (const asset of ["diagnostics.html", "diagnostics.css", "diagnostics.js", "public-config.js", "privacy.html", "sources-and-licenses.html", "LICENSE.txt", "NOTICE.txt", "legal.css"]) {
    assert.ok(worker.includes(`./${asset}`), `${asset} must be cached with the light shell`);
  }
});

test("v2.6 LTS public release, visual controls and standalone disclosures are explicit and packageable", () => {
  const config = fs.readFileSync(path.join(root, "public-config.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const visuals = fs.readFileSync(path.join(root, "visuals.js"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
  const sources = fs.readFileSync(path.join(root, "sources-and-licenses.html"), "utf8");
  assert.match(config, /publicReleaseMode: true/);
  assert.match(config, /publicSafeMode: false/);
  assert.match(config, /remoteBookMovieImages: true/);
  assert.match(config, /localCityImages: true/);
  assert.match(config, /releaseChannel: "lts"/);
  assert.match(config, /featureFreeze: true/);
  assert.match(config, /supportPolicy: "maintenance-only"/);
  assert.match(visuals, /REMOTE_HOSTS = Object\.freeze\(new Set/);
  assert.doesNotMatch(visuals.match(/REMOTE_HOSTS = Object\.freeze\(new Set\([\s\S]*?\)\);/)?.[0] || "", /archive\.org/,
    "Archive is a CSP redirect backend, not a directly constructible catalog candidate host");
  assert.match(visuals, /options\?\.dataSaver !== true/);
  assert.match(visuals, /options\?\.safeMode !== true/);
  assert.doesNotMatch(app, /safeImageUrl\(item\.image\).*封面/, "book/movie image URLs must pass through the visual allow-list module");
  assert.match(index, /id="publicSafeBanner"/);
  assert.match(index, /id="originAlternate"/);
  assert.match(privacy, /默认视觉模式[\s\S]*?images\.weserv\.nl[\s\S]*?请求书封／海报/);
  assert.match(privacy, /不写入应用 Cache，也不进入轻量／完整离线包/);
  assert.match(sources, /公开运行目录、搜索分片和静态部署包不分发 IMDb 数值评分或票数/);
  assert.match(sources, /MetaHub Terms of Use/);
  assert.ok(fs.existsSync(path.join(root, ".nojekyll")), "GitHub Pages static build must disable Jekyll processing");
  for (const filename of ["privacy.html", "sources-and-licenses.html"]) {
    const html = fs.readFileSync(path.join(root, filename), "utf8");
    assert.match(html, /v2\.6\.0/);
    assert.match(html, /http-equiv="Content-Security-Policy"[^>]*content="[^"]*script-src 'self';/,
      `${filename} must declare an explicit script-src for the GitHub Pages security contract`);
    assert.doesNotMatch(html, /<script/i, `${filename} should remain script-free`);
    assert.doesNotMatch(html, /\bon[a-z]+\s*=/i, `${filename} must not contain inline event handlers`);
  }
});
