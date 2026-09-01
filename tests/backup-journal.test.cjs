const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const Backup = require("../backup.js");
const Music = require("../music.js");

const OPTIONAL_KEYS = Backup.OPTIONAL_KEYS;
const TARGET_KEYS = [
  "dailyAtlas.profile.v1",
  ...Backup.TYPES.map((type) => `${Backup.STATE_PREFIX}${type}`),
  ...OPTIONAL_KEYS.filter((key) => key !== "dailyAtlas.profile.v1")
];

class FaultStorage {
  constructor(entries, sharedValues) {
    this.values = sharedValues || new Map(Object.entries(entries || {}));
    this.mutation = 0;
    this.fault = null;
  }

  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }

  setItem(key, value) {
    this.#mutate(() => this.values.set(key, String(value)));
  }

  removeItem(key) {
    this.#mutate(() => this.values.delete(key));
  }

  arm(at, options) {
    this.mutation = 0;
    this.fault = { at, after: options?.after === true, persistent: options?.persistent === true, triggered: false };
  }

  disarm() {
    this.fault = null;
    this.mutation = 0;
  }

  #mutate(action) {
    this.mutation += 1;
    const fault = this.fault;
    const shouldFail = fault && this.mutation >= fault.at && (fault.persistent || !fault.triggered);
    if (!shouldFail) {
      action();
      return;
    }
    fault.triggered = true;
    if (!fault.after) throw new Error(`storage-fault-before-${this.mutation}`);
    action();
    throw new Error(`storage-fault-after-${this.mutation}`);
  }
}

function state(type, currentId, version = "4") {
  return {
    schemaVersion: 3,
    type,
    date: "2026-08-12",
    revision: 4,
    version,
    currentId,
    sequence: 3,
    skipped: [],
    knownEntries: []
  };
}

function profile(generation, favorite) {
  const timestamp = `2026-08-12T00:00:0${generation}.000Z`;
  return {
    schemaVersion: 1,
    generation,
    updatedAt: timestamp,
    enabled: true,
    themeLinking: true,
    feedback: {
      book: {
        "book-1": {
          liked: false,
          favorite,
          unsuitable: false,
          updatedAt: timestamp,
          updatedAtByKind: { liked: timestamp, favorite: timestamp, unsuitable: timestamp }
        }
      },
      movie: {}, city: {}, german: {}, medical: {}
    },
    explicit: {
      book: { genres: ["history"], eras: [], popularity: [] },
      movie: { genres: [], eras: [], popularity: [] },
      city: { regions: ["欧洲"] },
      german: { levels: ["B1"] },
      medical: { topicGroups: ["睡眠"] }
    },
    updatedAtByField: {
      enabled: timestamp,
      themeLinking: timestamp,
      explicit: {
        book: { genres: timestamp, eras: timestamp, popularity: timestamp },
        movie: { genres: timestamp, eras: timestamp, popularity: timestamp },
        city: { regions: timestamp },
        german: { levels: timestamp },
        medical: { topicGroups: timestamp }
      }
    }
  };
}

function importData() {
  return {
    states: Object.fromEntries(Backup.TYPES.map((type) => [type, state(type, `${type}-new`, "9")])),
    optional: {
      "dailyAtlas.profile.v1": profile(7, true),
      "dailyAtlas.appearance.v1": { schemaVersion: 1, color: "sky", style: "aurora" },
      "dailyAtlas.audio.v1": { volume: 0.31 },
      "dailyAtlas.audio.v2": { volume: 0.31, trackId: "rainy-study" },
      "dailyAtlas.speech.v1": { voiceURI: "de-test" },
      "dailyAtlas.reminder.v1": { schemaVersion: 1, enabled: true, time: "09:15", lastNotifiedDate: "2026-08-11" }
    }
  };
}

function initialEntries() {
  return Object.fromEntries(TARGET_KEYS.map((key, index) => [key, JSON.stringify({ old: index, marker: key })]));
}

function snapshot(storage) {
  return Object.fromEntries(TARGET_KEYS.map((key) => [key, storage.getItem(key)]));
}

function isSameSnapshot(left, right) {
  return TARGET_KEYS.every((key) => left[key] === right[key]);
}

function selectedSnapshot(storage, keys) {
  return Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]));
}

function sameSelected(left, right, keys) {
  return keys.every((key) => left[key] === right[key]);
}

function atomicWrites(keys, marker) {
  return keys.map((key, index) => ({ key, value: JSON.stringify({ marker, index, key }) }));
}

function canonicalAtomicAfter(keys, operation) {
  const storage = new FaultStorage(initialEntries());
  assert.equal(Backup.applyEntriesAtomically(storage, atomicWrites(keys, "after"), { operation }), keys.length);
  assert.equal(storage.getItem(Backup.PENDING_KEY), null);
  return selectedSnapshot(storage, keys);
}

function browserContextWithStorage(storage, descriptor) {
  const context = { document: {} };
  context.globalThis = context;
  if (descriptor) Object.defineProperty(context, "localStorage", descriptor);
  else context.localStorage = storage;
  const source = fs.readFileSync(path.resolve(__dirname, "..", "backup.js"), "utf8");
  vm.runInNewContext(source, context, { filename: "backup.js" });
  return context;
}

function canonicalAfter(data) {
  const storage = new FaultStorage(initialEntries());
  assert.equal(Backup.apply(storage, data), TARGET_KEYS.length);
  assert.equal(storage.getItem(Backup.PENDING_KEY), null);
  return snapshot(storage);
}

test("collect and validate use field-level schemas and discard secrets and prototype keys", () => {
  const maliciousProfile = JSON.parse(JSON.stringify(profile(3, true)));
  maliciousProfile.secret = "TOP_SECRET_PROFILE";
  maliciousProfile.feedback.book["book-1"].secret = "TOP_SECRET_ENTRY";
  maliciousProfile.updatedAtByField.secret = "TOP_SECRET_CLOCK";
  maliciousProfile.explicit.book.secret = ["TOP_SECRET_EXPLICIT"];
  Object.defineProperty(maliciousProfile.feedback.book, "__proto__", {
    value: { liked: true, secret: "TOP_SECRET_PROTO" }, enumerable: true
  });
  const rawState = { ...state("book", "book-1"), secret: "TOP_SECRET_STATE" };
  rawState.knownEntries = [{ id: "book-2", at: "2026-08-12T00:00:00.000Z", secret: "TOP_SECRET_KNOWN" }];
  const storage = new FaultStorage({
    "dailyAtlas.state.v3.book": JSON.stringify(rawState),
    "dailyAtlas.profile.v1": JSON.stringify(maliciousProfile),
    "dailyAtlas.appearance.v1": JSON.stringify({
      schemaVersion: 1, color: "sky", style: "aurora", density: "compact", dataSaver: true,
      textSize: "large", contrast: "high", motion: "reduce", token: "TOP_SECRET_APPEARANCE"
    }),
    "dailyAtlas.audio.v1": JSON.stringify({ volume: 0.4, token: "TOP_SECRET_AUDIO1" }),
    "dailyAtlas.audio.v2": JSON.stringify({ volume: 0.5, trackId: "rainy-study", token: "TOP_SECRET_AUDIO2" }),
    "dailyAtlas.speech.v1": JSON.stringify({ voiceURI: "voice", token: "TOP_SECRET_SPEECH" }),
    "dailyAtlas.reminder.v1": JSON.stringify({ schemaVersion: 1, enabled: true, time: "08:30", lastNotifiedDate: null, token: "TOP_SECRET_REMINDER" })
  });
  const exported = Backup.serialize(storage);
  assert.equal(exported.includes("TOP_SECRET"), false);
  assert.equal(exported.includes("__proto__"), false);

  const payload = JSON.parse(exported);
  payload.optional["unknown.secret.key"] = { token: "TOP_SECRET_OPTIONAL" };
  const checked = Backup.validate(payload, {
    book: new Set(["book-1", "book-2"]), movie: new Set(), city: new Set(), german: new Set(), medical: new Set()
  });
  assert.equal(checked.ok, true);
  assert.deepEqual(Object.keys(checked.normalized.states.book), [
    "schemaVersion", "type", "date", "revision", "version", "currentId", "sequence", "skipped", "knownEntries"
  ]);
  assert.deepEqual(Object.keys(checked.normalized.optional["dailyAtlas.audio.v2"]), ["volume", "trackId"]);
  assert.deepEqual(Object.keys(checked.normalized.optional["dailyAtlas.appearance.v1"]), [
    "schemaVersion", "color", "style", "density", "dataSaver", "textSize", "contrast", "motion"
  ]);
  assert.deepEqual(Object.keys(checked.normalized.optional["dailyAtlas.speech.v1"]), ["voiceURI"]);
  assert.deepEqual(Object.keys(checked.normalized.optional["dailyAtlas.reminder.v1"]), ["schemaVersion", "enabled", "time", "lastNotifiedDate"]);
  assert.deepEqual(Object.keys(checked.normalized.optional["dailyAtlas.profile.v1"]), [
    "schemaVersion", "generation", "updatedAt", "enabled", "themeLinking", "feedback", "explicit", "updatedAtByField"
  ]);
  assert.equal(Object.hasOwn(checked.normalized.optional, "unknown.secret.key"), false);
  assert.equal(Object.hasOwn(checked.normalized.optional["dailyAtlas.profile.v1"].feedback.book, "__proto__"), false);
  assert.equal(Object.prototype.polluted, undefined);

  checked.normalized.states.book.secret = "TOP_SECRET_BYPASS_STATE";
  checked.normalized.optional["dailyAtlas.profile.v1"].secret = "TOP_SECRET_BYPASS_PROFILE";
  checked.normalized.optional["dailyAtlas.audio.v2"].secret = "TOP_SECRET_BYPASS_AUDIO";
  checked.normalized.optional["dailyAtlas.appearance.v1"].secret = "TOP_SECRET_BYPASS_APPEARANCE";
  checked.normalized.optional["unknown.secret.key"] = { secret: "TOP_SECRET_BYPASS_KEY" };
  const target = new FaultStorage();
  Backup.apply(target, checked.normalized);
  const appliedBytes = TARGET_KEYS.map((key) => target.getItem(key) || "").join("\n");
  assert.equal(appliedBytes.includes("TOP_SECRET"), false);
  assert.equal(appliedBytes.includes("__proto__"), false);
});

test("backup preserves every selectable music track ID", () => {
  assert.equal(Music.TRACKS.length, 100);
  for (const track of Music.TRACKS) {
    const storage = new FaultStorage({
      "dailyAtlas.audio.v2": JSON.stringify({ volume: 0.31, trackId: track.id, secret: "DROP" })
    });
    const exported = Backup.collect(storage);
    assert.deepEqual(exported.optional["dailyAtlas.audio.v2"], { volume: 0.31, trackId: track.id }, track.id);
  }
});

test("a simulated crash leaves a complete profile-first journal and a fresh startup finishes it forward", () => {
  const storage = new FaultStorage(initialEntries());
  const before = snapshot(storage);
  const after = canonicalAfter(importData());
  storage.arm(3, { after: false, persistent: true });
  assert.throws(() => Backup.apply(storage, importData()), (error) => {
    assert.equal(error.code, "APPLY_RECOVERY_INCOMPLETE");
    assert.equal(error.recoveryComplete, false);
    return true;
  });
  const journalText = storage.getItem(Backup.PENDING_KEY);
  assert.ok(journalText);
  const journal = JSON.parse(journalText);
  assert.equal(journal.schemaVersion, Backup.JOURNAL_VERSION);
  assert.equal(journal.operation, "import");
  assert.equal(journal.forwardOnly, true);
  assert.deepEqual(journal.entries.map((entry) => entry.key), TARGET_KEYS);
  assert.equal(journal.entries[0].key, "dailyAtlas.profile.v1");
  assert.deepEqual(Object.fromEntries(journal.entries.map((entry) => [entry.key, entry.before])), before);
  assert.ok(journal.entries.every((entry) => Object.hasOwn(entry, "after")));

  storage.disarm();
  assert.deepEqual(Backup.recoverPending(storage), {
    ok: true, status: "committed", dataState: "after", dataRestored: true, journalCleared: true
  });
  assert.deepEqual(snapshot(storage), after);
});

test("one-shot failures before and after every mutation leave an all-old or all-new snapshot", () => {
  const data = importData();
  const before = snapshot(new FaultStorage(initialEntries()));
  const after = canonicalAfter(data);
  const mutationCount = TARGET_KEYS.length + 2;
  for (const afterWrite of [false, true]) {
    for (let point = 1; point <= mutationCount; point += 1) {
      const storage = new FaultStorage(initialEntries());
      storage.arm(point, { after: afterWrite, persistent: false });
      let result = null;
      let error = null;
      try { result = Backup.apply(storage, data); } catch (caught) { error = caught; }
      const current = snapshot(storage);
      assert.ok(isSameSnapshot(current, before) || isSameSnapshot(current, after), `mixed snapshot at ${afterWrite ? "after" : "before"} mutation ${point}`);
      assert.equal(storage.getItem(Backup.PENDING_KEY), null, `journal retained at one-shot mutation ${point}`);
      if (result !== null) assert.equal(result, TARGET_KEYS.length);
      else {
        assert.ok(error instanceof Error);
        assert.notEqual(error.code, "APPLY_RECOVERY_INCOMPLETE");
      }
    }
  }
});

test("persistent storage failure retains a journal until startup can converge to all old or all new", () => {
  const data = importData();
  const before = snapshot(new FaultStorage(initialEntries()));
  const after = canonicalAfter(data);
  const mutationCount = TARGET_KEYS.length + 2;
  for (const afterWrite of [false, true]) {
    for (let point = 1; point <= mutationCount; point += 1) {
      const storage = new FaultStorage(initialEntries());
      storage.arm(point, { after: afterWrite, persistent: true });
      let result = null;
      let error = null;
      try { result = Backup.apply(storage, data); } catch (caught) { error = caught; }
      const pending = storage.getItem(Backup.PENDING_KEY);
      if (pending) {
        assert.ok(error);
        assert.equal(error.code, "APPLY_RECOVERY_INCOMPLETE");
        assert.equal(error.recoveryComplete, false);
        const restarted = new FaultStorage(null, storage.values);
        const recovered = Backup.recoverPending(restarted);
        assert.equal(recovered.ok, true);
        assert.equal(recovered.journalCleared, true);
        assert.ok(["rolled-back", "committed"].includes(recovered.status));
        assert.deepEqual(snapshot(restarted), recovered.status === "committed" ? after : before);
        assert.equal(restarted.getItem(Backup.PENDING_KEY), null);
      } else {
        assert.ok(isSameSnapshot(snapshot(storage), before) || isSameSnapshot(snapshot(storage), after));
        if (result !== null) assert.equal(result, TARGET_KEYS.length);
        else assert.equal(error.recoveryComplete, true);
      }
    }
  }
});

test("a persistent journal-write failure touches no business key and never claims success", () => {
  const storage = new FaultStorage(initialEntries());
  const before = snapshot(storage);
  storage.arm(1, { after: false, persistent: true });
  assert.throws(() => Backup.apply(storage, importData()), (error) => {
    assert.equal(error.code, "JOURNAL_PREPARE_FAILED");
    assert.equal(error.dataState, "before");
    return true;
  });
  assert.deepEqual(snapshot(storage), before);
  assert.equal(storage.getItem(Backup.PENDING_KEY), null);
});

test("invalid or uncleared journals are retained and block a new import", () => {
  const malformed = new FaultStorage({ [Backup.PENDING_KEY]: JSON.stringify({ schemaVersion: 2, entries: [] }) });
  const outcome = Backup.recoverPending(malformed);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, "invalid-journal");
  assert.ok(malformed.getItem(Backup.PENDING_KEY));
  assert.throws(() => Backup.apply(malformed, importData()), (error) => {
    assert.equal(error.code, "PENDING_RECOVERY_INCOMPLETE");
    return true;
  });
});

test("atomic entry API accepts only unique allowlisted keys and string-or-null values", () => {
  const storage = new FaultStorage(initialEntries());
  const before = snapshot(storage);
  const validKey = TARGET_KEYS[0];
  const invalidCases = [
    [],
    [{ key: "unknown.key", value: "x" }],
    [{ key: Backup.PENDING_KEY, value: "x" }],
    [{ key: validKey, value: "x" }, { key: validKey, value: "y" }],
    [{ key: validKey, value: { not: "serialized" } }]
  ];
  for (const entries of invalidCases) {
    assert.throws(() => Backup.applyEntriesAtomically(storage, entries), TypeError);
    assert.deepEqual(snapshot(storage), before);
    assert.equal(storage.getItem(Backup.PENDING_KEY), null);
  }
  assert.throws(
    () => Backup.applyEntriesAtomically(storage, [{ key: validKey, value: "x" }], { operation: "Not Allowed" }),
    TypeError
  );
  assert.deepEqual(snapshot(storage), before);

  assert.equal(Backup.applyEntriesAtomically(storage, [{ key: validKey, value: null }], { operation: "single-key" }), 1);
  assert.equal(storage.getItem(validKey), null);
  assert.equal(storage.getItem(Backup.PENDING_KEY), null);
});

test("v3 subset journals roll ordinary two-key and five-key operations back at every one-shot fault", () => {
  const cases = [
    { operation: "unsuitable", keys: [TARGET_KEYS[0], TARGET_KEYS[2]] },
    { operation: "reset-known", keys: TARGET_KEYS.slice(1, 6) }
  ];
  for (const { operation, keys } of cases) {
    const before = selectedSnapshot(new FaultStorage(initialEntries()), keys);
    const after = canonicalAtomicAfter(keys, operation);
    const mutationCount = keys.length + 2;
    for (const afterWrite of [false, true]) {
      for (let point = 1; point <= mutationCount; point += 1) {
        const storage = new FaultStorage(initialEntries());
        storage.arm(point, { after: afterWrite, persistent: false });
        let result = null;
        let error = null;
        try {
          result = Backup.applyEntriesAtomically(storage, atomicWrites(keys, "after"), { operation });
        } catch (caught) {
          error = caught;
        }
        const current = selectedSnapshot(storage, keys);
        if (result !== null) {
          assert.equal(result, keys.length, `${operation} result at ${afterWrite ? "after" : "before"} ${point}`);
          assert.ok(sameSelected(current, after, keys), `${operation} successful result was not all-new at mutation ${point}`);
        } else {
          assert.ok(error instanceof Error);
          assert.ok(sameSelected(current, before, keys), `${operation} failed result was not all-old at mutation ${point}`);
          assert.equal(error.recoveryComplete, true);
        }
        assert.equal(storage.getItem(Backup.PENDING_KEY), null, `${operation} retained a journal at mutation ${point}`);
        for (const key of TARGET_KEYS.filter((key) => !keys.includes(key))) {
          assert.equal(storage.getItem(key), initialEntries()[key], `${operation} touched unrelated ${key}`);
        }
      }
    }
  }
});

test("persistent faults retain an ordinary subset journal and restart always restores the full before snapshot", () => {
  const cases = [
    { operation: "undo", keys: [TARGET_KEYS[0], TARGET_KEYS[3]] },
    { operation: "reset-known", keys: TARGET_KEYS.slice(1, 6) }
  ];
  for (const { operation, keys } of cases) {
    const before = selectedSnapshot(new FaultStorage(initialEntries()), keys);
    const after = canonicalAtomicAfter(keys, operation);
    const mutationCount = keys.length + 2;
    for (const afterWrite of [false, true]) {
      for (let point = 1; point <= mutationCount; point += 1) {
        const storage = new FaultStorage(initialEntries());
        storage.arm(point, { after: afterWrite, persistent: true });
        let result = null;
        let error = null;
        try {
          result = Backup.applyEntriesAtomically(storage, atomicWrites(keys, "after"), { operation });
        } catch (caught) {
          error = caught;
        }
        const pending = storage.getItem(Backup.PENDING_KEY);
        if (pending !== null) {
          assert.ok(error, `${operation} retained a journal without reporting failure at mutation ${point}`);
          assert.equal(error.code, "APPLY_RECOVERY_INCOMPLETE");
          const parsed = JSON.parse(pending);
          assert.equal(parsed.schemaVersion, Backup.JOURNAL_VERSION);
          assert.equal(parsed.operation, operation);
          assert.equal(parsed.forwardOnly, false);
          assert.deepEqual(parsed.entries.map((entry) => entry.key), keys);
          const restarted = new FaultStorage(null, storage.values);
          assert.deepEqual(Backup.recoverPending(restarted), {
            ok: true, status: "rolled-back", dataState: "before", dataRestored: true, journalCleared: true
          });
          assert.ok(sameSelected(selectedSnapshot(restarted, keys), before, keys), `${operation} restart was not all-old at mutation ${point}`);
          assert.equal(restarted.getItem(Backup.PENDING_KEY), null);
        } else if (result !== null) {
          assert.equal(result, keys.length);
          assert.ok(sameSelected(selectedSnapshot(storage, keys), after, keys));
        } else {
          assert.ok(error);
          assert.ok(sameSelected(selectedSnapshot(storage, keys), before, keys));
          assert.equal(error.dataState, "before");
        }
      }
    }
  }
});

test("explicit forward-only subset operations converge to after while ordinary operations default to rollback", () => {
  const keys = [TARGET_KEYS[0], TARGET_KEYS[1]];
  const after = canonicalAtomicAfter(keys, "forward-fixture");
  const storage = new FaultStorage(initialEntries());
  storage.arm(3, { after: false, persistent: true });
  assert.throws(
    () => Backup.applyEntriesAtomically(storage, atomicWrites(keys, "after"), { operation: "forward-fixture", forwardOnly: true }),
    (error) => error.code === "APPLY_RECOVERY_INCOMPLETE"
  );
  const journal = JSON.parse(storage.getItem(Backup.PENDING_KEY));
  assert.equal(journal.schemaVersion, Backup.JOURNAL_VERSION);
  assert.equal(journal.operation, "forward-fixture");
  assert.equal(journal.forwardOnly, true);
  storage.disarm();
  assert.deepEqual(Backup.recoverPending(storage), {
    ok: true, status: "committed", dataState: "after", dataRestored: true, journalCleared: true
  });
  assert.ok(sameSelected(selectedSnapshot(storage, keys), after, keys));
});

test("legacy v2 and operation-less full import journals remain recoverable after the v3 subset upgrade", () => {
  const before = initialEntries();
  const after = Object.fromEntries(TARGET_KEYS.map((key, index) => [key, JSON.stringify({ legacyAfter: index, key })]));
  const seeded = { ...before };
  TARGET_KEYS.forEach((key, index) => { if (index % 2 === 0) seeded[key] = after[key]; });
  seeded[Backup.PENDING_KEY] = JSON.stringify({
    schemaVersion: Backup.LEGACY_JOURNAL_VERSION,
    transactionId: "legacy-v2",
    startedAt: "2026-08-12T00:00:00.000Z",
    forwardOnly: true,
    entries: TARGET_KEYS.map((key) => ({ key, before: before[key], after: after[key] }))
  });
  const storage = new FaultStorage(seeded);
  assert.deepEqual(Backup.recoverPending(storage), {
    ok: true, status: "committed", dataState: "after", dataRestored: true, journalCleared: true
  });
  assert.deepEqual(snapshot(storage), after);
  assert.equal(storage.getItem(Backup.PENDING_KEY), null);

  const operationless = new FaultStorage({
    ...seeded,
    [Backup.PENDING_KEY]: JSON.stringify({
      schemaVersion: Backup.JOURNAL_VERSION,
      transactionId: "full-import-fixture",
      startedAt: "2026-08-12T00:00:00.000Z",
      forwardOnly: true,
      entries: TARGET_KEYS.map((key) => ({ key, before: before[key], after: after[key] }))
    })
  });
  assert.deepEqual(Backup.recoverPending(operationless), {
    ok: true, status: "committed", dataState: "after", dataRestored: true, journalCleared: true
  });
  assert.deepEqual(snapshot(operationless), after);
  assert.equal(operationless.getItem(Backup.PENDING_KEY), null);
});

test("browser bootstrap publishes memory-only mode when the first pending-journal read is unavailable", () => {
  const denied = new Error("storage denied");
  const methodFailure = browserContextWithStorage({
    getItem() { throw denied; },
    setItem() { throw denied; },
    removeItem() { throw denied; }
  });
  assert.equal(methodFailure.DAILY_ATLAS_IMPORT_RECOVERY.ok, true);
  assert.equal(methodFailure.DAILY_ATLAS_IMPORT_RECOVERY.status, "storage-unavailable-memory-only");
  assert.equal(methodFailure.DAILY_ATLAS_IMPORT_RECOVERY.persistenceAvailable, false);
  assert.equal(methodFailure.DAILY_ATLAS_PERSISTENCE_AVAILABLE, false);

  const getterFailure = browserContextWithStorage(null, {
    configurable: true,
    get() { throw denied; }
  });
  assert.equal(getterFailure.DAILY_ATLAS_IMPORT_RECOVERY.ok, true);
  assert.equal(getterFailure.DAILY_ATLAS_IMPORT_RECOVERY.status, "storage-unavailable-memory-only");
  assert.equal(getterFailure.DAILY_ATLAS_PERSISTENCE_AVAILABLE, false);
});

test("browser bootstrap remains hard-blocked when a readable journal cannot be recovered", () => {
  const key = TARGET_KEYS[0];
  const before = initialEntries()[key];
  const storage = new FaultStorage({
    [key]: before,
    [Backup.PENDING_KEY]: JSON.stringify({
      schemaVersion: Backup.JOURNAL_VERSION,
      transactionId: "readable-but-unrecoverable",
      startedAt: "2026-08-12T00:00:00.000Z",
      operation: "ordinary",
      forwardOnly: false,
      entries: [{ key, before, after: JSON.stringify({ after: true }) }]
    })
  });
  storage.arm(1, { after: false, persistent: true });
  const context = browserContextWithStorage(storage);
  assert.equal(context.DAILY_ATLAS_IMPORT_RECOVERY.ok, false);
  assert.equal(context.DAILY_ATLAS_IMPORT_RECOVERY.status, "rollback-complete-journal-retained");
  assert.equal(context.DAILY_ATLAS_IMPORT_RECOVERY.dataRestored, true);
  assert.notEqual(context.DAILY_ATLAS_PERSISTENCE_AVAILABLE, false);
  assert.ok(storage.getItem(Backup.PENDING_KEY), "the readable unrecovered journal must remain for a later restart");
});
