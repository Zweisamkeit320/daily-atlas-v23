"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Health = require("../runtime-health.js");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("runtime error ring stores only normalized stage/code metadata", () => {
  const storage = memoryStorage();
  Health.record("catalog", "TIMEOUT", { storage, now: "2026-08-28T00:00:00.000Z" });
  Health.record("bad stage with spaces", "secret=value", { storage, now: "2026-08-28T00:00:01.000Z" });
  assert.deepEqual(Health.readErrors(storage).map((entry) => ({ stage: entry.stage, code: entry.code })), [
    { stage: "catalog", code: "TIMEOUT" },
    { stage: "unknown", code: "UNKNOWN" }
  ]);
  assert.equal(storage.getItem(Health.ERROR_KEY).includes("secret=value"), false);
});

test("runtime error ring is bounded to twenty entries", () => {
  const storage = memoryStorage();
  for (let index = 0; index < 25; index += 1) Health.record("app", `E${index}`, { storage });
  const entries = Health.readErrors(storage);
  assert.equal(entries.length, 20);
  assert.equal(entries[0].code, "E5");
  assert.equal(entries[19].code, "E24");
});

test("startup stage timings are allowlisted, bounded, and session scoped", () => {
  const storage = memoryStorage();
  assert.equal(Health.recordStageTiming("catalog", 321.4, { storage, now: "2026-09-01T00:00:00.000Z" }), true);
  assert.equal(Health.recordStageTiming("secret-stage", 999, { storage }), false);
  assert.equal(Health.recordStageTiming("modules", 456, { storage, now: "2026-09-01T00:00:01.000Z" }), true);
  const finished = Health.finishStageTimings({ storage, now: "2026-09-01T00:00:02.000Z" });
  assert.equal(finished.totalMs, 777);
  assert.deepEqual(finished.stages, { catalog: 321, modules: 456 });
  assert.equal(storage.getItem(Health.STAGE_TIMING_KEY).includes("secret"), false);
});

test("startup timings remain memory-only when persistent browser storage is unavailable", () => {
  const previousPersistence = global.DAILY_ATLAS_PERSISTENCE_AVAILABLE;
  const previousSessionStorage = global.sessionStorage;
  let writes = 0;
  global.DAILY_ATLAS_PERSISTENCE_AVAILABLE = false;
  global.sessionStorage = {
    getItem() { throw new Error("session storage must not be read during startup"); },
    setItem() { writes += 1; throw new Error("session storage must not be written in memory-only mode"); }
  };
  try {
    assert.equal(Health.recordStageTiming("shell", 10, { now: "2026-09-01T00:00:00.000Z" }), true);
    assert.equal(Health.recordStageTiming("app", 20, { now: "2026-09-01T00:00:01.000Z" }), true);
    const finished = Health.finishStageTimings({ now: "2026-09-01T00:00:02.000Z" });
    assert.equal(finished.totalMs, 30);
    assert.equal(writes, 0);
  } finally {
    if (previousPersistence === undefined) delete global.DAILY_ATLAS_PERSISTENCE_AVAILABLE;
    else global.DAILY_ATLAS_PERSISTENCE_AVAILABLE = previousPersistence;
    if (previousSessionStorage === undefined) delete global.sessionStorage;
    else global.sessionStorage = previousSessionStorage;
  }
});

test("withTimeout rejects a hung operation with a stable code", async () => {
  await assert.rejects(
    Health.withTimeout(new Promise(() => {}), 100, { label: "hung-test" }),
    (error) => error?.name === "TimeoutError" && error?.code === "TIMEOUT"
  );
});

test("diagnostic probes time out even when AbortController is unavailable", async () => {
  const started = Date.now();
  const result = await Health.probe("https://unreachable.invalid", {
    fetchImpl() { return new Promise(() => {}); },
    AbortController: null,
    timeoutMs: 100
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "TIMEOUT");
  assert.ok(Date.now() - started < 1000, "probe must settle instead of hanging");
});

test("diagnostic probe uses one end-to-end deadline and aborts a hung response body", async () => {
  let aborted = 0;
  class FakeAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; aborted += 1; }
  }
  const started = Date.now();
  const result = await Health.probe("https://example.test/city.webp", {
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 70));
      return ({
      ok: true,
      status: 200,
      headers: { get(name) { return name === "content-type" ? "image/webp" : null; } },
      arrayBuffer() { return new Promise(() => {}); }
      });
    },
    AbortController: FakeAbortController,
    timeoutMs: 100,
    readBody: true,
    expectedContentType: "image/webp",
    expectedFormat: "webp"
  });
  assert.equal(result.code, "TIMEOUT");
  assert.equal(aborted, 1);
  assert.ok(Date.now() - started < 150, "headers and body must share one deadline");
});

test("diagnostic retry recovers one transient failure but does not retry invalid content", async () => {
  let calls = 0;
  const recovered = await Health.probeWithRetry("https://example.test/app.js", {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary network failure");
      return { ok: true, status: 200, headers: { get() { return "4"; } } };
    },
    maxAttempts: 2,
    retryDelayMs: 0
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.attemptCount, 2);
  assert.deepEqual(recovered.attempts.map((entry) => entry.code), ["NETWORK", "OK"]);

  calls = 0;
  const invalid = await Health.probeWithRetry("https://example.test/city.webp", {
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get(name) { return name === "content-type" ? "text/html" : null; } },
        async arrayBuffer() { return new TextEncoder().encode("<html></html>").buffer; }
      };
    },
    maxAttempts: 2,
    retryDelayMs: 0,
    readBody: true,
    expectedContentType: "image/webp",
    expectedFormat: "webp"
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "INVALID_CONTENT_TYPE");
  assert.equal(invalid.attemptCount, 1);
  assert.equal(calls, 1, "content corruption is not a transient network retry");
});

test("probe severity distinguishes transient degradation from critical corruption", () => {
  assert.equal(Health.probeSeverity({ ok: true, code: "OK" }, true), "pass");
  assert.equal(Health.probeSeverity({ ok: false, code: "NETWORK" }, true), "degraded");
  assert.equal(Health.probeSeverity({ ok: false, code: "TIMEOUT" }, true), "degraded");
  assert.equal(Health.probeSeverity({ ok: false, code: "HTTP_ERROR" }, true), "fail");
  assert.equal(Health.probeSeverity({ ok: false, code: "INVALID_CONTENT" }, true), "fail");
  assert.equal(Health.probeSeverity({ ok: false, code: "INVALID_CONTENT" }, false), "degraded");
});

test("runtime errors map to finite detail and module codes without leaking arbitrary paths", () => {
  assert.equal(Health.detailErrorCode(Object.assign(new Error("request failed"), { code: "TIMEOUT" })), "DETAIL_TIMEOUT");
  assert.equal(Health.detailErrorCode(Object.assign(new Error("request failed"), { code: "NETWORK" })), "DETAIL_NETWORK");
  assert.equal(Health.detailErrorCode(Object.assign(new Error("request failed"), { status: 503 })), "DETAIL_HTTP_ERROR");
  assert.equal(Health.detailErrorCode(new Error("detail identity mismatch")), "DETAIL_IDENTITY_INVALID");
  assert.equal(Health.detailErrorCode(new Error("script failed")), "DETAIL_SCRIPT_LOAD_FAILED");
  assert.equal(Health.detailErrorCode(new Error("secret query=private")), "DETAIL_LOAD_FAILED");
  assert.equal(Health.moduleErrorCode("./music.js", "timeout"), "MODULE_MUSIC_TIMEOUT");
  assert.equal(Health.moduleErrorCode("./catalog-loader.js", "load_failed"), "MODULE_CATALOG_LOADER_LOAD_FAILED");
  assert.equal(Health.moduleErrorCode("https://evil.test/secret.js?token=x", "timeout"), "MODULE_UNKNOWN_TIMEOUT");
});

test("bounded mapper never exceeds its shared concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  const results = await Health.mapWithConcurrency(Array.from({ length: 17 }, (_, index) => index), 4, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 4));
    active -= 1;
    return value * 2;
  });
  assert.equal(peak, 4);
  assert.deepEqual(results, Array.from({ length: 17 }, (_, index) => index * 2));
});

test("cache inspection and repair touch only daily-atlas cache names", async () => {
  const deleted = [];
  const cacheStorage = {
    async keys() { return ["daily-atlas-shell-a", "another-app", "daily-atlas-audio-b"]; },
    async open(name) { return { async keys() { return name.includes("shell") ? [1, 2] : [1]; } }; },
    async delete(name) { deleted.push(name); return true; }
  };
  const before = await Health.inspectCaches({ caches: cacheStorage });
  assert.equal(before.caches.length, 2);
  assert.equal(before.totalEntries, 3);
  const result = await Health.repairCaches({ caches: cacheStorage });
  assert.equal(result.ok, true);
  assert.deepEqual(deleted, ["daily-atlas-audio-b", "daily-atlas-shell-a"]);
});

test("storage snapshot reports quota headroom without inventing values", async () => {
  const result = await Health.storageSnapshot({
    storageManager: {
      async estimate() { return { usage: 1024, quota: 4096 }; },
      async persisted() { return false; }
    }
  });
  assert.deepEqual({ supported: result.supported, usage: result.usage, quota: result.quota, available: result.available, persisted: result.persisted }, {
    supported: true,
    usage: 1024,
    quota: 4096,
    available: 3072,
    persisted: false
  });
});
