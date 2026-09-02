(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasSpeech = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STORAGE_KEY = "dailyAtlas.speech.v1";
  const DEVICE_VOICE_BOUNDARY = "默认播放随包的固定德语合成女声；设备德语音色只作为缺少音频时的后备。Web Speech API 不提供可验证的性别字段，因此后备音色不承诺性别。";
  const synth = root.speechSynthesis || null;
  const Utterance = root.SpeechSynthesisUtterance || null;
  const AudioConstructor = typeof root.Audio === "function" ? root.Audio : null;
  const document = root.document || null;
  const subscribers = new Set();
  const managedVoiceSelects = new Set();
  const state = {
    status: AudioConstructor || (synth && Utterance) ? "ready" : "unsupported",
    speaking: false,
    pending: false,
    token: 0,
    text: "",
    itemId: null,
    voiceURI: null,
    activeVoiceURI: null,
    playbackMode: null,
    audioUrl: null,
    audioElement: null,
    error: null,
    persistence: Promise.resolve(),
    initialized: false
  };

  function safeParse(value) {
    try { return value ? JSON.parse(value) : null; } catch (_error) { return null; }
  }

  function loadVoicePreference() {
    try {
      const parsed = safeParse(root.localStorage?.getItem(STORAGE_KEY));
      return typeof parsed?.voiceURI === "string" ? parsed.voiceURI : null;
    } catch (_error) {
      return null;
    }
  }

  function transactionStorage(lease) {
    const storage = lease?.storage;
    if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") return storage;
    if (!root.DailyAtlasLock?.constants && !document && root.localStorage) return root.localStorage;
    throw new Error("Canonical speech transaction storage is unavailable");
  }

  function saveVoicePreference(voiceURI) {
    const intendedVoiceURI = typeof voiceURI === "string" && voiceURI ? voiceURI : null;
    const transaction = root.DailyAtlasLock?.transaction;
    if (root.DAILY_ATLAS_PERSISTENCE_AVAILABLE === false || root.DAILY_ATLAS_IMPORT_RECOVERY?.ok === false ||
        (document && typeof transaction !== "function")) return Promise.resolve(false);
    const write = (lease) => {
      const storage = transactionStorage(lease);
      const current = safeParse(storage.getItem(STORAGE_KEY));
      const normalizedCurrent = {
        voiceURI: typeof current?.voiceURI === "string" && current.voiceURI ? current.voiceURI : null
      };
      const next = { ...normalizedCurrent, voiceURI: intendedVoiceURI };
      const serialized = JSON.stringify(next);
      storage.setItem(STORAGE_KEY, serialized);
      if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error("Speech preference write verification failed");
      return next;
    };
    state.persistence = (typeof transaction === "function"
      ? transaction(write)
      : Promise.resolve().then(() => write({ storage: root.localStorage })))
      .then(() => true)
      .catch((error) => error?.committed === true);
    return state.persistence;
  }

  function isGermanLanguage(value) {
    return /^de(?:[-_]|$)/i.test(String(value || ""));
  }

  function listGermanVoices(voices) {
    const source = Array.isArray(voices)
      ? voices
      : synth && typeof synth.getVoices === "function" ? Array.from(synth.getVoices()) : [];
    return source.filter((voice) => voice && isGermanLanguage(voice.lang));
  }

  function voiceScore(voice, requestedLanguage) {
    const language = String(voice.lang || "").replace("_", "-").toLowerCase();
    const requested = String(requestedLanguage || "de-DE").replace("_", "-").toLowerCase();
    let score = 0;
    if (language === requested) score += 8;
    if (language === "de-de") score += 5;
    if (voice.localService) score += 3;
    if (voice.default) score += 1;
    return score;
  }

  function chooseGermanVoice(voices, preferredVoiceURI, requestedLanguage) {
    const german = listGermanVoices(voices);
    const preferred = german.find((voice) => voice.voiceURI === preferredVoiceURI);
    if (preferred) return preferred;
    return german.slice().sort((left, right) =>
      voiceScore(right, requestedLanguage) - voiceScore(left, requestedLanguage) ||
      String(left.name || left.voiceURI).localeCompare(String(right.name || right.voiceURI), "de")
    )[0] || null;
  }

  function initialize() {
    if (state.initialized) return api;
    state.voiceURI = loadVoicePreference();
    state.initialized = true;
    if (synth?.addEventListener) synth.addEventListener("voiceschanged", handleVoicesChanged);
    else if (synth && "onvoiceschanged" in synth) synth.onvoiceschanged = handleVoicesChanged;
    document?.addEventListener("click", handleDelegatedClick);
    document?.addEventListener("visibilitychange", () => {
      if (document.hidden && (state.speaking || state.pending)) stop("页面已隐藏");
    });
    root.addEventListener?.("pagehide", () => stop("页面已关闭"));
    handleVoicesChanged();
    dispatchState();
    return api;
  }

  function handleVoicesChanged() {
    const voices = listGermanVoices();
    if (state.voiceURI && !voices.some((voice) => voice.voiceURI === state.voiceURI)) {
      state.voiceURI = null;
      saveVoicePreference(null);
    }
    populateVoiceSelect(voices);
    for (const select of managedVoiceSelects) populateVoiceSelect(voices, select);
    if (typeof root.CustomEvent === "function" && typeof root.dispatchEvent === "function") {
      root.dispatchEvent(new root.CustomEvent("dailyatlasspeechvoices", {
        detail: { voices: serializeVoices(voices), boundary: DEVICE_VOICE_BOUNDARY }
      }));
    }
  }

  function serializeVoices(voices) {
    return voices.map((voice) => Object.freeze({
      voiceURI: String(voice.voiceURI || ""),
      name: String(voice.name || ""),
      lang: String(voice.lang || ""),
      localService: Boolean(voice.localService),
      default: Boolean(voice.default)
    }));
  }

  function populateVoiceSelect(voices, target) {
    const select = target || document?.querySelector("#germanVoiceSelect");
    if (!select) return;
    const options = [];
    const automatic = document.createElement("option");
    automatic.value = "";
    automatic.textContent = "自动选择设备德语音色";
    options.push(automatic);
    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = `${voice.name || voice.voiceURI} · ${voice.lang}${voice.localService ? " · 本地" : ""}`;
      options.push(option);
    }
    select.replaceChildren(...options);
    select.value = state.voiceURI || "";
    if (!select.dataset.dailyAtlasSpeechBound) {
      select.dataset.dailyAtlasSpeechBound = "true";
      select.addEventListener("change", () => selectVoice(select.value || null));
    }
    select.disabled = !voices.length;
  }

  function selectVoice(voiceURI) {
    if (voiceURI === null || voiceURI === "") {
      state.voiceURI = null;
      saveVoicePreference(null);
      handleVoicesChanged();
      return true;
    }
    const match = listGermanVoices().find((voice) => voice.voiceURI === voiceURI);
    if (!match) return false;
    state.voiceURI = voiceURI;
    saveVoicePreference(voiceURI);
    handleVoicesChanged();
    return true;
  }

  function normalizeText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) throw new TypeError("German speech text is required");
    if (text.length > 500) throw new RangeError("German speech text exceeds 500 characters");
    return text;
  }

  function normalizeGermanLanguage(value) {
    return isGermanLanguage(value) ? String(value).replace("_", "-") : "de-DE";
  }

  function normalizeBundledAudioUrl(value) {
    const url = String(value || "").trim();
    return /^\.\/assets\/audio\/german\/de-[a-z0-9-]+\.mp3$/.test(url) ? url : null;
  }

  function speak(value, options) {
    const text = normalizeText(value);
    const settings = options || {};
    const requestedItemId = settings.id === undefined || settings.id === null ? null : String(settings.id);
    const sameActiveItem = requestedItemId === null ? state.text === text : state.itemId === requestedItemId;
    if ((state.speaking || state.pending) && sameActiveItem) {
      stop("用户停止朗读");
      return { ok: true, stopped: true, boundary: DEVICE_VOICE_BOUNDARY };
    }
    stop("替换上一条朗读", false);
    const audioUrl = normalizeBundledAudioUrl(settings.audioUrl);
    if (audioUrl && AudioConstructor) return speakBundled(text, requestedItemId, audioUrl, settings);
    return speakWithDevice(text, requestedItemId, settings);
  }

  function speakBundled(text, requestedItemId, audioUrl, settings) {
    const token = ++state.token;
    const audio = new AudioConstructor(audioUrl);
    audio.preload = "auto";
    state.text = text;
    state.itemId = requestedItemId;
    state.activeVoiceURI = "bundled:de_DE-eva_k-x_low";
    state.playbackMode = "bundled-female";
    state.audioUrl = audioUrl;
    state.audioElement = audio;
    state.pending = true;
    state.speaking = false;
    state.error = null;
    duckMusic();
    setState("queued");
    audio.onplay = () => {
      if (token !== state.token) return;
      state.pending = false;
      state.speaking = true;
      setState("speaking");
    };
    audio.onended = () => finish(token, "ended", null);
    audio.onerror = () => fallbackFromBundled(token, text, requestedItemId, settings, "bundled-audio-failed");
    try {
      const playResult = audio.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => fallbackFromBundled(token, text, requestedItemId, settings, "bundled-audio-play-rejected"));
      }
    } catch (_error) {
      fallbackFromBundled(token, text, requestedItemId, settings, "bundled-audio-play-failed");
    }
    return {
      ok: true,
      text,
      id: state.itemId,
      mode: "bundled-female",
      audioUrl,
      boundary: DEVICE_VOICE_BOUNDARY
    };
  }

  function fallbackFromBundled(token, text, requestedItemId, settings, reason) {
    if (token !== state.token) return;
    clearAudioElement();
    if (!synth || !Utterance) {
      finish(token, "error", reason);
      return;
    }
    stop("固定朗读不可用，切换设备语音", false);
    speakWithDevice(text, requestedItemId, { ...settings, audioUrl: null });
  }

  function speakWithDevice(text, requestedItemId, settings) {
    if (!synth || !Utterance) {
      setState("unsupported", { error: "speech-synthesis-unavailable" });
      return { ok: false, reason: "unsupported", boundary: DEVICE_VOICE_BOUNDARY };
    }
    const germanVoices = listGermanVoices();
    if (!germanVoices.length) {
      state.text = text;
      state.itemId = requestedItemId;
      state.activeVoiceURI = null;
      state.playbackMode = null;
      state.audioUrl = null;
      state.audioElement = null;
      state.pending = false;
      state.speaking = false;
      setState("no-german-voice", { error: "no-german-voice" });
      return { ok: false, reason: "no-german-voice", boundary: DEVICE_VOICE_BOUNDARY };
    }
    const token = ++state.token;
    const language = normalizeGermanLanguage(settings.lang);
    const voice = chooseGermanVoice(germanVoices, settings.voiceURI || state.voiceURI, language);
    const utterance = new Utterance(text);
    utterance.lang = language;
    utterance.rate = clamp(settings.rate, 0.6, 1.3, 0.9);
    utterance.pitch = clamp(settings.pitch, 0.5, 1.5, 1);
    utterance.volume = clamp(settings.volume, 0, 1, 1);
    if (voice) utterance.voice = voice;
    state.text = text;
    state.itemId = requestedItemId;
    state.activeVoiceURI = voice?.voiceURI || null;
    state.playbackMode = "device-voice";
    state.audioUrl = null;
    state.audioElement = null;
    state.pending = true;
    state.speaking = false;
    state.error = null;
    duckMusic();
    setState("queued");
    utterance.onstart = () => {
      if (token !== state.token) return;
      state.pending = false;
      state.speaking = true;
      setState("speaking");
    };
    utterance.onend = () => finish(token, "ended", null);
    utterance.onerror = (event) => finish(token, "error", String(event?.error || "synthesis-failed"));
    try {
      synth.speak(utterance);
    } catch (error) {
      finish(token, "error", String(error?.message || "synthesis-failed"));
      return { ok: false, reason: "synthesis-failed", boundary: DEVICE_VOICE_BOUNDARY };
    }
    return {
      ok: true,
      text,
      id: state.itemId,
      mode: "device-voice",
      voice: voice ? serializeVoices([voice])[0] : null,
      boundary: DEVICE_VOICE_BOUNDARY
    };
  }

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function finish(token, status, error) {
    if (token !== state.token) return;
    clearAudioElement();
    state.pending = false;
    state.speaking = false;
    state.error = error;
    if (status === "error") {
      state.text = "";
      state.itemId = null;
      state.activeVoiceURI = null;
      state.playbackMode = null;
      state.audioUrl = null;
    }
    unduckMusic();
    setState(status);
  }

  function stop(reason, announce) {
    const wasActive = state.pending || state.speaking;
    state.token += 1;
    clearAudioElement();
    try { synth?.cancel(); } catch (_error) {}
    state.pending = false;
    state.speaking = false;
    state.text = "";
    state.itemId = null;
    state.activeVoiceURI = null;
    state.playbackMode = null;
    state.audioUrl = null;
    state.error = null;
    unduckMusic();
    if (wasActive && announce !== false) setState("stopped", { reason: String(reason || "stopped") });
    else updateButtons();
    return wasActive;
  }

  function clearAudioElement() {
    const audio = state.audioElement;
    state.audioElement = null;
    if (!audio) return;
    audio.onplay = null;
    audio.onended = null;
    audio.onerror = null;
    try { audio.pause(); } catch (_error) {}
    try { audio.removeAttribute?.("src"); audio.load?.(); } catch (_error) {}
  }

  function duckMusic() {
    root.DailyAtlasMusic?.duck?.("speech");
  }

  function unduckMusic() {
    root.DailyAtlasMusic?.unduck?.("speech");
  }

  function setState(status, extra) {
    state.status = status;
    if (extra?.error) state.error = extra.error;
    updateButtons();
    const statusElement = document?.querySelector("#germanSpeechStatus");
    if (statusElement) statusElement.textContent = statusLabel(status);
    dispatchState(extra);
  }

  function statusLabel(status) {
    return ({
      unsupported: "当前浏览器不支持德语朗读",
      "no-german-voice": "此设备未安装可验证的德语语音",
      ready: "可播放随包德语合成女声",
      queued: "正在准备德语朗读",
      speaking: "正在朗读德语例句",
      ended: "德语朗读已结束",
      stopped: "德语朗读已停止",
      error: "德语朗读失败"
    })[status] || "德语朗读";
  }

  function snapshot() {
    return Object.freeze({
      supported: Boolean(AudioConstructor || (synth && Utterance)),
      status: state.status,
      speaking: state.speaking,
      pending: state.pending,
      text: state.text,
      itemId: state.itemId,
      selectedVoiceURI: state.voiceURI,
      activeVoiceURI: state.activeVoiceURI,
      playbackMode: state.playbackMode,
      audioUrl: state.audioUrl,
      error: state.error,
      availableVoices: serializeVoices(listGermanVoices()),
      boundary: DEVICE_VOICE_BOUNDARY
    });
  }

  function dispatchState(extra) {
    const detail = Object.freeze({ ...snapshot(), ...(extra || {}) });
    for (const callback of subscribers) {
      try { callback(detail); } catch (_error) {}
    }
    if (typeof root.CustomEvent === "function" && typeof root.dispatchEvent === "function") {
      root.dispatchEvent(new root.CustomEvent("dailyatlasspeechstate", { detail }));
    }
  }

  function refreshVoices() {
    handleVoicesChanged();
    return serializeVoices(listGermanVoices());
  }

  function createController(options) {
    const settings = options || {};
    const voiceSelect = typeof settings.voiceSelect === "string"
      ? document?.querySelector(settings.voiceSelect)
      : settings.voiceSelect || null;
    if (voiceSelect) managedVoiceSelects.add(voiceSelect);
    if (typeof settings.onState === "function") subscribers.add(settings.onState);
    refreshVoices();
    if (typeof settings.onState === "function") {
      try { settings.onState(snapshot()); } catch (_error) {}
    }
    return Object.freeze({
      toggle(text, id, options) {
        const normalized = normalizeText(text);
        const active = state.pending || state.speaking;
        const sameItem = id !== undefined && id !== null
          ? state.itemId === String(id)
          : state.text === normalized;
        if (active && sameItem) {
          stop("用户停止朗读");
          return { ok: true, stopped: true, boundary: DEVICE_VOICE_BOUNDARY };
        }
        return speak(normalized, { ...(options || {}), id });
      },
      stop,
      refreshVoices,
      getState: snapshot,
      destroy() {
        if (voiceSelect) managedVoiceSelects.delete(voiceSelect);
        if (typeof settings.onState === "function") subscribers.delete(settings.onState);
      }
    });
  }

  function updateButtons() {
    if (!document) return;
    for (const button of document.querySelectorAll("[data-german-speak]")) {
      const buttonText = speechTextForButton(button, false);
      const active = Boolean(buttonText && buttonText === state.text && (state.pending || state.speaking));
      button.setAttribute("aria-pressed", String(active));
      if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", active ? "停止德语例句朗读" : "朗读德语例句");
      else if (/^(朗读|停止)德语例句朗读$/.test(button.getAttribute("aria-label"))) {
        button.setAttribute("aria-label", active ? "停止德语例句朗读" : "朗读德语例句");
      }
    }
  }

  function speechTextForButton(button, strict) {
    const direct = button?.dataset?.speechText;
    if (direct) return String(direct).trim();
    const card = button?.closest?.("#germanCard, .german-card") || button?.parentElement;
    const target = card?.querySelector?.(".german-example strong[lang='de'], [data-german-example], [lang='de']");
    const text = target?.textContent?.trim() || "";
    if (strict && !text) throw new TypeError("No German example is associated with this button");
    return text;
  }

  function handleDelegatedClick(event) {
    const button = event.target?.closest?.("[data-german-speak]");
    if (!button) return;
    const text = speechTextForButton(button, true);
    speak(text, {
      id: button.dataset.itemId || null,
      lang: button.dataset.speechLang || "de-DE",
      audioUrl: button.dataset.speechAudio || null
    });
  }

  const api = Object.freeze({
    DEVICE_VOICE_BOUNDARY,
    initialize,
    createController,
    speak,
    stop,
    selectVoice,
    listGermanVoices,
    chooseGermanVoice,
    refreshVoices,
    getState: snapshot,
    isGermanLanguage
  });

  if (root.DAILY_ATLAS_DEFER_PLATFORM_INIT !== true) initialize();
  return api;
});
