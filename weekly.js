(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasWeekly = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TYPES = Object.freeze(["book", "movie", "city", "german", "medical"]);
  const COLLECTIONS = Object.freeze({ book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" });
  const GENRE_LABELS = Object.freeze({ history: "历史", mystery: "悬疑", scifi: "科幻" });
  const PRIVACY_NOTE = "仅依据本机仍保留的探索、喜欢和收藏状态生成，不上传个人画像。取消后的操作不会作为历史事件保留。";

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function weekRange(now, options) {
    const input = now instanceof Date ? new Date(now.getTime()) : new Date(now);
    const current = Number.isNaN(input.getTime()) ? new Date() : input;
    const requestedStart = Number(options?.weekStartsOn);
    const weekStartsOn = Number.isInteger(requestedStart) && requestedStart >= 0 && requestedStart <= 6 ? requestedStart : 1;
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const offset = (start.getDay() - weekStartsOn + 7) % 7;
    start.setDate(start.getDate() - offset);
    const endExclusive = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    endExclusive.setDate(endExclusive.getDate() + 7);
    const endInclusive = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate());
    endInclusive.setDate(endInclusive.getDate() - 1);
    return Object.freeze({
      weekStartsOn,
      startMs: start.getTime(),
      endMs: endExclusive.getTime(),
      startDate: localDateKey(start),
      endDate: localDateKey(endInclusive)
    });
  }

  function timestampInRange(value, range) {
    if (typeof value !== "string" || !value) return false;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp >= range.startMs && timestamp < range.endMs;
  }

  function itemMap(catalog) {
    const source = isObject(catalog) ? catalog : {};
    const output = new Map();
    for (const type of TYPES) {
      const items = Array.isArray(source[COLLECTIONS[type]]) ? source[COLLECTIONS[type]] : [];
      for (const item of items) {
        if (!isObject(item) || typeof item.id !== "string" || !item.id) continue;
        output.set(`${type}:${item.id}`, item);
      }
    }
    return output;
  }

  function increment(map, key) {
    if (typeof key !== "string" || !key.trim()) return;
    map.set(key, (map.get(key) || 0) + 1);
  }

  function ranked(map, labels) {
    return Object.freeze([...map.entries()]
      .map(([id, count]) => Object.freeze({ id, label: labels?.[id] || id, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN") || left.id.localeCompare(right.id)));
  }

  function feedbackTimestamp(entry, kind) {
    return entry?.updatedAtByKind?.[kind] || entry?.updatedAt || "";
  }

  function buildReport(input) {
    const settings = isObject(input) ? input : {};
    const range = weekRange(settings.now === undefined ? new Date() : settings.now, settings);
    const items = itemMap(settings.catalog);
    const profile = isObject(settings.profile) ? settings.profile : {};
    const typeStates = isObject(settings.typeStates) ? settings.typeStates : {};
    const known = new Set();
    const liked = new Set();
    const favorites = new Set();
    const byType = new Map();

    for (const type of TYPES) {
      const knownEntries = Array.isArray(typeStates[type]?.knownEntries) ? typeStates[type].knownEntries : [];
      for (const entry of knownEntries) {
        const key = `${type}:${entry?.id || ""}`;
        if (items.has(key) && timestampInRange(entry?.at, range)) known.add(key);
      }
      const feedback = isObject(profile.feedback?.[type]) ? profile.feedback[type] : {};
      for (const [id, entry] of Object.entries(feedback)) {
        const key = `${type}:${id}`;
        if (!items.has(key) || !isObject(entry)) continue;
        if (entry.liked === true && timestampInRange(feedbackTimestamp(entry, "liked"), range)) liked.add(key);
        if (entry.favorite === true && timestampInRange(feedbackTimestamp(entry, "favorite"), range)) favorites.add(key);
      }
    }

    const activity = new Set([...known, ...liked, ...favorites]);
    for (const key of activity) increment(byType, key.slice(0, key.indexOf(":")));

    const genres = new Map();
    for (const key of liked) {
      const type = key.slice(0, key.indexOf(":"));
      if (!(type === "book" || type === "movie")) continue;
      const item = items.get(key);
      const values = Array.isArray(item?.genres) ? item.genres : [item?.genre];
      for (const genre of new Set(values)) {
        if (Object.hasOwn(GENRE_LABELS, genre)) increment(genres, genre);
      }
    }

    const germanLevels = new Map();
    const medicalTopics = new Map();
    for (const key of activity) {
      const type = key.slice(0, key.indexOf(":"));
      const item = items.get(key);
      if (type === "german") increment(germanLevels, item?.level);
      if (type === "medical") increment(medicalTopics, item?.topicGroup || item?.topic);
    }

    return Object.freeze({
      range,
      knownCount: known.size,
      likedCount: liked.size,
      favoriteCount: favorites.size,
      activityCount: activity.size,
      byType: ranked(byType),
      genres: ranked(genres, GENRE_LABELS),
      germanLevels: ranked(germanLevels),
      medicalTopics: ranked(medicalTopics),
      empty: activity.size === 0,
      privacyNote: PRIVACY_NOTE,
      scopeNote: "本周收藏和喜欢只统计当前仍有效且最后更新时间落在本周的状态；德语等级与医学主题按本周相关项目去重。"
    });
  }

  return Object.freeze({ TYPES, PRIVACY_NOTE, localDateKey, weekRange, buildReport });
});
