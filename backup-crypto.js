(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasBackupCrypto = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const FORMAT = "daily-atlas-encrypted-backup";
  const SCHEMA_VERSION = 1;
  const LEGACY_FORMAT = "daily-atlas-backup";
  const ITERATIONS = 600000;
  const MAX_BYTES = 3 * 1024 * 1024;
  const MAX_PLAINTEXT_BYTES = 2 * 1024 * 1024;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const TAG_BITS = 128;
  const KEY_BITS = 256;
  const AAD_TEXT = `${FORMAT}|${SCHEMA_VERSION}|PBKDF2|SHA-256|${ITERATIONS}|AES-GCM|${KEY_BITS}|${TAG_BITS}`;
  const TOP_FIELDS = Object.freeze(["cipher", "ciphertext", "format", "kdf", "schemaVersion"]);
  const KDF_FIELDS = Object.freeze(["hash", "iterations", "name", "salt"]);
  const CIPHER_FIELDS = Object.freeze(["iv", "keyLength", "name", "tagLength"]);
  const encoder = new TextEncoder();

  function error(code, message, cause) {
    const output = new Error(message);
    output.name = "BackupCryptoError";
    output.code = code;
    if (cause !== undefined) output.cause = cause;
    return output;
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function exactFields(value, fields) {
    return isObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
  }

  function utf8Bytes(value) {
    return encoder.encode(value);
  }

  function encodeBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    if (typeof root.btoa !== "function") throw error("UNSUPPORTED", "Base64 encoding is unavailable in this browser");
    const chunks = [];
    for (let index = 0; index < bytes.length; index += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
    }
    return root.btoa(chunks.join(""));
  }

  function decodeBase64(value, expectedLength) {
    if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      throw error("INVALID_ENVELOPE", "Encrypted backup contains malformed Base64 data");
    }
    let bytes;
    try {
      if (typeof Buffer !== "undefined") bytes = new Uint8Array(Buffer.from(value, "base64"));
      else {
        if (typeof root.atob !== "function") throw error("UNSUPPORTED", "Base64 decoding is unavailable in this browser");
        const binary = root.atob(value);
        bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      }
    } catch (cause) {
      if (cause?.name === "BackupCryptoError") throw cause;
      throw error("INVALID_ENVELOPE", "Encrypted backup contains malformed Base64 data", cause);
    }
    if (encodeBase64(bytes) !== value || (expectedLength !== undefined && bytes.length !== expectedLength)) {
      throw error("INVALID_ENVELOPE", "Encrypted backup contains non-canonical or wrong-sized Base64 data");
    }
    return bytes;
  }

  function parseJson(text, code, message) {
    try { return JSON.parse(text); }
    catch (cause) { throw error(code, message, cause); }
  }

  function validateEnvelope(value) {
    if (!exactFields(value, TOP_FIELDS) || value.format !== FORMAT || value.schemaVersion !== SCHEMA_VERSION) {
      throw error("INVALID_ENVELOPE", "This is not a supported encrypted Daily Atlas backup");
    }
    if (!exactFields(value.kdf, KDF_FIELDS) || value.kdf.name !== "PBKDF2" ||
        value.kdf.hash !== "SHA-256" || value.kdf.iterations !== ITERATIONS) {
      throw error("INVALID_ENVELOPE", "Encrypted backup KDF parameters are not supported");
    }
    if (!exactFields(value.cipher, CIPHER_FIELDS) || value.cipher.name !== "AES-GCM" ||
        value.cipher.keyLength !== KEY_BITS || value.cipher.tagLength !== TAG_BITS) {
      throw error("INVALID_ENVELOPE", "Encrypted backup cipher parameters are not supported");
    }
    decodeBase64(value.kdf.salt, SALT_BYTES);
    decodeBase64(value.cipher.iv, IV_BYTES);
    const ciphertext = decodeBase64(value.ciphertext);
    if (ciphertext.length <= TAG_BITS / 8) throw error("INVALID_ENVELOPE", "Encrypted backup ciphertext is empty");
    return value;
  }

  function inspect(text) {
    if (typeof text !== "string") throw error("INVALID_FILE", "Backup content must be text");
    if (utf8Bytes(text).length > MAX_BYTES) throw error("FILE_TOO_LARGE", "Backup file exceeds the 3 MB limit");
    const value = parseJson(text, "INVALID_FILE", "Backup JSON cannot be parsed");
    if (isObject(value) && value.format === LEGACY_FORMAT) {
      return Object.freeze({ kind: "plain", encrypted: false, requiresPassword: false, envelope: null });
    }
    const envelope = validateEnvelope(value);
    return Object.freeze({ kind: "encrypted", encrypted: true, requiresPassword: true, envelope });
  }

  function passwordBytes(password) {
    if (typeof password !== "string" || password.length === 0) throw error("PASSWORD_REQUIRED", "A password is required for this encrypted backup");
    const bytes = utf8Bytes(password);
    if (bytes.length > 4096) throw error("INVALID_PASSWORD", "Password is too long");
    return bytes;
  }

  function cryptoProvider(options) {
    const provider = options?.crypto || root.crypto;
    if (!provider || typeof provider.getRandomValues !== "function" || !provider.subtle ||
        typeof provider.subtle.importKey !== "function" || typeof provider.subtle.deriveKey !== "function" ||
        typeof provider.subtle.encrypt !== "function" || typeof provider.subtle.decrypt !== "function") {
      throw error("UNSUPPORTED", "Web Crypto is unavailable; use a current browser over HTTPS");
    }
    return provider;
  }

  async function deriveKey(provider, password, salt) {
    const bytes = passwordBytes(password);
    try {
      const material = await provider.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveKey"]);
      return await provider.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
        material,
        { name: "AES-GCM", length: KEY_BITS },
        false,
        ["encrypt", "decrypt"]
      );
    } finally {
      bytes.fill(0);
    }
  }

  function validatePlaintext(text) {
    if (typeof text !== "string") throw error("INVALID_PLAINTEXT", "Backup content must be text");
    const bytes = utf8Bytes(text);
    if (bytes.length > MAX_PLAINTEXT_BYTES) throw error("PLAINTEXT_TOO_LARGE", "Plain backup exceeds the 2 MB encryption limit");
    const value = parseJson(text, "INVALID_PLAINTEXT", "Plain backup JSON cannot be parsed");
    if (!isObject(value) || value.format !== LEGACY_FORMAT || value.schemaVersion !== 1) {
      throw error("INVALID_PLAINTEXT", "Only a validated Daily Atlas JSON backup can be encrypted");
    }
    return bytes;
  }

  async function encrypt(text, password, options) {
    const plaintext = validatePlaintext(text);
    const provider = cryptoProvider(options);
    const salt = provider.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = provider.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(provider, password, salt);
    let encrypted;
    try {
      encrypted = new Uint8Array(await provider.subtle.encrypt(
        { name: "AES-GCM", iv, tagLength: TAG_BITS, additionalData: utf8Bytes(AAD_TEXT) },
        key,
        plaintext
      ));
    } catch (cause) {
      throw error("ENCRYPTION_FAILED", "Backup encryption failed", cause);
    }
    const envelope = {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: encodeBase64(salt) },
      cipher: { name: "AES-GCM", keyLength: KEY_BITS, tagLength: TAG_BITS, iv: encodeBase64(iv) },
      ciphertext: encodeBase64(encrypted)
    };
    const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
    if (utf8Bytes(serialized).length > MAX_BYTES) throw error("FILE_TOO_LARGE", "Encrypted backup exceeds the 3 MB limit");
    return serialized;
  }

  async function decrypt(text, password, options) {
    const checked = inspect(text);
    if (!checked.encrypted) return Object.freeze({ encrypted: false, plaintext: text });
    const provider = cryptoProvider(options);
    const envelope = checked.envelope;
    const salt = decodeBase64(envelope.kdf.salt, SALT_BYTES);
    const iv = decodeBase64(envelope.cipher.iv, IV_BYTES);
    const ciphertext = decodeBase64(envelope.ciphertext);
    const key = await deriveKey(provider, password, salt);
    let plaintext;
    try {
      plaintext = new Uint8Array(await provider.subtle.decrypt(
        { name: "AES-GCM", iv, tagLength: TAG_BITS, additionalData: utf8Bytes(AAD_TEXT) },
        key,
        ciphertext
      ));
    } catch (cause) {
      throw error("AUTHENTICATION_FAILED", "Password is incorrect or the encrypted backup was modified", cause);
    }
    if (plaintext.length > MAX_PLAINTEXT_BYTES) throw error("PLAINTEXT_TOO_LARGE", "Decrypted backup exceeds the 2 MB limit");
    let decoded;
    try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(plaintext); }
    catch (cause) { throw error("INVALID_PLAINTEXT", "Decrypted backup is not valid UTF-8", cause); }
    validatePlaintext(decoded);
    return Object.freeze({ encrypted: true, plaintext: decoded });
  }

  return Object.freeze({
    FORMAT,
    SCHEMA_VERSION,
    ITERATIONS,
    MAX_BYTES,
    MAX_PLAINTEXT_BYTES,
    encrypt,
    decrypt,
    inspect
  });
});
