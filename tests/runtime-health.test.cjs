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
