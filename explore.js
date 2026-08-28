(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasExplore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TYPE_META = Object.freeze({
    book: Object.freeze({ collection: "books", order: 0 }),
    movie: Object.freeze({ collection: "movies", order: 1 }),
    city: Object.freeze({ collection: "cities", order: 2 }),
    german: Object.freeze({ collection: "german", order: 3 }),
    medical: Object.freeze({ collection: "medical", order: 4 })
  });
  const TYPES = Object.freeze(Object.keys(TYPE_META));
  const GENRES = new Set(["history", "mystery", "scifi"]);
  const ERAS = new Set(["early", "modern", "recent", "unknown"]);
  const LEVELS = new Set(["A1", "A2", "B1", "B2"]);
  const SORTS = new Set(["relevance", "rating", "year", "title"]);
  const DEFAULT_PAGE_SIZE = 24;
  const MAX_PAGE_SIZE = 100;

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function cleanText(value, maximum = 500) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maximum);
  }

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll("ß", "ss")
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function itemTitle(item, type) {
    if (type === "city") return cleanText(item.cityZh || item.title, 300);
    if (type === "german") return cleanText(item.german || item.title, 300);
    return cleanText(item.title, 300);
  }

  function eraOfYear(value) {
    const year = Number(value);
    if (!Number.isFinite(year) || year <= 0) return "unknown";
    if (year < 1980) return "early";
    if (year < 2010) return "modern";
    return "recent";
  }

  function ratingPercent(item, type) {
    if (!(type === "book" || type === "movie")) return null;
    const value = Number(item?.rating?.value);
    const maximum = Number(item?.rating?.max);
    if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return null;
    return Math.max(0, Math.min(1, value / maximum));
  }

  function itemGenres(item, engine) {
    const values = typeof engine?.itemGenres === "function"
      ? engine.itemGenres(item)
      : Array.isArray(item?.genres) ? item.genres : [item?.genre];
    return [...new Set(values.filter((value) => GENRES.has(value)))];
  }

  function searchParts(item, type, genres) {
    const common = [
      itemTitle(item, type),
      item.originalTitle,
      item.creator,
      item.summary,
      item.reason,
      item.audience,
      item.series,
      item.installment,
      item.prerequisite,
      item.genreLabel,
      ...(Array.isArray(item.tags) ? item.tags : []),
      ...genres
    ];
    if (type === "city") common.push(
      item.cityEn, item.countryZh, item.countryEn, item.region, item.bestFor,
      item.seasonNote, item.culturalTip, ...(Array.isArray(item.highlights) ? item.highlights : [])
    );
    if (type === "german") common.push(
      item.german, item.chinese, item.explanation, item.exampleGerman,
      item.exampleChinese, item.pronunciationHint, item.kind, item.level
    );
    if (type === "medical") common.push(
      item.topicGroup, item.topic, item.action, item.limitsOrRedFlags,
      item.sourceName, item.riskLevel
    );
    return normalizeText(common.filter((value) => typeof value === "string" && value.trim()).join(" \u0000 "));
  }

  function buildIndex(catalog, engine) {
    const source = isObject(catalog) ? catalog : {};
    const entries = [];
    const counts = Object.fromEntries(TYPES.map((type) => [type, 0]));
    const seen = new Set();
    for (const type of TYPES) {
      const raw = Array.isArray(source[TYPE_META[type].collection]) ? source[TYPE_META[type].collection] : [];
      const qualified = typeof engine?.qualifiedItems === "function" ? engine.qualifiedItems(raw) : raw;
      for (const item of qualified) {
        if (!isObject(item) || typeof item.id !== "string" || !item.id) continue;
        const key = `${type}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const genres = itemGenres(item, engine);
        entries.push(Object.freeze({
          key,
          type,
          typeOrder: TYPE_META[type].order,
          item,
          title: itemTitle(item, type),
          normalizedTitle: normalizeText(itemTitle(item, type)),
          text: searchParts(item, type, genres),
          genres: Object.freeze(genres),
          era: type === "book" || type === "movie" ? eraOfYear(item.year) : "",
          region: type === "city" ? cleanText(item.region, 100) : "",
          ratingPercent: ratingPercent(item, type),
          level: type === "german" && LEVELS.has(item.level) ? item.level : "",
          medicalTopic: type === "medical" ? cleanText(item.topicGroup || item.topic, 200) : ""
        }));
        counts[type] += 1;
      }
    }
    return Object.freeze({ entries: Object.freeze(entries), counts: Object.freeze(counts) });
  }

  function safeInteger(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) return fallback;
    return Math.max(minimum, Math.min(maximum, parsed));
  }

  function normalizeRating(value) {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
  }

  function normalizeFilters(raw) {
    const input = isObject(raw) ? raw : {};
    const type = TYPES.includes(input.type) ? input.type : "all";
    const genre = GENRES.has(input.genre) ? input.genre : "";
    const era = ERAS.has(input.era) ? input.era : "";
    const level = LEVELS.has(input.level) ? input.level : "";
    const sort = SORTS.has(input.sort) ? input.sort : "relevance";
    return Object.freeze({
      q: cleanText(input.q, 200),
      type,
      genre,
      era,
      region: cleanText(input.region, 100),
      ratingPercent: normalizeRating(input.ratingPercent),
      level,
      medicalTopic: cleanText(input.medicalTopic, 200),
      sort,
      page: safeInteger(input.page, 1, 1, Number.MAX_SAFE_INTEGER),
      pageSize: safeInteger(input.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    });
  }

  function relevance(entry, normalizedQuery, tokens) {
    if (!normalizedQuery) return 0;
    let score = entry.normalizedTitle === normalizedQuery ? 100 : entry.normalizedTitle.startsWith(normalizedQuery) ? 40 : 0;
    if (!score && entry.normalizedTitle.includes(normalizedQuery)) score = 20;
    for (const token of tokens) {
      if (entry.normalizedTitle === token) score += 15;
      else if (entry.normalizedTitle.includes(token)) score += 6;
      else if (entry.text.includes(token)) score += 1;
    }
    return score;
  }

  function compareStable(left, right) {
    return left.typeOrder - right.typeOrder || left.title.localeCompare(right.title, "zh-CN") || left.key.localeCompare(right.key);
  }

  function query(index, rawFilters) {
    const entries = Array.isArray(index) ? index : Array.isArray(index?.entries) ? index.entries : [];
    const filters = normalizeFilters(rawFilters);
    const normalizedQuery = normalizeText(filters.q);
    const tokens = normalizedQuery ? normalizedQuery.split(" ").filter(Boolean) : [];
    const matches = [];
    for (const entry of entries) {
      if (!entry || !TYPES.includes(entry.type)) continue;
      if (filters.type !== "all" && entry.type !== filters.type) continue;
      if (filters.genre && (!(entry.type === "book" || entry.type === "movie") || !entry.genres.includes(filters.genre))) continue;
      if (filters.era && (!(entry.type === "book" || entry.type === "movie") || entry.era !== filters.era)) continue;
      if (filters.region && (entry.type !== "city" || entry.region !== filters.region)) continue;
      if (filters.ratingPercent !== null && (!(entry.type === "book" || entry.type === "movie") || entry.ratingPercent === null || entry.ratingPercent < filters.ratingPercent)) continue;
      if (filters.level && (entry.type !== "german" || entry.level !== filters.level)) continue;
      if (filters.medicalTopic && (entry.type !== "medical" || entry.medicalTopic !== filters.medicalTopic)) continue;
      if (tokens.length && !tokens.every((token) => entry.text.includes(token))) continue;
      matches.push({ entry, relevance: relevance(entry, normalizedQuery, tokens) });
    }

    matches.sort((left, right) => {
      if (filters.sort === "rating") {
        const difference = (right.entry.ratingPercent ?? -1) - (left.entry.ratingPercent ?? -1);
        if (difference) return difference;
      } else if (filters.sort === "year") {
        const difference = Number(right.entry.item?.year || 0) - Number(left.entry.item?.year || 0);
        if (difference) return difference;
      } else if (filters.sort === "title") {
        const difference = left.entry.title.localeCompare(right.entry.title, "zh-CN");
        if (difference) return difference;
      } else if (right.relevance !== left.relevance) return right.relevance - left.relevance;
      return compareStable(left.entry, right.entry);
    });

    const total = matches.length;
    const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, pageCount);
    const offset = (page - 1) * filters.pageSize;
    return Object.freeze({
      total,
      page,
      pageSize: filters.pageSize,
      pageCount,
      items: Object.freeze(matches.slice(offset, offset + filters.pageSize).map((match) => match.entry)),
      filters
    });
  }

  return Object.freeze({
    TYPES,
    TYPE_META,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    normalizeText,
    eraOfYear,
    buildIndex,
    normalizeFilters,
    query
  });
});
