const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const Backup = require("../backup.js");
const Crypto = require("../backup-crypto.js");
const Profile = require("../profile.js");
const State = require("../state.js");

const TYPES = Profile.TYPES;
const validIds = Object.fromEntries(TYPES.map((type) => [type, new Set([
  `${type}-current`, `${type}-known-local`, `${type}-known-imported`, `${type}-skip-local`, `${type}-skip-imported`
])]));

function typeState(type, overrides) {
  return {
    schemaVersion: 3,
    type,
    date: "2026-08-28",
    revision: 2,
    version: "2",
    currentId: `${type}-current`,
    sequence: 3,
    skipped: [],
    knownEntries: [],
    ...(overrides || {})
  };
}

function core(states, optional) {
  return { states: states || {}, optional: optional || {} };
}

function plainBackup(note) {
  return JSON.stringify({
    format: Backup.FORMAT,
    schemaVersion: Backup.SCHEMA_VERSION,
    appVersion: "2.1.0",
    catalogSnapshot: "2026-08-28",
    exportedAt: "2026-08-28T00:00:00.000Z",
    states: {},
    optional: {},
    note: note || "中文与 Deutsch"
  });
}

test("state merge unions durable known records, unions only same-day skips, and keeps the local current card", () => {
  const local = typeState("book", {
    revision: 4,
    version: "9",
    skipped: ["book-skip-local"],
    knownEntries: [{ id: "book-known-local", at: "2026-08-20T00:00:00.000Z" }]
  });
  const imported = typeState("book", {
    revision: 7,
    version: "12",
    currentId: "book-known-local",
    sequence: 9,
    skipped: ["book-skip-imported"],
    knownEntries: [
      { id: "book-known-local", at: "2026-08-19T00:00:00.000Z" },
      { id: "book-known-imported", at: "2026-08-21T00:00:00.000Z" }
    ]
  });
  const before = JSON.stringify({ local, imported });
  const merged = State.mergeImport(local, imported, "book", validIds.book);
  assert.equal(merged.currentId, "book-current");
  assert.deepEqual(merged.knownEntries, [
    { id: "book-known-local", at: "2026-08-19T00:00:00.000Z" },
    { id: "book-known-imported", at: "2026-08-21T00:00:00.000Z" }
  ]);
  assert.deepEqual(merged.skipped, ["book-skip-local", "book-skip-imported"]);
  assert.equal(merged.version, "13");
  assert.equal(merged.revision, 8);
  assert.equal(merged.sequence, 9);
  assert.equal(JSON.stringify({ local, imported }), before, "merge is pure and does not mutate either source");

  const anotherDay = State.mergeImport(local, {
    ...imported,
    date: "2026-08-27",
    skipped: ["book-skip-imported"]
  }, "book", validIds.book);
  assert.equal(anotherDay.date, local.date);
  assert.equal(anotherDay.currentId, local.currentId);
  assert.deepEqual(anotherDay.skipped, ["book-skip-local"], "an imported daily skip never leaks into another date");
  assert.ok(anotherDay.knownEntries.some((entry) => entry.id === "book-known-imported"), "long-term known history still merges across dates");
});

test("a contradictory imported known marker cannot dislodge the local current card", () => {
  const local = typeState("movie");
  const imported = typeState("movie", {
    currentId: null,
    knownEntries: [{ id: "movie-current", at: "2026-08-28T00:00:00.000Z" }],
    skipped: ["movie-current"]
  });
  const merged = State.mergeImport(local, imported, "movie", validIds.movie);
  assert.equal(merged.currentId, "movie-current");
  assert.equal(merged.knownEntries.some((entry) => entry.id === "movie-current"), false);
  assert.equal(merged.skipped.includes("movie-current"), false);
});

test("profile merge compares field clocks even across generations and then raises one generation fence", () => {
  let local = Profile.emptyProfile();
  local = Profile.setExplicit(local, "city", "regions", ["Europe"], new Date("2026-08-28T01:00:00Z"));
  local = Profile.setFeedback(local, "book", "book-known-local", "favorite", true, new Date("2026-08-28T01:00:01Z"));
  local.generation = 7;

  let imported = Profile.emptyProfile();
  imported = Profile.setExplicit(imported, "medical", "topicGroups", ["sleep"], new Date("2026-08-28T01:00:02Z"));
  imported = Profile.setFeedback(imported, "book", "book-known-local", "liked", true, new Date("2026-08-28T01:00:03Z"));
  imported.generation = 2;

  const merged = Profile.mergeImport(local, imported, validIds);
  assert.equal(merged.generation, 8);
  assert.deepEqual(merged.explicit.city.regions, ["Europe"]);
  assert.deepEqual(merged.explicit.medical.topicGroups, ["sleep"]);
  assert.deepEqual(Profile.feedbackFor(merged, "book", "book-known-local"), {
    liked: true,
    favorite: true,
    unsuitable: false
  });
  assert.equal(local.generation, 7);
  assert.equal(imported.generation, 2);

  const exhausted = { ...imported, generation: Number.MAX_SAFE_INTEGER };
  assert.throws(() => Profile.mergeImport(local, exhausted, validIds), /generation is exhausted/);
});

test("backup merge preview is reusable, local-first for device settings, and reports the actual semantic diff", () => {
  const localProfile = Profile.setFeedback(
    Profile.emptyProfile(), "book", "book-known-local", "favorite", true, new Date("2026-08-28T02:00:00Z")
  );
  const importedProfile = Profile.setExplicit(
    Profile.emptyProfile(), "german", "levels", ["B1"], new Date("2026-08-28T02:00:01Z")
  );
  const local = core({
    book: typeState("book", { knownEntries: [{ id: "book-known-local", at: "2026-08-20T00:00:00Z" }] })
  }, {
    "dailyAtlas.profile.v1": localProfile,
    "dailyAtlas.appearance.v1": { schemaVersion: 1, color: "sage", style: "clean", density: "compact", dataSaver: true, textSize: "large", contrast: "high", motion: "reduce" }
  });
  const imported = core({
    book: typeState("book", { knownEntries: [{ id: "book-known-imported", at: "2026-08-21T00:00:00Z" }] })
  }, {
    "dailyAtlas.profile.v1": importedProfile,
    "dailyAtlas.appearance.v1": { schemaVersion: 1, color: "peach", style: "aurora" },
    "dailyAtlas.reminder.v1": { schemaVersion: 1, enabled: true, time: "09:15", lastNotifiedDate: null }
  });
  const sourceSnapshot = JSON.stringify({ local, imported });
  const preview = Backup.previewImport(local, imported, { mode: "merge", validIdsByType: validIds });
  assert.equal(preview.mode, "merge");
  assert.equal(preview.hasChanges, true);
  assert.equal(preview.result.states.book.currentId, "book-current");
  assert.equal(preview.result.states.book.knownEntries.length, 2);
  assert.equal(preview.result.optional["dailyAtlas.appearance.v1"].color, "sage", "an existing device appearance stays local");
  assert.equal(preview.result.optional["dailyAtlas.reminder.v1"].time, "09:15", "a missing local option can be filled from the backup");
  assert.equal(Profile.feedbackFor(preview.result.optional["dailyAtlas.profile.v1"], "book", "book-known-local").favorite, true);
  assert.deepEqual(preview.result.optional["dailyAtlas.profile.v1"].explicit.german.levels, ["B1"]);
  assert.deepEqual(preview.diff.states.book.knownAdded, ["book-known-imported"]);
  assert.equal(preview.diff.optional["dailyAtlas.appearance.v1"], "unchanged");
  assert.equal(preview.diff.optional["dailyAtlas.reminder.v1"], "add");
  assert.equal(preview.diff.totals.knownAdded, 1);
  assert.equal(JSON.stringify({ local, imported }), sourceSnapshot, "preview does not mutate local or imported data");
});

test("replace preview removes omitted keys, advances concurrency counters, and rejects malformed plans before apply", () => {
  const local = core({ book: typeState("book", { revision: 12, version: "99" }) }, {
    "dailyAtlas.profile.v1": { ...Profile.emptyProfile(), generation: 4 },
    "dailyAtlas.audio.v2": { volume: 0.6, trackId: "rainy-study" }
  });
  const imported = core({ book: typeState("book", { revision: 1, version: "2", currentId: "book-known-imported" }) }, {});
  const preview = Backup.previewImport(local, imported, { mode: "replace", validIdsByType: validIds });
  assert.equal(preview.result.states.book.version, "100");
  assert.equal(preview.result.states.book.revision, 13);
  assert.equal(preview.result.optional["dailyAtlas.profile.v1"].generation, 5);
  assert.equal(Object.hasOwn(preview.result.optional, "dailyAtlas.audio.v2"), false);
  assert.equal(preview.diff.optional["dailyAtlas.audio.v2"], "remove");
  assert.equal(preview.diff.states.book.currentAfter, "book-known-imported");
  assert.throws(() => Backup.previewImport(local, imported, { mode: "append" }), /replace or merge/);
  assert.throws(() => Backup.previewImport(local, core({ book: { schemaVersion: 3, type: "book" } }, {}), { mode: "merge" }), /not normalized/);
});

test("encrypted envelope uses the fixed PBKDF2/AES-GCM contract and round-trips Unicode without retaining the password", async () => {
  const plaintext = plainBackup();
  const password = "Correct Horse 电池 订书钉";
  const encrypted = await Crypto.encrypt(plaintext, password, { crypto: webcrypto });
  const envelope = JSON.parse(encrypted);
  assert.equal(Crypto.ITERATIONS, 600000);
  assert.equal(Crypto.MAX_BYTES, 3 * 1024 * 1024);
  assert.deepEqual(Object.keys(envelope).sort(), ["cipher", "ciphertext", "format", "kdf", "schemaVersion"]);
  assert.deepEqual(envelope.kdf, {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: 600000,
    salt: envelope.kdf.salt
  });
  assert.deepEqual(envelope.cipher, {
    name: "AES-GCM",
    keyLength: 256,
    tagLength: 128,
    iv: envelope.cipher.iv
  });
  assert.equal(encrypted.includes(password), false);
  assert.equal(Crypto.inspect(encrypted).requiresPassword, true);
  const opened = await Crypto.decrypt(encrypted, password, { crypto: webcrypto });
  assert.equal(opened.encrypted, true);
  assert.equal(opened.plaintext, plaintext);

  const source = fs.readFileSync(path.resolve(__dirname, "..", "backup-crypto.js"), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, "the crypto layer has no persistence path for a password or derived key");
});

test("legacy plaintext backups remain readable without a password or Web Crypto", async () => {
  const plaintext = plainBackup("legacy");
  assert.deepEqual(Crypto.inspect(plaintext), {
    kind: "plain",
    encrypted: false,
    requiresPassword: false,
    envelope: null
  });
  const opened = await Crypto.decrypt(plaintext, undefined, { crypto: {} });
  assert.deepEqual(opened, { encrypted: false, plaintext });
});

test("the browser UMD path encrypts and decrypts without Node Buffer globals", async () => {
  const context = {
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    JSON,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    atob: (value) => Buffer.from(value, "base64").toString("binary")
  };
  context.globalThis = context;
  const source = fs.readFileSync(path.resolve(__dirname, "..", "backup-crypto.js"), "utf8");
  vm.runInNewContext(source, context, { filename: "backup-crypto.js" });
  const plaintext = plainBackup("browser-path");
  const encrypted = await context.DailyAtlasBackupCrypto.encrypt(plaintext, "浏览器密码");
  const opened = await context.DailyAtlasBackupCrypto.decrypt(encrypted, "浏览器密码");
  assert.equal(opened.encrypted, true);
  assert.equal(opened.plaintext, plaintext);
});

test("wrong passwords and ciphertext tampering fail closed with the same authentication error", async () => {
  const encrypted = await Crypto.encrypt(plainBackup(), "right-password", { crypto: webcrypto });
  await assert.rejects(
    Crypto.decrypt(encrypted, "wrong-password", { crypto: webcrypto }),
    (error) => error?.name === "BackupCryptoError" && error.code === "AUTHENTICATION_FAILED"
  );
  const envelope = JSON.parse(encrypted);
  const bytes = Buffer.from(envelope.ciphertext, "base64");
  bytes[0] ^= 1;
  envelope.ciphertext = bytes.toString("base64");
  await assert.rejects(
    Crypto.decrypt(JSON.stringify(envelope), "right-password", { crypto: webcrypto }),
    (error) => error?.name === "BackupCryptoError" && error.code === "AUTHENTICATION_FAILED"
  );
});

test("strict encrypted envelopes reject parameter changes, unknown fields, malformed Base64, and oversize data before decryption", async () => {
  const encrypted = await Crypto.encrypt(plainBackup(), "password", { crypto: webcrypto });
  const cases = [];
  const unknown = JSON.parse(encrypted);
  unknown.secret = "DROP";
  cases.push(JSON.stringify(unknown));
  const iterations = JSON.parse(encrypted);
  iterations.kdf.iterations = 1;
  cases.push(JSON.stringify(iterations));
  const malformed = JSON.parse(encrypted);
  malformed.kdf.salt = "not/base64";
  cases.push(JSON.stringify(malformed));
  const proto = JSON.parse(encrypted);
  Object.defineProperty(proto, "__proto__", { value: { polluted: true }, enumerable: true });
  cases.push(JSON.stringify(proto));
  for (const value of cases) {
    assert.throws(() => Crypto.inspect(value), (error) => error?.code === "INVALID_ENVELOPE");
  }
  assert.throws(
    () => Crypto.inspect(" ".repeat(Crypto.MAX_BYTES + 1)),
    (error) => error?.code === "FILE_TOO_LARGE"
  );
  await assert.rejects(
    Crypto.encrypt(plainBackup("x".repeat(Crypto.MAX_PLAINTEXT_BYTES)), "password", { crypto: webcrypto }),
    (error) => error?.code === "PLAINTEXT_TOO_LARGE"
  );
  await assert.rejects(
    Crypto.encrypt(plainBackup(), "password", { crypto: {} }),
    (error) => error?.code === "UNSUPPORTED"
  );
  assert.equal(Object.prototype.polluted, undefined);
});
