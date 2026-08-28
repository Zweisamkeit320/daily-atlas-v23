(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasEngine = api;
  root.DailyDuetEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CONTENT_TYPES = Object.freeze(["book", "movie", "city", "german", "medical"]);
  const GENRES = Object.freeze(["history", "mystery", "scifi"]);
  const POPULARITY_CYCLE = Object.freeze(["classic", "mid", "underseen", "mid", "underseen", "classic"]);
  const THEMES = Object.freeze([
    Object.freeze({ id: "memory", label: "记忆与遗忘", summary: "从个人记忆、城市遗迹到身体与语言，观察我们如何保存和改写过去。" }),
    Object.freeze({ id: "evidence", label: "线索与证据", summary: "在故事、城市、语言和健康信息中练习辨认线索，也保留对结论的边界感。" }),
    Object.freeze({ id: "future", label: "技术与未来", summary: "把想象中的未来、真实城市创新与医学进展放在同一张思考地图上。" }),
    Object.freeze({ id: "journey", label: "迁徙与旅程", summary: "一次移动会改变空间，也会改变人物、语言、文化与身体经验。" }),
    Object.freeze({ id: "choice", label: "选择与代价", summary: "今天的五项内容共同追问：在有限信息和约束下，我们怎样作出选择。" }),
    Object.freeze({ id: "resilience", label: "韧性与改变", summary: "从危机、适应与恢复出发，理解个体和社会如何穿过变化。" }),
    Object.freeze({ id: "community", label: "人与共同体", summary: "把关系、制度、公共空间、沟通方式和公共健康连接起来。" }),
    Object.freeze({ id: "nature", label: "自然与身体", summary: "地理环境、人的身体与想象世界并非彼此分离，而是持续互相塑造。" }),
    Object.freeze({ id: "perception", label: "感知与表达", summary: "观看、聆听、推理和命名，会改变我们理解作品、城市和自身的方式。" }),
    Object.freeze({ id: "time", label: "时间与层积", summary: "历史、城市纹理、语法时态和生命节律，都在展示时间留下的不同层次。" })
  ]);
  const DAILY_THEME_IDS = Object.freeze(["memory", "evidence", "journey", "community", "nature", "perception", "time"]);

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function localDateKey(date) {
    const value = date instanceof Date ? date : new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function daySerial(dateKey) {
    const parts = String(dateKey).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
  }

  function dailyTheme(dateKey) {
    const key = dateKey || localDateKey();
    const themeId = DAILY_THEME_IDS[((daySerial(key) % DAILY_THEME_IDS.length) + DAILY_THEME_IDS.length) % DAILY_THEME_IDS.length];
    return THEMES.find((theme) => theme.id === themeId);
  }

  function itemThemes(item) {
    if (!item) return [];
    const allowed = new Set(THEMES.map((theme) => theme.id));
    return [...new Set((Array.isArray(item.themeTags) ? item.themeTags : []).filter((value) => allowed.has(value)))];
  }

  function itemGenres(item) {
    if (!item) return [];
    const values = Array.isArray(item.genres) ? item.genres : [item.genre];
    return [...new Set(values.filter((genre) => GENRES.includes(genre)))];
  }

  function preferredGenre(dateKey, type, sequence) {
    const typeOffset = type === "movie" ? 1 : 0;
    const step = Number.isFinite(sequence) ? sequence : 0;
    return GENRES[(daySerial(dateKey) + typeOffset + step) % GENRES.length];
  }

  function preferredPopularityTier(dateKey, type, sequence) {
    const typeOffset = type === "movie" ? 2 : 0;
    const step = Number.isFinite(sequence) ? sequence : 0;
    return POPULARITY_CYCLE[(daySerial(dateKey) + typeOffset + step) % POPULARITY_CYCLE.length];
  }

  function hasText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function isQualified(item) {
    if (!item || !CONTENT_TYPES.includes(item.type) || !hasText(item.id) || !hasText(item.sourceUrl)) return false;

    if (item.type === "book") {
      const rating = item.rating;
      return Boolean(
        rating &&
        rating.source === "Open Library" &&
        rating.max === 5 &&
        Number(rating.value) >= 4 &&
        Number(rating.count) >= 20 &&
        hasText(item.image) &&
        itemGenres(item).length
      );
    }

    if (item.type === "movie") {
      const rating = item.rating;
      return Boolean(
        rating &&
        rating.source === "IMDb" &&
        rating.max === 10 &&
        Number(rating.value) >= 7.5 &&
        Number(rating.count) >= 30000 &&
        hasText(item.image) &&
        itemGenres(item).length
      );
    }

    if (item.type === "city") {
      return hasText(item.title) && hasText(item.countryZh) && hasText(item.summary) && Array.isArray(item.highlights) && item.highlights.length >= 3;
    }

    if (item.type === "german") {
      return hasText(item.german) && hasText(item.chinese) && hasText(item.explanation) && hasText(item.exampleGerman) && hasText(item.exampleChinese);
    }

    return hasText(item.title) && hasText(item.summary) && hasText(item.action) && hasText(item.limitsOrRedFlags) && hasText(item.image) && hasText(item.alt);
  }

  function qualifiedItems(items) {
    return (Array.isArray(items) ? items : []).filter(isQualified);
  }

  function uniqueValidIds(ids, validIds) {
    const allowed = validIds instanceof Set ? validIds : new Set(validIds || []);
    return [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => allowed.has(id));
  }

  function rotationGroup(item) {
    if (!item) return "";
    if (item.type === "city") return item.region || "";
    if (item.type === "german") return item.level || item.kind || "";
    if (item.type === "medical") return item.topic || "";
    return "";
  }

  function curatedCandidates(items, excludedIds, options) {
    const settings = options || {};
    const excluded = excludedIds instanceof Set ? excludedIds : new Set(excludedIds || []);
    const eligible = qualifiedItems(items).filter((item) => !excluded.has(item.id));
    if (!eligible.length) return [];

    const type = settings.type || eligible[0].type;
    let pool = eligible;

    if (["book", "movie"].includes(type)) {
      const allowedLevels = settings.allowSourceScreened
        ? ["editorial-curated", "editorial-reviewed", "evidence-reviewed", "source-screened"]
        : ["editorial-curated", "editorial-reviewed", "evidence-reviewed"];
      pool = pool.filter((item) => allowedLevels.includes(item.curationLevel));
      if (!pool.length) return [];
    }

    if (settings.themeId) {
      const themed = pool.filter((item) => itemThemes(item).includes(settings.themeId));
      if (themed.length) pool = themed;
    }

    if (["book", "movie"].includes(type)) {
      const genre = settings.genre || preferredGenre(settings.dateKey, type, settings.sequence);
      const genrePool = pool.filter((item) => itemGenres(item).includes(genre));
      if (genrePool.length) pool = genrePool;

      const tier = settings.popularityTier || preferredPopularityTier(settings.dateKey, type, settings.sequence);
      const tierPool = pool.filter((item) => item.popularityTier === tier);
      if (tierPool.length) pool = tierPool;

      // The 500-item release keeps the original editorial pool as a quality
      // floor. Evidence-reviewed expansion items become eligible only after
      // the editorial items for the same theme/genre/popularity conditions
      // have been excluded. Explicit source-screened exploration remains a
      // separate opt-in mode and intentionally widens all curation levels.
      if (!(settings.exploration && settings.allowSourceScreened)) {
        const editorial = pool.filter((item) => ["editorial-curated", "editorial-reviewed"].includes(item.curationLevel));
        const evidence = pool.filter((item) => item.curationLevel === "evidence-reviewed");
        if (editorial.length) pool = editorial;
        else if (evidence.length) pool = evidence;
      }
    } else {
      const scoreOf = typeof settings.scoreItem === "function" ? settings.scoreItem : () => 0;
      if (!settings.exploration && typeof settings.scoreItem === "function") {
        const ranked = pool.slice().sort((left, right) => {
          const difference = Number(scoreOf(right)) - Number(scoreOf(left));
          return Number.isFinite(difference) && difference !== 0 ? difference : left.id.localeCompare(right.id);
        });
        const best = Number(scoreOf(ranked[0]));
        if (Number.isFinite(best) && best > 0) {
          const close = ranked.filter((item) => Number(scoreOf(item)) >= Math.max(1, best - 2));
          const floor = Math.min(ranked.length, Math.max(5, Math.ceil(ranked.length * 0.1)));
          pool = close.length >= floor ? close : ranked.slice(0, floor);
        }
      }

      const groups = [...new Set(pool.map(rotationGroup).filter(Boolean))].sort();
      if (groups.length) {
        let selectedGroup = groups[hashString(`${settings.dateKey}:${type}:group:${settings.sequence || 0}`) % groups.length];
        if (!settings.exploration && typeof settings.scoreItem === "function") {
          const rankedGroups = groups.map((group) => ({
            group,
            score: Math.max(...pool.filter((item) => rotationGroup(item) === group).map((item) => Number(scoreOf(item)) || 0))
          })).sort((left, right) => right.score - left.score || left.group.localeCompare(right.group));
          if (rankedGroups[0]?.score > 0) selectedGroup = rankedGroups[0].group;
        }
        const grouped = pool.filter((item) => rotationGroup(item) === selectedGroup);
        if (grouped.length) pool = grouped;
      }
    }

    const scoreOf = typeof settings.scoreItem === "function" ? settings.scoreItem : () => 0;
    if (["book", "movie"].includes(type) && !settings.exploration && typeof settings.scoreItem === "function") {
      const ranked = pool.slice().sort((left, right) => {
        const difference = Number(scoreOf(right)) - Number(scoreOf(left));
        return Number.isFinite(difference) && difference !== 0 ? difference : left.id.localeCompare(right.id);
      });
      const best = Number(scoreOf(ranked[0]));
      if (Number.isFinite(best) && best > 0) {
        const close = ranked.filter((item) => Number(scoreOf(item)) >= Math.max(1, best - 2));
        const floor = Math.min(ranked.length, Math.max(5, Math.ceil(ranked.length * 0.1)));
        pool = close.length >= floor ? close : ranked.slice(0, floor);
      }
    }

    return pool.slice().sort((left, right) => {
      if (!settings.exploration) {
        const scoreDifference = Number(scoreOf(right)) - Number(scoreOf(left));
        if (Number.isFinite(scoreDifference) && scoreDifference !== 0) return scoreDifference;
      }
      return left.id.localeCompare(right.id);
    });
  }

  function selectionWindow(candidates, settings) {
    if (!candidates.length || settings.exploration || typeof settings.scoreItem !== "function") return candidates;
    const best = Number(settings.scoreItem(candidates[0]));
    if (!Number.isFinite(best) || best <= 0) return candidates;
    const preferred = candidates.filter((item) => Number(settings.scoreItem(item)) >= Math.max(1, best - 2));
    const minimum = Math.min(candidates.length, Math.max(3, Math.ceil(candidates.length * 0.2)));
    return preferred.length >= minimum ? preferred : candidates.slice(0, minimum);
  }

  function chooseInitial(items, options) {
    const settings = options || {};
    const dateKey = settings.dateKey || localDateKey();
    const type = settings.type || (items && items[0] && items[0].type) || "book";
    const sequence = Number.isFinite(settings.sequence) ? settings.sequence : 0;
    const candidates = curatedCandidates(items, new Set(settings.excludedIds || settings.seenIds || []), {
      dateKey,
      type,
      sequence,
      genre: settings.genre,
      popularityTier: settings.popularityTier,
      themeId: settings.themeId,
      scoreItem: settings.scoreItem,
      exploration: settings.exploration,
      allowSourceScreened: settings.allowSourceScreened
    });
    if (!candidates.length) return null;
    const window = selectionWindow(candidates, settings);
    const index = hashString(`${dateKey}:${type}:initial:${sequence}`) % window.length;
    return window[index];
  }

  function chooseNext(items, options) {
    const settings = options || {};
    const dateKey = settings.dateKey || localDateKey();
    const type = settings.type || (items && items[0] && items[0].type) || "book";
    const excluded = new Set(settings.excludedIds || settings.seenIds || []);
    if (settings.currentId) excluded.add(settings.currentId);
    const sequence = Number.isFinite(settings.sequence) ? settings.sequence : excluded.size;
    const candidates = curatedCandidates(items, excluded, {
      dateKey,
      type,
      sequence,
      genre: settings.genre,
      popularityTier: settings.popularityTier,
      themeId: settings.themeId,
      scoreItem: settings.scoreItem,
      exploration: settings.exploration,
      allowSourceScreened: settings.allowSourceScreened
    });
    if (!candidates.length) return null;
    const window = selectionWindow(candidates, settings);
    const index = hashString(`${dateKey}:${type}:next:${sequence}`) % window.length;
    return window[index];
  }

  function formatCount(count) {
    const number = Number(count) || 0;
    if (number >= 100000000) {
      const value = Math.round((number / 100000000) * 10) / 10;
      return `${String(value).replace(/\.0$/, "")} 亿`;
    }
    if (number >= 10000) {
      const value = Math.round((number / 10000) * 10) / 10;
      return `${String(value).replace(/\.0$/, "")} 万`;
    }
    return new Intl.NumberFormat("zh-CN").format(number);
  }

  function formatSnapshot(dateKey) {
    return String(dateKey || "").replaceAll("-", ".");
  }

  return Object.freeze({
    CONTENT_TYPES,
    GENRES,
    POPULARITY_CYCLE,
    THEMES,
    DAILY_THEME_IDS,
    hashString,
    localDateKey,
    daySerial,
    dailyTheme,
    itemThemes,
    itemGenres,
    preferredGenre,
    preferredPopularityTier,
    isQualified,
    qualifiedItems,
    uniqueValidIds,
    curatedCandidates,
    selectionWindow,
    chooseInitial,
    chooseNext,
    formatCount,
    formatSnapshot
  });
});
