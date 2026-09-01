const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const Music = require("../music.js");
const Speech = require("../speech.js");
const CityLive = require("../city-live.js");
const Reminders = require("../reminders.js");
const Pwa = require("../pwa.js");
const ServiceWorkerBuild = require("../scripts/build-service-worker.cjs");

function loadBrowserModule(file, additions) {
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    Date,
    Intl,
    URL,
    Blob,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Promise,
    Set,
    Map,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...additions
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
  return { api: context.module.exports, context };
}

function fakeEventTarget(fields) {
  const listeners = new Map();
  return Object.assign({}, fields || {}, {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
    emit(type, event) {
      for (const callback of [...(listeners.get(type) || [])]) callback(event || { type });
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    }
  });
}

function fakeClock() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(callback) {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    runNext() {
      const entry = timers.entries().next().value;
      assert.ok(entry, "a pending timer is available");
      timers.delete(entry[0]);
      entry[1]();
    },
    size() {
      return timers.size;
    }
  };
}

test("music library contains one hundred distinct procedural presets with explicit recording provenance", () => {
  assert.equal(Music.TRACKS.length, 100);
  assert.equal(Music.tracks, Music.TRACKS);
  assert.equal(new Set(Music.TRACKS.map((track) => track.id)).size, 100);
  assert.equal(new Set(Music.TRACKS.map((track) => track.title)).size, 100);
  const signatures = Music.TRACKS.map((track) => JSON.stringify([
    track.bpm, track.rootMidi, track.scale, track.melody, track.bass, track.harmony
  ]));
  assert.equal(new Set(signatures).size, 100, "no two track recipes are identical");
  assert.ok(Music.TRACKS.every((track) => track.bpm >= 60 && track.bpm <= 90));
  assert.ok(Music.TRACKS.every((track) => track.melody.length >= 8 && track.bass.length === 4));
  assert.ok(Music.TRACKS.every((track) => track.performanceType === "in-browser-procedural-synthesis"));
  assert.ok(Music.TRACKS.every((track) => track.recordingSource === "none"));
  assert.ok(Object.isFrozen(Music.TRACKS) && Music.TRACKS.every(Object.isFrozen));
  const originals = Music.TRACKS.filter((track) => track.sourceKind === "original-procedural");
  const publicDomain = Music.TRACKS.filter((track) => track.sourceKind === "public-domain-arrangement");
  assert.equal(originals.length, 80);
  assert.equal(publicDomain.length, 20);
  assert.ok(publicDomain.every((track) => track.compositionPublicDomain === true));
  assert.ok(publicDomain.every((track) => track.menuLabel.includes("公版·本项目合成")));
  assert.ok(publicDomain.every((track) => /本项目.*合成/.test(track.disclosure)));
  assert.ok(publicDomain.every((track) => /不含.*第三方录音/.test(track.disclosure)));
  assert.ok(publicDomain.some((track) => track.id === "pd-beethoven-fur-elise" && track.composer === "贝多芬"));
  assert.ok(publicDomain.some((track) => track.id === "pd-debussy-clair-de-lune" && track.composer === "德彪西"));
  assert.ok(Math.abs(Music.degreeFrequency(69, "major", 0) - 440) < 1e-9);

  const initial = Music.getState().trackId;
  const selected = Music.TRACKS.find((track) => track.id !== initial);
  assert.equal(Music.selectTrack(selected.id), true);
  assert.equal(Music.getState().trackId, selected.id);
  assert.equal(Music.setTrack("missing-track"), false);
  assert.notEqual(Music.next().id, selected.id);
  assert.equal(typeof Music.previous, "function");
  assert.equal(Music.duck("test"), 1);
  assert.equal(Music.getState().ducked, true);
  assert.equal(Music.restore("test"), 0);
  assert.equal(Music.getState().ducked, false);
});

test("music selection persists across reloads, wraps in both directions and never restores playback", async () => {
  const storageMap = new Map([
    ["dailyAtlas.audio.v2", JSON.stringify({ volume: 0.27, trackId: "pd-satie-gymnopedie-1" })]
  ]);
  const additions = {
    localStorage: {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, value) => storageMap.set(key, value)
    },
    DailyAtlasLock: { transaction: (task) => Promise.resolve(task()) },
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  };
  const firstLoad = loadBrowserModule("music.js", additions).api;
  assert.equal(firstLoad.getState().trackId, "pd-satie-gymnopedie-1");
  assert.equal(firstLoad.getState().playing, false, "a saved selection never implies autoplay");
  assert.equal(firstLoad.getState().trackSourceKind, "public-domain-arrangement");

  assert.equal(firstLoad.setTrack(firstLoad.TRACKS[0].id), true);
  assert.equal(firstLoad.previous().id, firstLoad.TRACKS.at(-1).id, "previous wraps from first to last");
  assert.equal(firstLoad.next().id, firstLoad.TRACKS[0].id, "next wraps from last to first");
  const chosen = firstLoad.TRACKS.at(-1);
  assert.equal(firstLoad.setTrack(chosen.id), true);
  firstLoad.setVolume(0.42);
  await Promise.resolve();
  assert.deepEqual(JSON.parse(storageMap.get("dailyAtlas.audio.v2")), { volume: 0.42, trackId: chosen.id });

  const reload = loadBrowserModule("music.js", additions).api;
  assert.equal(reload.getState().trackId, chosen.id);
  assert.equal(reload.getState().volume, 0.42);
  assert.equal(reload.getState().playing, false, "reload restores preferences but not playback");
});

test("German device-voice fallback is language-aware and does not claim a gender", () => {
  const voices = [
    { voiceURI: "en", name: "English", lang: "en-US", localService: true, default: true },
    { voiceURI: "de-remote", name: "Deutsch Cloud", lang: "de-DE", localService: false, default: true },
    { voiceURI: "de-local", name: "Deutsch Lokal", lang: "de_DE", localService: true, default: false }
  ];
  assert.deepEqual(Speech.listGermanVoices(voices).map((voice) => voice.voiceURI), ["de-remote", "de-local"]);
  assert.equal(Speech.chooseGermanVoice(voices, "de-local", "de-DE").voiceURI, "de-local");
  assert.equal(Speech.chooseGermanVoice(voices, null, "de-DE").voiceURI, "de-local");
  assert.match(Speech.DEVICE_VOICE_BOUNDARY, /固定德语合成女声/);
  assert.match(Speech.DEVICE_VOICE_BOUNDARY, /后备音色不承诺性别/);
  assert.doesNotMatch(Speech.DEVICE_VOICE_BOUNDARY, /保证使用女性|已选择女声|女性音色可用/);
});

test("bundled German female narration is preferred and balances music ducking", async () => {
  const duckReasons = new Set();
  const instances = [];
  let deviceSpeakCalls = 0;
  class MockAudio {
    constructor(src) {
      this.src = src;
      this.preload = "";
      this.onplay = null;
      this.onended = null;
      this.onerror = null;
      instances.push(this);
    }
    play() {
      this.onplay?.();
      return Promise.resolve();
    }
    pause() {}
    removeAttribute() {}
    load() {}
  }
  const synthesis = {
    getVoices: () => [{ voiceURI: "de-local", name: "Deutsch", lang: "de-DE", localService: true }],
    speak() { deviceSpeakCalls += 1; },
    cancel() {},
    addEventListener() {}
  };
  class MockUtterance { constructor(text) { this.text = text; } }
  const { api } = loadBrowserModule("speech.js", {
    Audio: MockAudio,
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: MockUtterance,
    DailyAtlasMusic: {
      duck: (reason) => duckReasons.add(reason),
      unduck: (reason) => duckReasons.delete(reason)
    },
    localStorage: { getItem: () => null, setItem() {} }
  });
  const result = api.speak("Heute lerne ich Deutsch.", {
    id: "de-test",
    audioUrl: "./assets/audio/german/de-test.mp3"
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "bundled-female");
  assert.equal(instances.length, 1);
  assert.equal(deviceSpeakCalls, 0, "device speech is only a fallback");
  assert.equal(api.getState().playbackMode, "bundled-female");
  assert.equal(api.getState().speaking, true);
  assert.deepEqual([...duckReasons], ["speech"]);
  instances[0].onended?.();
  assert.equal(api.getState().status, "ended");
  assert.equal(duckReasons.size, 0);
});

test("speech playback exposes queued/speaking/ended state and balances music ducking", () => {
  const duckReasons = new Set();
  const synthesis = {
    current: null,
    getVoices() {
      return [{ voiceURI: "de-local", name: "Deutsch", lang: "de-DE", localService: true, default: true }];
    },
    speak(utterance) { this.current = utterance; },
    cancel() {},
    addEventListener() {}
  };
  class MockUtterance {
    constructor(text) { this.text = text; }
  }
  const { api } = loadBrowserModule("speech.js", {
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: MockUtterance,
    DailyAtlasMusic: {
      duck: (reason) => duckReasons.add(reason),
      unduck: (reason) => duckReasons.delete(reason)
    },
    localStorage: { getItem: () => null, setItem() {} }
  });
  const result = api.speak("Heute lerne ich Deutsch.");
  assert.equal(result.ok, true);
  assert.equal(result.voice.voiceURI, "de-local");
  assert.equal(api.getState().status, "queued");
  assert.deepEqual([...duckReasons], ["speech"]);
  synthesis.current.onstart();
  assert.equal(api.getState().speaking, true);
  synthesis.current.onend();
  assert.equal(api.getState().status, "ended");
  assert.equal(api.getState().speaking, false);
  assert.equal(duckReasons.size, 0);

  const observed = [];
  const controller = api.createController({ onState: (next) => observed.push(next.status) });
  const toggled = controller.toggle("Ich lese jeden Tag.", "de-example-1");
  assert.equal(toggled.ok, true);
  assert.equal(controller.getState().itemId, "de-example-1");
  const stopped = controller.toggle("Ich lese jeden Tag.", "de-example-1");
  assert.equal(stopped.stopped, true);
  assert.ok(observed.includes("queued"));
  controller.destroy();
});

test("device fallback fails honestly when no German voice is available", () => {
  let speakCalls = 0;
  const synthesis = {
    getVoices: () => [{ voiceURI: "en-default", name: "English", lang: "en-US", default: true }],
    speak() { speakCalls += 1; },
    cancel() {},
    addEventListener() {}
  };
  class MockUtterance { constructor(text) { this.text = text; } }
  const { api } = loadBrowserModule("speech.js", {
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: MockUtterance,
    localStorage: { getItem: () => null, setItem() {} }
  });
  const result = api.speak("Heute lerne ich Deutsch.");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-german-voice");
  assert.equal(speakCalls, 0, "an unknown default voice is never mislabeled as German");
  assert.equal(api.getState().status, "no-german-voice");
  assert.equal(api.getState().speaking, false);
  assert.equal(api.getState().pending, false);
});

test("city weather is fetched only on demand, cached for thirty minutes and marked stale on failure", async () => {
  const storageMap = new Map();
  const storage = {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, value) => storageMap.set(key, value),
    removeItem: (key) => storageMap.delete(key)
  };
  const city = {
    id: "city-berlin",
    cityZh: "柏林",
    coordinates: { latitude: 52.52, longitude: 13.41 },
    timezone: "Europe/Berlin"
  };
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.match(url, /api\.open-meteo\.com\/v1\/forecast/);
    assert.match(url, /timezone=Europe%2FBerlin/);
    return {
      ok: true,
      json: async () => ({
        timezone: "Europe/Berlin",
        timezone_abbreviation: "CEST",
        utc_offset_seconds: 7200,
        current: {
          time: "2026-08-12T10:00",
          temperature_2m: 21.4,
          apparent_temperature: 20.8,
          precipitation: 0,
          weather_code: 2,
          wind_speed_10m: 12.1
        }
      })
    };
  };
  const start = new Date("2026-08-12T08:00:00.000Z");
  const network = await CityLive.fetchWeather(city, { fetchImpl, storage, now: start });
  assert.equal(network.cacheStatus, "network");
  assert.equal(network.data.weatherLabel, "局部多云");
  assert.equal(calls, 1);

  const cached = await CityLive.fetchWeather(city, {
    fetchImpl: async () => { throw new Error("fresh cache should avoid the network"); },
    storage,
    now: new Date(start.getTime() + 29 * 60 * 1000)
  });
  assert.equal(cached.cacheStatus, "fresh-cache");
  assert.equal(cached.stale, false);
  assert.equal(calls, 1);

  const stale = await CityLive.fetchWeather(city, {
    fetchImpl: async () => { throw new Error("offline"); },
    storage,
    now: new Date(start.getTime() + 31 * 60 * 1000)
  });
  assert.equal(stale.cacheStatus, "stale-cache");
  assert.equal(stale.stale, true);
  assert.match(stale.error, /Error|offline/);
  assert.match(CityLive.PRIVACY_BOUNDARY, /主动请求/);

  const publicResult = await CityLive.fetchCurrent(city, {
    fetchImpl: async () => { throw new Error("cached alias should not fetch"); },
    storage,
    now: new Date(start.getTime() + 10 * 60 * 1000)
  });
  assert.equal(publicResult.cached, true);
  assert.equal(publicResult.retrievedAt, start.toISOString());
  assert.match(publicResult.summary, /局部多云.*21\.4°C/);
});

test("city local time validates coordinates and IANA timezones", () => {
  const city = { id: "city-berlin", latitude: 52.52, longitude: 13.41, timezone: "Europe/Berlin" };
  const clock = CityLive.getLocalTime(city, new Date("2026-01-15T12:00:00.000Z"));
  assert.equal(clock.timezone, "Europe/Berlin");
  assert.match(clock.formatted, /13:00/);
  assert.throws(() => CityLive.normalizeCity({ ...city, latitude: 100 }), /latitude/);
  assert.throws(() => CityLive.normalizeCity({ ...city, timezone: "Not/AZone" }), /timezone/);
});

test("reminder time math and exported ICS are deterministic and explicitly recurring", () => {
  assert.equal(Reminders.validTime("08:30"), true);
  assert.equal(Reminders.validTime("24:00"), false);
  assert.equal(Reminders.validTime("8:30"), false);
  const now = new Date(2026, 7, 12, 8, 29, 59);
  assert.equal(Reminders.nextOccurrence("08:30", now).getDate(), 12);
  assert.equal(Reminders.nextOccurrence("08:30", new Date(2026, 7, 12, 8, 30)).getDate(), 13);
  const ics = Reminders.buildIcs({
    time: "08:30",
    startDate: new Date(2026, 7, 12),
    generatedAt: new Date("2026-08-12T00:00:00.000Z")
  });
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20260812T083000/);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /TRIGGER:PT0M/);
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75), "ICS content lines are RFC-folded to 75 octets");
  assert.match(Reminders.REMINDER_BOUNDARY, /不能保证/);
});

test("runtime reminders request no implicit permission and notify at most once per local day", async () => {
  const storageMap = new Map();
  let shown = 0;
  class MockNotification {}
  MockNotification.permission = "granted";
  MockNotification.requestPermission = async () => "granted";
  const { api } = loadBrowserModule("reminders.js", {
    Notification: MockNotification,
    navigator: {
      serviceWorker: {
        getRegistration: async () => ({ showNotification: async () => { shown += 1; } })
      }
    },
    localStorage: {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, value) => storageMap.set(key, value)
    },
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout: () => 1,
    clearTimeout() {}
  });
  api.configure({ enabled: true, time: "08:30" });
  assert.equal(await api.checkDue(new Date(2026, 7, 12, 8, 31)), true);
  assert.equal(await api.checkDue(new Date(2026, 7, 12, 9, 0)), false);
  assert.equal(shown, 1);
  assert.equal(api.load().enabled, true);
  assert.equal(api.disable().enabled, false);
  assert.equal(typeof api.exportICS, "function");
  assert.equal(api.check, api.checkDue);
});

test("PWA manifest keeps a relative shell while the pinned catalog route remains atomic", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "./assets/icons/icon-192.png" && icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.src === "./assets/icons/icon-512.png" && icon.sizes === "512x512"));
  for (const size of [192, 512]) {
    const png = fs.readFileSync(path.join(ROOT, "assets", "icons", `icon-${size}.png`));
    assert.equal(png.readUInt32BE(16), size, `icon-${size} width`);
    assert.equal(png.readUInt32BE(20), size, `icon-${size} height`);
  }
  const worker = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  for (const file of ["asset-routing.js", "profile.js", "backup.js", "lock.js", "appearance.js", "speech.js", "city-live.js", "reminders.js", "pwa.js", "manifest.webmanifest"]) {
    assert.match(worker, new RegExp(file.replace(".", "\\.")));
  }
  assert.doesNotMatch(worker, /api\.open-meteo\.com|covers\.openlibrary|metahub/);
  assert.match(worker, /const CACHE_VERSION = "v3-[a-f0-9]{16}";/, "each built shell has a content-derived cache version");
  for (const declaration of ["SHELL_VERSION", "CONTENT_VERSION", "MEDICAL_VERSION", "AUDIO_VERSION", "SEARCH_VERSION"]) {
    assert.match(worker, new RegExp(`const ${declaration} = "[a-z][0-9]-[a-f0-9]{16}";`), `${declaration} is independently content-derived`);
  }
  assert.match(worker, /for \(const cacheName of \[CACHE_NAME, CONTENT_CACHE, MEDICAL_CACHE, SEARCH_CACHE, AUDIO_METADATA_CACHE\]\)/, "runtime lookup is restricted to the five active packs");
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/, "an explicit update action can activate a waiting worker");
  const installBlock = worker.slice(worker.indexOf('self.addEventListener("install"'), worker.indexOf('self.addEventListener("activate"'));
  assert.match(installBlock, /cacheApplicationShell\(\)/, "the default install delegates the core shell transaction");
  assert.match(installBlock, /cacheContentPack\(\)/, "the catalog is isolated in a content pack");
  assert.match(installBlock, /cacheOrdinaryPack\(MEDICAL_CACHE/, "medical assets are independently reusable");
  assert.match(installBlock, /cacheOrdinaryPack\(SEARCH_CACHE/, "search code is independently reusable");
  assert.match(installBlock, /reusable = new Map/, "a failed update preserves already-ready unchanged packs");
  assert.match(installBlock, /DailyAtlasAssets\.assetResolver\(`catalog-data\/\$\{record\.path\}`/, "the split selection catalog uses the shared verified resolver");
  assert.doesNotMatch(installBlock, /cache\.addAll/, "cache writes use explicit checked responses instead of Cache.addAll's opaque failure surface");
  assert.doesNotMatch(installBlock, /manifest\.items|slice\(index, index \+ 25\)/, "the default install never downloads all 500 narrations");
  for (const message of ["OFFLINE_GET_STATUS", "OFFLINE_SET_MODE", "OFFLINE_CACHE_CURRENT_AUDIO", "OFFLINE_PAUSE_FULL", "OFFLINE_RESUME_FULL", "OFFLINE_CANCEL_FULL", "OFFLINE_REPAIR_CACHES"]) {
    assert.match(worker, new RegExp(message), `${message} is part of the worker protocol`);
  }
  assert.match(worker, /FULL_AUDIO_MARKER/, "a full pack is exposed only after a completion marker is written");
  assert.match(worker, /audioCacheSnapshot\(cache, manifest, true\)/, "resumed staging files are revalidated from actual cache contents");
  assert.equal(Pwa.capability().supported, false, "Node/file-like environments safely decline registration");
  assert.match(Pwa.PWA_BOUNDARY, /file:\/\//);

  let registeredUrl = null;
  const offlineMessages = [];
  const offlineWorker = {
    postMessage(message, ports) {
      offlineMessages.push(message);
      const reply = ports?.[0];
      if (message.type === "OFFLINE_SET_MODE" && message.mode === "full") {
        reply?.postMessage({ requestId: message.requestId, final: false, ok: true, mode: "light", phase: "downloading", cachedCount: 10, totalCount: 500, errorCode: null });
        reply?.postMessage({ requestId: message.requestId, final: true, ok: true, mode: "full", phase: "ready", cachedCount: 500, totalCount: 500, errorCode: null });
        return;
      }
      reply?.postMessage({ requestId: message.requestId, final: true, ok: true, mode: "light", phase: "ready", cachedCount: 1, totalCount: 500, errorCode: null });
    }
  };
  class FakeMessageChannel {
    constructor() {
      this.port1 = { onmessage: null, close() {} };
      this.port2 = { postMessage: (data) => this.port1.onmessage?.({ data }) };
    }
  }
  const registration = {
    waiting: null,
    active: offlineWorker,
    addEventListener() {},
    update: async () => {}
  };
  const { api } = loadBrowserModule("pwa.js", {
    location: { protocol: "https:", reload() {} },
    isSecureContext: true,
    navigator: {
      onLine: true,
      storage: {
        estimate: async () => ({ usage: 100, quota: 1000 }),
        persisted: async () => false,
        persist: async () => true
      },
      serviceWorker: {
        controller: null,
        ready: Promise.resolve({ active: offlineWorker }),
        addEventListener() {},
        register: async (url) => { registeredUrl = url; return registration; }
      }
    },
    MessageChannel: FakeMessageChannel,
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  });
  api.initialize({ autoRegister: false });
  const result = await api.register();
  assert.equal(result.ok, true);
  assert.equal(registeredUrl, "./sw.js");
  assert.equal(api.getState().registered, true);
  assert.equal(api.status().registered, true);
  assert.equal(api.install, api.promptInstall);
  assert.equal(typeof api.onInstallAvailable(() => {}), "function");
  const progress = [];
  const full = await api.setOfflineMode("full", (value) => progress.push(value.cachedCount));
  assert.equal(full.ok, true);
  assert.equal(full.mode, "full");
  assert.deepEqual(progress, [10, 500]);
  assert.equal(api.getState().offlineMode, "full");
  const current = await api.cacheCurrentNarration("./assets/audio/german/de-example.mp3");
  assert.equal(current.ok, true);
  const cancelled = await api.cancelOfflineDownload();
  assert.equal(cancelled.ok, true);
  assert.equal((await api.pauseOfflineDownload()).ok, true);
  assert.equal((await api.resumeOfflineDownload()).ok, true);
  assert.equal((await api.repairCaches()).ok, true);
  assert.deepEqual({ ...(await api.getStorageEstimate()) }, { supported: true, usage: 100, quota: 1000, available: 900, estimatedFullBytes: null, persisted: false });
  assert.deepEqual({ ...(await api.requestPersistentStorage()) }, { supported: true, persisted: true });
  const light = await api.setOfflineMode("light");
  assert.equal(light.mode, "light");
  assert.ok(offlineMessages.some((message) => message.type === "OFFLINE_GET_STATUS"));
  assert.ok(offlineMessages.some((message) => message.type === "OFFLINE_SET_MODE" && message.mode === "full"));
  assert.ok(offlineMessages.some((message) => message.type === "OFFLINE_CACHE_CURRENT_AUDIO"));
  assert.ok(offlineMessages.some((message) => message.type === "OFFLINE_CANCEL_FULL"));
  assert.ok(offlineMessages.some((message) => message.type === "OFFLINE_PAUSE_FULL"));
  assert.ok(offlineMessages.some((message) => message.type === "OFFLINE_RESUME_FULL"));
  assert.ok(offlineMessages.some((message) => message.type === "OFFLINE_REPAIR_CACHES"));
  assert.ok(offlineMessages.some((message) => message.type === "OFFLINE_SET_MODE" && message.mode === "light"));
});

test("PWA observes existing and future installing workers exactly once", async () => {
  const existing = fakeEventTarget({ state: "installing" });
  const future = fakeEventTarget({ state: "installing" });
  const registration = fakeEventTarget({
    installing: existing,
    waiting: null,
    active: null,
    update: async () => {}
  });
  const serviceWorker = fakeEventTarget({
    controller: { id: "current-controller" },
    register: async () => registration
  });
  const { api } = loadBrowserModule("pwa.js", {
    location: { protocol: "https:" },
    isSecureContext: true,
    navigator: { onLine: true, serviceWorker },
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  });

  assert.equal((await api.register()).ok, true);
  assert.equal(existing.listenerCount("statechange"), 1, "an existing installing worker is observed immediately");
  registration.emit("updatefound");
  assert.equal(existing.listenerCount("statechange"), 1, "the same worker is never observed twice");

  registration.installing = future;
  registration.emit("updatefound");
  assert.equal(future.listenerCount("statechange"), 1, "a future updatefound worker is observed");
  future.state = "installed";
  future.emit("statechange");
  assert.equal(api.getState().updateAvailable, true);
});

test("PWA immediately recognizes an already-installed update worker", async () => {
  const installed = fakeEventTarget({ state: "installed" });
  const registration = fakeEventTarget({
    installing: installed,
    waiting: null,
    active: null,
    update: async () => {}
  });
  const serviceWorker = fakeEventTarget({
    controller: { id: "current-controller" },
    register: async () => registration
  });
  const { api } = loadBrowserModule("pwa.js", {
    location: { protocol: "https:" },
    isSecureContext: true,
    navigator: { onLine: true, serviceWorker },
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  });

  assert.equal((await api.register()).ok, true);
  assert.equal(installed.listenerCount("statechange"), 1);
  assert.equal(api.getState().updateAvailable, true, "the immediate state check closes the installed-before-binding race");
});

test("PWA binds controllerchange before requesting activation and completes the normal path", async () => {
  const clock = fakeClock();
  let reloads = 0;
  let listenerWasBound = false;
  let serviceWorker;
  const waiting = fakeEventTarget({
    state: "installed",
    postMessage(message) {
      assert.deepEqual({ ...message }, { type: "SKIP_WAITING" });
      listenerWasBound = serviceWorker.listenerCount("controllerchange") === 1;
    }
  });
  const registration = fakeEventTarget({ waiting, installing: null, active: null, update: async () => {} });
  serviceWorker = fakeEventTarget({
    controller: { id: "current-controller" },
    register: async () => registration
  });
  const { api } = loadBrowserModule("pwa.js", {
    location: { protocol: "https:", reload() { reloads += 1; } },
    isSecureContext: true,
    navigator: { onLine: true, serviceWorker },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  });

  await api.register();
  assert.equal(api.applyUpdate({ reload: true, timeoutMs: 25 }), true);
  assert.equal(listenerWasBound, true, "controllerchange is bound before SKIP_WAITING is posted");
  assert.equal(api.getState().updateApplying, true);
  assert.equal(clock.size(), 1);
  serviceWorker.emit("controllerchange");
  assert.equal(api.getState().updateApplying, false);
  assert.equal(api.getState().updateAvailable, false);
  assert.equal(serviceWorker.listenerCount("controllerchange"), 0);
  assert.equal(clock.size(), 0);
  assert.equal(reloads, 1);
});

test("PWA activation timeout restores a retryable update transaction", async () => {
  const clock = fakeClock();
  let postCalls = 0;
  const waiting = fakeEventTarget({
    state: "installed",
    postMessage() { postCalls += 1; }
  });
  const registration = fakeEventTarget({ waiting, installing: null, active: null, update: async () => {} });
  const serviceWorker = fakeEventTarget({
    controller: { id: "current-controller" },
    register: async () => registration
  });
  const { api } = loadBrowserModule("pwa.js", {
    location: { protocol: "https:" },
    isSecureContext: true,
    navigator: { onLine: true, serviceWorker },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  });

  await api.register();
  assert.equal(api.applyUpdate({ timeoutMs: 25 }), true);
  assert.equal(api.applyUpdate({ timeoutMs: 25 }), false, "a second request is rejected only while activation is in flight");
  assert.equal(postCalls, 1);
  clock.runNext();
  assert.equal(api.getState().status, "update-apply-timeout");
  assert.equal(api.getState().updateApplying, false);
  assert.equal(api.getState().updateAvailable, true, "the still-waiting worker is offered again after timeout");
  assert.equal(serviceWorker.listenerCount("controllerchange"), 0);

  assert.equal(api.applyUpdate({ timeoutMs: 25 }), true, "the same complete waiting worker can be retried");
  assert.equal(postCalls, 2);
  serviceWorker.emit("controllerchange");
  assert.equal(api.getState().updateApplying, false);
  assert.equal(api.getState().updateAvailable, false);
  assert.equal(clock.size(), 0);
});

test("PWA storage preflight settles when a browser storage promise hangs", async () => {
  const { api } = loadBrowserModule("pwa.js", {
    location: { protocol: "http:" },
    isSecureContext: false,
    navigator: {
      storage: {
        estimate: () => new Promise(() => {}),
        persisted: () => new Promise(() => {})
      }
    },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    addEventListener() {},
    dispatchEvent() {}
  });
  const result = await api.getStorageEstimate();
  assert.equal(result.supported, true);
  assert.equal(result.usage, null);
  assert.equal(result.quota, null);
  assert.match(result.error, /timed out/);
});

test("service-worker pack versions change only for the independently modified payload", () => {
  const worker = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/audio/german/manifest.json"), "utf8"));
  const baseline = ServiceWorkerBuild.expectedPackVersions(worker, manifest);
  const changedKeys = (overrides) => {
    const changed = ServiceWorkerBuild.expectedPackVersions(worker, manifest, overrides);
    return Object.keys(baseline).filter((key) => baseline[key] !== changed[key]);
  };
  assert.deepEqual(changedKeys(new Map([["styles.css", Buffer.from("changed shell")]])), ["shell"]);
  assert.deepEqual(changedKeys(new Map([[ServiceWorkerBuild.CATALOG_SPLIT.pointer[0], Buffer.from("changed manifest pointer")]])), ["shell"]);
  assert.deepEqual(changedKeys(new Map([["explore.js", Buffer.from("changed search")]])), ["search"]);
  assert.deepEqual(changedKeys(new Map([[ServiceWorkerBuild.CATALOG_SPLIT.details[0], Buffer.from("changed detail")]])), ["content"]);
  assert.deepEqual(changedKeys(new Map([[ServiceWorkerBuild.MEDICAL_ASSET_FILES[2], Buffer.from("changed medical")]])), ["medical"]);
  assert.deepEqual(changedKeys(new Map([["assets/audio/german/manifest.json", Buffer.from("changed audio metadata")]])), ["audio"]);

  const routing = fs.readFileSync(path.join(ROOT, "asset-routing.js"), "utf8");
  const revision = "0123456789abcdef0123456789abcdef01234567";
  assert.match(ServiceWorkerBuild.expectedAssetRouting(routing, revision), new RegExp(`const DEPLOYMENT_REVISION = "${revision}";`));
});
