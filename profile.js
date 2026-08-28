(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasProfile = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TYPES = Object.freeze(["book", "movie", "city", "german", "medical"]);
  const FEEDBACK_KINDS = Object.freeze(["liked", "favorite", "unsuitable"]);
  const STORAGE_KEY = "dailyAtlas.profile.v1";
  const EPOCH = "1970-01-01T00:00:00.000Z";

  const EXPLICIT_FIELDS = Object.freeze({
    book: Object.freeze(["genres", "eras", "popularity"]),
    movie: Object.freeze(["genres", "eras", "popularity"]),
    city: Object.freeze(["regions"]),
    german: Object.freeze(["levels"]),
    medical: Object.freeze(["topicGroups"])
  });

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function emptyProfile() {
    return {
      schemaVersion: 1,
      generation: 0,
      updatedAt: EPOCH,
      enabled: true,
      themeLinking: true,
      updatedAtByField: {
        enabled: EPOCH,
        themeLinking: EPOCH,
        explicit: Object.fromEntries(TYPES.map((type) => [
          type,
          Object.fromEntries(EXPLICIT_FIELDS[type].map((field) => [field, EPOCH]))
        ]))
      },
      feedback: Object.fromEntries(TYPES.map((type) => [type, {}])),
      explicit: {
        book: { genres: [], eras: [], popularity: [] },
        movie: { genres: [], eras: [], popularity: [] },
        city: { regions: [] },
        german: { levels: [] },
        medical: { topicGroups: [] }
      }
    };
  }

  function uniqueStrings(values, allowed) {
    const list = [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string"))];
    return allowed ? list.filter((value) => allowed.includes(value)) : list;
  }

  function validTimestamp(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value))
      ? new Date(value).toISOString()
      : EPOCH;
  }

  function timestampMs(value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.parse(EPOCH) : parsed;
  }

  function timestampOf(now) {
    const date = now instanceof Date ? now : new Date();
    return Number.isNaN(date.getTime()) ? EPOCH : date.toISOString();
  }

  function compareTimestamps(first, second) {
    return timestampMs(first) - timestampMs(second);
  }

  function latestTimestamp(...values) {
    return values.reduce((latest, value) => {
      const normalized = validTimestamp(value);
      return compareTimestamps(normalized, latest) > 0 ? normalized : latest;
    }, EPOCH);
  }

  function logicalTimestamp(now, priorTimestamps) {
    const requestedMs = timestampMs(timestampOf(now));
    const priorMs = Math.max(...priorTimestamps.map((value) => timestampMs(validTimestamp(value))));
    const nextMs = Math.max(requestedMs, priorMs + 1);
    const timestamp = new Date(nextMs);
    if (Number.isNaN(timestamp.getTime())) throw new RangeError("Profile logical timestamp is exhausted");
    return timestamp.toISOString();
  }

  function validGeneration(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return JSON.stringify([...value].sort());
    return JSON.stringify(value);
  }

  function newerValue(first, second, firstAt, secondAt) {
    if (compareTimestamps(secondAt, firstAt) > 0) return second;
    if (compareTimestamps(secondAt, firstAt) < 0) return first;
    return canonicalValue(second).localeCompare(canonicalValue(first)) >= 0 ? second : first;
  }

  function normalize(raw, validIdsByType) {
    const output = emptyProfile();
    if (!isObject(raw) || raw.schemaVersion !== 1) return output;
    output.generation = validGeneration(raw.generation);
    output.enabled = raw.enabled !== false;
    output.themeLinking = raw.themeLinking !== false;
    output.updatedAt = validTimestamp(raw.updatedAt);
    const fieldTimes = isObject(raw.updatedAtByField) ? raw.updatedAtByField : {};
    output.updatedAtByField.enabled = validTimestamp(fieldTimes.enabled || output.updatedAt);
    output.updatedAtByField.themeLinking = validTimestamp(fieldTimes.themeLinking || output.updatedAt);
    for (const type of TYPES) {
      const source = isObject(raw.feedback) && isObject(raw.feedback[type]) ? raw.feedback[type] : {};
      const allowed = validIdsByType && validIdsByType[type] instanceof Set ? validIdsByType[type] : null;
      for (const [id, entry] of Object.entries(source)) {
        if (!id || id === "__proto__" || id === "prototype" || id === "constructor" || (allowed && !allowed.has(id)) || !isObject(entry)) continue;
        const fallbackTimestamp = validTimestamp(entry.updatedAt);
        const updatedAtByKind = Object.fromEntries(FEEDBACK_KINDS.map((kind) => [
          kind,
          validTimestamp(entry.updatedAtByKind?.[kind] || fallbackTimestamp)
        ]));
        const normalized = {
          liked: entry.liked === true,
          favorite: entry.favorite === true,
          unsuitable: entry.unsuitable === true,
          updatedAt: latestTimestamp(fallbackTimestamp, ...Object.values(updatedAtByKind)),
          updatedAtByKind
        };
        if (normalized.liked && normalized.unsuitable) {
          if (compareTimestamps(updatedAtByKind.unsuitable, updatedAtByKind.liked) >= 0) normalized.liked = false;
          else normalized.unsuitable = false;
        }
        output.feedback[type][id] = normalized;
      }
    }

    const explicit = isObject(raw.explicit) ? raw.explicit : {};
    output.explicit.book.genres = uniqueStrings(explicit.book?.genres, ["history", "mystery", "scifi"]);
    output.explicit.book.eras = uniqueStrings(explicit.book?.eras, ["early", "modern", "recent"]);
    output.explicit.book.popularity = uniqueStrings(explicit.book?.popularity, ["classic", "mid", "underseen"]);
    output.explicit.movie.genres = uniqueStrings(explicit.movie?.genres, ["history", "mystery", "scifi"]);
    output.explicit.movie.eras = uniqueStrings(explicit.movie?.eras, ["early", "modern", "recent"]);
    output.explicit.movie.popularity = uniqueStrings(explicit.movie?.popularity, ["classic", "mid", "underseen"]);
    output.explicit.city.regions = uniqueStrings(explicit.city?.regions);
    output.explicit.german.levels = uniqueStrings(explicit.german?.levels, ["A1", "A2", "B1", "B2"]);
    output.explicit.medical.topicGroups = uniqueStrings(explicit.medical?.topicGroups);
    for (const type of TYPES) {
      for (const field of EXPLICIT_FIELDS[type]) {
        output.updatedAtByField.explicit[type][field] = validTimestamp(
          fieldTimes.explicit?.[type]?.[field] || output.updatedAt
        );
      }
    }
    output.updatedAt = latestTimestamp(
      output.updatedAt,
      output.updatedAtByField.enabled,
      output.updatedAtByField.themeLinking,
      ...TYPES.flatMap((type) => EXPLICIT_FIELDS[type].map((field) => output.updatedAtByField.explicit[type][field])),
      ...TYPES.flatMap((type) => Object.values(output.feedback[type]).flatMap((entry) => Object.values(entry.updatedAtByKind)))
    );
    return output;
  }

  function parse(serialized, validIdsByType) {
    try {
      return normalize(serialized ? JSON.parse(serialized) : null, validIdsByType);
    } catch (_error) {
      return emptyProfile();
    }
  }

  function feedbackFor(profile, type, id) {
    const entry = profile?.feedback?.[type]?.[id];
    return isObject(entry)
      ? { liked: entry.liked === true, favorite: entry.favorite === true, unsuitable: entry.unsuitable === true }
      : { liked: false, favorite: false, unsuitable: false };
  }

  function setFeedback(profile, type, id, kind, value, now) {
    if (!TYPES.includes(type) || !FEEDBACK_KINDS.includes(kind) || typeof id !== "string" || !id) return normalize(profile);
    const output = normalize(profile);
    const current = feedbackFor(output, type, id);
    const existing = output.feedback[type][id];
    const updatedAtByKind = {
      liked: validTimestamp(existing?.updatedAtByKind?.liked || existing?.updatedAt),
      favorite: validTimestamp(existing?.updatedAtByKind?.favorite || existing?.updatedAt),
      unsuitable: validTimestamp(existing?.updatedAtByKind?.unsuitable || existing?.updatedAt)
    };
    current[kind] = value === true;
    const affectedKinds = [kind];
    if (kind === "liked" && current.liked) {
      current.unsuitable = false;
      affectedKinds.push("unsuitable");
    }
    if (kind === "unsuitable" && current.unsuitable) {
      current.liked = false;
      affectedKinds.push("liked");
    }
    const timestamp = logicalTimestamp(now, affectedKinds.map((affectedKind) => updatedAtByKind[affectedKind]));
    for (const affectedKind of affectedKinds) updatedAtByKind[affectedKind] = timestamp;
    const updated = { ...current, updatedAt: latestTimestamp(...Object.values(updatedAtByKind)), updatedAtByKind };
    output.feedback[type][id] = updated;
    output.updatedAt = latestTimestamp(output.updatedAt, updated.updatedAt);
    return output;
  }

  function toggleFeedback(profile, type, id, kind, now) {
    const current = feedbackFor(profile, type, id);
    return setFeedback(profile, type, id, kind, !current[kind], now);
  }

  function setExplicit(profile, type, field, values, now) {
    const output = normalize(profile);
    if (!isObject(output.explicit[type]) || !Object.hasOwn(output.explicit[type], field)) return output;
    output.explicit[type][field] = uniqueStrings(values);
    const timestamp = logicalTimestamp(now, [output.updatedAtByField.explicit[type][field]]);
    output.updatedAt = latestTimestamp(output.updatedAt, timestamp);
    output.updatedAtByField.explicit[type][field] = timestamp;
    return normalize(output);
  }

  function setSetting(profile, field, value, now) {
    const output = normalize(profile);
    if (field !== "enabled" && field !== "themeLinking") return output;
    output[field] = value === true;
    const timestamp = logicalTimestamp(now, [output.updatedAtByField[field]]);
    output.updatedAt = latestTimestamp(output.updatedAt, timestamp);
    output.updatedAtByField[field] = timestamp;
    return normalize(output);
  }

  function merge(left, right, validIdsByType) {
    const a = normalize(left, validIdsByType);
    const b = normalize(right, validIdsByType);
    if (a.generation !== b.generation) {
      return normalize(a.generation > b.generation ? a : b, validIdsByType);
    }

    const output = emptyProfile();
    output.generation = a.generation;
    output.updatedAt = latestTimestamp(a.updatedAt, b.updatedAt);
    for (const field of ["enabled", "themeLinking"]) {
      const firstAt = validTimestamp(a.updatedAtByField[field]);
      const secondAt = validTimestamp(b.updatedAtByField[field]);
      output[field] = newerValue(a[field], b[field], firstAt, secondAt) === true;
      output.updatedAtByField[field] = latestTimestamp(firstAt, secondAt);
    }
    for (const type of TYPES) {
      for (const field of EXPLICIT_FIELDS[type]) {
        const firstAt = validTimestamp(a.updatedAtByField.explicit[type][field]);
        const secondAt = validTimestamp(b.updatedAtByField.explicit[type][field]);
        output.explicit[type][field] = newerValue(
          a.explicit[type][field],
          b.explicit[type][field],
          firstAt,
          secondAt
        );
        output.updatedAtByField.explicit[type][field] = latestTimestamp(firstAt, secondAt);
      }
    }
    for (const type of TYPES) {
      const ids = new Set([...Object.keys(a.feedback[type]), ...Object.keys(b.feedback[type])]);
      output.feedback[type] = {};
      for (const id of ids) {
        const first = a.feedback[type][id];
        const second = b.feedback[type][id];
        if (!first) output.feedback[type][id] = second;
        else if (!second) output.feedback[type][id] = first;
        else {
          const merged = { updatedAtByKind: {} };
          for (const kind of FEEDBACK_KINDS) {
            const firstAt = validTimestamp(first.updatedAtByKind?.[kind] || first.updatedAt);
            const secondAt = validTimestamp(second.updatedAtByKind?.[kind] || second.updatedAt);
            merged[kind] = newerValue(first[kind] === true, second[kind] === true, firstAt, secondAt) === true;
            merged.updatedAtByKind[kind] = latestTimestamp(firstAt, secondAt);
          }
          if (merged.liked && merged.unsuitable) {
            if (compareTimestamps(merged.updatedAtByKind.unsuitable, merged.updatedAtByKind.liked) >= 0) merged.liked = false;
            else merged.unsuitable = false;
          }
          merged.updatedAt = latestTimestamp(...FEEDBACK_KINDS.map((kind) => merged.updatedAtByKind[kind]));
          output.feedback[type][id] = merged;
        }
      }
    }
    return normalize(output, validIdsByType);
  }

  function resetPreferences(profile, now, validIdsByType) {
    const source = normalize(profile, validIdsByType);
    if (source.generation === Number.MAX_SAFE_INTEGER) throw new RangeError("Profile generation is exhausted");
    const timestamp = logicalTimestamp(now, [
      source.updatedAtByField.enabled,
      source.updatedAtByField.themeLinking,
      ...TYPES.flatMap((type) => EXPLICIT_FIELDS[type].map((field) => source.updatedAtByField.explicit[type][field])),
      ...TYPES.flatMap((type) => Object.values(source.feedback[type]).flatMap((entry) => Object.values(entry.updatedAtByKind)))
    ]);
    const output = emptyProfile();
    output.generation = source.generation + 1;
    output.updatedAt = timestamp;
    output.enabled = source.enabled;
    output.themeLinking = source.themeLinking;
    output.updatedAtByField.enabled = timestamp;
    output.updatedAtByField.themeLinking = timestamp;
    for (const type of TYPES) {
      for (const field of EXPLICIT_FIELDS[type]) output.updatedAtByField.explicit[type][field] = timestamp;
      for (const [id, entry] of Object.entries(source.feedback[type])) {
        const favoriteAt = validTimestamp(entry.updatedAtByKind?.favorite || entry.updatedAt);
        output.feedback[type][id] = {
          liked: false,
          favorite: entry.favorite === true,
          unsuitable: false,
          updatedAt: latestTimestamp(timestamp, favoriteAt),
          updatedAtByKind: {
            liked: timestamp,
            favorite: favoriteAt,
            unsuitable: timestamp
          }
        };
      }
    }
    return normalize(output, validIdsByType);
  }

  function replaceGeneration(profile, minimumGeneration, validIdsByType) {
    const output = normalize(profile, validIdsByType);
    const floor = validGeneration(minimumGeneration);
    const current = Math.max(output.generation, floor);
    if (current === Number.MAX_SAFE_INTEGER) throw new RangeError("Profile generation is exhausted");
    output.generation = current + 1;
    return output;
  }

  function mergeImport(localProfile, importedProfile, validIdsByType) {
    const localValid = isObject(localProfile) && localProfile.schemaVersion === 1;
    const importedValid = isObject(importedProfile) && importedProfile.schemaVersion === 1;
    const local = normalize(localProfile, validIdsByType);
    if (!importedValid) return local;
    const imported = normalize(importedProfile, validIdsByType);
    const highestGeneration = Math.max(localValid ? local.generation : 0, imported.generation);
    if (highestGeneration === Number.MAX_SAFE_INTEGER) throw new RangeError("Profile generation is exhausted");
    if (!localValid) {
      imported.generation = highestGeneration + 1;
      return normalize(imported, validIdsByType);
    }

    // Ordinary Profile.merge treats generation as a replacement fence. A
    // user-selected merge import intentionally compares each field clock, so
    // align temporary generations first and then raise the merged result above
    // both sources to fence off stale tabs.
    local.generation = 0;
    imported.generation = 0;
    const output = merge(local, imported, validIdsByType);
    output.generation = highestGeneration + 1;
    return normalize(output, validIdsByType);
  }

  function eraOf(item) {
    const year = Number(item && item.year);
    if (!Number.isFinite(year) || year <= 0) return "";
    if (year < 1980) return "early";
    if (year < 2010) return "modern";
    return "recent";
  }

  function itemFeatures(item, type) {
    if (!item) return [];
    const common = [
      ...(Array.isArray(item.themeTags) ? item.themeTags.map((value) => `theme:${value}`) : []),
      ...(Array.isArray(item.tags) ? item.tags.map((value) => `tag:${value}`) : [])
    ];
    if (type === "book" || type === "movie") {
      return [
        ...common,
        ...(Array.isArray(item.genres) ? item.genres.map((value) => `genre:${value}`) : []),
        `era:${eraOf(item)}`,
        `popularity:${item.popularityTier || ""}`
      ].filter((value) => !value.endsWith(":"));
    }
    if (type === "city") return [...common, `region:${item.region || ""}`].filter((value) => !value.endsWith(":"));
    if (type === "german") return [...common, `level:${item.level || ""}`, `kind:${item.kind || ""}`].filter((value) => !value.endsWith(":"));
    return [...common, `medical:${item.topicGroup || item.topic || ""}`].filter((value) => !value.endsWith(":"));
  }

  function explicitScore(item, type, profile) {
    const prefs = profile?.explicit?.[type] || {};
    if (type === "book" || type === "movie") {
      let score = 0;
      if (prefs.genres?.length && item.genres?.some((genre) => prefs.genres.includes(genre))) score += 4;
      if (prefs.eras?.length && prefs.eras.includes(eraOf(item))) score += 2;
      if (prefs.popularity?.length && prefs.popularity.includes(item.popularityTier)) score += 2;
      return score;
    }
    if (type === "city") return prefs.regions?.includes(item.region) ? 4 : 0;
    if (type === "german") return prefs.levels?.includes(item.level) ? 4 : 0;
    return prefs.topicGroups?.includes(item.topicGroup || item.topic) ? 4 : 0;
  }

  function inferredWeights(profile, type, collection) {
    const weights = new Map();
    const items = new Map((Array.isArray(collection) ? collection : []).map((item) => [item.id, item]));
    for (const [id, entry] of Object.entries(profile?.feedback?.[type] || {})) {
      if (!entry.liked || entry.unsuitable) continue;
      for (const feature of itemFeatures(items.get(id), type)) weights.set(feature, (weights.get(feature) || 0) + 1);
    }
    return weights;
  }

  function scoreItem(item, type, profile, collection) {
    if (!profile?.enabled) return 0;
    const feedback = feedbackFor(profile, type, item.id);
    if (feedback.unsuitable) return Number.NEGATIVE_INFINITY;
    const weights = inferredWeights(profile, type, collection);
    const inferred = itemFeatures(item, type).reduce((sum, feature) => sum + Math.min(weights.get(feature) || 0, 3), 0);
    return explicitScore(item, type, profile) + inferred;
  }

  function unsuitableIds(profile, type) {
    return Object.entries(profile?.feedback?.[type] || {})
      .filter(([, entry]) => entry?.unsuitable === true)
      .map(([id]) => id);
  }

  function favoriteEntries(profile) {
    return TYPES.flatMap((type) => Object.entries(profile?.feedback?.[type] || {})
      .filter(([, entry]) => entry?.favorite === true)
      .map(([id, entry]) => ({ type, id, updatedAt: entry.updatedAtByKind?.favorite || entry.updatedAt }))
    ).sort((left, right) => compareTimestamps(right.updatedAt, left.updatedAt)
      || left.type.localeCompare(right.type)
      || left.id.localeCompare(right.id));
  }

  return Object.freeze({
    TYPES,
    FEEDBACK_KINDS,
    STORAGE_KEY,
    emptyProfile,
    normalize,
    parse,
    feedbackFor,
    setFeedback,
    toggleFeedback,
    setExplicit,
    setSetting,
    merge,
    mergeImport,
    resetPreferences,
    replaceGeneration,
    eraOf,
    itemFeatures,
    explicitScore,
    scoreItem,
    unsuitableIds,
    favoriteEntries
  });
});
