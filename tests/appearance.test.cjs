"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const Appearance = require("../appearance.js");

function browserAppearance(initial) {
  const values = new Map(initial ? [[Appearance.STORAGE_KEY, JSON.stringify(initial)]] : []);
  const listeners = {};
  const events = [];
  const meta = { content: "", setAttribute(name, value) { if (name === "content") this.content = value; } };
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    JSON,
    Object,
    Array,
    Set,
    Promise,
    Error,
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value))
    },
    document: {
      documentElement: { dataset: {} },
      querySelector: (selector) => selector === 'meta[name="theme-color"]' ? meta : null
    },
    DailyAtlasLock: { transaction: (task) => Promise.resolve().then(task) },
    addEventListener: (type, listener) => { listeners[type] = listener; },
    dispatchEvent: (event) => events.push(event),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "..", "appearance.js"), "utf8"), context, { filename: "appearance.js" });
  return { api: context.module.exports, context, values, listeners, events, meta };
}

test("appearance normalization accepts only the documented display fields", () => {
  const input = JSON.parse('{"schemaVersion":99,"color":"sky","style":"aurora","density":"compact","dataSaver":true,"textSize":"large","contrast":"high","motion":"reduce","secret":"DROP","__proto__":{"polluted":true}}');
  assert.deepEqual(Appearance.normalize(input), {
    schemaVersion: 1,
    color: "sky",
    style: "aurora",
    density: "compact",
    dataSaver: true,
    textSize: "large",
    contrast: "high",
    motion: "reduce"
  });
  assert.deepEqual(Appearance.normalize({
    color: "unknown", style: "unknown", density: "tiny", dataSaver: "true",
    textSize: "huge", contrast: "maximum", motion: "none"
  }), Appearance.DEFAULTS);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Appearance.PALETTES.length, 6);
  assert.equal(Appearance.STYLES.length, 4);
  assert.equal(Appearance.DENSITIES.length, 2);
  assert.equal(Appearance.TEXT_SIZES.length, 2);
  assert.equal(Appearance.CONTRASTS.length, 2);
  assert.equal(Appearance.MOTIONS.length, 2);
});

test("appearance applies, persists and synchronizes display settings without reloading", async () => {
  const harness = browserAppearance({
    schemaVersion: 1, color: "sage", style: "botanical", density: "compact", dataSaver: true,
    textSize: "large", contrast: "high", motion: "reduce", token: "DROP"
  });
  const initial = harness.api.initialize();
  assert.equal(initial.color, "sage");
  assert.equal(initial.style, "botanical");
  assert.deepEqual({ ...harness.context.document.documentElement.dataset }, {
    backgroundColor: "sage",
    backgroundStyle: "botanical",
    density: "compact",
    dataSaver: "true",
    textSize: "large",
    contrast: "high",
    motion: "reduce"
  });
  assert.equal(harness.meta.content, "#e8f0e8");

  harness.api.configure({
    color: "lavender", style: "clean", density: "comfortable", dataSaver: false,
    textSize: "default", contrast: "default", motion: "system"
  });
  assert.equal(await harness.api.whenSaved(), true);
  assert.deepEqual(JSON.parse(harness.values.get(Appearance.STORAGE_KEY)), {
    schemaVersion: 1,
    color: "lavender",
    style: "clean",
    density: "comfortable",
    dataSaver: false,
    textSize: "default",
    contrast: "default",
    motion: "system"
  });

  harness.values.set(Appearance.STORAGE_KEY, JSON.stringify({
    schemaVersion: 1, color: "sand", style: "aurora", density: "compact", dataSaver: true,
    textSize: "large", contrast: "high", motion: "reduce", secret: "DROP"
  }));
  harness.listeners.storage({
    key: Appearance.STORAGE_KEY,
    newValue: JSON.stringify({ schemaVersion: 1, color: "sage", style: "clean", secret: "STALE" })
  });
  assert.equal(harness.api.getState().color, "sand");
  assert.equal(harness.api.getState().style, "aurora");
  assert.equal(harness.api.getState().dataSaver, true);
  assert.equal(harness.context.document.documentElement.dataset.backgroundColor, "sand");
  assert.equal(harness.context.document.documentElement.dataset.density, "compact");
  assert.equal(harness.context.document.documentElement.dataset.dataSaver, "true");
  assert.ok(harness.events.some((event) => event.type === "dailyatlasappearancestate"));
});

test("appearance keeps the selected session background and reports a failed durable write", async () => {
  const harness = browserAppearance();
  harness.api.initialize();
  harness.context.localStorage.setItem = () => { throw new Error("quota"); };
  harness.api.configure({ color: "peach", style: "clean" });
  assert.equal(await harness.api.whenSaved(), false);
  assert.equal(harness.api.getState().persistenceStatus, "error");
  assert.equal(harness.context.document.documentElement.dataset.backgroundColor, "peach");
  assert.equal(harness.context.document.documentElement.dataset.backgroundStyle, "clean");
  assert.equal(harness.context.document.documentElement.dataset.dataSaver, "false");
});

test("appearance merges a one-field edit with the canonical stored background", async () => {
  const harness = browserAppearance({ schemaVersion: 1, color: "sage", style: "editorial" });
  harness.api.initialize();

  // Another tab commits a color immediately before this tab enters the shared
  // persistence transaction. This tab is changing only the style.
  harness.values.set(Appearance.STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    color: "lavender",
    style: "editorial"
  }));
  harness.api.configure({ style: "botanical" });
  assert.equal(await harness.api.whenSaved(), true);

  assert.deepEqual(JSON.parse(harness.values.get(Appearance.STORAGE_KEY)), {
    schemaVersion: 1,
    color: "lavender",
    style: "botanical",
    density: "comfortable",
    dataSaver: false,
    textSize: "default",
    contrast: "default",
    motion: "system"
  });
  assert.equal(harness.api.getState().color, "lavender");
  assert.equal(harness.api.getState().style, "botanical");
});

test("appearance storage events converge by rereading canonical storage instead of stale event data", () => {
  const harness = browserAppearance({ schemaVersion: 1, color: "paper", style: "editorial" });
  harness.api.initialize();
  harness.values.set(Appearance.STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    color: "sand",
    style: "aurora"
  }));

  harness.listeners.storage({
    key: Appearance.STORAGE_KEY,
    newValue: JSON.stringify({ schemaVersion: 1, color: "sage", style: "clean" })
  });

  assert.equal(harness.api.getState().color, "sand");
  assert.equal(harness.api.getState().style, "aurora");
  assert.equal(harness.context.document.documentElement.dataset.backgroundColor, "sand");
  assert.equal(harness.context.document.documentElement.dataset.backgroundStyle, "aurora");
  assert.equal(harness.context.document.documentElement.dataset.density, "comfortable");
  assert.equal(harness.context.document.documentElement.dataset.motion, "system");
});

test("appearance merges a data-saver edit with peer background and accessibility settings", async () => {
  const harness = browserAppearance({
    schemaVersion: 1,
    color: "paper",
    style: "editorial",
    density: "comfortable",
    dataSaver: false,
    textSize: "default",
    contrast: "default",
    motion: "system"
  });
  harness.api.initialize();
  harness.values.set(Appearance.STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    color: "sand",
    style: "botanical",
    density: "compact",
    dataSaver: false,
    textSize: "large",
    contrast: "high",
    motion: "reduce"
  }));
  harness.api.configure({ dataSaver: true });
  assert.equal(await harness.api.whenSaved(), true);
  assert.deepEqual(JSON.parse(harness.values.get(Appearance.STORAGE_KEY)), {
    schemaVersion: 1,
    color: "sand",
    style: "botanical",
    density: "compact",
    dataSaver: true,
    textSize: "large",
    contrast: "high",
    motion: "reduce"
  });
});
