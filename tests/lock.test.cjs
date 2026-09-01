const test = require("node:test");
const assert = require("node:assert/strict");

const Lock = require("../lock.js");

class SharedStorage {
  constructor(entries) {
    this.map = new Map(Object.entries(entries || {}));
    this.throwOnGet = false;
    this.throwOnSetKey = null;
    this.throwOnRemoveKey = null;
  }

  getItem(key) {
    if (this.throwOnGet) throw new Error("storage denied");
    return this.map.has(String(key)) ? this.map.get(String(key)) : null;
  }

  setItem(key, value) {
    if (this.throwOnSetKey === String(key)) throw new Error(`set denied for ${key}`);
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    if (this.throwOnRemoveKey === String(key)) throw new Error(`remove denied for ${key}`);
    this.map.delete(String(key));
  }

  clear() {
    this.map.clear();
  }
}

class MemoryIndexedDatabase {
  constructor() {
    this.records = new Map();
    this.queue = [];
    this.active = false;
    this.abortNextCommit = false;
    this.transactionCount = 0;
    this.storeCreated = false;
    this.objectStoreNames = { contains: () => this.storeCreated };
  }

  createObjectStore() {
    this.storeCreated = true;
    return {};
  }

  transaction() {
    const transaction = new MemoryIndexedTransaction(this);
    this.queue.push(transaction);
    this.drain();
    return transaction;
  }

  drain() {
    if (this.active || !this.queue.length) return;
    this.active = true;
    const transaction = this.queue.shift();
    queueMicrotask(() => transaction.start());
  }

  finish() {
    this.active = false;
    this.drain();
  }

  close() {}
}

class MemoryIndexedTransaction {
  constructor(database) {
    this.database = database;
    this.operations = [];
    this.working = null;
    this.started = false;
    this.finished = false;
    this.aborted = false;
    this.error = null;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
  }

  objectStore() {
    return {
      get: (key) => this.enqueue({ type: "get", key: String(key) }),
      put: (value) => this.enqueue({ type: "put", value: structuredClone(value) })
    };
  }

  enqueue(operation) {
    if (this.finished || this.aborted) throw new Error("transaction is inactive");
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.operations.push({ ...operation, request });
    if (this.started) queueMicrotask(() => this.process());
    return request;
  }

  start() {
    if (this.aborted) return this.finishAbort();
    this.started = true;
    this.database.transactionCount += 1;
    this.working = new Map([...this.database.records].map(([key, value]) => [key, structuredClone(value)]));
    this.process();
  }

  process() {
    if (this.finished || this.aborted) return;
    const operation = this.operations.shift();
    if (!operation) {
      queueMicrotask(() => {
        if (this.operations.length) this.process();
        else this.commit();
      });
      return;
    }
    try {
      if (operation.type === "get") {
        operation.request.result = this.working.has(operation.key)
          ? structuredClone(this.working.get(operation.key))
          : undefined;
      } else {
        const key = String(operation.value.name);
        this.working.set(key, structuredClone(operation.value));
        operation.request.result = key;
      }
      operation.request.onsuccess?.({ target: operation.request });
    } catch (error) {
      operation.request.error = error;
      this.error = error;
      operation.request.onerror?.({ target: operation.request });
      this.onerror?.({ target: this });
      this.aborted = true;
    }
    queueMicrotask(() => this.aborted ? this.finishAbort() : this.process());
  }

  commit() {
    if (this.finished || this.aborted) return;
    if (this.database.abortNextCommit) {
      this.database.abortNextCommit = false;
      this.error = new Error("injected IndexedDB abort");
      this.aborted = true;
      this.onerror?.({ target: this });
      this.finishAbort();
      return;
    }
    this.finished = true;
    this.database.records = this.working;
    this.oncomplete?.({ target: this });
    this.database.finish();
  }

  abort() {
    if (this.finished || this.aborted) return;
    this.aborted = true;
    queueMicrotask(() => this.finishAbort());
  }

  finishAbort() {
    if (this.finished) return;
    this.finished = true;
    this.onabort?.({ target: this });
    this.database.finish();
  }
}

class MemoryIndexedDB {
  constructor() {
    this.database = new MemoryIndexedDatabase();
    this.opened = false;
  }

  open() {
    const request = { result: this.database, error: null, onupgradeneeded: null, onblocked: null, onerror: null, onsuccess: null };
    queueMicrotask(() => {
      if (!this.opened) {
        this.opened = true;
        request.onupgradeneeded?.({ target: request });
      }
      request.onsuccess?.({ target: request });
    });
    return request;
  }
}

class SerialLockManager {
  constructor() {
    this.queue = [];
    this.active = false;
    this.paused = false;
    this.names = [];
  }

  request(name, callback) {
    this.names.push(name);
    return new Promise((resolve, reject) => {
      this.queue.push({ callback, resolve, reject });
      this.drain();
    });
  }

  drain() {
    if (this.active || this.paused || !this.queue.length) return;
    this.active = true;
    const entry = this.queue.shift();
    queueMicrotask(() => {
      let result;
      try { result = entry.callback(Object.freeze({ name: Lock.constants.TRANSACTION_NAME })); }
      catch (error) {
        entry.reject(error);
        this.active = false;
        this.drain();
        return;
      }
      Promise.resolve(result).then(entry.resolve, entry.reject).finally(() => {
        this.active = false;
        this.drain();
      });
    });
  }

  resume() {
    this.paused = false;
    this.drain();
  }
}

function coordinator(storage, manager, options) {
  return Lock.createTransactionCoordinator({
    storage,
    lockManager: manager,
    indexedDB: null,
    ...(options || {})
  });
}

function canonicalCoordinator(storage, manager, indexedDB, options) {
  return Lock.createTransactionCoordinator({
    storage,
    lockManager: manager,
    indexedDB,
    productionDocument: true,
    ...(options || {})
  });
}

function profile(generation, label) {
  return JSON.stringify({ generation, label });
}

function canonicalSnapshot(entries) {
  return Object.fromEntries(Lock.constants.CANONICAL_KEYS.map((key) => [key, entries?.[key] ?? null]));
}

test("Web Locks coordinator uses one fixed name and serializes canonical read-modify-write tasks", async () => {
  const storage = new SharedStorage({ value: "0" });
  const manager = new SerialLockManager();
  const first = coordinator(storage, manager);
  const second = coordinator(storage, manager);

  await Promise.all([
    first.run(() => storage.setItem("value", String(Number(storage.getItem("value")) + 1))),
    second.run(() => storage.setItem("value", String(Number(storage.getItem("value")) + 1)))
  ]);

  assert.equal(storage.getItem("value"), "2");
  assert.deepEqual(manager.names, [Lock.constants.TRANSACTION_NAME, Lock.constants.TRANSACTION_NAME]);
  assert.equal(first.backend, "web-locks+shared-storage");
  assert.equal(second.backend, "web-locks+shared-storage");
});

test("async transaction callbacks are rejected before their body can run", async () => {
  const storage = new SharedStorage();
  const manager = new SerialLockManager();
  const current = coordinator(storage, manager);
  let ran = false;

  await assert.rejects(
    current.run(async () => { ran = true; }),
    (error) => error instanceof Lock.TransactionContractError && error.code === "ASYNC_TRANSACTION_CALLBACK"
  );
  assert.equal(ran, false);
  assert.equal(manager.names.length, 0, "an invalid callback never requests the global lock");
});

test("a promise returned from a normal callback aborts the transaction contract", async () => {
  const storage = new SharedStorage();
  const current = coordinator(storage, new SerialLockManager());
  await assert.rejects(
    current.run(() => Promise.resolve(true)),
    (error) => error instanceof Lock.TransactionContractError && error.code === "ASYNC_TRANSACTION_CALLBACK"
  );
});

test("missing Web Locks and IndexedDB fails closed without running a persistent task", async () => {
  const storage = new SharedStorage();
  const current = Lock.createTransactionCoordinator({ storage, lockManager: null, indexedDB: null });
  let ran = false;

  await assert.rejects(
    current.run(() => { ran = true; }),
    (error) => error instanceof Lock.TransactionBlockedError && error.code === "COORDINATION_UNAVAILABLE"
  );
  assert.equal(ran, false);
  assert.equal(current.backend, "unavailable");
  assert.deepEqual(current.status(), {
    backend: "unavailable",
    accepted: 1,
    completed: 0,
    failed: 1,
    pending: 0,
    idle: true,
    lastError: {
      name: "TransactionBlockedError",
      code: "COORDINATION_UNAVAILABLE",
      message: "This browser cannot safely commit persistent writes without IndexedDB"
    }
  });
});

test("pending and whenIdle account for work accepted before the browser lock grants access", async () => {
  const storage = new SharedStorage();
  const manager = new SerialLockManager();
  manager.paused = true;
  const current = coordinator(storage, manager);
  let ran = false;
  let idle = false;

  const operation = current.run(() => { ran = true; });
  void current.whenIdle().then(() => { idle = true; });
  assert.equal(ran, false);
  assert.equal(idle, false);
  assert.deepEqual(current.status(), {
    backend: "web-locks+shared-storage",
    accepted: 1,
    completed: 0,
    failed: 0,
    pending: 1,
    idle: false,
    lastError: null
  });

  manager.resume();
  await operation;
  await current.whenIdle();
  assert.equal(ran, true);
  assert.equal(idle, true);
  assert.equal(current.status().completed, 1);
  assert.equal(current.status().pending, 0);
});

test("a pending journal without a configured recovery handler blocks before business code", async () => {
  const storage = new SharedStorage({ [Lock.constants.IMPORT_PENDING_KEY]: "journal" });
  const manager = new SerialLockManager();
  const current = coordinator(storage, manager);
  const priorCustomEvent = globalThis.CustomEvent;
  const priorDispatchEvent = globalThis.dispatchEvent;
  const events = [];
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.dispatchEvent = (event) => { events.push(event); return true; };
  let ran = false;

  try {
    await assert.rejects(
      current.run(() => { ran = true; }),
      (error) => error instanceof Lock.TransactionBlockedError && error.code === "PENDING_IMPORT"
    );
    assert.equal(ran, false);
    assert.equal(globalThis.DAILY_ATLAS_IMPORT_RECOVERY.ok, false);
    assert.equal(events.at(-1)?.type, "dailyatlasstorageblocked");
  } finally {
    if (priorCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = priorCustomEvent;
    if (priorDispatchEvent === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = priorDispatchEvent;
    delete globalThis.DAILY_ATLAS_IMPORT_RECOVERY;
  }
});

test("journal recovery and the following business write run under the same coordinator", async () => {
  const storage = new SharedStorage({ [Lock.constants.IMPORT_PENDING_KEY]: "journal", value: "before" });
  const manager = new SerialLockManager();
  const events = [];
  const recover = (shared) => {
    events.push("recover");
    shared.setItem("value", "recovered");
    shared.removeItem(Lock.constants.IMPORT_PENDING_KEY);
    return { ok: true, status: "rolled-back", dataState: "before", dataRestored: true, journalCleared: true };
  };
  const current = coordinator(storage, manager, { recoveryHandler: recover });

  await current.run(() => {
    events.push(`write:${storage.getItem("value")}`);
    storage.setItem("value", "after");
  });

  assert.deepEqual(events, ["recover", "write:recovered"]);
  assert.equal(storage.getItem("value"), "after");
  assert.equal(storage.getItem(Lock.constants.IMPORT_PENDING_KEY), null);
  assert.equal(globalThis.DAILY_ATLAS_IMPORT_RECOVERY.status, "rolled-back");
  delete globalThis.DAILY_ATLAS_IMPORT_RECOVERY;
});

test("incomplete recovery keeps the journal and blocks the business task", async () => {
  const storage = new SharedStorage({ [Lock.constants.IMPORT_PENDING_KEY]: "journal" });
  const current = coordinator(storage, new SerialLockManager(), {
    recoveryHandler: () => ({ ok: false, status: "rollback-incomplete", dataRestored: false, journalCleared: false })
  });
  let ran = false;
  await assert.rejects(
    current.run(() => { ran = true; }),
    (error) => error instanceof Lock.TransactionBlockedError && error.code === "RECOVERY_BLOCKED"
  );
  assert.equal(ran, false);
  assert.equal(storage.getItem(Lock.constants.IMPORT_PENDING_KEY), "journal");
  assert.equal(globalThis.DAILY_ATLAS_IMPORT_RECOVERY.ok, false);
  delete globalThis.DAILY_ATLAS_IMPORT_RECOVERY;
});

test("journal-read failure is explicit, switches persistence off and never runs business code", async () => {
  const storage = new SharedStorage();
  storage.throwOnGet = true;
  const current = coordinator(storage, new SerialLockManager());
  const previous = globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE;
  let ran = false;

  await assert.rejects(
    current.run(() => { ran = true; }),
    (error) => error instanceof Lock.TransactionBlockedError && error.code === "JOURNAL_READ_FAILED"
  );
  assert.equal(ran, false);
  assert.equal(globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE, false);
  assert.equal(globalThis.DAILY_ATLAS_IMPORT_RECOVERY.status, "storage-unavailable-memory-only");

  if (previous === undefined) delete globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE;
  else globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE = previous;
  delete globalThis.DAILY_ATLAS_IMPORT_RECOVERY;
});

test("task failure settles accounting and a later task can use the same global lock", async () => {
  const storage = new SharedStorage();
  const current = coordinator(storage, new SerialLockManager());
  await assert.rejects(current.run(() => { throw new Error("expected failure"); }), /expected failure/);
  let laterRan = false;
  await current.run(() => { laterRan = true; });
  assert.equal(laterRan, true);
  assert.equal(current.status().accepted, 2);
  assert.equal(current.status().completed, 1);
  assert.equal(current.status().failed, 1);
  assert.equal(current.status().pending, 0);
});

test("production Web Locks use an outer lock and an inner IndexedDB canonical snapshot commit", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  const manager = new SerialLockManager();
  const indexedDB = new MemoryIndexedDB();
  const current = canonicalCoordinator(storage, manager, indexedDB);
  const priorCustomEvent = globalThis.CustomEvent;
  const priorDispatchEvent = globalThis.dispatchEvent;
  const events = [];
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.dispatchEvent = (event) => { events.push(event); return true; };

  try {
    const result = await current.run((lease) => {
      assert.equal(lease.backend, "web-locks+indexeddb");
      assert.equal(lease.snapshotId, Lock.constants.SNAPSHOT_ID);
      assert.equal(lease.seededFromMirror, true);
      assert.equal(JSON.parse(lease.storage.getItem(profileKey)).generation, 0);
      lease.storage.setItem(profileKey, profile(1, "committed"));
      lease.storage.setItem(Lock.constants.IMPORT_PENDING_KEY, JSON.stringify({ operation: "import" }));
      lease.storage.removeItem(Lock.constants.IMPORT_PENDING_KEY);
      return "ok";
    });

    assert.equal(result, "ok");
    assert.equal(current.backend, "web-locks+indexeddb");
    assert.deepEqual(manager.names, [Lock.constants.TRANSACTION_NAME]);
    assert.equal(indexedDB.database.transactionCount, 1, "the Web Lock callback enters the IndexedDB gate exactly once");
    const record = indexedDB.database.records.get(Lock.constants.TRANSACTION_NAME);
    assert.equal(record.snapshotId, Lock.constants.SNAPSHOT_ID);
    assert.equal(record.sequence, 1);
    assert.equal(record.snapshot[profileKey], profile(1, "committed"));
    assert.equal(storage.getItem(profileKey), profile(1, "committed"));
    assert.equal(storage.getItem(Lock.constants.SNAPSHOT_MARKER_KEY), Lock.constants.SNAPSHOT_ID);
    assert.equal(events.at(-1)?.type, "dailyatlascanonicalchange");
    assert.deepEqual(events.at(-1)?.detail, {
      snapshotId: Lock.constants.SNAPSHOT_ID,
      sequence: 1,
      changedKeys: [profileKey],
      operation: "import",
      source: "local",
      mirrorOk: true
    });
  } finally {
    if (priorCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = priorCustomEvent;
    if (priorDispatchEvent === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = priorDispatchEvent;
    delete globalThis.DAILY_ATLAS_SNAPSHOT_MIRROR;
  }
});

test("a stale second localStorage mirror reads the canonical snapshot and commits generation N plus 2", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const firstStorage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  const staleStorage = new SharedStorage({ [profileKey]: profile(0, "stale") });
  const manager = new SerialLockManager();
  const indexedDB = new MemoryIndexedDB();
  const first = canonicalCoordinator(firstStorage, manager, indexedDB);
  const second = canonicalCoordinator(staleStorage, manager, indexedDB);

  await first.run((lease) => {
    const current = JSON.parse(lease.storage.getItem(profileKey));
    lease.storage.setItem(profileKey, profile(current.generation + 1, "first"));
  });
  assert.equal(JSON.parse(staleStorage.getItem(profileKey)).generation, 0, "the fixture remains a genuinely stale page mirror");

  let observed;
  await second.run((lease) => {
    observed = JSON.parse(lease.storage.getItem(profileKey)).generation;
    lease.storage.setItem(profileKey, profile(observed + 1, "second"));
  });

  assert.equal(observed, 1, "the second transaction reads IndexedDB canonical state rather than its stale mirror");
  assert.equal(staleStorage.getItem(Lock.constants.SNAPSHOT_MARKER_KEY), Lock.constants.SNAPSHOT_ID,
    "a first-migration marker delayed in the stale page is repaired, not misclassified as clear");
  const record = indexedDB.database.records.get(Lock.constants.TRANSACTION_NAME);
  assert.equal(JSON.parse(record.snapshot[profileKey]).generation, 2);
  assert.equal(JSON.parse(staleStorage.getItem(profileKey)).generation, 2);
  assert.equal(record.sequence, 2);
});

test("an IndexedDB abort discards staging and exposes no uncommitted localStorage value", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  const indexedDB = new MemoryIndexedDB();
  const current = canonicalCoordinator(storage, null, indexedDB);

  await current.run((lease) => lease.storage.setItem(profileKey, profile(1, "before-abort")));
  const committedBefore = structuredClone(indexedDB.database.records.get(Lock.constants.TRANSACTION_NAME));
  indexedDB.database.abortNextCommit = true;

  await assert.rejects(
    current.run((lease) => {
      lease.storage.setItem(profileKey, profile(2, "must-not-leak"));
      assert.equal(storage.getItem(profileKey), profile(1, "before-abort"), "staging never mutates the mirror before commit");
    }),
    /injected IndexedDB abort/
  );
  assert.equal(storage.getItem(profileKey), profile(1, "before-abort"));
  assert.deepEqual(indexedDB.database.records.get(Lock.constants.TRANSACTION_NAME), committedBefore);
});

test("callback and IndexedDB aborts restore a missing marker so an explicit clear remains a reseed request", async () => {
  const profileKey = "dailyAtlas.profile.v1";

  for (const failureMode of ["callback", "indexeddb"]) {
    const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
    const indexedDB = new MemoryIndexedDB();
    const current = canonicalCoordinator(storage, null, indexedDB);
    await current.run((lease) => lease.storage.setItem(profileKey, profile(1, "old-canonical")));
    storage.clear();

    if (failureMode === "indexeddb") indexedDB.database.abortNextCommit = true;
    await assert.rejects(
      current.run((lease) => {
        assert.equal(lease.storage.getItem(profileKey), null);
        lease.storage.setItem(profileKey, profile(2, "must-abort"));
        if (failureMode === "callback") throw new Error("injected callback failure");
      }),
      failureMode === "callback" ? /injected callback failure/ : /injected IndexedDB abort/
    );

    assert.equal(storage.getItem(Lock.constants.SNAPSHOT_MARKER_KEY), null,
      `${failureMode}: an aborted transaction restores the pre-transaction marker`);
    assert.equal(indexedDB.database.records.get(Lock.constants.TRANSACTION_NAME).snapshot[profileKey], profile(1, "old-canonical"));

    let observed = "not-run";
    await current.run((lease) => {
      observed = lease.storage.getItem(profileKey);
      lease.storage.setItem(profileKey, profile(1, `after-${failureMode}-abort`));
    });
    assert.equal(observed, null, `${failureMode}: the following transaction still recognizes the explicit clear`);
  }
});

test("invalid and prototype-bearing canonical snapshots fail closed before business code", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({
    [Lock.constants.SNAPSHOT_MARKER_KEY]: Lock.constants.SNAPSHOT_ID,
    [profileKey]: profile(7, "mirror")
  });
  const indexedDB = new MemoryIndexedDB();
  indexedDB.opened = true;
  indexedDB.database.storeCreated = true;
  const polluted = canonicalSnapshot({ [profileKey]: profile(9, "poison") });
  Object.defineProperty(polluted, "__proto__", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: { polluted: true }
  });
  indexedDB.database.records.set(Lock.constants.TRANSACTION_NAME, {
    name: Lock.constants.TRANSACTION_NAME,
    sequence: 4,
    snapshotId: Lock.constants.SNAPSHOT_ID,
    snapshot: polluted
  });
  const current = canonicalCoordinator(storage, null, indexedDB);
  let ran = false;

  await assert.rejects(
    current.run(() => { ran = true; }),
    (error) => error instanceof Lock.SnapshotValidationError && error.code === "SNAPSHOT_INVALID"
  );
  assert.equal(ran, false);
  assert.equal({}.polluted, undefined);
  assert.equal(storage.getItem(profileKey), profile(7, "mirror"));
});

test("transaction storage rejects unknown keys and readStorage is immutable", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  const indexedDB = new MemoryIndexedDB();
  const current = canonicalCoordinator(storage, null, indexedDB);

  await assert.rejects(
    current.run((lease) => lease.storage.setItem("__proto__", "polluted")),
    (error) => error instanceof Lock.SnapshotStorageError && error.code === "SNAPSHOT_KEY_NOT_ALLOWED"
  );
  assert.equal({}.polluted, undefined);
  assert.equal(storage.getItem(profileKey), profile(0, "seed"));

  const read = await current.read((transactionStorage) => JSON.parse(transactionStorage.getItem(profileKey)).generation);
  assert.equal(read, 0);
  await assert.rejects(
    current.read((transactionStorage) => transactionStorage.setItem(profileKey, profile(9, "forbidden"))),
    (error) => error instanceof Lock.TransactionBlockedError && error.code === "READ_ONLY_TRANSACTION"
  );
  assert.equal(storage.getItem(profileKey), profile(0, "seed"));
});

test("a mirror failure does not reject a committed canonical result and the next read repairs the mirror", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  const indexedDB = new MemoryIndexedDB();
  const current = canonicalCoordinator(storage, null, indexedDB);
  const priorCustomEvent = globalThis.CustomEvent;
  const priorDispatchEvent = globalThis.dispatchEvent;
  const events = [];
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.dispatchEvent = (event) => { events.push(event); return true; };

  try {
    await current.run((lease) => lease.storage.setItem(profileKey, profile(1, "baseline")));
    storage.throwOnSetKey = profileKey;
    const result = await current.run((lease) => {
      lease.storage.setItem(profileKey, profile(2, "canonical"));
      return "committed-result";
    });
    assert.equal(result, "committed-result", "post-commit mirror failure preserves the business result");
    assert.equal(current.status().completed, 2);
    assert.equal(current.status().failed, 0);
    assert.equal(JSON.parse(indexedDB.database.records.get(Lock.constants.TRANSACTION_NAME).snapshot[profileKey]).generation, 2);
    assert.equal(JSON.parse(storage.getItem(profileKey)).generation, 1, "a failed mirror may remain stale but cannot roll back canonical state");
    assert.equal(globalThis.DAILY_ATLAS_SNAPSHOT_MIRROR.ok, false);
    assert.equal(events.at(-1)?.type, "dailyatlascanonicalchange");
    assert.equal(events.at(-1)?.detail.mirrorOk, false, "the UI receives a truthful non-fatal mirror warning");

    storage.throwOnSetKey = null;
    const observed = await current.read((transactionStorage) => JSON.parse(transactionStorage.getItem(profileKey)).generation);
    assert.equal(observed, 2, "readStorage uses the committed IndexedDB snapshot, not the stale mirror");
    assert.equal(JSON.parse(storage.getItem(profileKey)).generation, 2, "the next canonical transaction repairs the mirror");
    assert.equal(globalThis.DAILY_ATLAS_SNAPSHOT_MIRROR.ok, true);
  } finally {
    if (priorCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = priorCustomEvent;
    if (priorDispatchEvent === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = priorDispatchEvent;
    delete globalThis.DAILY_ATLAS_SNAPSHOT_MIRROR;
  }
});

test("an initial partial mirror cannot be misclassified as localStorage.clear", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  const indexedDB = new MemoryIndexedDB();
  const current = canonicalCoordinator(storage, null, indexedDB);
  storage.throwOnSetKey = profileKey;

  await current.run((lease) => lease.storage.setItem(profileKey, profile(1, "canonical")));
  assert.equal(globalThis.DAILY_ATLAS_SNAPSHOT_MIRROR.ok, false);
  assert.equal(storage.getItem(Lock.constants.SNAPSHOT_MARKER_KEY), Lock.constants.SNAPSHOT_ID,
    "post-commit mirroring arms the fixed marker before copying business keys");
  storage.throwOnSetKey = null;
  const observed = await current.read((transactionStorage) => JSON.parse(transactionStorage.getItem(profileKey)).generation);
  assert.equal(observed, 1, "the next gate trusts the committed canonical snapshot rather than reseeding the partial mirror");
  assert.equal(JSON.parse(storage.getItem(profileKey)).generation, 1);
  delete globalThis.DAILY_ATLAS_SNAPSHOT_MIRROR;
});

test("a marker write failure aborts before the first canonical commit", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  storage.throwOnSetKey = Lock.constants.SNAPSHOT_MARKER_KEY;
  const indexedDB = new MemoryIndexedDB();
  const current = canonicalCoordinator(storage, null, indexedDB);
  let ran = false;

  await assert.rejects(
    current.run(() => { ran = true; }),
    (error) => error instanceof Lock.SnapshotStorageError && error.code === "SNAPSHOT_MARKER_WRITE_FAILED"
  );
  assert.equal(ran, false);
  assert.equal(indexedDB.database.records.has(Lock.constants.TRANSACTION_NAME), false);
  assert.equal(storage.getItem(profileKey), profile(0, "seed"));
});

test("a missing fixed marker after localStorage.clear reseeds the canonical snapshot", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  const indexedDB = new MemoryIndexedDB();
  const current = canonicalCoordinator(storage, null, indexedDB);

  await current.run((lease) => lease.storage.setItem(profileKey, profile(1, "old-canonical")));
  storage.clear();
  let observed = "not-run";
  await current.run((lease) => {
    observed = lease.storage.getItem(profileKey);
    lease.storage.setItem(profileKey, profile(1, "after-clear"));
  });

  assert.equal(observed, null, "the cleared mirror is intentionally reseeded instead of reviving the old snapshot");
  const record = indexedDB.database.records.get(Lock.constants.TRANSACTION_NAME);
  assert.equal(record.snapshot[profileKey], profile(1, "after-clear"));
  assert.equal(storage.getItem(Lock.constants.SNAPSHOT_MARKER_KEY), Lock.constants.SNAPSHOT_ID);
});

test("the session marker preserves an explicit clear across a page coordinator reload", async () => {
  const profileKey = "dailyAtlas.profile.v1";
  const storage = new SharedStorage({ [profileKey]: profile(0, "seed") });
  const sessionStorage = new SharedStorage();
  const indexedDB = new MemoryIndexedDB();
  const first = canonicalCoordinator(storage, null, indexedDB, { sessionStorage });
  await first.run((lease) => lease.storage.setItem(profileKey, profile(1, "old")));
  assert.equal(sessionStorage.getItem(Lock.constants.SNAPSHOT_SESSION_KEY), Lock.constants.SNAPSHOT_ID);

  storage.clear();
  const reloaded = canonicalCoordinator(storage, null, indexedDB, { sessionStorage });
  const observed = await reloaded.read((transactionStorage) => transactionStorage.getItem(profileKey));
  assert.equal(observed, null);
  assert.equal(indexedDB.database.records.get(Lock.constants.TRANSACTION_NAME).snapshot[profileKey], null);
});

test("a production document with Web Locks but no IndexedDB fails closed", async () => {
  const storage = new SharedStorage();
  const manager = new SerialLockManager();
  const current = Lock.createTransactionCoordinator({
    storage,
    lockManager: manager,
    indexedDB: null,
    productionDocument: true
  });
  let ran = false;

  await assert.rejects(
    current.run(() => { ran = true; }),
    (error) => error instanceof Lock.TransactionBlockedError && error.code === "COORDINATION_UNAVAILABLE"
  );
  assert.equal(ran, false);
  assert.equal(current.backend, "unavailable");
  assert.equal(manager.names.length, 0);
});

test("public boundary names the standards-backed backends and the fail-closed rule", () => {
  assert.match(Lock.COORDINATION_BOUNDARY, /Web Locks/);
  assert.match(Lock.COORDINATION_BOUNDARY, /IndexedDB readwrite transaction/);
  assert.match(Lock.COORDINATION_BOUNDARY, /synchronous and short/);
  assert.match(Lock.COORDINATION_BOUNDARY, /lease\.storage/);
  assert.match(Lock.COORDINATION_BOUNDARY, /post-commit mirror/);
  assert.match(Lock.COORDINATION_BOUNDARY, /does not turn an already committed canonical transaction into a failure/);
  assert.match(Lock.COORDINATION_BOUNDARY, /fails closed/);
  assert.match(Lock.COORDINATION_BOUNDARY, /no localStorage lease/);
  assert.equal(Lock.constants.CANONICAL_KEYS.length, 16);
  assert.equal(new Set(Lock.constants.CANONICAL_KEYS).size, 16);
  assert.equal(typeof Lock.createController, "undefined");
});
