(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasReminders = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STORAGE_KEY = "dailyAtlas.reminder.v1";
  const NOTIFICATION_TAG = "daily-atlas-daily-reminder";
  const REMINDER_BOUNDARY = "网页只能在页面或受浏览器保留的 PWA 运行期间尽力提醒，不能保证浏览器完全关闭后每天准点唤醒。需要可靠的关闭后提醒时，请导出每日 ICS 并交给系统日历。";
  const document = root.document || null;
  const state = {
    settings: normalizeSettings(null),
    timer: null,
    started: false,
    initialized: false,
    persistence: Promise.resolve(),
    lastStatus: "idle"
  };

  function validTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
  }

  function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      schemaVersion: 1,
      enabled: Boolean(input.enabled),
      time: validTime(input.time) ? input.time : "08:30",
      lastNotifiedDate: /^\d{4}-\d{2}-\d{2}$/.test(String(input.lastNotifiedDate || ""))
        ? input.lastNotifiedDate
        : null
    };
  }

  function readSettings(storage) {
    try {
      const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
      return normalizeSettings(parsed);
    } catch (_error) {
      return normalizeSettings(null);
    }
  }

  function loadSettings() {
    try {
      return readSettings(root.localStorage);
    } catch (_error) {
      return normalizeSettings(null);
    }
  }

  function normalizeSettingsPatch(value) {
    const input = value && typeof value === "object" ? value : {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(input, "enabled")) patch.enabled = Boolean(input.enabled);
    if (Object.prototype.hasOwnProperty.call(input, "time")) {
      if (!validTime(input.time)) throw new RangeError("Reminder time must use HH:MM");
      patch.time = input.time;
    }
    if (Object.prototype.hasOwnProperty.call(input, "lastNotifiedDate")) {
      patch.lastNotifiedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.lastNotifiedDate || ""))
        ? String(input.lastNotifiedDate)
        : null;
    }
    return patch;
  }

  function transactionStorage(lease) {
    const storage = lease?.storage;
    if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") return storage;
    if (!root.DailyAtlasLock?.constants && !document && root.localStorage) return root.localStorage;
    throw new Error("Canonical reminder transaction storage is unavailable");
  }

  function saveSettings(value) {
    const patch = normalizeSettingsPatch(value);
    const transaction = root.DailyAtlasLock?.transaction;
    if (root.DAILY_ATLAS_PERSISTENCE_AVAILABLE === false || root.DAILY_ATLAS_IMPORT_RECOVERY?.ok === false ||
        (document && typeof transaction !== "function")) return Promise.resolve(false);
    const write = (lease) => {
      const storage = transactionStorage(lease);
      const next = normalizeSettings({ ...readSettings(storage), ...patch });
      const serialized = JSON.stringify(next);
      storage.setItem(STORAGE_KEY, serialized);
      if (storage.getItem(STORAGE_KEY) !== serialized) throw new Error("Reminder preference write verification failed");
      return next;
    };
    state.persistence = (typeof transaction === "function"
      ? transaction(write)
      : Promise.resolve().then(() => write({ storage: root.localStorage })))
      .then((next) => {
        state.settings = normalizeSettings(next);
        return true;
      })
      .catch((error) => {
        if (error?.committed === true && error.result) {
          state.settings = normalizeSettings(error.result);
          return true;
        }
        return false;
      });
    return state.persistence;
  }

  function localDateKey(date) {
    const value = date instanceof Date ? date : new Date(date || Date.now());
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  function timeParts(value) {
    if (!validTime(value)) throw new RangeError("Reminder time must use HH:MM");
    const [hour, minute] = value.split(":").map(Number);
    return { hour, minute };
  }

  function occurrenceForDate(time, date) {
    const { hour, minute } = timeParts(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
  }

  function nextOccurrence(time, from) {
    const now = from instanceof Date ? new Date(from.getTime()) : new Date(from || Date.now());
    let candidate = occurrenceForDate(time, now);
    if (candidate.getTime() <= now.getTime()) {
      candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, timeParts(time).hour, timeParts(time).minute, 0, 0);
    }
    return candidate;
  }

  function initialize() {
    if (state.initialized) return api;
    state.settings = loadSettings();
    state.initialized = true;
    if (root.DAILY_ATLAS_IMPORT_RECOVERY?.ok === false) {
      state.lastStatus = "storage-recovery-blocked";
      dispatchState(state.lastStatus);
      return api;
    }
    root.addEventListener?.("focus", checkDue);
    root.addEventListener?.("pageshow", checkDue);
    document?.addEventListener("visibilitychange", () => {
      if (!document.hidden) void checkDue();
    });
    if (state.settings.enabled) start();
    dispatchState("ready");
    return api;
  }

  function configure(patch) {
    const update = normalizeSettingsPatch(patch);
    const candidate = normalizeSettings({ ...state.settings, ...update });
    state.settings = candidate;
    saveSettings(update);
    if (state.settings.enabled) start();
    else stop();
    dispatchState("configured");
    return getState();
  }

  async function requestPermission() {
    const NotificationClass = root.Notification;
    if (!NotificationClass || typeof NotificationClass.requestPermission !== "function") {
      dispatchState("unsupported");
      return "unsupported";
    }
    let permission;
    try { permission = await NotificationClass.requestPermission(); }
    catch (_error) { permission = "denied"; }
    dispatchState(`permission-${permission}`);
    return permission;
  }

  function start() {
    state.started = true;
    schedule();
    dispatchState("scheduled");
    return true;
  }

  function stop() {
    state.started = false;
    if (state.timer !== null) root.clearTimeout?.(state.timer);
    state.timer = null;
    dispatchState("stopped");
    return true;
  }

  function schedule(now) {
    if (state.timer !== null) root.clearTimeout?.(state.timer);
    state.timer = null;
    if (!state.started || !state.settings.enabled || typeof root.setTimeout !== "function") return;
    const current = now instanceof Date ? now : new Date();
    const next = nextOccurrence(state.settings.time, current);
    const delay = Math.max(50, Math.min(2147483647, next.getTime() - current.getTime()));
    state.timer = root.setTimeout(async () => {
      state.timer = null;
      await checkDue();
      schedule();
    }, delay);
  }

  async function checkDue(now) {
    const current = now instanceof Date ? now : new Date();
    if (!state.settings.enabled) return false;
    const today = localDateKey(current);
    if (state.settings.lastNotifiedDate === today) return false;
    const due = occurrenceForDate(state.settings.time, current);
    if (current.getTime() < due.getTime()) return false;
    const shown = await showNotification();
    if (shown) {
      state.settings = { ...state.settings, lastNotifiedDate: today };
      saveSettings({ lastNotifiedDate: today });
      dispatchState("notified");
    } else dispatchState(permissionState() === "denied" ? "permission-denied" : "notification-unavailable");
    return shown;
  }

  function permissionState() {
    return root.Notification?.permission || (root.Notification ? "default" : "unsupported");
  }

  async function showNotification() {
    const NotificationClass = root.Notification;
    if (!NotificationClass || NotificationClass.permission !== "granted") return false;
    const options = {
      body: "今天的一本书、一部电影、一座城市、一条德语和一则医学科普已经准备好。",
      icon: "./assets/favicon.svg",
      badge: "./assets/favicon.svg",
      tag: NOTIFICATION_TAG,
      renotify: false,
      lang: "zh-CN",
      data: { url: "./" }
    };
    try {
      const serviceWorker = root.navigator?.serviceWorker;
      let registration = null;
      try { registration = serviceWorker?.getRegistration ? await serviceWorker.getRegistration() : null; }
      catch (_error) { registration = null; }
      if (registration?.showNotification) {
        await registration.showNotification("今日万象 · 今日五项已就绪", options);
        return true;
      }
      const notification = new NotificationClass("今日万象 · 今日五项已就绪", options);
      notification.onclick = () => {
        try { root.focus?.(); } catch (_error) {}
        notification.close?.();
      };
      return true;
    } catch (_error) {
      return false;
    }
  }

  function icsEscape(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function icsDate(value) {
    return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`;
  }

  function utcStamp(value) {
    return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function buildIcs(options) {
    const settings = options || {};
    const time = validTime(settings.time) ? settings.time : state.settings.time;
    const startDate = settings.startDate instanceof Date ? settings.startDate : new Date(settings.startDate || Date.now());
    const { hour, minute } = timeParts(time);
    const floatingStart = `${icsDate(startDate)}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
    const summary = icsEscape(settings.summary || "今日万象 · 每日五项精选");
    const description = icsEscape(settings.description || "打开今日万象，探索一本书、一部电影、一座城市、一条德语和一则医学科普。");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Daily Atlas//Daily Reminder//ZH-CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:daily-atlas-reminder@local",
      `DTSTAMP:${utcStamp(new Date(settings.generatedAt || Date.now()))}`,
      `DTSTART:${floatingStart}`,
      "RRULE:FREQ=DAILY",
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:PT0M",
      `DESCRIPTION:${summary}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
      ""
    ];
    return lines.flatMap(foldIcsLine).join("\r\n");
  }

  function utf8Bytes(character) {
    const point = character.codePointAt(0);
    if (point <= 0x7f) return 1;
    if (point <= 0x7ff) return 2;
    if (point <= 0xffff) return 3;
    return 4;
  }

  function foldIcsLine(line) {
    if (!line) return [""];
    const output = [];
    let current = "";
    let bytes = 0;
    let limit = 75;
    for (const character of line) {
      const size = utf8Bytes(character);
      if (current && bytes + size > limit) {
        output.push(output.length ? ` ${current}` : current);
        current = "";
        bytes = 0;
        limit = 74;
      }
      current += character;
      bytes += size;
    }
    output.push(output.length ? ` ${current}` : current);
    return output;
  }

  function downloadIcs(options) {
    if (!document || typeof root.Blob !== "function" || !root.URL?.createObjectURL) return false;
    const content = buildIcs(options);
    const blob = new root.Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = root.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "daily-atlas-reminder.ics";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout?.(() => root.URL.revokeObjectURL(url), 0);
    dispatchState("ics-exported");
    return true;
  }

  function getState() {
    return Object.freeze({
      supported: Boolean(root.Notification),
      permission: permissionState(),
      enabled: state.settings.enabled,
      time: state.settings.time,
      lastNotifiedDate: state.settings.lastNotifiedDate,
      started: state.started,
      status: state.lastStatus,
      nextOccurrence: state.settings.enabled ? nextOccurrence(state.settings.time, new Date()).toISOString() : null,
      boundary: REMINDER_BOUNDARY
    });
  }

  function dispatchState(status) {
    state.lastStatus = status;
    if (typeof root.CustomEvent !== "function" || typeof root.dispatchEvent !== "function") return;
    root.dispatchEvent(new root.CustomEvent("dailyatlasreminderstate", { detail: getState() }));
  }

  function load() {
    return getState();
  }

  async function enable(time) {
    if (!validTime(time)) throw new RangeError("Reminder time must use HH:MM");
    let permission = permissionState();
    if (permission === "default") permission = await requestPermission();
    if (permission !== "granted") {
      configure({ enabled: false, time });
      return getState();
    }
    return configure({ enabled: true, time });
  }

  function disable() {
    return configure({ enabled: false });
  }

  const api = Object.freeze({
    REMINDER_BOUNDARY,
    initialize,
    load,
    enable,
    disable,
    configure,
    requestPermission,
    start,
    stop,
    checkDue,
    showNotification,
    buildIcs,
    foldIcsLine,
    exportICS: downloadIcs,
    downloadIcs,
    validTime,
    localDateKey,
    nextOccurrence,
    check: checkDue,
    getState
  });

  if (root.DAILY_ATLAS_DEFER_PLATFORM_INIT !== true) initialize();
  return api;
});
