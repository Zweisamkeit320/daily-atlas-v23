(function (root, factory) {
  const commonJs = typeof module === "object" && module.exports;
  const api = factory(
    commonJs ? require("./state.js") : root.DailyAtlasState,
    commonJs ? require("./profile.js") : root.DailyAtlasProfile
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasBackup = api;
  // The production page defers recovery until lock.js has acquired the global
  // Web Locks / IndexedDB transaction gate. Standalone consumers without the
  // defer flag retain the synchronous compatibility bootstrap used by tests.
  if (root.document && root.DAILY_ATLAS_DEFER_PLATFORM_INIT !== true) {
    let recovery;
    try {
      recovery = api.recoverPending(root.localStorage);
      if (recovery.status === "journal-read-failed") recovery = api.memoryOnlyRecovery(recovery.error);
    } catch (error) {
      recovery = api.memoryOnlyRecovery(error);
    }
    root.DAILY_ATLAS_IMPORT_RECOVERY = recovery;
    if (recovery.persistenceAvailable === false) root.DAILY_ATLAS_PERSISTENCE_AVAILABLE = false;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (State, Profile) {
  "use strict";

  const FORMAT = "daily-atlas-backup";
  const SCHEMA_VERSION = 1;
  const TYPES = Object.freeze(["book", "movie", "city", "german", "medical"]);
  const STATE_PREFIX = "dailyAtlas.state.v3.";
  const OPTIONAL_KEYS = Object.freeze([
    "dailyAtlas.profile.v1",
    "dailyAtlas.appearance.v1",
    "dailyAtlas.audio.v1",
    "dailyAtlas.audio.v2",
    "dailyAtlas.speech.v1",
    "dailyAtlas.reminder.v1"
  ]);
  const PENDING_KEY = "dailyAtlas.import.pending.v1";
  const LEGACY_JOURNAL_VERSION = 2;
  const JOURNAL_VERSION = 3;
  const MAX_BYTES = 2 * 1024 * 1024;
  const TARGET_KEYS = Object.freeze([
    "dailyAtlas.profile.v1",
    ...TYPES.map((type) => `${STATE_PREFIX}${type}`),
    ...OPTIONAL_KEYS.filter((key) => key !== "dailyAtlas.profile.v1")
  ]);
  const FEEDBACK_KINDS = Object.freeze(["liked", "favorite", "unsuitable"]);
  const EXPLICIT_FIELDS = Object.freeze({
    book: Object.freeze({ genres: ["history", "mystery", "scifi"], eras: ["early", "modern", "recent"], popularity: ["classic", "mid", "underseen"] }),
    movie: Object.freeze({ genres: ["history", "mystery", "scifi"], eras: ["early", "modern", "recent"], popularity: ["classic", "mid", "underseen"] }),
    city: Object.freeze({ regions: null }),
    german: Object.freeze({ levels: ["A1", "A2", "B1", "B2"] }),
    medical: Object.freeze({ topicGroups: null })
  });
  const DEFAULT_TIME = "1970-01-01T00:00:00.000Z";
  const FIRST_TRACK = "morning-harbor";
  const TRACK_IDS = new Set([
    "morning-harbor", "rainy-study", "moonlit-walk", "moss-garden", "valley-glow",
    "paper-afternoon", "north-window-snow", "forest-tea", "far-lighthouse", "cloud-train",
    "still-water", "autumn-arcade", "sleepy-star-map", "evening-garden", "pine-and-moon",
    "blue-hour-river", "dune-whisper", "morning-eaves", "old-town-dusk", "sea-salt-breeze",
    "dawn-library", "bamboo-rain", "amber-window", "quiet-orbit", "meadow-letter",
    "porcelain-sky", "hidden-courtyard", "lake-at-five", "cedar-path", "lantern-tide",
    "silk-road-dawn", "stone-bridge-rain", "winter-library", "peach-cloud", "lighthouse-notes",
    "reed-marsh", "starlit-platform", "garden-after-rain", "quiet-museum", "apricot-evening",
    "glacier-breath", "maple-window", "harbor-postcard", "mountain-ink", "warm-porch",
    "blue-porcelain", "island-clock", "cloud-observatory", "linen-curtain", "river-stones",
    "tea-steam", "midnight-archive", "coast-journal", "violet-hour", "moon-over-tiles",
    "pale-gold-field", "pine-library", "silent-canal", "windmill-dusk", "olive-grove",
    "aurora-letter", "old-map", "summer-eaves", "night-ferry", "snowbound-cabin",
    "misty-orchard", "copper-moon", "slow-compass", "quiet-greenhouse", "seaside-reading",
    "birch-sunrise", "ink-and-rain", "terrace-wind", "constellation-lake", "orchard-noon",
    "distant-bell", "pearl-morning", "paper-kite", "willow-reflection", "sunday-window",
    "pd-bach-air", "pd-bach-prelude-c", "pd-pachelbel-canon", "pd-vivaldi-spring", "pd-vivaldi-winter",
    "pd-mozart-eine-kleine", "pd-mozart-turkish-march", "pd-beethoven-fur-elise", "pd-beethoven-moonlight", "pd-beethoven-fifth",
    "pd-mendelssohn-spring-song", "pd-chopin-nocturne-9-2", "pd-schumann-traumerei", "pd-brahms-hungarian-dance-5", "pd-tchaikovsky-swan-lake",
    "pd-grieg-morning-mood", "pd-debussy-clair-de-lune", "pd-satie-gymnopedie-1", "pd-dvorak-new-world-largo", "pd-saint-saens-swan"
  ]);

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function parseJson(value) {
    try { return value == null ? null : JSON.parse(value); } catch (_error) { return null; }
  }

  function validTimestamp(value, fallback) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
  }

  function safeCounter(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function safeText(value, maximum) {
    return typeof value === "string" && value.length <= maximum ? value : null;
  }

  function safeIdentifier(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 300 &&
      !["__proto__", "prototype", "constructor"].includes(value);
  }

  function uniqueStrings(value, allowed) {
    const result = [];
    const seen = new Set();
    for (const entry of Array.isArray(value) ? value : []) {
      if (typeof entry !== "string" || entry.length > 100 || seen.has(entry) || (allowed && !allowed.includes(entry))) continue;
      seen.add(entry);
      result.push(entry);
    }
    return result;
  }

  function normalizeState(raw, type, allowed) {
    if (!isObject(raw) || raw.schemaVersion !== 3 || raw.type !== type || !Array.isArray(raw.knownEntries) || !Array.isArray(raw.skipped)) return null;
    const cleanKnown = [];
    const seenKnown = new Set();
    for (const entry of raw.knownEntries) {
      if (!isObject(entry) || !safeIdentifier(entry.id) || (allowed && !allowed.has(entry.id)) || seenKnown.has(entry.id)) continue;
      seenKnown.add(entry.id);
      cleanKnown.push({ id: entry.id, at: validTimestamp(entry.at, DEFAULT_TIME) });
    }
    const cleanSkipped = [];
    const seenSkipped = new Set();
    for (const id of raw.skipped) {
      if (!safeIdentifier(id) || (allowed && !allowed.has(id)) || seenSkipped.has(id)) continue;
      seenSkipped.add(id);
      cleanSkipped.push(id);
    }
    let currentId = safeIdentifier(raw.currentId) && (!allowed || allowed.has(raw.currentId)) ? raw.currentId : null;
    if (seenKnown.has(currentId) || seenSkipped.has(currentId)) currentId = null;
    return {
      schemaVersion: 3,
      type,
      date: safeText(raw.date, 40) || "",
      revision: safeCounter(raw.revision),
      version: typeof raw.version === "string" && /^\d+$/.test(raw.version) ? raw.version.replace(/^0+(?=\d)/, "") : "0",
      currentId,
      sequence: safeCounter(raw.sequence),
      skipped: cleanSkipped,
      knownEntries: cleanKnown
    };
  }

  function emptyExplicit() {
    return Object.fromEntries(Object.entries(EXPLICIT_FIELDS).map(([type, fields]) => [
      type,
      Object.fromEntries(Object.keys(fields).map((field) => [field, []]))
    ]));
  }

  function emptyExplicitTimestamps(timestamp) {
    return Object.fromEntries(Object.entries(EXPLICIT_FIELDS).map(([type, fields]) => [
      type,
      Object.fromEntries(Object.keys(fields).map((field) => [field, timestamp]))
    ]));
  }

  function normalizeProfile(raw, validIdsByType) {
    if (!isObject(raw) || raw.schemaVersion !== 1) return null;
    const updatedAt = validTimestamp(raw.updatedAt, DEFAULT_TIME);
    const output = {
      schemaVersion: 1,
      generation: safeCounter(raw.generation),
      updatedAt,
      enabled: raw.enabled !== false,
      themeLinking: raw.themeLinking !== false,
      feedback: Object.fromEntries(TYPES.map((type) => [type, {}])),
      explicit: emptyExplicit(),
      updatedAtByField: {
        enabled: validTimestamp(raw.updatedAtByField?.enabled, updatedAt),
        themeLinking: validTimestamp(raw.updatedAtByField?.themeLinking, updatedAt),
        explicit: emptyExplicitTimestamps(updatedAt)
      }
    };
    for (const type of TYPES) {
      const source = isObject(raw.feedback?.[type]) ? raw.feedback[type] : {};
      const allowed = validIdsByType?.[type] instanceof Set ? validIdsByType[type] : null;
      for (const [id, entry] of Object.entries(source)) {
        if (!safeIdentifier(id) || (allowed && !allowed.has(id)) || !isObject(entry)) continue;
        const entryUpdatedAt = validTimestamp(entry.updatedAt, updatedAt);
        const normalizedEntry = {
          liked: entry.liked === true,
          favorite: entry.favorite === true,
          unsuitable: entry.unsuitable === true,
          updatedAt: entryUpdatedAt,
          updatedAtByKind: Object.fromEntries(FEEDBACK_KINDS.map((kind) => [
            kind,
            validTimestamp(entry.updatedAtByKind?.[kind], entryUpdatedAt)
          ]))
        };
        if (normalizedEntry.liked && normalizedEntry.unsuitable) {
          if (normalizedEntry.updatedAtByKind.unsuitable.localeCompare(normalizedEntry.updatedAtByKind.liked) >= 0) normalizedEntry.liked = false;
          else normalizedEntry.unsuitable = false;
        }
        output.feedback[type][id] = normalizedEntry;
      }
    }
    for (const [type, fields] of Object.entries(EXPLICIT_FIELDS)) {
      for (const [field, allowed] of Object.entries(fields)) {
        output.explicit[type][field] = uniqueStrings(raw.explicit?.[type]?.[field], allowed);
        output.updatedAtByField.explicit[type][field] = validTimestamp(raw.updatedAtByField?.explicit?.[type]?.[field], updatedAt);
      }
    }
    return output;
  }

  function finiteVolume(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.18;
  }

  function normalizeAudioV1(raw) {
    return isObject(raw) ? { volume: finiteVolume(raw.volume) } : null;
  }

  function normalizeAppearance(raw) {
    if (!isObject(raw)) return null;
    const colors = ["paper", "sage", "sky", "peach", "lavender", "sand"];
    const styles = ["editorial", "clean", "botanical", "aurora"];
    const densities = ["comfortable", "compact"];
    const textSizes = ["default", "large"];
    const contrasts = ["default", "high"];
    const motions = ["system", "reduce"];
    return {
      schemaVersion: 1,
      color: colors.includes(raw.color) ? raw.color : "paper",
      style: styles.includes(raw.style) ? raw.style : "editorial",
      density: densities.includes(raw.density) ? raw.density : "comfortable",
      dataSaver: raw.dataSaver === true,
      textSize: textSizes.includes(raw.textSize) ? raw.textSize : "default",
      contrast: contrasts.includes(raw.contrast) ? raw.contrast : "default",
      motion: motions.includes(raw.motion) ? raw.motion : "system"
    };
  }

  function normalizeAudioV2(raw) {
    if (!isObject(raw)) return null;
    return {
      volume: finiteVolume(raw.volume),
      trackId: TRACK_IDS.has(raw.trackId) ? raw.trackId : FIRST_TRACK
    };
  }

  function normalizeSpeech(raw) {
    if (!isObject(raw)) return null;
    return { voiceURI: raw.voiceURI === null || raw.voiceURI === undefined ? null : safeText(raw.voiceURI, 300) };
  }

  function validReminderTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
  }

  function normalizeReminder(raw) {
    if (!isObject(raw)) return null;
    const lastDate = safeText(raw.lastNotifiedDate, 10);
    return {
      schemaVersion: 1,
      enabled: raw.enabled === true,
      time: validReminderTime(raw.time) ? raw.time : "08:30",
      lastNotifiedDate: lastDate && /^\d{4}-\d{2}-\d{2}$/.test(lastDate) ? lastDate : null
    };
  }

  function normalizeOptional(key, value, validIdsByType) {
    if (key === "dailyAtlas.profile.v1") return normalizeProfile(value, validIdsByType);
    if (key === "dailyAtlas.appearance.v1") return normalizeAppearance(value);
    if (key === "dailyAtlas.audio.v1") return normalizeAudioV1(value);
    if (key === "dailyAtlas.audio.v2") return normalizeAudioV2(value);
    if (key === "dailyAtlas.speech.v1") return normalizeSpeech(value);
    if (key === "dailyAtlas.reminder.v1") return normalizeReminder(value);
    return null;
  }

  function collect(storage, options) {
    const settings = options || {};
    const states = {};
    for (const type of TYPES) {
      const allowed = settings.validIdsByType?.[type] instanceof Set ? settings.validIdsByType[type] : null;
      states[type] = normalizeState(parseJson(storage.getItem(`${STATE_PREFIX}${type}`)), type, allowed);
    }
    const optional = {};
    for (const key of OPTIONAL_KEYS) {
      const raw = parseJson(storage.getItem(key));
      const value = normalizeOptional(key, raw, settings.validIdsByType);
      if (value !== null) optional[key] = value;
    }
    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      appVersion: settings.appVersion || "2.3.0",
      catalogSnapshot: settings.catalogSnapshot || "unknown",
      exportedAt: new Date().toISOString(),
      states,
      optional
    };
  }

  function serialize(storage, options) {
    return `${JSON.stringify(collect(storage, options), null, 2)}\n`;
  }

  function validate(payload, validIdsByType) {
    const errors = [];
    const warnings = [];
    if (!isObject(payload) || payload.format !== FORMAT || payload.schemaVersion !== SCHEMA_VERSION) {
      return { ok: false, errors: ["这不是受支持的今日万象备份文件。"], warnings, normalized: null };
    }
    if (!isObject(payload.states) || !isObject(payload.optional)) {
      return { ok: false, errors: ["备份结构不完整。"], warnings, normalized: null };
    }
    const normalized = { states: {}, optional: {} };
    for (const type of TYPES) {
      const state = payload.states[type];
      if (state == null) continue;
      const allowed = validIdsByType?.[type] instanceof Set ? validIdsByType[type] : null;
      const clean = normalizeState(state, type, allowed);
      if (!clean) {
        errors.push(`${type} 状态结构无效。`);
        continue;
      }
      if (clean.knownEntries.length !== state.knownEntries.length || clean.skipped.length !== new Set(state.skipped).size || clean.currentId !== state.currentId) {
        warnings.push(`${type} 中的无效、重复或冲突记录已忽略。`);
      }
      normalized.states[type] = clean;
    }
    for (const key of OPTIONAL_KEYS) {
      if (!Object.hasOwn(payload.optional, key)) continue;
      const clean = normalizeOptional(key, payload.optional[key], validIdsByType);
      if (clean === null) errors.push(`${key} 设置结构无效。`);
      else normalized.optional[key] = clean;
    }
    return { ok: errors.length === 0, errors, warnings: [...new Set(warnings)], normalized };
  }

  function parseText(text, validIdsByType) {
    if (typeof text !== "string") return { ok: false, errors: ["备份内容不是文本。"], warnings: [], normalized: null };
    if (new TextEncoder().encode(text).length > MAX_BYTES) return { ok: false, errors: ["备份文件超过 2 MB 上限。"], warnings: [], normalized: null };
    try {
      return validate(JSON.parse(text), validIdsByType);
    } catch (_error) {
      return { ok: false, errors: ["备份 JSON 无法解析。"], warnings: [], normalized: null };
    }
  }

  function normalizeImportData(value, validIdsByType) {
    if (!isObject(value) || !isObject(value.states) || !isObject(value.optional)) throw new Error("Import was not normalized");
    const output = { states: {}, optional: {} };
    for (const type of TYPES) {
      if (!Object.hasOwn(value.states, type) || value.states[type] == null) continue;
      const allowed = validIdsByType?.[type] instanceof Set ? validIdsByType[type] : null;
      const clean = normalizeState(value.states[type], type, allowed);
      if (!clean) throw new Error(`${type} import state was not normalized`);
      output.states[type] = clean;
    }
    for (const key of OPTIONAL_KEYS) {
      if (!Object.hasOwn(value.optional, key)) continue;
      const clean = normalizeOptional(key, value.optional[key], validIdsByType);
      if (clean === null) throw new Error(`${key} import setting was not normalized`);
      output.optional[key] = clean;
    }
    return output;
  }

  function importApisAvailable() {
    return Boolean(
      State && typeof State.mergeImport === "function" && typeof State.incrementVersion === "function" &&
      Profile && typeof Profile.mergeImport === "function" && typeof Profile.replaceGeneration === "function"
    );
  }

  function assertImportApis() {
    if (!importApisAvailable()) throw new Error("State/Profile import helpers are unavailable");
  }

  function nextRevision(...values) {
    const highest = Math.max(0, ...values.map((value) => safeCounter(value)));
    return highest >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : highest + 1;
  }

  function replaceStateForImport(localState, importedState, type, validIds) {
    const imported = normalizeState(importedState, type, validIds);
    if (!imported) return null;
    const local = normalizeState(localState, type, validIds);
    const higherVersion = local && State.compareVersions(local.version, imported.version) > 0
      ? local.version
      : imported.version;
    return normalizeState({
      ...imported,
      version: State.incrementVersion(higherVersion),
      revision: nextRevision(local?.revision, imported.revision)
    }, type, validIds);
  }

  function replaceImport(localValue, importedValue, options) {
    assertImportApis();
    const settings = options || {};
    const local = normalizeImportData(localValue, settings.validIdsByType);
    const imported = normalizeImportData(importedValue, settings.validIdsByType);
    const output = { states: {}, optional: {} };
    for (const type of TYPES) {
      if (!Object.hasOwn(imported.states, type)) continue;
      const allowed = settings.validIdsByType?.[type] instanceof Set ? settings.validIdsByType[type] : null;
      output.states[type] = replaceStateForImport(local.states[type], imported.states[type], type, allowed);
    }
    const localProfile = local.optional["dailyAtlas.profile.v1"] || Profile.emptyProfile();
    const importedProfile = imported.optional["dailyAtlas.profile.v1"] || Profile.emptyProfile();
    output.optional["dailyAtlas.profile.v1"] = Profile.replaceGeneration(
      importedProfile,
      localProfile.generation,
      settings.validIdsByType
    );
    for (const key of OPTIONAL_KEYS) {
      if (key === "dailyAtlas.profile.v1" || !Object.hasOwn(imported.optional, key)) continue;
      output.optional[key] = imported.optional[key];
    }
    return normalizeImportData(output, settings.validIdsByType);
  }

  function mergeImport(localValue, importedValue, options) {
    assertImportApis();
    const settings = options || {};
    const local = normalizeImportData(localValue, settings.validIdsByType);
    const imported = normalizeImportData(importedValue, settings.validIdsByType);
    const output = { states: {}, optional: {} };
    for (const type of TYPES) {
      const localState = local.states[type];
      const importedState = imported.states[type];
      if (!localState && !importedState) continue;
      if (!importedState) {
        output.states[type] = localState;
        continue;
      }
      const allowed = settings.validIdsByType?.[type] instanceof Set ? settings.validIdsByType[type] : null;
      output.states[type] = State.mergeImport(localState, importedState, type, allowed);
    }

    const profileKey = "dailyAtlas.profile.v1";
    const localProfile = local.optional[profileKey];
    const importedProfile = imported.optional[profileKey];
    if (importedProfile) {
      output.optional[profileKey] = Profile.mergeImport(localProfile, importedProfile, settings.validIdsByType);
    } else if (localProfile) {
      output.optional[profileKey] = localProfile;
    } else {
      output.optional[profileKey] = Profile.replaceGeneration(Profile.emptyProfile(), 0, settings.validIdsByType);
    }
    // Device settings are deliberately local-first. Importing them only fills
    // a setting that does not yet exist on this browser/device.
    for (const key of OPTIONAL_KEYS) {
      if (key === profileKey) continue;
      if (Object.hasOwn(local.optional, key)) output.optional[key] = local.optional[key];
      else if (Object.hasOwn(imported.optional, key)) output.optional[key] = imported.optional[key];
    }
    return normalizeImportData(output, settings.validIdsByType);
  }

  function difference(afterValues, beforeValues) {
    const before = new Set(beforeValues);
    return [...new Set(afterValues)].filter((value) => !before.has(value)).sort();
  }

  function stateDiff(before, after) {
    const beforeKnown = (before?.knownEntries || []).map((entry) => entry.id);
    const afterKnown = (after?.knownEntries || []).map((entry) => entry.id);
    const beforeSkipped = before?.skipped || [];
    const afterSkipped = after?.skipped || [];
    const knownAdded = difference(afterKnown, beforeKnown);
    const knownRemoved = difference(beforeKnown, afterKnown);
    const skippedAdded = difference(afterSkipped, beforeSkipped);
    const skippedRemoved = difference(beforeSkipped, afterSkipped);
    const currentBefore = before?.currentId || null;
    const currentAfter = after?.currentId || null;
    const dateBefore = before?.date || null;
    const dateAfter = after?.date || null;
    const sequenceBefore = before?.sequence || 0;
    const sequenceAfter = after?.sequence || 0;
    return {
      changed: Boolean(
        Boolean(before) !== Boolean(after) || knownAdded.length || knownRemoved.length || skippedAdded.length || skippedRemoved.length ||
        currentBefore !== currentAfter || dateBefore !== dateAfter || sequenceBefore !== sequenceAfter
      ),
      dateBefore,
      dateAfter,
      currentBefore,
      currentAfter,
      sequenceBefore,
      sequenceAfter,
      knownBefore: beforeKnown.length,
      knownAfter: afterKnown.length,
      knownAdded,
      knownRemoved,
      skippedBefore: beforeSkipped.length,
      skippedAfter: afterSkipped.length,
      skippedAdded,
      skippedRemoved
    };
  }

  function activeFeedback(profile, kind) {
    const output = [];
    for (const type of TYPES) {
      for (const [id, entry] of Object.entries(profile?.feedback?.[type] || {})) {
        if (entry?.[kind] === true) output.push(`${type}:${id}`);
      }
    }
    return output;
  }

  function profileDiff(beforeValue, afterValue, validIdsByType) {
    const before = Profile.normalize(beforeValue, validIdsByType);
    const after = Profile.normalize(afterValue, validIdsByType);
    const feedback = {};
    let feedbackChanged = 0;
    for (const kind of FEEDBACK_KINDS) {
      const beforeIds = activeFeedback(before, kind);
      const afterIds = activeFeedback(after, kind);
      const added = difference(afterIds, beforeIds);
      const removed = difference(beforeIds, afterIds);
      feedback[kind] = { before: beforeIds.length, after: afterIds.length, added, removed };
      feedbackChanged += added.length + removed.length;
    }
    const explicit = [];
    for (const [type, fields] of Object.entries(EXPLICIT_FIELDS)) {
      for (const field of Object.keys(fields)) {
        const first = before.explicit[type][field];
        const second = after.explicit[type][field];
        if (JSON.stringify(first) !== JSON.stringify(second)) explicit.push({ type, field, before: first, after: second });
      }
    }
    const settings = ["enabled", "themeLinking"]
      .filter((field) => before[field] !== after[field])
      .map((field) => ({ field, before: before[field], after: after[field] }));
    return {
      changed: Boolean(feedbackChanged || explicit.length || settings.length),
      generationBefore: before.generation,
      generationAfter: after.generation,
      feedback,
      explicit,
      settings
    };
  }

  function optionalAction(before, after) {
    if (before === undefined && after !== undefined) return "add";
    if (before !== undefined && after === undefined) return "remove";
    if (JSON.stringify(before) === JSON.stringify(after)) return "unchanged";
    return "replace";
  }

  function diffImport(localValue, proposedValue, options) {
    assertImportApis();
    const settings = options || {};
    const local = normalizeImportData(localValue, settings.validIdsByType);
    const proposed = normalizeImportData(proposedValue, settings.validIdsByType);
    const states = Object.fromEntries(TYPES.map((type) => [type, stateDiff(local.states[type], proposed.states[type])]));
    const beforeProfile = local.optional["dailyAtlas.profile.v1"];
    const afterProfile = proposed.optional["dailyAtlas.profile.v1"];
    const profile = profileDiff(beforeProfile, afterProfile, settings.validIdsByType);
    const optional = {};
    for (const key of OPTIONAL_KEYS) {
      if (key === "dailyAtlas.profile.v1") continue;
      optional[key] = optionalAction(local.optional[key], proposed.optional[key]);
    }
    const totals = {
      stateTypesChanged: Object.values(states).filter((entry) => entry.changed).length,
      knownAdded: Object.values(states).reduce((sum, entry) => sum + entry.knownAdded.length, 0),
      knownRemoved: Object.values(states).reduce((sum, entry) => sum + entry.knownRemoved.length, 0),
      skippedAdded: Object.values(states).reduce((sum, entry) => sum + entry.skippedAdded.length, 0),
      skippedRemoved: Object.values(states).reduce((sum, entry) => sum + entry.skippedRemoved.length, 0),
      feedbackAdded: FEEDBACK_KINDS.reduce((sum, kind) => sum + profile.feedback[kind].added.length, 0),
      feedbackRemoved: FEEDBACK_KINDS.reduce((sum, kind) => sum + profile.feedback[kind].removed.length, 0),
      explicitFieldsChanged: profile.explicit.length,
      settingsChanged: profile.settings.length,
      optionalAdded: Object.values(optional).filter((action) => action === "add").length,
      optionalReplaced: Object.values(optional).filter((action) => action === "replace").length,
      optionalRemoved: Object.values(optional).filter((action) => action === "remove").length
    };
    const hasChanges = Boolean(
      totals.stateTypesChanged || profile.changed || totals.optionalAdded || totals.optionalReplaced || totals.optionalRemoved
    );
    return { hasChanges, states, profile, optional, totals };
  }

  function previewImport(localValue, importedValue, options) {
    const settings = options || {};
    const mode = settings.mode || "replace";
    if (mode !== "replace" && mode !== "merge") throw new TypeError("Import preview mode must be replace or merge");
    const result = mode === "merge"
      ? mergeImport(localValue, importedValue, settings)
      : replaceImport(localValue, importedValue, settings);
    const diff = diffImport(localValue, result, settings);
    return { mode, hasChanges: diff.hasChanges, result, diff };
  }

  function exactWrite(storage, key, value) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error(`Storage verification failed for ${key}`);
  }

  function snapshotMatches(storage, entries, field) {
    try { return entries.every((entry) => storage.getItem(entry.key) === entry[field]); }
    catch (_error) { return false; }
  }

  function storedValue(value) {
    return value === null || typeof value === "string";
  }

  function validOperation(value) {
    return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
  }

  function normalizeJournalEntries(entries, requireFullSet) {
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > TARGET_KEYS.length) return null;
    if (requireFullSet && entries.length !== TARGET_KEYS.length) return null;
    const byKey = new Map();
    const ordered = [];
    for (const entry of entries) {
      if (!isObject(entry) || !TARGET_KEYS.includes(entry.key) || byKey.has(entry.key) ||
          !storedValue(entry.before) || !storedValue(entry.after)) return null;
      const clean = { key: entry.key, before: entry.before, after: entry.after };
      byKey.set(entry.key, clean);
      ordered.push(clean);
    }
    if (requireFullSet && !TARGET_KEYS.every((key) => byKey.has(key))) return null;
    return requireFullSet ? TARGET_KEYS.map((key) => byKey.get(key)) : ordered;
  }

  function normalizeJournal(raw) {
    if (!isObject(raw)) return null;
    if (raw.schemaVersion === LEGACY_JOURNAL_VERSION) {
      const entries = normalizeJournalEntries(raw.entries, true);
      return entries ? { operation: "import", forwardOnly: raw.forwardOnly === true, entries } : null;
    }
    if (raw.schemaVersion !== JOURNAL_VERSION) return null;
    const entries = normalizeJournalEntries(raw.entries, false);
    if (!entries) return null;
    // A few pre-v3 fixtures followed the exported JOURNAL_VERSION constant but
    // did not carry an operation field. Accept that shape only for the complete
    // ten-key import set; subset journals must always identify their operation.
    const operation = validOperation(raw.operation)
      ? raw.operation
      : raw.operation === undefined && entries.length === TARGET_KEYS.length ? "import" : null;
    return operation ? { operation, forwardOnly: raw.forwardOnly === true, entries } : null;
  }

  function memoryOnlyRecovery(error) {
    const recovery = {
      ok: true,
      status: "storage-unavailable-memory-only",
      dataRestored: false,
      journalCleared: false,
      persistenceAvailable: false
    };
    if (error !== undefined) recovery.error = error;
    return recovery;
  }

  function recoverPending(storage) {
    let serialized;
    try { serialized = storage.getItem(PENDING_KEY); }
    catch (error) {
      return { ok: false, status: "journal-read-failed", dataRestored: false, journalCleared: false, error };
    }
    if (serialized === null) return { ok: true, status: "no-pending", dataRestored: true, journalCleared: true };
    const journal = normalizeJournal(parseJson(serialized));
    if (!journal) return { ok: false, status: "invalid-journal", dataRestored: false, journalCleared: false };
    const allBefore = snapshotMatches(storage, journal.entries, "before");
    if (allBefore) {
      try {
        exactWrite(storage, PENDING_KEY, null);
        return { ok: true, status: "rolled-back", dataState: "before", dataRestored: true, journalCleared: true };
      } catch (error) {
        try {
          if (storage.getItem(PENDING_KEY) === null) {
            return { ok: true, status: "rolled-back", dataState: "before", dataRestored: true, journalCleared: true };
          }
        } catch (_readError) {}
        return { ok: false, status: "rollback-complete-journal-retained", dataState: "before", dataRestored: true, journalCleared: false, error };
      }
    }
    const targetField = journal.forwardOnly ? "after" : "before";
    const successStatus = journal.forwardOnly ? "committed" : "rolled-back";
    const successState = journal.forwardOnly ? "after" : "before";
    let firstError = null;
    for (const entry of journal.entries) {
      try { exactWrite(storage, entry.key, entry[targetField]); }
      catch (error) { if (!firstError) firstError = error; }
    }
    const dataComplete = snapshotMatches(storage, journal.entries, targetField);
    if (!dataComplete) {
      return { ok: false, status: `${successStatus === "committed" ? "commit" : "rollback"}-incomplete`, dataState: "mixed", dataRestored: false, journalCleared: false, error: firstError };
    }
    try {
      exactWrite(storage, PENDING_KEY, null);
      return { ok: true, status: successStatus, dataState: successState, dataRestored: true, journalCleared: true };
    } catch (error) {
      try {
        if (storage.getItem(PENDING_KEY) === null) {
          return { ok: true, status: successStatus, dataState: successState, dataRestored: true, journalCleared: true };
        }
      } catch (_readError) {}
      return { ok: false, status: `${successStatus === "committed" ? "commit" : "rollback"}-complete-journal-retained`, dataState: successState, dataRestored: true, journalCleared: false, error };
    }
  }

  function makeApplyError(original, recovery, code, entries) {
    const originalMessage = original instanceof Error ? original.message : String(original || "unknown error");
    const error = new Error(`Local data transaction failed (${originalMessage}); recovery status: ${recovery.status}`);
    error.name = "BackupApplyError";
    error.code = code;
    error.cause = original;
    error.recovery = recovery;
    error.recoveryComplete = recovery.ok === true && recovery.journalCleared === true;
    error.rollbackComplete = recovery.status === "rolled-back";
    error.dataState = entries && snapshotMatchesSafe(entries, recovery, code);
    return error;
  }

  function snapshotMatchesSafe(_entries, recovery, code) {
    if (["JOURNAL_PREPARE_FAILED", "READ_BEFORE_FAILED"].includes(code) && recovery.status === "no-pending") return "before";
    if (recovery.dataState === "before" || recovery.status === "rolled-back") return "before";
    if (recovery.dataState === "after" || recovery.status === "committed") return "after";
    return "unknown";
  }

  function normalizeAtomicEntries(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > TARGET_KEYS.length) {
      throw new TypeError(`Atomic entries must contain between one and ${TARGET_KEYS.length} allowlisted storage keys`);
    }
    const seen = new Set();
    return value.map((entry) => {
      if (!isObject(entry) || !TARGET_KEYS.includes(entry.key) || seen.has(entry.key)) {
        throw new TypeError("Atomic entries must use unique allowlisted storage keys");
      }
      const after = Object.hasOwn(entry, "value") ? entry.value : entry.after;
      if (!storedValue(after)) throw new TypeError(`Atomic value for ${entry.key} must be a string or null`);
      seen.add(entry.key);
      return { key: entry.key, after };
    });
  }

  function assertRecovered(storage) {
    const priorRecovery = recoverPending(storage);
    if (!priorRecovery.ok) {
      throw makeApplyError(priorRecovery.error || new Error("A previous transaction still needs recovery"), priorRecovery, "PENDING_RECOVERY_INCOMPLETE");
    }
    return priorRecovery;
  }

  function applyNormalizedEntries(storage, writes, settings) {
    let entries;
    try {
      entries = writes.map(({ key, after }) => ({ key, before: storage.getItem(key), after }));
    } catch (error) {
      throw makeApplyError(error, { ok: true, status: "no-pending", dataRestored: true, journalCleared: true }, "READ_BEFORE_FAILED");
    }
    const operation = settings.operation;
    const journal = JSON.stringify({
      schemaVersion: JOURNAL_VERSION,
      transactionId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startedAt: new Date().toISOString(),
      operation,
      forwardOnly: settings.forwardOnly === true,
      entries
    });

    let journalPrepared = false;
    try {
      exactWrite(storage, PENDING_KEY, journal);
      journalPrepared = true;
      for (const entry of entries) exactWrite(storage, entry.key, entry.after);
      if (!snapshotMatches(storage, entries, "after")) throw new Error("Final import verification failed");
      exactWrite(storage, PENDING_KEY, null);
      return entries.length;
    } catch (original) {
      const recovery = recoverPending(storage);
      if ((journalPrepared && recovery.status === "no-pending" && snapshotMatches(storage, entries, "after")) || recovery.status === "committed") return entries.length;
      const code = !journalPrepared && recovery.status === "no-pending"
        ? "JOURNAL_PREPARE_FAILED"
        : recovery.status === "rolled-back" ? "APPLY_ROLLED_BACK" : "APPLY_RECOVERY_INCOMPLETE";
      throw makeApplyError(original, recovery, code, entries);
    }
  }

  function applyEntriesAtomically(storage, entries, options) {
    const writes = normalizeAtomicEntries(entries);
    const settings = options || {};
    const operation = settings.operation === undefined ? "ordinary" : settings.operation;
    if (!validOperation(operation)) throw new TypeError("Atomic operation must be a lowercase identifier of at most 64 characters");
    assertRecovered(storage);
    return applyNormalizedEntries(storage, writes, { operation, forwardOnly: settings.forwardOnly === true });
  }

  function apply(storage, normalized) {
    assertRecovered(storage);
    const clean = normalizeImportData(normalized);
    const importedProfile = clean.optional["dailyAtlas.profile.v1"];
    const writes = [{ key: "dailyAtlas.profile.v1", after: importedProfile ? JSON.stringify(importedProfile) : null }];
    for (const type of TYPES) writes.push({ key: `${STATE_PREFIX}${type}`, after: clean.states[type] ? JSON.stringify(clean.states[type]) : null });
    for (const key of OPTIONAL_KEYS) {
      if (key !== "dailyAtlas.profile.v1") writes.push({ key, after: clean.optional[key] ? JSON.stringify(clean.optional[key]) : null });
    }
    // Production replace and merge previews always produce a generation-bearing
    // profile before app.js applies them, so a crash can complete forward. Preserve the
    // legacy library boundary for profile-less normalized payloads: without a
    // generation fence they roll back instead of deleting newer local state.
    const forwardOnly = isObject(importedProfile) && importedProfile.schemaVersion === 1 &&
      Number.isSafeInteger(importedProfile.generation) && importedProfile.generation >= 0;
    return applyNormalizedEntries(storage, writes, { operation: "import", forwardOnly });
  }

  return Object.freeze({
    FORMAT,
    SCHEMA_VERSION,
    TYPES,
    STATE_PREFIX,
    OPTIONAL_KEYS,
    PENDING_KEY,
    TARGET_KEYS,
    LEGACY_JOURNAL_VERSION,
    JOURNAL_VERSION,
    MAX_BYTES,
    collect,
    serialize,
    validate,
    parseText,
    replaceImport,
    mergeImport,
    diffImport,
    previewImport,
    memoryOnlyRecovery,
    recoverPending,
    applyEntriesAtomically,
    apply
  });
});
