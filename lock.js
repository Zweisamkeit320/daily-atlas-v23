(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasLock = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const TRANSACTION_NAME = "daily-atlas:transaction";
  const IMPORT_PENDING_KEY = "dailyAtlas.import.pending.v1";
  const DATABASE_NAME = "daily-atlas-coordination";
  const DATABASE_VERSION = 1;
  const MUTEX_STORE = "mutex";
  const DEFAULT_TIMEOUT_MS = 15000;
  const SNAPSHOT_ID = "daily-atlas:canonical-snapshot:v1";
  const SNAPSHOT_MARKER_KEY = "dailyAtlas.coordination.snapshot.v1";
  const SNAPSHOT_SESSION_KEY = "dailyAtlas.coordination.session.v1";
  const SNAPSHOT_KEYS = Object.freeze([
    "dailyAtlas.profile.v1",
    "dailyAtlas.state.v3.book",
    "dailyAtlas.state.v3.movie",
    "dailyAtlas.state.v3.city",
    "dailyAtlas.state.v3.german",
    "dailyAtlas.state.v3.medical",
    "dailyAtlas.appearance.v1",
    "dailyAtlas.audio.v1",
    "dailyAtlas.audio.v2",
    "dailyAtlas.speech.v1",
    "dailyAtlas.reminder.v1",
    IMPORT_PENDING_KEY,
    "dailyAtlas.known.v2",
    "dailyAtlas.daily.v2",
    "dailyDuet.seen.v1",
    "dailyDuet.daily.v1"
  ]);
  const SNAPSHOT_KEY_SET = new Set(SNAPSHOT_KEYS);
  const COORDINATION_BOUNDARY =
    "Persistent application keys are staged in memory and committed as one canonical snapshot by a same-origin IndexedDB readwrite transaction. " +
    "When Web Locks are available they are the outer gate and IndexedDB remains the inner commit gate; without Web Locks, IndexedDB is the gate. " +
    "The protected callback must be synchronous and short and must use lease.storage. Allowlisted business values in real localStorage are only a " +
    "post-commit mirror and never the source for an established canonical snapshot; only the fixed clear-detection marker may be armed before commit. " +
    "A post-commit mirror failure is reported separately and does not turn an already committed canonical transaction into a failure. " +
    "In a production document, unavailable IndexedDB fails closed; no localStorage lease is used as a mutex.";

  class CoordinationError extends Error {
    constructor(message, code, cause) {
      super(message);
      this.name = "CoordinationError";
      this.code = code || "COORDINATION_ERROR";
      if (cause !== undefined) this.cause = cause;
    }
  }

  class LockTimeoutError extends CoordinationError {
    constructor(name) {
      super(`Timed out waiting for the IndexedDB transaction gate: ${name}`, "LOCK_TIMEOUT");
      this.name = "LockTimeoutError";
    }
  }

  class TransactionContractError extends CoordinationError {
    constructor() {
      super("Persistent transaction callbacks must be synchronous", "ASYNC_TRANSACTION_CALLBACK");
      this.name = "TransactionContractError";
    }
  }

  class TransactionBlockedError extends CoordinationError {
    constructor(message, code, cause) {
      super(message, code || "TRANSACTION_BLOCKED", cause);
      this.name = "TransactionBlockedError";
    }
  }

  class SnapshotValidationError extends CoordinationError {
    constructor(message, cause) {
      super(message || "The canonical persistence snapshot is invalid", "SNAPSHOT_INVALID", cause);
      this.name = "SnapshotValidationError";
    }
  }

  class SnapshotStorageError extends CoordinationError {
    constructor(message, code, cause) {
      super(message, code || "SNAPSHOT_STORAGE_FAILED", cause);
      this.name = "SnapshotStorageError";
    }
  }

  function finiteInteger(value, fallback, minimum) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= minimum ? number : fallback;
  }

  function isPromiseLike(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function") &&
      typeof value.then === "function";
  }

  function isAsyncFunction(value) {
    return typeof value === "function" && value.constructor?.name === "AsyncFunction";
  }

  function dataObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function emptySnapshot() {
    const output = Object.create(null);
    for (const key of SNAPSHOT_KEYS) output[key] = null;
    return output;
  }

  function validateSnapshot(value) {
    if (!dataObject(value) || Object.getOwnPropertySymbols(value).length !== 0) {
      throw new SnapshotValidationError("The canonical snapshot must be a plain data object");
    }
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== SNAPSHOT_KEYS.length || names.some((key) => !SNAPSHOT_KEY_SET.has(key))) {
      throw new SnapshotValidationError("The canonical snapshot contains missing or unknown keys");
    }
    const output = emptySnapshot();
    for (const key of SNAPSHOT_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || (descriptor.value !== null && typeof descriptor.value !== "string")) {
        throw new SnapshotValidationError(`The canonical snapshot value for ${key} must be a string or null`);
      }
      output[key] = descriptor.value;
    }
    return output;
  }

  function cloneSnapshot(value) {
    return validateSnapshot(value);
  }

  function captureStorageSnapshot(storage) {
    if (!storage || typeof storage.getItem !== "function") {
      throw new SnapshotStorageError("Persistent mirror storage is unavailable", "STORAGE_UNAVAILABLE");
    }
    const output = emptySnapshot();
    try {
      for (const key of SNAPSHOT_KEYS) {
        const value = storage.getItem(key);
        if (value !== null && typeof value !== "string") {
          throw new TypeError(`Storage returned a non-string value for ${key}`);
        }
        output[key] = value;
      }
    } catch (error) {
      throw error instanceof SnapshotStorageError
        ? error
        : new SnapshotStorageError("Could not read the persistence mirror", "SNAPSHOT_READ_FAILED", error);
    }
    return output;
  }

  function readSnapshotMarker(storage) {
    if (!storage || typeof storage.getItem !== "function") {
      throw new SnapshotStorageError("Persistent mirror storage is unavailable", "STORAGE_UNAVAILABLE");
    }
    try {
      const marker = storage.getItem(SNAPSHOT_MARKER_KEY);
      if (marker !== null && typeof marker !== "string") throw new TypeError("Snapshot marker must be a string or null");
      return marker;
    } catch (error) {
      throw new SnapshotStorageError("Could not read the persistence mirror marker", "SNAPSHOT_MARKER_READ_FAILED", error);
    }
  }

  function exactMirrorWrite(storage, key, value) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error(`Mirror verification failed for ${key}`);
  }

  function armSnapshotMarker(storage) {
    try { exactMirrorWrite(storage, SNAPSHOT_MARKER_KEY, SNAPSHOT_ID); }
    catch (error) {
      throw new SnapshotStorageError("Could not establish the canonical snapshot marker", "SNAPSHOT_MARKER_WRITE_FAILED", error);
    }
  }

  function restoreSnapshotMarker(storage, value) {
    try {
      exactMirrorWrite(storage, SNAPSHOT_MARKER_KEY, value);
      return null;
    } catch (error) {
      return new SnapshotStorageError(
        "The canonical transaction aborted and its snapshot marker could not be restored",
        "SNAPSHOT_MARKER_RESTORE_FAILED",
        error
      );
    }
  }

  function mirrorSnapshot(storage, snapshot) {
    const canonical = validateSnapshot(snapshot);
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function" ||
      typeof storage.removeItem !== "function") {
      throw new SnapshotStorageError("Persistent mirror storage is unavailable", "STORAGE_UNAVAILABLE");
    }
    try {
      // The fixed marker is coordination metadata, not business data. Write it
      // first after the IndexedDB commit so a partial mirror cannot be mistaken
      // for an intentional localStorage.clear on the next transaction.
      armSnapshotMarker(storage);
      for (const key of SNAPSHOT_KEYS) exactMirrorWrite(storage, key, canonical[key]);
    } catch (error) {
      throw error instanceof SnapshotStorageError
        ? error
        : new SnapshotStorageError("The canonical snapshot committed but its localStorage mirror failed", "SNAPSHOT_MIRROR_FAILED", error);
    }
    return canonical;
  }

  function createTransactionStorage(snapshot, options) {
    const staged = cloneSnapshot(snapshot);
    const settings = options || {};
    let operation = null;

    function allowedKey(key) {
      const normalized = String(key);
      if (!SNAPSHOT_KEY_SET.has(normalized)) {
        throw new SnapshotStorageError(`Transaction storage key is not allowlisted: ${normalized}`, "SNAPSHOT_KEY_NOT_ALLOWED");
      }
      return normalized;
    }

    function assertMutable() {
      if (settings.readOnly === true) {
        throw new TransactionBlockedError("Canonical read transactions cannot modify storage", "READ_ONLY_TRANSACTION");
      }
    }

    function rememberOperation(key, value) {
      if (key !== IMPORT_PENDING_KEY || typeof value !== "string") return;
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed?.operation === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(parsed.operation)) {
          operation = parsed.operation;
        }
      } catch (_error) {}
    }

    rememberOperation(IMPORT_PENDING_KEY, staged[IMPORT_PENDING_KEY]);

    const storage = {
      get length() {
        return SNAPSHOT_KEYS.reduce((count, key) => count + (staged[key] === null ? 0 : 1), 0);
      },
      key(index) {
        const offset = Number(index);
        if (!Number.isInteger(offset) || offset < 0) return null;
        return SNAPSHOT_KEYS.filter((key) => staged[key] !== null)[offset] || null;
      },
      getItem(key) {
        return staged[allowedKey(key)];
      },
      setItem(key, value) {
        assertMutable();
        const normalized = allowedKey(key);
        const serialized = String(value);
        staged[normalized] = serialized;
        rememberOperation(normalized, serialized);
      },
      removeItem(key) {
        assertMutable();
        staged[allowedKey(key)] = null;
      },
      clear() {
        assertMutable();
        for (const key of SNAPSHOT_KEYS) staged[key] = null;
      }
    };
    return Object.freeze({
      storage: Object.freeze(storage),
      snapshot: () => cloneSnapshot(staged),
      operation: () => operation
    });
  }

  function parseSnapshotRecord(record) {
    if (record === undefined || record === null) return { state: "missing", sequence: 0, snapshot: null };
    if (!dataObject(record)) throw new SnapshotValidationError("The IndexedDB mutex record is invalid");
    const sequence = Number.isSafeInteger(record.sequence) && record.sequence >= 0 ? record.sequence : 0;
    const hasId = Object.prototype.hasOwnProperty.call(record, "snapshotId");
    const hasSnapshot = Object.prototype.hasOwnProperty.call(record, "snapshot");
    if (!hasId && !hasSnapshot) return { state: "legacy", sequence, snapshot: null };
    if (!hasId || !hasSnapshot || record.snapshotId !== SNAPSHOT_ID) {
      throw new SnapshotValidationError("The IndexedDB mutex snapshot identity is invalid");
    }
    return { state: "canonical", sequence, snapshot: validateSnapshot(record.snapshot) };
  }

  function publishMirrorFailure(error) {
    const detail = Object.freeze({
      ok: false,
      code: error?.code || "SNAPSHOT_MIRROR_FAILED",
      message: String(error?.message || error)
    });
    root.DAILY_ATLAS_SNAPSHOT_MIRROR = detail;
    dispatch("dailyatlassnapshotmirrorfailed", detail);
    return detail;
  }

  function publishMirrorSuccess() {
    const detail = Object.freeze({ ok: true, code: null, message: "" });
    root.DAILY_ATLAS_SNAPSHOT_MIRROR = detail;
    return detail;
  }

  function dispatch(type, detail) {
    if (typeof root.CustomEvent !== "function" || typeof root.dispatchEvent !== "function") return;
    try { root.dispatchEvent(new root.CustomEvent(type, { detail })); }
    catch (_error) {}
  }

  function publishRecovery(recovery) {
    root.DAILY_ATLAS_IMPORT_RECOVERY = recovery;
    if (recovery?.persistenceAvailable === false) root.DAILY_ATLAS_PERSISTENCE_AVAILABLE = false;
    if (recovery?.ok === false) dispatch("dailyatlasstorageblocked", recovery);
    return recovery;
  }

  function markRecoveryBlocked(status, error) {
    const recovery = {
      ok: false,
      status: status || "pending-import",
      dataRestored: false,
      journalCleared: false
    };
    if (error !== undefined) recovery.error = error;
    publishRecovery(recovery);
    return recovery;
  }

  function markPersistenceUnavailable(error) {
    const recovery = {
      ok: true,
      status: "storage-unavailable-memory-only",
      dataRestored: false,
      journalCleared: false,
      persistenceAvailable: false
    };
    if (error !== undefined) recovery.error = error;
    publishRecovery(recovery);
    root.DAILY_ATLAS_PERSISTENCE_AVAILABLE = false;
    dispatch("dailyatlasstorageunavailable", recovery);
    return recovery;
  }

  function createIndexedDbGate(options) {
    const settings = options || {};
    const indexedDB = settings.indexedDB === undefined ? root.indexedDB : settings.indexedDB;
    const storage = settings.storage === undefined ? root.localStorage : settings.storage;
    const sessionStorage = settings.sessionStorage === undefined ? root.sessionStorage : settings.sessionStorage;
    const databaseName = settings.databaseName || DATABASE_NAME;
    const databaseVersion = finiteInteger(settings.databaseVersion, DATABASE_VERSION, 1);
    const storeName = settings.storeName || MUTEX_STORE;
    const timeoutMs = finiteInteger(settings.timeoutMs, DEFAULT_TIMEOUT_MS, 1);
    const startTimer = typeof settings.setTimeout === "function"
      ? settings.setTimeout
      : typeof root.setTimeout === "function" ? root.setTimeout.bind(root) : setTimeout;
    const stopTimer = typeof settings.clearTimeout === "function"
      ? settings.clearTimeout
      : typeof root.clearTimeout === "function" ? root.clearTimeout.bind(root) : clearTimeout;
    let database = null;
    let opening = null;
    let markerObserved = false;

    function sessionHasMarker() {
      try { return sessionStorage?.getItem?.(SNAPSHOT_SESSION_KEY) === SNAPSHOT_ID; }
      catch (_error) { return false; }
    }

    function rememberMarker() {
      markerObserved = true;
      try { sessionStorage?.setItem?.(SNAPSHOT_SESSION_KEY, SNAPSHOT_ID); }
      catch (_error) {}
    }

    function unavailable(cause) {
      return new CoordinationError("IndexedDB transaction coordination is unavailable", "COORDINATION_UNAVAILABLE", cause);
    }

    function invalidate(candidate) {
      if (!candidate || database === candidate) database = null;
      if (candidate) {
        try { candidate.close(); } catch (_error) {}
      }
    }

    function openDatabase() {
      if (!indexedDB || typeof indexedDB.open !== "function") return Promise.reject(unavailable());
      if (database) return Promise.resolve(database);
      if (opening) return opening;

      opening = new Promise((resolve, reject) => {
        let request;
        let settled = false;
        const timer = startTimer(() => {
          if (settled) return;
          settled = true;
          reject(new CoordinationError("Timed out opening the IndexedDB transaction gate", "COORDINATION_OPEN_TIMEOUT"));
        }, timeoutMs);

        function fail(error) {
          if (settled) return;
          settled = true;
          stopTimer(timer);
          reject(unavailable(error));
        }

        try { request = indexedDB.open(databaseName, databaseVersion); }
        catch (error) {
          fail(error);
          return;
        }

        request.onupgradeneeded = () => {
          try {
            const next = request.result;
            if (!next.objectStoreNames.contains(storeName)) next.createObjectStore(storeName, { keyPath: "name" });
          } catch (error) {
            fail(error);
          }
        };
        request.onblocked = () => fail(new Error("IndexedDB upgrade is blocked by another page"));
        request.onerror = () => fail(request.error || new Error("IndexedDB open failed"));
        request.onsuccess = () => {
          const next = request.result;
          if (settled) {
            try { next.close(); } catch (_error) {}
            return;
          }
          settled = true;
          stopTimer(timer);
          database = next;
          next.onversionchange = () => invalidate(next);
          if ("onclose" in next) next.onclose = () => { if (database === next) database = null; };
          resolve(next);
        };
      }).finally(() => { opening = null; });
      return opening;
    }

    function runOnDatabase(db, name, task, runOptions) {
      const execution = runOptions || {};
      return new Promise((resolve, reject) => {
        let transaction;
        let timer = null;
        let entered = false;
        let result;
        let failure = null;
        let committedSnapshot = null;
        let commitDetail = null;
        let markerBeforeArm = null;
        let markerRestoreNeeded = false;

        try { transaction = db.transaction(storeName, "readwrite"); }
        catch (error) {
          invalidate(db);
          reject(unavailable(error));
          return;
        }

        const finishTimer = () => {
          if (timer !== null) stopTimer(timer);
          timer = null;
        };
        timer = startTimer(() => {
          if (entered) return;
          failure = new LockTimeoutError(name);
          try { transaction.abort(); } catch (_error) {}
        }, timeoutMs);

        transaction.oncomplete = () => {
          finishTimer();
          markerRestoreNeeded = false;
          if (!committedSnapshot) {
            reject(failure || new CoordinationError("IndexedDB transaction completed without a canonical snapshot", "SNAPSHOT_COMMIT_MISSING"));
            return;
          }
          try {
            mirrorSnapshot(storage, committedSnapshot);
            rememberMarker();
            publishMirrorSuccess();
            dispatch("dailyatlascanonicalchange", Object.freeze({ ...commitDetail, mirrorOk: true }));
            resolve(result);
          } catch (error) {
            error.committed = true;
            error.result = result;
            publishMirrorFailure(error);
            dispatch("dailyatlascanonicalchange", Object.freeze({ ...commitDetail, mirrorOk: false }));
            resolve(result);
          }
        };
        transaction.onabort = () => {
          finishTimer();
          let error = failure || transaction.error || new CoordinationError("IndexedDB transaction gate aborted", "COORDINATION_ABORTED");
          if (markerRestoreNeeded) {
            const restoreError = restoreSnapshotMarker(storage, markerBeforeArm);
            markerRestoreNeeded = false;
            if (restoreError) {
              restoreError.transactionError = error;
              error = restoreError;
            }
          }
          reject(error);
        };
        transaction.onerror = () => {
          if (!failure) failure = transaction.error || new CoordinationError("IndexedDB transaction gate failed", "COORDINATION_FAILED");
        };

        let request;
        try { request = transaction.objectStore(storeName).get(name); }
        catch (error) {
          failure = error;
          try { transaction.abort(); } catch (_error) {}
          return;
        }
        request.onerror = () => {
          failure = request.error || new CoordinationError("IndexedDB mutex request failed", "COORDINATION_FAILED");
        };
        request.onsuccess = () => {
          entered = true;
          finishTimer();
          try {
            const parsed = parseSnapshotRecord(request.result);
            const marker = readSnapshotMarker(storage);
            markerBeforeArm = marker;
            let before;
            let seededFromMirror = false;
            if (parsed.state !== "canonical") {
              before = captureStorageSnapshot(storage);
              seededFromMirror = true;
            } else {
              if (marker === SNAPSHOT_ID) {
                rememberMarker();
                before = parsed.snapshot;
              } else if (marker === null && (markerObserved || sessionHasMarker())) {
                // A marker previously observed by this tab/session has gone
                // missing: localStorage.clear is an explicit reseed request.
                before = captureStorageSnapshot(storage);
                seededFromMirror = true;
              } else if (marker === null) {
                // A newly opened/stale document can momentarily miss the fixed
                // marker written by the first migrator. The IDB snapshot wins.
                before = parsed.snapshot;
              } else {
                throw new SnapshotValidationError("The localStorage snapshot marker does not match the canonical snapshot");
              }
            }
            // The marker is fixed coordination metadata. Establishing it before
            // the callback makes a marker-write failure abort the IDB commit;
            // no business key is mirrored until transaction.oncomplete.
            markerRestoreNeeded = true;
            armSnapshotMarker(storage);
            const staged = createTransactionStorage(before, { readOnly: execution.readOnly === true });
            const sequence = parsed.sequence < Number.MAX_SAFE_INTEGER ? parsed.sequence + 1 : null;
            if (sequence === null) throw new RangeError("IndexedDB transaction sequence is exhausted");
            const lease = Object.freeze({
              backend: execution.backend || "indexeddb",
              name,
              sequence,
              snapshotId: SNAPSHOT_ID,
              seededFromMirror,
              storage: staged.storage
            });
            result = task(lease);
            if (isPromiseLike(result)) throw new TransactionContractError();
            committedSnapshot = staged.snapshot();
            commitDetail = {
              snapshotId: SNAPSHOT_ID,
              sequence,
              changedKeys: SNAPSHOT_KEYS.filter((key) => before[key] !== committedSnapshot[key]),
              operation: staged.operation(),
              source: "local"
            };
            transaction.objectStore(storeName).put({
              name,
              sequence,
              committedAt: new Date().toISOString(),
              snapshotId: SNAPSHOT_ID,
              snapshot: committedSnapshot
            });
          } catch (error) {
            failure = error;
            committedSnapshot = null;
            try { transaction.abort(); } catch (_error) {}
          }
        };
      });
    }

    async function run(name, task, runOptions) {
      if (typeof task !== "function") throw new TypeError("Lock task must be a function");
      if (typeof name !== "string" || !name || name.length > 120) {
        throw new TypeError("Lock name must be a non-empty string of at most 120 characters");
      }
      const db = await openDatabase();
      return runOnDatabase(db, name, task, runOptions);
    }

    function close() {
      invalidate(database);
      opening = null;
    }

    return Object.freeze({ run, close, backend: "indexeddb", boundary: COORDINATION_BOUNDARY });
  }

  function createTransactionCoordinator(options) {
    const settings = options || {};
    const storage = settings.storage === undefined ? root.localStorage : settings.storage;
    const lockManager = settings.lockManager === undefined ? root.navigator?.locks : settings.lockManager;
    const indexedDB = settings.indexedDB === undefined ? root.indexedDB : settings.indexedDB;
    const indexedDbGate = settings.indexedDbGate || (indexedDB && typeof indexedDB.open === "function"
      ? createIndexedDbGate({
        indexedDB,
        storage,
        sessionStorage: settings.sessionStorage,
        databaseName: settings.databaseName,
        databaseVersion: settings.databaseVersion,
        storeName: settings.storeName,
        timeoutMs: settings.timeoutMs,
        setTimeout: settings.setTimeout,
        clearTimeout: settings.clearTimeout
      })
      : null);
    const hasWebLocks = Boolean(lockManager && typeof lockManager.request === "function");
    const productionDocument = settings.productionDocument === undefined
      ? Boolean(root.document && typeof root.document === "object")
      : settings.productionDocument === true;
    const allowLinearSharedStorage = settings.linearSharedStorage === true ||
      (!productionDocument && settings.linearSharedStorage !== false);
    const backend = indexedDbGate
      ? hasWebLocks ? "web-locks+indexeddb" : "indexeddb"
      : hasWebLocks && allowLinearSharedStorage ? "web-locks+shared-storage" : "unavailable";
    let recoveryHandler = typeof settings.recoveryHandler === "function" ? settings.recoveryHandler : null;
    let pending = 0;
    let accepted = 0;
    let completed = 0;
    let failed = 0;
    let lastError = null;
    let idleWaiters = [];

    function setRecoveryHandler(handler) {
      if (handler !== null && typeof handler !== "function") throw new TypeError("Recovery handler must be a function or null");
      if (isAsyncFunction(handler)) throw new TransactionContractError();
      recoveryHandler = handler;
    }

    function readPendingJournal(transactionStorage) {
      if (!transactionStorage || typeof transactionStorage.getItem !== "function") {
        throw new TransactionBlockedError("Shared persistence storage is unavailable", "STORAGE_UNAVAILABLE");
      }
      try { return transactionStorage.getItem(IMPORT_PENDING_KEY); }
      catch (error) {
        markPersistenceUnavailable(error);
        throw new TransactionBlockedError("Could not verify the import journal before writing", "JOURNAL_READ_FAILED", error);
      }
    }

    function runRecovery(handler, transactionStorage) {
      if (typeof handler !== "function") {
        markRecoveryBlocked("pending-import");
        throw new TransactionBlockedError("Persistent writes are paused while an import journal is pending", "PENDING_IMPORT");
      }
      let recovery;
      try { recovery = handler(transactionStorage); }
      catch (error) {
        recovery = markRecoveryBlocked("recovery-threw", error);
      }
      if (isPromiseLike(recovery)) throw new TransactionContractError();
      if (!recovery || typeof recovery !== "object") {
        recovery = markRecoveryBlocked("invalid-recovery-result");
      } else publishRecovery(recovery);
      if (recovery.ok !== true || recovery.journalCleared !== true) {
        throw new TransactionBlockedError("Pending journal recovery is incomplete", "RECOVERY_BLOCKED", recovery.error);
      }
      return recovery;
    }

    function ensureWritable(transactionStorage) {
      const serialized = readPendingJournal(transactionStorage);
      if (serialized !== null) runRecovery(recoveryHandler, transactionStorage);
      if (root.DAILY_ATLAS_IMPORT_RECOVERY?.ok === false) {
        throw new TransactionBlockedError("Persistent writes are paused until import recovery completes", "RECOVERY_BLOCKED");
      }
      return true;
    }

    function invoke(task, recoveryOnly, lease) {
      if (!lease?.storage) throw new TransactionBlockedError("Canonical transaction storage is unavailable", "STORAGE_UNAVAILABLE");
      if (!recoveryOnly) ensureWritable(lease.storage);
      const result = task(lease);
      if (isPromiseLike(result)) throw new TransactionContractError();
      return result;
    }

    function execute(task, recoveryOnly, executeOptions) {
      const execution = executeOptions || {};
      const guarded = (lease) => invoke(task, recoveryOnly, lease);
      if (backend === "web-locks+indexeddb") {
        return lockManager.request(TRANSACTION_NAME, () =>
          indexedDbGate.run(TRANSACTION_NAME, guarded, { backend, readOnly: execution.readOnly === true }));
      }
      if (backend === "indexeddb") {
        return indexedDbGate.run(TRANSACTION_NAME, guarded, { backend, readOnly: execution.readOnly === true });
      }
      if (backend === "web-locks+shared-storage") {
        const sharedStorage = execution.readOnly === true
          ? createTransactionStorage(captureStorageSnapshot(storage), { readOnly: true }).storage
          : storage;
        return lockManager.request(TRANSACTION_NAME, (outerLease) => guarded(Object.freeze({
          backend,
          name: TRANSACTION_NAME,
          sequence: null,
          snapshotId: null,
          seededFromMirror: false,
          storage: sharedStorage,
          outerLease
        })));
      }
      return Promise.reject(new TransactionBlockedError(
        "This browser cannot safely commit persistent writes without IndexedDB",
        "COORDINATION_UNAVAILABLE"
      ));
    }

    function finishTransaction(error) {
      pending = Math.max(0, pending - 1);
      if (error) {
        failed += 1;
        lastError = Object.freeze({ name: error.name || "Error", code: error.code || null, message: String(error.message || error) });
      } else completed += 1;
      if (pending !== 0) return;
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const resolve of waiters) resolve();
    }

    function trackedExecute(task, recoveryOnly, executeOptions) {
      if (typeof task !== "function") return Promise.reject(new TypeError("Transaction task must be a function"));
      if (isAsyncFunction(task)) return Promise.reject(new TransactionContractError());
      accepted += 1;
      pending += 1;
      let operation;
      try { operation = execute(task, recoveryOnly, executeOptions); }
      catch (error) { operation = Promise.reject(error); }
      return Promise.resolve(operation).then(
        (result) => {
          finishTransaction(null);
          return result;
        },
        (error) => {
          finishTransaction(error);
          throw error;
        }
      );
    }

    function run(task) {
      return trackedExecute(task, false);
    }

    function recover(handler) {
      if (typeof handler === "function") setRecoveryHandler(handler);
      if (!recoveryHandler) return Promise.reject(new TypeError("A synchronous recovery handler is required"));
      return trackedExecute((lease) => runRecovery(recoveryHandler, lease.storage), true);
    }

    function read(reader) {
      if (typeof reader !== "function") return Promise.reject(new TypeError("Canonical reader must be a function"));
      if (isAsyncFunction(reader)) return Promise.reject(new TransactionContractError());
      return trackedExecute((lease) => reader(lease.storage, lease), true, { readOnly: true });
    }

    function whenIdle() {
      if (pending === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    }

    function status() {
      return Object.freeze({
        backend,
        accepted,
        completed,
        failed,
        pending,
        idle: pending === 0,
        lastError
      });
    }

    function close() {
      indexedDbGate?.close?.();
    }

    return Object.freeze({
      run,
      read,
      recover,
      whenIdle,
      status,
      setRecoveryHandler,
      assertWritable(transactionStorage) {
        if (transactionStorage) return ensureWritable(transactionStorage);
        if (backend === "web-locks+shared-storage") return ensureWritable(storage);
        throw new TransactionBlockedError("Canonical writes require an active transaction lease", "TRANSACTION_CONTEXT_REQUIRED");
      },
      close,
      backend,
      name: TRANSACTION_NAME
    });
  }

  let defaultTransaction = null;
  let defaultRecoveryHandler = null;

  function getDefaultTransaction() {
    if (defaultTransaction) return defaultTransaction;
    let storage;
    let lockManager;
    let indexedDB;
    try {
      storage = root.localStorage;
      lockManager = root.navigator?.locks;
      indexedDB = root.indexedDB;
    } catch (error) {
      throw new TransactionBlockedError("Shared persistence storage is unavailable", "STORAGE_UNAVAILABLE", error);
    }
    defaultTransaction = createTransactionCoordinator({ storage, lockManager, indexedDB, recoveryHandler: defaultRecoveryHandler });
    return defaultTransaction;
  }

  function transaction(task) {
    try { return getDefaultTransaction().run(task); }
    catch (error) { return Promise.reject(error); }
  }

  function readStorage(reader) {
    try { return getDefaultTransaction().read(reader); }
    catch (error) { return Promise.reject(error); }
  }

  function bootstrapRecovery(handler) {
    if (typeof handler !== "function") return Promise.reject(new TypeError("A synchronous recovery handler is required"));
    defaultRecoveryHandler = handler;
    let coordinator;
    try {
      coordinator = getDefaultTransaction();
      coordinator.setRecoveryHandler(handler);
    } catch (error) {
      return Promise.resolve(markPersistenceUnavailable(error));
    }
    if (coordinator.backend === "unavailable") {
      return Promise.resolve(markPersistenceUnavailable(new CoordinationError(
        "No safe cross-tab coordination primitive is available",
        "COORDINATION_UNAVAILABLE"
      )));
    }
    return coordinator.recover(handler).catch((error) => {
      if (error instanceof SnapshotStorageError) {
        try {
          if (root.localStorage?.getItem(IMPORT_PENDING_KEY) !== null) {
            return markRecoveryBlocked("recovery-incomplete", error);
          }
        } catch (_storageError) {}
        return markPersistenceUnavailable(error);
      }
      if (["COORDINATION_UNAVAILABLE", "COORDINATION_OPEN_TIMEOUT", "STORAGE_UNAVAILABLE"].includes(error?.code)) {
        return markPersistenceUnavailable(error);
      }
      throw error;
    });
  }

  function whenIdle() {
    return defaultTransaction ? defaultTransaction.whenIdle() : Promise.resolve();
  }

  function status() {
    return defaultTransaction
      ? defaultTransaction.status()
      : Object.freeze({ backend: "uninitialized", accepted: 0, completed: 0, failed: 0, pending: 0, idle: true, lastError: null });
  }

  return Object.freeze({
    createIndexedDbGate,
    createTransactionCoordinator,
    transaction,
    readStorage,
    bootstrapRecovery,
    whenIdle,
    status,
    CoordinationError,
    LockTimeoutError,
    TransactionContractError,
    TransactionBlockedError,
    SnapshotValidationError,
    SnapshotStorageError,
    COORDINATION_BOUNDARY,
    constants: Object.freeze({
      TRANSACTION_NAME,
      IMPORT_PENDING_KEY,
      DATABASE_NAME,
      DATABASE_VERSION,
      MUTEX_STORE,
      DEFAULT_TIMEOUT_MS,
      SNAPSHOT_ID,
      SNAPSHOT_MARKER_KEY,
      SNAPSHOT_SESSION_KEY,
      SNAPSHOT_KEYS,
      CANONICAL_KEYS: SNAPSHOT_KEYS
    })
  });
});
