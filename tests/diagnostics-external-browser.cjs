"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const EXTERNAL_HOSTS = Object.freeze([
  "images.weserv.nl",
  "covers.openlibrary.org",
  "images.metahub.space"
]);
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json") || filePath.endsWith(".webmanifest")) return "application/json";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname === "/" ? "/diagnostics.html" : url.pathname;
    const relative = pathname.replace(/^\/+/, "");
    const resolved = path.resolve(ROOT, relative);
    if (!resolved.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType(resolved),
      "Cache-Control": "no-store"
    });
    fs.createReadStream(resolved).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/diagnostics.html`,
    async close() { await new Promise((resolve) => server.close(resolve)); }
  };
}

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => document.querySelector("#overallStatus")?.dataset.status !== "running");
}

async function assertInvalidConfig(browser, serverUrl, configScript, expectedCode) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const externalRequests = [];
  await context.route("**/public-config.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript; charset=utf-8",
    body: configScript
  }));
  await context.route(/^https:\/\//, (route) => {
    externalRequests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
  await waitForDiagnostics(page);
  assert.equal(await page.locator("#overallStatus").getAttribute("data-status"), "fail");
  const environment = await page.locator("#environmentList").innerText();
  assert.match(environment, new RegExp(expectedCode));
  assert.match(environment, /远程书封／海报\s+未知（按禁用处理）/);
  assert.match(environment, /同源城市图\s+未知（按禁用处理）/);
  assert.deepEqual(externalRequests, []);
  await context.close();
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const externalRequests = [];
    await context.route(/^https:\/\/(images\.weserv\.nl|covers\.openlibrary\.org|images\.metahub\.space)\//, async (route) => {
      externalRequests.push(new URL(route.request().url()).hostname);
      await route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await waitForDiagnostics(page);
    assert.deepEqual(externalRequests, [], "diagnostics must make zero third-party image requests before explicit user action");
    assert.match(await page.locator("#externalImagePrivacy").innerText(), /公网 IP/);
    assert.match(await page.locator("#externalImageProbeList").innerText(), /未运行/);

    await page.locator("#externalImageTestButton").click();
    await page.waitForFunction(() => document.querySelectorAll("#externalImageProbeList .badge").length === 3 && !document.querySelector("#externalImageTestButton").disabled);
    assert.deepEqual([...new Set(externalRequests)].sort(), [...EXTERNAL_HOSTS].sort());
    assert.equal(await page.locator("#externalImageProbeList .badge").count(), 3);
    assert.equal(await page.locator("#externalImageProbeList .badge.fail").count(), 0);
    assert.deepEqual(consoleErrors, []);
    await context.close();

    const configScript = (value) => `globalThis.DAILY_ATLAS_PUBLIC_CONFIG=${JSON.stringify(value)};\n`;
    const validShape = {
      schemaVersion: 2,
      appVersion: "2.4.4",
      publicReleaseMode: true,
      publicSafeMode: false,
      remoteBookMovieImages: true,
      localCityImages: true
    };
    await assertInvalidConfig(browser, server.url, "/* deliberately missing DAILY_ATLAS_PUBLIC_CONFIG */\n", "CONFIG_UNAVAILABLE");
    await assertInvalidConfig(browser, server.url, configScript({ ...validShape, schemaVersion: 1 }), "CONFIG_SCHEMA_INVALID");
    await assertInvalidConfig(browser, server.url, configScript({ ...validShape, appVersion: "2.3.1" }), "CONFIG_VERSION_MISMATCH");
    await assertInvalidConfig(browser, server.url, configScript({ ...validShape, remoteBookMovieImages: "yes" }), "CONFIG_BOOLEAN_INVALID");

    const optionalCdnContext = await browser.newContext({ serviceWorkers: "block" });
    await optionalCdnContext.route("**/asset-routing.js", (route) => route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: "globalThis.DailyAtlasAssets={deploymentMatches:()=>true,CDN_BASE:'https://cdn.jsdelivr.net/gh/example/daily-atlas@immutable/'};"
    }));
    await optionalCdnContext.route("https://cdn.jsdelivr.net/**", (route) => route.abort("connectionfailed"));
    const optionalCdnPage = await optionalCdnContext.newPage();
    await optionalCdnPage.goto(server.url, { waitUntil: "domcontentloaded" });
    await waitForDiagnostics(optionalCdnPage);
    assert.equal(await optionalCdnPage.locator("#overallStatus").getAttribute("data-status"), "pass");
    assert.match(await optionalCdnPage.locator("#overallTitle").innerText(), /核心功能正常/);
    assert.match(await optionalCdnPage.locator("#overallDetail").innerText(), /非必要/);
    const optionalCdnProbe = optionalCdnPage.locator("#probeList .probe-row").filter({ hasText: "固定 CDN 清单" });
    assert.match(await optionalCdnProbe.innerText(), /网络降级/);
    await optionalCdnContext.close();

    const recoveredCityContext = await browser.newContext({ serviceWorkers: "block" });
    let recoveredCityRequests = 0;
    await recoveredCityContext.route("**/assets/visuals/cities/city-chengdu.webp", async (route) => {
      recoveredCityRequests += 1;
      if (recoveredCityRequests === 1) await route.abort("connectionfailed");
      else await route.continue();
    });
    const recoveredCityPage = await recoveredCityContext.newPage();
    await recoveredCityPage.goto(server.url, { waitUntil: "domcontentloaded" });
    await waitForDiagnostics(recoveredCityPage);
    assert.equal(recoveredCityRequests, 2, "one transient city failure is retried once");
    const recoveredCityProbe = recoveredCityPage.locator("#probeList .probe-row").filter({ hasText: "同源城市实图（成都）" });
    assert.match(await recoveredCityProbe.innerText(), /通过/);
    assert.match(await recoveredCityProbe.innerText(), /重试 1 次/);
    assert.notEqual(await recoveredCityPage.locator("#overallStatus").getAttribute("data-status"), "fail");
    await recoveredCityContext.close();

    const degradedCityContext = await browser.newContext({ serviceWorkers: "block" });
    let degradedCityRequests = 0;
    await degradedCityContext.route("**/assets/visuals/cities/city-chengdu.webp", async (route) => {
      degradedCityRequests += 1;
      await route.abort("connectionfailed");
    });
    const degradedCityPage = await degradedCityContext.newPage();
    await degradedCityPage.goto(server.url, { waitUntil: "domcontentloaded" });
    await waitForDiagnostics(degradedCityPage);
    assert.equal(degradedCityRequests, 2, "persistent city network failure is bounded to two attempts");
    assert.equal(await degradedCityPage.locator("#overallStatus").getAttribute("data-status"), "degraded");
    const degradedCityProbe = degradedCityPage.locator("#probeList .probe-row").filter({ hasText: "同源城市实图（成都）" });
    assert.match(await degradedCityProbe.innerText(), /NETWORK/);
    assert.match(await degradedCityProbe.innerText(), /网络降级/);
    await degradedCityContext.close();

    const wrongCityContext = await browser.newContext({ serviceWorkers: "block" });
    const wrongCityExternalRequests = [];
    await wrongCityContext.route("**/assets/visuals/cities/city-chengdu.webp", (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>wrong fallback</title>"
    }));
    await wrongCityContext.route(/^https:\/\//, (route) => {
      wrongCityExternalRequests.push(route.request().url());
      return route.abort();
    });
    const wrongCityPage = await wrongCityContext.newPage();
    await wrongCityPage.goto(server.url, { waitUntil: "domcontentloaded" });
    await waitForDiagnostics(wrongCityPage);
    assert.equal(await wrongCityPage.locator("#overallStatus").getAttribute("data-status"), "fail");
    const cityProbe = wrongCityPage.locator("#probeList .probe-row").filter({ hasText: "同源城市实图（成都）" });
    assert.match(await cityProbe.innerText(), /INVALID_CONTENT_TYPE/);
    assert.deepEqual(wrongCityExternalRequests, []);
    await wrongCityContext.close();

    process.stdout.write("diagnostics privacy, retry/degraded classification and fail-closed config browser checks: PASS\n");
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
