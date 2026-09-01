"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

global.DAILY_ATLAS_PUBLIC_CONFIG = {
  remoteBookMovieImages: true,
  localCityImages: true
};
global.DAILY_ATLAS_CITY_VISUALS = {
  items: [{
    id: "city-chengdu",
    path: "assets/visuals/cities/city-chengdu.webp",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Chengdu.jpg",
    author: "Example",
    licenseCode: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    licenseName: "CC BY 4.0"
  }, {
    id: "city-berlin",
    path: "assets/visuals/cities/city-berlin.webp",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Berlin.jpg",
    author: "Example",
    attribution: "Example, Berlin.jpg, CC-BY-SA-3.0-DE, via Wikimedia Commons; cropped to 16:9 and resized.",
    licenseCode: "CC-BY-SA-3.0-DE",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/",
    licenseName: "Attribution-ShareAlike 3.0 Germany"
  }]
};
const Visuals = require("../visuals.js");

function createClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); }
  };
}

function createImage(candidates, visual) {
  const attributes = new Map([
    ["data-visual-candidates", JSON.stringify(candidates)],
    ["data-visual-index", "0"]
  ]);
  const listeners = new Map();
  const writes = [];
  return {
    complete: false,
    hidden: false,
    isConnected: true,
    naturalWidth: 0,
    writes,
    closest() { return visual; },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      for (const listener of [...(listeners.get(type) || [])]) listener({ type, target: this });
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    get src() { return attributes.get("src") || ""; },
    set src(value) {
      writes.push(String(value));
      attributes.set("src", String(value));
    }
  };
}

function createVisual() {
  const credit = { hidden: true };
  return {
    classList: createClassList(),
    credit,
    querySelector(selector) { return selector === "[data-visual-credit]" ? credit : null; }
  };
}

test("book and movie routing uses an exact remote allow-list with a fallback", () => {
  const book = Visuals.resolve({ id: "/works/OL1W", title: "书", image: "https://covers.openlibrary.org/b/id/1-L.jpg" }, "book", {});
  assert.equal(book.candidates.length, 3);
  assert.match(book.candidates[0], /^https:\/\/images\.weserv\.nl\//);
  assert.equal(book.candidates[1], "https://covers.openlibrary.org/b/id/1-M.jpg?default=false");
  assert.equal(book.candidates[2], "https://covers.openlibrary.org/b/id/1-L.jpg?default=false");

  const rejected = Visuals.resolve({ id: "bad", title: "坏", image: "https://example.invalid/tracker.png" }, "movie", {});
  assert.deepEqual(rejected.candidates, []);
});

test("data saver and safe mode never emit remote media or city image requests", () => {
  const item = { id: "tt1", title: "片", image: "https://images.metahub.space/poster/medium/tt1/img" };
  assert.deepEqual(Visuals.resolve(item, "movie", { dataSaver: true }).candidates, []);
  assert.deepEqual(Visuals.resolve(item, "movie", { safeMode: true }).candidates, []);
  assert.deepEqual(Visuals.resolve({ id: "city-chengdu", cityZh: "成都" }, "city", { dataSaver: true }).candidates, []);
});

test("city routing is same-origin and rejects unsafe IDs", () => {
  const city = Visuals.resolve({ id: "city-chengdu", cityZh: "成都" }, "city", {});
  assert.deepEqual(city.candidates, ["./assets/visuals/cities/city-chengdu.webp"]);
  assert.deepEqual(Visuals.resolve({ id: "../bad", cityZh: "坏" }, "city", {}).candidates, []);
  assert.deepEqual(Visuals.resolve({ id: "city-unreviewed", cityZh: "待核" }, "city", {}).candidates, []);
});

test("a reviewed city can paint from its stable ID before the large attribution manifest loads", () => {
  const manifest = global.DAILY_ATLAS_CITY_VISUALS;
  delete global.DAILY_ATLAS_CITY_VISUALS;
  try {
    const city = Visuals.resolve({ id: "city-chengdu", cityZh: "成都" }, "city", {});
    assert.deepEqual(city.candidates, ["./assets/visuals/cities/city-chengdu.webp"]);
    assert.equal(city.provider, "Wikimedia Commons");
    assert.equal(city.sourcePage, "./city-credits.html#city-chengdu");
    assert.deepEqual(Visuals.resolve({ id: "../bad", cityZh: "坏" }, "city", {}).candidates, []);
  } finally {
    global.DAILY_ATLAS_CITY_VISUALS = manifest;
  }
});

test("jurisdiction-specific city licences keep their official display name", () => {
  const city = Visuals.resolve({ id: "city-berlin", cityZh: "柏林" }, "city", {});
  assert.equal(city.licenseCode, "CC-BY-SA-3.0-DE");
  assert.equal(city.licenseName, "Attribution-ShareAlike 3.0 Germany");
  assert.match(city.provider, /Attribution-ShareAlike 3\.0 Germany$/);
});

test("weserv proxy never accepts an arbitrary source host", () => {
  assert.equal(Visuals.IMAGE_ROUTE_TIMEOUT_MS, 3000);
  assert.equal(Visuals.IMAGE_TOTAL_TIMEOUT_MS, 9000);
  assert.equal(Visuals.weservUrl("https://evil.example/a.jpg", 480), null);
  assert.equal(Visuals.normalizedRemoteUrl("javascript:alert(1)"), null);
});

test("unbind detaches a card without canceling its current request or starting later candidates", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => { timer.cleared = true; };

  try {
    const visual = createVisual();
    const candidates = [
      "https://images.weserv.nl/?url=https%3A%2F%2Fcovers.openlibrary.org%2Fb%2Fid%2F1-M.jpg",
      "https://covers.openlibrary.org/b/id/1-M.jpg?default=false",
      "https://covers.openlibrary.org/b/id/1-L.jpg?default=false"
    ];
    const image = createImage(candidates, visual);
    image.setAttribute("src", candidates[0]);
    const container = { querySelectorAll: () => [image] };

    Visuals.bind(container);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 3000);

    Visuals.unbind(container);
    image.isConnected = false;
    timers[0].callback(); // 模拟已进入任务队列、clearTimeout 来不及阻止的旧回调。
    image.dispatch("error");
    image.dispatch("load");

    assert.deepEqual(image.writes, []);
    assert.equal(image.getAttribute("src"), candidates[0]);
    assert.equal(image.getAttribute("data-visual-index"), "0");
    assert.equal(image.getAttribute("data-daily-atlas-visual-bound"), null);
    assert.equal(visual.classList.contains("visual-image-loaded"), false);
    assert.equal(visual.classList.contains("visual-image-failed"), false);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("an old generation cannot mutate a newer image binding", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => { timer.cleared = true; };

  try {
    const oldVisual = createVisual();
    const oldImage = createImage([
      "https://images.metahub.space/poster/medium/tt0000001/img",
      "https://images.metahub.space/poster/small/tt0000001/img"
    ], oldVisual);
    const oldContainer = { querySelectorAll: () => [oldImage] };
    Visuals.bind(oldContainer);
    const staleTimer = timers[0];

    Visuals.unbind(oldContainer);
    oldImage.isConnected = false;

    const newVisual = createVisual();
    const newImage = createImage([
      "https://images.metahub.space/poster/medium/tt0000002/img",
      "https://images.metahub.space/poster/small/tt0000002/img"
    ], newVisual);
    Visuals.bind({ querySelectorAll: () => [newImage] });

    staleTimer.callback();
    oldImage.dispatch("load");
    assert.deepEqual(oldImage.writes, []);
    assert.deepEqual(newImage.writes, []);
    assert.equal(newVisual.classList.contains("visual-image-loaded"), false);

    newImage.dispatch("load");
    assert.equal(newVisual.classList.contains("visual-image-loaded"), true);
    assert.equal(newImage.hidden, false);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("remote fallback is bounded to three routes and nine seconds", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => { timer.cleared = true; };

  try {
    const visual = createVisual();
    const candidates = [1, 2, 3, 4].map((id) => `https://images.metahub.space/poster/medium/tt000000${id}/img`);
    const image = createImage(candidates, visual);
    const container = { querySelectorAll: () => [image] };

    Visuals.bind(container);
    Visuals.bind(container);
    assert.equal(timers.length, 1, "重复 bind 不应创建第二套计时器");

    timers[0].callback();
    timers[1].callback();
    timers[2].callback();

    assert.equal(timers.length, 3);
    assert.deepEqual(timers.map((timer) => timer.delay), [3000, 3000, 3000]);
    assert.deepEqual(image.writes, candidates.slice(1, 3));
    assert.equal(image.hidden, true);
    assert.equal(visual.classList.contains("visual-image-failed"), true);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
