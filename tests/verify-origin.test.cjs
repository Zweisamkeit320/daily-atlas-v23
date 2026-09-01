"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "verify-origin.ps1");
const EXTERNAL_HOSTS = Object.freeze(["images.weserv.nl", "covers.openlibrary.org", "images.metahub.space"]);
const CSP_IMAGE_HOSTS = Object.freeze([...EXTERNAL_HOSTS, "archive.org", "*.us.archive.org"]);
const PUBLIC_CONFIG = `(function () {
  const config = {
    schemaVersion: 2,
    appVersion: "2.4.2",
    publicReleaseMode: true,
    publicSafeMode: false,
    remoteBookMovieImages: true,
    localCityImages: true
  };
  globalThis.DAILY_ATLAS_PUBLIC_CONFIG = config;
})();
`;
const SERVICE_WORKER = "// service worker v2.4 origin verifier fixture\n";
const VISUALS_MODULE = "// visual resolver v2.4 origin verifier fixture\n";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const CITY_ASSETS = Object.freeze(Array.from({ length: 200 }, (_, index) => {
  const id = `city-fixture-${String(index).padStart(3, "0")}`;
  const payload = Buffer.from(`fixture-city-${index}`, "utf8");
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length + 4);
  const bytes = Buffer.concat([Buffer.from("RIFF", "ascii"), size, Buffer.from("WEBP", "ascii"), payload]);
  return Object.freeze({
    id,
    path: `assets/visuals/cities/${id}.webp`,
    bytes,
    sha256: sha256(bytes)
  });
}));
const CITY_ASSET_BY_PATH = new Map(CITY_ASSETS.map((entry) => [entry.path, entry]));
const CITY_MANIFEST_VALUE = Object.freeze({
  schemaVersion: 1,
  count: CITY_ASSETS.length,
  items: CITY_ASSETS.map((entry) => ({
    id: entry.id,
    path: `./${entry.path}`,
    sourcePage: `https://commons.wikimedia.org/wiki/File:${entry.id}.webp`,
    author: "Fixture author",
    licenseName: "Creative Commons Attribution 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: `Fixture author, ${entry.id}, CC BY 4.0`,
    sha256: entry.sha256,
    bytes: entry.bytes.length,
    width: 960,
    height: 540
  }))
});
const CITY_MANIFEST = `(function(root){"use strict";root.DAILY_ATLAS_CITY_VISUALS=${JSON.stringify(CITY_MANIFEST_VALUE)};})(typeof globalThis!=="undefined"?globalThis:this);\n`;
const CITY_MANIFEST_JSON = `${JSON.stringify(CITY_MANIFEST_VALUE)}\n`;
const EMPTY_CITY_MANIFEST = `(function(root){"use strict";root.DAILY_ATLAS_CITY_VISUALS={"schemaVersion":1,"count":0,"items":[]};})(globalThis);\n`;
const EMPTY_CITY_MANIFEST_JSON = '{"schemaVersion":1,"count":0,"items":[]}\n';
const VISUAL_MANIFEST_VALUE = Object.freeze({
  schemaVersion: 1,
  items: CITY_ASSETS.map((entry) => ({
    id: entry.id,
    type: "city",
    status: "approved-open-license-local",
    localFile: entry.path,
    audit: { local: { file: entry.path, sha256: entry.sha256, bytes: entry.bytes.length, width: 960, height: 540 } }
  }))
});
const VISUAL_MANIFEST = `(function(root){root.DAILY_ATLAS_VISUAL_MANIFEST=${JSON.stringify(VISUAL_MANIFEST_VALUE)};})(globalThis);\n`;
const EMPTY_VISUAL_MANIFEST = `(function(root){root.DAILY_ATLAS_VISUAL_MANIFEST={schemaVersion:1,items:[]};})(globalThis);\n`;
const SELECTION_DATA_PATH = "catalog-data/selection-data.0123456789ab.json";
const SELECTION_DATA_VALUE = Object.freeze({
  metadata: Object.freeze({ schemaVersion: 1 }),
  rows: Object.freeze({ city: CITY_ASSETS.map((entry) => [entry.id]) })
});
const CATALOG_MANIFEST_VALUE = Object.freeze({
  schemaVersion: 1,
  appVersion: "2.4.2",
  selectionData: Object.freeze({ path: path.basename(SELECTION_DATA_PATH) })
});
const RUNTIME_CHAIN_FILES = Object.freeze([
  "index.html", "styles.css", "public-config.js", "runtime-health.js", "bootstrap.js", "asset-routing.js",
  "catalog-loader.js", "catalog.js", "engine.js", "state.js", "profile.js", "lock.js", "backup.js",
  "backup-crypto.js", "appearance.js", "explore.js", "weekly.js", "music.js", "speech.js", "city-live.js",
  "reminders.js", "visuals.js", "pwa.js", "app.js", "search-worker.js", "diagnostics.html", "diagnostics.css",
  "diagnostics.js", "privacy.html", "sources-and-licenses.html", "city-credits.html", "city-credits.js", "legal.css", "manifest.webmanifest", "sw.js",
  "assets/favicon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/visuals/manifest.js",
  "assets/visuals/cities/manifest.json",
  "catalog-data/manifest.js", "catalog-data/manifest.json", "assets/medical/manifest.json",
  "assets/audio/german/manifest.json", SELECTION_DATA_PATH
]);
const DEFAULT_MANIFEST = Object.freeze({
  id: "./",
  name: "Daily Atlas fixture",
  short_name: "Atlas",
  start_url: "./",
  scope: "./",
  display: "standalone",
  icons: []
});
const HTML_META_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://images.weserv.nl https://covers.openlibrary.org https://archive.org https://*.us.archive.org https://images.metahub.space; object-src 'none'; base-uri 'self'; form-action 'self'";
const HTML = `<!doctype html><html lang="zh-CN"><head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${HTML_META_CSP}">
  <title>Daily Atlas fixture</title>
</head><body>fixture</body></html>`;
const CITY_CREDITS_HTML = `<!doctype html><html lang="zh-CN"><head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${HTML_META_CSP}">
  <title>今日万象｜城市图署名清单</title>
  <script defer src="./city-credits.js"></script>
</head><body><main><h1>城市图署名与许可清单</h1><div id="cityCreditList"></div></main></body></html>`;
const CITY_CREDITS_JS = "// city credits fixture\n";
const HTML_WITHOUT_META_SECURITY = "<!doctype html><title>missing meta security</title>";
const RESPONSE_CSP = `${HTML_META_CSP}; frame-ancestors 'none'`;
const CLOUDFLARE_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": RESPONSE_CSP,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
});
const GITHUB_SECURITY_HEADERS = Object.freeze({
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
});

// Test-only certificate. The private key is deliberately embedded and has no use outside this loopback fixture.
const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDJ++sEDdEpvBNG
duR8uy4sghUdN1V1znDp87mpE3giNiKAtP8MOWW+uVu3UGz6oZ7X34eDl2R5qxaQ
2JQvR92RVgEGWa2G0BN8BdGYB1R/5FyQQZKUe5b7iGPbIwfvtD3tq+wW8aoQZTVu
r3BJtxtHY1tClw4o9nhiN9dR/yJq8GqBUrpGTL9RLTsvHqGwEL+Fnw7U/7j+KlIc
B1KGfhkA4c1922fIjwqz3IscZyP/OVfWgAnYoX3b5nj+Y6n4j1IcU5fxWhfNSd5f
W4o82PW986aT8KMqxU7mbdKvWv3ebyx/96r9zo2QvZsl8YJ3jD8sn8aznzMKWNFF
949U2NdLAgMBAAECggEAXhN4NHStCafAQI8qv8+8410ZMXju1IZ5P/ZVcKMRTrnx
GwpySoLHWWxjBAAxKhEx9zD1ILzYPvUJdyBw8I6j68fnhUoqkQKEOL1LEGjFmiXG
WSg5efAQdApkHBJ2ZVaJi5QKS+t2Ptms5+dNwP/IdFkaDetmXHzjuDdzEg1nve91
kJwSzSh2i/vbL9kX3YZQhDCojR/uzc3g5TdUnjDiI+l1HBZCDrve/KOVf46a1GGC
522WX9Mxji3G89wGQB28KuP1T+E/HEH66/wdcjc5dNTqlKcQHK/fDCoUmjDo4Luw
vhEk8RXwIQqf8Tcv+rimPR9v/0bv/GSJ7Zf8n/WKtQKBgQDjnCdw32j+ol6ZLr5A
BNqGTi7JgWVuJsE6giWigorW4jij1i0ttaDvHNlFn2JTXcJtXXqWgPgaCL7JPUDB
5xDMOybjT4XOXN5b3prFh4i/RV4lqUrjF4zEI/BRVFe6nlzSTFRGArKcYaWKJwIJ
FKHyZw4b9GZfdvLS0DtMoRyMHQKBgQDjLX/DN4Tyl7LKrfIF9HoAFQOMN47FBWwy
ooWuvqJT9tXwbHrce4nAJ1wnEHxPSF2QkEYEa6v6bh8tWB5DeDxWPwmfT3AQ2Yz+
AG1+QMH10UQepiOzGlqZNbBgdvt4itr5opDjnTEO3EkmVCoMqoUUwTGhOv5YANcs
kJCvgvyEhwKBgQCqbVJbAe3sPEf5CzcJWJkH16LQ30LDp+Ennivv8y9ilyEyDDzn
7QgEAuXta9qD8cCTg1s3NnqPg9zXcjX6+rlpMyF7MyBN1NvqjlP1c/bAwYAtUwXv
5MJSW1amjzDhW5LFJMI1ae+ziKobN/oeMoTQrLmz1NySvs4zbBf62Og3QQKBgQCP
YmRFPoF27DA4pFkhURC/hIPcuCQwTh/gRZvCkye5fw3A1XcmOgLTeQQ807biA3aq
i6TlnV/KjD65S+iuBPFwLhFQr763o9fNaU+yZAUHtbEc9xeJL5UHJk/QUsidaGaV
MPnp74jLLFYvDugLXoToeJduf+GQgddNlWD8pdvjeQKBgHmnclzvzC6dQcQH4VRV
7BxV9O12KFHoKj65MoC+vEE3l0jFaLb99P/H8LGRmNS6pEXzhFNIK/NtoIC9gq3w
Es/YRC/xl4ChGJ+EzTr1LaoOQt8oedstrc5jIXg+zNl9Q1bCMPs6Sid/OU/gwFV0
gKQdqnY+B9z5L78LcIikwmne
-----END PRIVATE KEY-----`;
const TEST_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUb2OlwUruo366CA4rscNOMEcZ2v4wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDgzMDA2MzkwNloXDTM2MDgy
NzA2MzkwNlowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAyfvrBA3RKbwTRnbkfLsuLIIVHTdVdc5w6fO5qRN4IjYi
gLT/DDllvrlbt1Bs+qGe19+Hg5dkeasWkNiUL0fdkVYBBlmthtATfAXRmAdUf+Rc
kEGSlHuW+4hj2yMH77Q97avsFvGqEGU1bq9wSbcbR2NbQpcOKPZ4YjfXUf8iavBq
gVK6Rky/US07Lx6hsBC/hZ8O1P+4/ipSHAdShn4ZAOHNfdtnyI8Ks9yLHGcj/zlX
1oAJ2KF92+Z4/mOp+I9SHFOX8VoXzUneX1uKPNj1vfOmk/CjKsVO5m3Sr1r93m8s
f/eq/c6NkL2bJfGCd4w/LJ/Gs58zCljRRfePVNjXSwIDAQABo28wbTAdBgNVHQ4E
FgQUGj1t+5tFsF5WW9QCHXNeaUA2T0UwHwYDVR0jBBgwFoAUGj1t+5tFsF5WW9QC
HXNeaUA2T0UwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAKBuY9QcnCz7LCBebF3/LgJPBfNpvGEx
yJ5UMnA0YEh1wtfwikW9fsoMWtqipiA3yxwBrZlnyqLBV7hyCiD7sEZIXWsUK1hi
xrb87U5YWuX4bN+zqxGj5djlgE+e9XQuI6yG5nVN9USvStE0rvPw/Wy+k+wm9Y6z
21/mWV09U7VDLX9a18Ov2HXtJG9Hm+Kisheeokx3+71UQBhF4j7gb4p276jnIKaf
QyzxgePwnBHpGn8z4pF/WUjXCpAV2zX6nSbDrqATN0e43oAvXziKWsVGC5J/MVLi
Rh1eKrd+ADqkQpozF92cj6D2q0+2DOtCpXcTW0ax/k4oHDykBKotASU=
-----END CERTIFICATE-----`;

const PWSH_AVAILABLE = process.platform === "win32" &&
  spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "exit 0"], { windowsHide: true }).status === 0;
const WINDOWS_SKIP = PWSH_AVAILABLE ? false : "requires Windows PowerShell Core and curl.exe";

function normalizeBasePath(value) {
  const prefixed = value.startsWith("/") ? value : `/${value}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

function writeResponse(response, status, headers, body = "") {
  response.writeHead(status, headers);
  response.end(body);
}

function runtimeFileBody(relativePath, options = {}) {
  if (["index.html", "diagnostics.html", "privacy.html", "sources-and-licenses.html"].includes(relativePath)) return HTML;
  if (relativePath === "city-credits.html") return CITY_CREDITS_HTML;
  if (relativePath === "city-credits.js") return CITY_CREDITS_JS;
  if (relativePath === "public-config.js") return PUBLIC_CONFIG;
  if (relativePath === "sw.js") return SERVICE_WORKER;
  if (relativePath === "visuals.js") return VISUALS_MODULE;
  if (relativePath === "manifest.webmanifest") return `${JSON.stringify(options.manifest || DEFAULT_MANIFEST)}\n`;
  if (relativePath === "assets/visuals/manifest.js") {
    return options.visualManifestMode === "empty" ? EMPTY_VISUAL_MANIFEST : VISUAL_MANIFEST;
  }
  if (relativePath === "assets/visuals/cities/manifest.js") {
    if (options.visualManifestMode === "absent") return null;
    return options.visualManifestMode === "empty" ? EMPTY_CITY_MANIFEST : CITY_MANIFEST;
  }
  if (relativePath === "assets/visuals/cities/manifest.json") {
    if (options.visualManifestMode === "absent") return null;
    return options.visualManifestMode === "empty" ? EMPTY_CITY_MANIFEST_JSON : CITY_MANIFEST_JSON;
  }
  if (relativePath === "catalog-data/manifest.json") return `${JSON.stringify(CATALOG_MANIFEST_VALUE)}\n`;
  if (relativePath === "catalog-data/manifest.js") return `globalThis.DAILY_ATLAS_SPLIT_MANIFEST=${JSON.stringify(CATALOG_MANIFEST_VALUE)};\n`;
  if (relativePath === SELECTION_DATA_PATH) return `${JSON.stringify(SELECTION_DATA_VALUE)}\n`;
  if (relativePath.endsWith(".json")) return "{}\n";
  if (relativePath.endsWith(".svg")) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n';
  if (relativePath.endsWith(".png")) return Buffer.from(`fixture:${relativePath}`, "utf8");
  if (relativePath.endsWith(".css")) return `/* fixture ${relativePath} */\n`;
  return `// fixture ${relativePath}\n`;
}

function contentTypeFor(relativePath) {
  if (relativePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (relativePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (relativePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (relativePath.endsWith(".webmanifest")) return "application/manifest+json";
  if (relativePath.endsWith(".json")) return "application/json";
  if (relativePath.endsWith(".svg")) return "image/svg+xml";
  if (relativePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function cityManifestScript(value) {
  return `(function(root){"use strict";root.DAILY_ATLAS_CITY_VISUALS=${JSON.stringify(value)};})(typeof globalThis!=="undefined"?globalThis:this);\n`;
}

function visualManifestScript(value) {
  return `(function(root){root.DAILY_ATLAS_VISUAL_MANIFEST=${JSON.stringify(value)};})(globalThis);\n`;
}

function installManifestOverride(app, staticDirectory, cityValue, visualValue = VISUAL_MANIFEST_VALUE) {
  const cityJs = cityManifestScript(cityValue);
  const cityJson = `${JSON.stringify(cityValue)}\n`;
  const visualJs = visualManifestScript(visualValue);
  fs.writeFileSync(path.join(staticDirectory, "assets", "visuals", "cities", "manifest.js"), cityJs);
  fs.writeFileSync(path.join(staticDirectory, "assets", "visuals", "cities", "manifest.json"), cityJson);
  fs.writeFileSync(path.join(staticDirectory, "assets", "visuals", "manifest.js"), visualJs);
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    const relative = url.pathname.slice(app.basePath.length);
    const body = relative === "assets/visuals/cities/manifest.js" ? cityJs
      : relative === "assets/visuals/cities/manifest.json" ? cityJson
        : relative === "assets/visuals/manifest.js" ? visualJs
          : null;
    if (body !== null) {
      writeResponse(response, 200, { "Content-Type": contentTypeFor(relative) }, body);
      return;
    }
    fallback(request, response);
  });
}

async function startServer(options = {}) {
  const basePath = normalizeBasePath(options.basePath || "/");
  const profile = options.profile || "GitHubPages";
  const visualManifestMode = options.visualManifestMode || "city";
  const compressedPaths = new Set(options.compressedPaths || []);
  const transientFailures = new Map(Object.entries(options.transientFailures || {}));
  let manifest = { ...DEFAULT_MANIFEST, ...(options.manifest || {}) };
  const requests = [];
  const acceptedEncodings = [];

  function defaultHandler(request, response) {
    const url = new URL(request.url, "https://fixture.invalid");
    requests.push(url.pathname);
    if (!url.pathname.startsWith(basePath)) {
      writeResponse(response, 404, { "Content-Type": "text/plain" }, "outside fixture base");
      return;
    }

    const relativePath = url.pathname.slice(basePath.length);
    acceptedEncodings.push({ path: relativePath, value: request.headers["accept-encoding"] || "" });
    const failuresRemaining = transientFailures.get(relativePath) || 0;
    if (failuresRemaining > 0) {
      transientFailures.set(relativePath, failuresRemaining - 1);
      request.socket.destroy();
      return;
    }
    const htmlHeaders = profile === "CloudflarePages"
      ? { ...CLOUDFLARE_SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" }
      : { ...GITHUB_SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" };

    if (["diagnostics.html", "privacy.html", "sources-and-licenses.html", "city-credits.html"].includes(relativePath)) {
      writeResponse(response, 307, { Location: `${basePath}${relativePath.slice(0, -5)}` });
      return;
    }
    if (["", "diagnostics", "privacy", "sources-and-licenses", "city-credits"].includes(relativePath)) {
      writeResponse(response, 200, htmlHeaders, relativePath === "city-credits" ? CITY_CREDITS_HTML : HTML);
      return;
    }
    if (CITY_ASSET_BY_PATH.has(relativePath) && visualManifestMode === "city") {
      writeResponse(response, 200, { "Content-Type": "image/webp" }, CITY_ASSET_BY_PATH.get(relativePath).bytes);
      return;
    }
    if (RUNTIME_CHAIN_FILES.includes(relativePath) || relativePath === "assets/visuals/cities/manifest.js") {
      const body = runtimeFileBody(relativePath, { manifest, visualManifestMode });
      if (body !== null) {
        if (compressedPaths.has(relativePath)) {
          const acceptEncoding = request.headers["accept-encoding"] || "";
          if (!/(?:^|,)\s*gzip(?:\s*;|\s*,|\s*$)/i.test(acceptEncoding)) {
            writeResponse(response, 406, { "Content-Type": "text/plain" }, "gzip transfer required by fixture");
            return;
          }
          writeResponse(response, 200, {
            "Content-Type": contentTypeFor(relativePath),
            "Content-Encoding": "gzip",
            "Vary": "Accept-Encoding"
          }, zlib.gzipSync(Buffer.isBuffer(body) ? body : Buffer.from(body)));
          return;
        }
        writeResponse(response, 200, { "Content-Type": contentTypeFor(relativePath) }, body);
        return;
      }
    }
    writeResponse(response, 404, { "Content-Type": "text/plain" }, "not found");
  }

  let handler = defaultHandler;
  const server = https.createServer({ key: TEST_TLS_KEY, cert: TEST_TLS_CERT }, (request, response) => {
    handler(request, response, defaultHandler);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const origin = `https://127.0.0.1:${address.port}`;
  return {
    origin,
    basePath,
    baseUrl: `${origin}${basePath}`,
    requests,
    acceptedEncodings,
    setHandler(next) { handler = next; },
    setManifest(next) { manifest = { ...DEFAULT_MANIFEST, ...next }; },
    defaultHandler,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

function createStaticFixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-atlas-origin-verifier-"));
  const visualManifestMode = options.visualManifestMode || "city";
  for (const relativePath of RUNTIME_CHAIN_FILES) {
    const target = path.join(directory, ...relativePath.split("/"));
    const body = runtimeFileBody(relativePath, { manifest: options.manifest || DEFAULT_MANIFEST, visualManifestMode });
    if (body === null) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
  if (visualManifestMode !== "absent") {
    const cityManifestPath = path.join(directory, "assets", "visuals", "cities", "manifest.js");
    fs.mkdirSync(path.dirname(cityManifestPath), { recursive: true });
    fs.writeFileSync(cityManifestPath, runtimeFileBody("assets/visuals/cities/manifest.js", { visualManifestMode }), "utf8");
  }
  if (visualManifestMode === "city") {
    for (const cityAsset of CITY_ASSETS) {
      const target = path.join(directory, ...cityAsset.path.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, cityAsset.bytes);
    }
  }

  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runVerifier({ baseUrl, staticDirectory, hostingProfile, legacyOrigin = false }) {
  return new Promise((resolve, reject) => {
    const urlParameter = legacyOrigin ? "-Origin" : "-BaseUrl";
    const child = spawn("pwsh", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", SCRIPT,
      urlParameter, baseUrl,
      "-HostingProfile", hostingProfile,
      "-StaticDirectory", staticDirectory,
      "-AllowInsecureLoopback"
    ], { cwd: ROOT, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`origin verifier timed out: ${baseUrl}`));
    }, 180000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function combinedOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

test("diagnostics external-image checks are explicit opt-in under an exact host CSP", () => {
  const html = fs.readFileSync(path.join(ROOT, "diagnostics.html"), "utf8");
  const script = fs.readFileSync(path.join(ROOT, "diagnostics.js"), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || "";
  const imageDirective = csp.match(/(?:^|;)\s*img-src\s+([^;]+)/)?.[1] || "";
  const declaredExternalHosts = [...imageDirective.matchAll(/https:\/\/[^\s;]+/g)].map((match) => match[0].slice("https://".length)).sort();
  assert.deepEqual(declaredExternalHosts, [...CSP_IMAGE_HOSTS].sort());
  assert.match(html, /id="externalImageTestButton"/);
  assert.match(html, /公网 IP/);
  assert.doesNotMatch(html, /<(?:img|source)\b[^>]+(?:src|srcset)="https:\/\//i);
  assert.match(script, /externalImageTest\.addEventListener\("click"/);
  assert.match(script, /image\.referrerPolicy = "no-referrer"/);
});

test("GitHub Pages profile accepts a HTTPS repository subpath and probes a curated city asset", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({
    basePath: "/daily-atlas-v23/",
    profile: "GitHubPages",
    visualManifestMode: "city",
    compressedPaths: ["catalog.js"],
    transientFailures: { "assets/visuals/cities/city-fixture-000.webp": 1 }
  });
  t.after(() => app.close());
  const staticDirectory = createStaticFixture(t, { visualManifestMode: "city" });
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory,
    hostingProfile: "GitHubPages"
  });
  assert.equal(result.code, 0, combinedOutput(result));
  assert.match(result.stdout, /GitHub Pages does not enforce a repository _headers file/);
  assert.match(result.stdout, /assets\/visuals\/cities\/manifest\.js/);
  assert.match(result.stdout, /exact 200-city 960x540 WebP hash\/byte closure verified/);
  assert.match(result.stdout, /PASS: GitHubPages BaseUrl=https:\/\/127\.0\.0\.1:\d+\/daily-atlas-v23\//);
  assert.ok(app.requests.length > 10, "expected the verifier to request core and hash-comparison resources");
  assert.ok(app.requests.every((requestPath) => requestPath.startsWith(app.basePath)), app.requests.join("\n"));
  assert.ok(app.acceptedEncodings.some((entry) => entry.path === "catalog.js" && /\bgzip\b/i.test(entry.value)),
    "the verifier must negotiate a compressed transfer while hashing the original decompressed catalog bytes");
  assert.ok(app.requests.filter((requestPath) => requestPath === `${app.basePath}assets/visuals/cities/city-fixture-000.webp`).length >= 2,
    "a bounded curl retry must recover one transient connection failure without weakening the city hash check");
});

test("Cloudflare Pages root profile applies the same 200-city closure rule with legacy -Origin", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/", profile: "CloudflarePages" });
  t.after(() => app.close());
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t),
    hostingProfile: "CloudflarePages",
    legacyOrigin: true
  });
  assert.equal(result.code, 0, combinedOutput(result));
  assert.match(result.stdout, /exact 200-city 960x540 WebP hash\/byte closure verified/);
  assert.match(result.stdout, /PASS: CloudflarePages BaseUrl=https:\/\/127\.0\.0\.1:\d+\//);
});

for (const redirectCase of [
  { name: "account root", location: "/" },
  { name: "sibling project", location: "/another-project/" },
  { name: "external authority", location: "https://example.invalid/daily-atlas-v23/" }
]) {
  test(`subpath verifier rejects a redirect to ${redirectCase.name} before following it`, { skip: WINDOWS_SKIP }, async (t) => {
    const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
    t.after(() => app.close());
    app.setHandler((request, response, fallback) => {
      const url = new URL(request.url, app.origin);
      if (url.pathname === app.basePath) {
        writeResponse(response, 302, { Location: redirectCase.location });
        return;
      }
      fallback(request, response);
    });
    const result = await runVerifier({
      baseUrl: app.baseUrl,
      staticDirectory: createStaticFixture(t),
      hostingProfile: "GitHubPages"
    });
    assert.notEqual(result.code, 0);
    assert.match(combinedOutput(result), redirectCase.name === "external authority" ? /Cross-authority URL rejected/ : /URL escapes BaseUrl path/);
    assert.deepEqual(app.requests, [], "the custom redirect handler should reject before the default handler logs any escaped request");
  });
}

test("verifier rejects a non-HTTPS BaseUrl before sending a request", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ profile: "CloudflarePages" });
  t.after(() => app.close());
  const result = await runVerifier({
    baseUrl: app.baseUrl.replace("https:", "http:"),
    staticDirectory: createStaticFixture(t),
    hostingProfile: "CloudflarePages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /BaseUrl must use HTTPS/);
  assert.equal(app.requests.length, 0);
});

test("verifier rejects public config without schemaVersion 2", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    if (url.pathname === `${app.basePath}public-config.js`) {
      writeResponse(response, 200, { "Content-Type": "text/javascript; charset=utf-8" }, PUBLIC_CONFIG.replace("schemaVersion: 2,", ""));
      return;
    }
    fallback(request, response);
  });
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t),
    hostingProfile: "GitHubPages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /missing v2\.4 release contract: schemaVersion: 2/);
});

for (const manifestCase of [
  { field: "id", value: "https://example.invalid/app/", expected: /Cross-authority URL rejected: manifest\.id/ },
  { field: "start_url", value: "/", expected: /URL escapes BaseUrl path: manifest\.start_url/ },
  { field: "scope", value: "../", expected: /URL escapes BaseUrl path: manifest\.scope/ }
]) {
  test(`manifest ${manifestCase.field} cannot escape the repository base path`, { skip: WINDOWS_SKIP }, async (t) => {
    const manifest = { ...DEFAULT_MANIFEST, [manifestCase.field]: manifestCase.value };
    const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages", manifest });
    t.after(() => app.close());
    const result = await runVerifier({
      baseUrl: app.baseUrl,
      staticDirectory: createStaticFixture(t, { manifest }),
      hostingProfile: "GitHubPages"
    });
    assert.notEqual(result.code, 0);
    assert.match(combinedOutput(result), manifestCase.expected);
  });
}

test("manifest start_url must also remain inside its declared scope", { skip: WINDOWS_SKIP }, async (t) => {
  const manifest = { ...DEFAULT_MANIFEST, start_url: "./", scope: "./narrow/" };
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages", manifest });
  t.after(() => app.close());
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t, { manifest }),
    hostingProfile: "GitHubPages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /manifest\.start_url escapes manifest\.scope/);
});

test("Cloudflare profile rejects HTML that has meta security but lacks complete response headers", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/", profile: "CloudflarePages" });
  t.after(() => app.close());
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    if (url.pathname === "/") {
      writeResponse(response, 200, {
        ...GITHUB_SECURITY_HEADERS,
        "Content-Type": "text/html; charset=utf-8"
      }, HTML);
      return;
    }
    fallback(request, response);
  });
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t),
    hostingProfile: "CloudflarePages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /Missing required response header.*Content-Security-Policy/);
});

test("GitHub profile rejects diagnostics without page-level CSP/referrer metadata", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    if (url.pathname === `${app.basePath}diagnostics`) {
      writeResponse(response, 200, {
        ...GITHUB_SECURITY_HEADERS,
        "Content-Type": "text/html; charset=utf-8"
      }, HTML_WITHOUT_META_SECURITY);
      return;
    }
    fallback(request, response);
  });
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t),
    hostingProfile: "GitHubPages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /Missing or invalid referrer meta \(diagnostics\)/);
});

for (const profile of ["GitHubPages", "CloudflarePages"]) {
  test(`${profile} rejects an SPA fallback returned for city-credits.html`, { skip: WINDOWS_SKIP }, async (t) => {
    const basePath = profile === "GitHubPages" ? "/daily-atlas-v23/" : "/";
    const app = await startServer({ basePath, profile });
    t.after(() => app.close());
    app.setHandler((request, response, fallback) => {
      const url = new URL(request.url, app.origin);
      if (url.pathname === `${app.basePath}city-credits`) {
        const headers = profile === "CloudflarePages"
          ? { ...CLOUDFLARE_SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" }
          : { ...GITHUB_SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" };
        writeResponse(response, 200, headers, HTML);
        return;
      }
      fallback(request, response);
    });
    const result = await runVerifier({
      baseUrl: app.baseUrl,
      staticDirectory: createStaticFixture(t),
      hostingProfile: profile
    });
    assert.notEqual(result.code, 0);
    assert.match(combinedOutput(result), /city-credits\.html resolved to an unrelated HTML document or SPA fallback/);
  });
}

test("GitHub profile rejects city credits without page-level CSP/referrer metadata", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    if (url.pathname === `${app.basePath}city-credits`) {
      writeResponse(response, 200, { ...GITHUB_SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" }, '<!doctype html><div id="cityCreditList"></div><script src="./city-credits.js"></script>');
      return;
    }
    fallback(request, response);
  });
  const result = await runVerifier({ baseUrl: app.baseUrl, staticDirectory: createStaticFixture(t), hostingProfile: "GitHubPages" });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /Missing or invalid referrer meta \(city-credits\)/);
});

test("Cloudflare profile rejects city credits without complete response security headers", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/", profile: "CloudflarePages" });
  t.after(() => app.close());
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    if (url.pathname === "/city-credits") {
      writeResponse(response, 200, { ...GITHUB_SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" }, CITY_CREDITS_HTML);
      return;
    }
    fallback(request, response);
  });
  const result = await runVerifier({ baseUrl: app.baseUrl, staticDirectory: createStaticFixture(t), hostingProfile: "CloudflarePages" });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /Missing required response header \(city-credits\.html\): Content-Security-Policy/);
});

test("the city runtime manifest must contain the exact 200-item contract", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({
    basePath: "/daily-atlas-v23/",
    profile: "GitHubPages",
    visualManifestMode: "empty"
  });
  t.after(() => app.close());
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t, { visualManifestMode: "empty" }),
    hostingProfile: "GitHubPages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /City manifest contract requires schemaVersion=1, count=200 and exactly 200 items/);
});

test("the verifier rejects an extra unmanifested city WebP before origin acceptance", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  const staticDirectory = createStaticFixture(t);
  fs.writeFileSync(path.join(staticDirectory, "assets", "visuals", "cities", "city-extra.webp"), CITY_ASSETS[0].bytes);
  const result = await runVerifier({ baseUrl: app.baseUrl, staticDirectory, hostingProfile: "GitHubPages" });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /must contain exactly 200 WebP files; found 201/);
});

test("the verifier rejects a non-positive city byte declaration", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  const staticDirectory = createStaticFixture(t);
  const cityValue = JSON.parse(JSON.stringify(CITY_MANIFEST_VALUE));
  const visualValue = JSON.parse(JSON.stringify(VISUAL_MANIFEST_VALUE));
  cityValue.items[0].bytes = 0;
  visualValue.items[0].audit.local.bytes = 0;
  installManifestOverride(app, staticDirectory, cityValue, visualValue);
  const result = await runVerifier({ baseUrl: app.baseUrl, staticDirectory, hostingProfile: "GitHubPages" });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /City manifest bytes must be a positive safe integer: city-fixture-000/);
});

test("the verifier rejects a declared city byte length that differs from the local file", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  const staticDirectory = createStaticFixture(t);
  const cityValue = JSON.parse(JSON.stringify(CITY_MANIFEST_VALUE));
  const visualValue = JSON.parse(JSON.stringify(VISUAL_MANIFEST_VALUE));
  cityValue.items[0].bytes += 1;
  visualValue.items[0].audit.local.bytes += 1;
  installManifestOverride(app, staticDirectory, cityValue, visualValue);
  const result = await runVerifier({ baseUrl: app.baseUrl, staticDirectory, hostingProfile: "GitHubPages" });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /City manifest local byte length mismatch: .*city-fixture-000\.webp/);
});

test("the verifier rejects combined visual audit bytes that differ from the city manifest", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  const staticDirectory = createStaticFixture(t);
  const cityValue = JSON.parse(JSON.stringify(CITY_MANIFEST_VALUE));
  const visualValue = JSON.parse(JSON.stringify(VISUAL_MANIFEST_VALUE));
  visualValue.items[0].audit.local.bytes += 1;
  installManifestOverride(app, staticDirectory, cityValue, visualValue);
  const result = await runVerifier({ baseUrl: app.baseUrl, staticDirectory, hostingProfile: "GitHubPages" });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /Combined visual manifest audit does not match the city runtime manifest: city-fixture-000/);
});

test("the verifier rejects a remote city download whose actual byte length differs", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    if (url.pathname === `${app.basePath}${CITY_ASSETS[0].path}`) {
      writeResponse(response, 200, { "Content-Type": "image/webp" }, Buffer.concat([CITY_ASSETS[0].bytes, Buffer.from([0])]));
      return;
    }
    fallback(request, response);
  });
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t),
    hostingProfile: "GitHubPages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /city-fixture-000\.webp remote byte length mismatch/);
});

test("the verifier rejects a remote city image whose bytes differ from the signed manifest", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    if (url.pathname === `${app.basePath}${CITY_ASSETS[0].path}`) {
      const altered = Buffer.from(CITY_ASSETS[0].bytes);
      altered[altered.length - 1] ^= 0xff;
      writeResponse(response, 200, { "Content-Type": "image/webp" }, altered);
      return;
    }
    fallback(request, response);
  });
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t),
    hostingProfile: "GitHubPages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /city-fixture-000\.webp SHA-256 mismatch/);
});

test("the verifier rejects a changed runtime application module", { skip: WINDOWS_SKIP }, async (t) => {
  const app = await startServer({ basePath: "/daily-atlas-v23/", profile: "GitHubPages" });
  t.after(() => app.close());
  app.setHandler((request, response, fallback) => {
    const url = new URL(request.url, app.origin);
    if (url.pathname === `${app.basePath}app.js`) {
      writeResponse(response, 200, { "Content-Type": "text/javascript; charset=utf-8" }, "// changed remote app\n");
      return;
    }
    fallback(request, response);
  });
  const result = await runVerifier({
    baseUrl: app.baseUrl,
    staticDirectory: createStaticFixture(t),
    hostingProfile: "GitHubPages"
  });
  assert.notEqual(result.code, 0);
  assert.match(combinedOutput(result), /app\.js SHA-256 mismatch/);
});
