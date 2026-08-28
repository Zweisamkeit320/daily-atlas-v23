(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function safeSequence(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function safeVersion(value) {
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return value.replace(/^0+(?=\d)/, "");
    }
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : "0";
  }

  function incrementVersion(value) {
    const digits = safeVersion(value).split("");
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      if (digits[index] !== "9") {
        digits[index] = String(Number(digits[index]) + 1);
        return digits.join("");
      }
      digits[index] = "0";
    }
    return `1${digits.join("")}`;
  }

  function compareVersions(left, right) {
    const a = safeVersion(left);
    const b = safeVersion(right);
    if (a.length !== b.length) return a.length > b.length ? 1 : -1;
    return a === b ? 0 : a > b ? 1 : -1;
  }

  function validKnownV2(value, types) {
    return Boolean(
      isPlainObject(value) &&
      value.schemaVersion === 2 &&
      types.every((type) => Array.isArray(value[type]))
    );
  }

  function validDailyV2(value, types) {
    return Boolean(
      isPlainObject(value) &&
      value.schemaVersion === 2 &&
      typeof value.date === "string" &&
      isPlainObject(value.current) &&
      isPlainObject(value.sequence) &&
      isPlainObject(value.skipped) &&
      types.every((type) => Array.isArray(value.skipped[type]))
    );
  }

  function validLegacyKnown(value) {
    return isPlainObject(value) && (Array.isArray(value.book) || Array.isArray(value.movie));
  }

  function validLegacyDaily(value) {
    return isPlainObject(value) && typeof value.date === "string";
  }

  function validTypeState(value, type) {
    return Boolean(
      isPlainObject(value) &&
      value.schemaVersion === 3 &&
      value.type === type &&
      typeof value.date === "string" &&
      Array.isArray(value.knownEntries) &&
      Array.isArray(value.skipped)
    );
  }

  function normalizeKnownEntries(entries, validIds) {
    const allowed = validIds instanceof Set ? validIds : new Set(validIds || []);
    const byId = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || !allowed.has(entry.id)) continue;
      const at = typeof entry.at === "string" && !Number.isNaN(Date.parse(entry.at))
        ? entry.at
        : "1970-01-01T00:00:00.000Z";
      byId.set(entry.id, { id: entry.id, at });
    }
    return [...byId.values()].sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
  }

  function normalizeLegacyOrder(knownByType, rawOrder, types) {
    const output = [];
    const seen = new Set();
    for (const entry of Array.isArray(rawOrder) ? rawOrder : []) {
      if (!entry || !types.includes(entry.type) || !knownByType[entry.type]?.includes(entry.id)) continue;
      const key = `${entry.type}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({ type: entry.type, id: entry.id });
    }
    for (const type of types) {
      for (const id of knownByType[type] || []) {
        const key = `${type}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push({ type, id });
      }
    }
    return output;
  }

  function entriesFromLegacy(type, knownIds, normalizedOrder) {
    const positions = new Map();
    normalizedOrder.forEach((entry, index) => {
      if (entry.type === type) positions.set(entry.id, index);
    });
    return (knownIds || []).map((id, index) => ({
      id,
      at: new Date(positions.has(id) ? positions.get(id) : normalizedOrder.length + index).toISOString()
    }));
  }

  function safeIdentifier(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 300 &&
      !["__proto__", "prototype", "constructor"].includes(value);
  }

  function normalizeTypeState(value, type, validIds) {
    if (!validTypeState(value, type)) return null;
    const allowed = validIds instanceof Set ? validIds : null;
    const knownById = new Map();
    for (const entry of value.knownEntries) {
      if (!isPlainObject(entry) || !safeIdentifier(entry.id) || (allowed && !allowed.has(entry.id))) continue;
      const at = typeof entry.at === "string" && !Number.isNaN(Date.parse(entry.at))
        ? new Date(entry.at).toISOString()
        : "1970-01-01T00:00:00.000Z";
      if (!knownById.has(entry.id)) knownById.set(entry.id, { id: entry.id, at });
    }
    const skipped = [];
    const skippedIds = new Set();
    for (const id of value.skipped) {
      if (!safeIdentifier(id) || (allowed && !allowed.has(id)) || skippedIds.has(id)) continue;
      skippedIds.add(id);
      skipped.push(id);
    }
    let currentId = safeIdentifier(value.currentId) && (!allowed || allowed.has(value.currentId))
      ? value.currentId
      : null;
    if (knownById.has(currentId) || skippedIds.has(currentId)) currentId = null;
    return {
      schemaVersion: 3,
      type,
      date: typeof value.date === "string" && value.date.length <= 40 ? value.date : "",
      revision: safeSequence(value.revision),
      version: safeVersion(value.version ?? value.revision),
      currentId,
      sequence: safeSequence(value.sequence),
      skipped,
      knownEntries: [...knownById.values()]
    };
  }

  function mergeImport(localValue, importedValue, type, validIds) {
    const local = normalizeTypeState(localValue, type, validIds);
    const imported = normalizeTypeState(importedValue, type, validIds);
    if (!local && !imported) return null;
    if (!imported) return local;

    const knownById = new Map();
    for (const entry of [...(local?.knownEntries || []), ...imported.knownEntries]) {
      const existing = knownById.get(entry.id);
      if (!existing || entry.at.localeCompare(existing.at) < 0) knownById.set(entry.id, { ...entry });
    }
    const sameDay = Boolean(local && local.date === imported.date);
    const skipped = [...new Set(sameDay ? [...local.skipped, ...imported.skipped] : local ? local.skipped : imported.skipped)];
    const currentId = local ? local.currentId : imported.currentId;

    // A visible local card is the user's immediate context. If an imported
    // snapshot records that same ID as known/skipped, keep it visible and drop
    // only that contradictory imported marker; all other known IDs are a union.
    if (currentId) {
      knownById.delete(currentId);
      const index = skipped.indexOf(currentId);
      if (index >= 0) skipped.splice(index, 1);
    }
    const knownIds = new Set(knownById.keys());
    const cleanSkipped = skipped.filter((id) => !knownIds.has(id));
    const higherVersion = !local || compareVersions(imported.version, local.version) >= 0
      ? imported.version
      : local.version;
    const higherRevision = Math.max(local?.revision || 0, imported.revision);
    const merged = {
      schemaVersion: 3,
      type,
      date: local ? local.date : imported.date,
      revision: higherRevision >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : higherRevision + 1,
      version: incrementVersion(higherVersion),
      currentId,
      sequence: Math.max(local?.sequence || 0, imported.sequence),
      skipped: cleanSkipped,
      knownEntries: [...knownById.values()].sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id))
    };
    return normalizeTypeState(merged, type, validIds);
  }

  return Object.freeze({
    isPlainObject,
    safeSequence,
    safeVersion,
    incrementVersion,
    compareVersions,
    validKnownV2,
    validDailyV2,
    validLegacyKnown,
    validLegacyDaily,
    validTypeState,
    normalizeKnownEntries,
    normalizeLegacyOrder,
    entriesFromLegacy,
    normalizeTypeState,
    mergeImport
  });
});
