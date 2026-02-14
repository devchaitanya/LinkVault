import { CRYPTO } from '../config/constants.js';

/**
 * CryptoService — all client-side cryptography operations.
 *
 * Trust boundary: THIS is the trust boundary. All encryption and decryption
 * happens exclusively in this module, inside the user's browser.
 *
 * The backend, database, and storage never see plaintext or keys.
 *
 * Uses Web Crypto API (SubtleCrypto) — no external crypto libraries.
 *
 * Extensibility: new crypto operations (e.g., key rotation, re-encryption)
 * should be added as new methods in this module.
 */

// ─── Key Generation ────────────────────────────────────────────

/**
 * Generate a random 256-bit content key.
 * This key is NEVER sent to the server.
 * @returns {Promise<CryptoKey>}
 */
export async function generateContentKey() {
  return crypto.subtle.generateKey(
    { name: CRYPTO.ALGORITHM, length: CRYPTO.KEY_LENGTH },
    true, // extractable — needed for URL fragment sharing
    ['encrypt', 'decrypt']
  );
}

/**
 * Export a CryptoKey to raw bytes (for URL fragment encoding).
 * @param {CryptoKey} key
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportKey(key) {
  return crypto.subtle.exportRaw ? crypto.subtle.exportKey('raw', key) : crypto.subtle.exportKey('raw', key);
}

/**
 * Import raw key bytes back into a CryptoKey.
 * @param {ArrayBuffer} rawKey
 * @returns {Promise<CryptoKey>}
 */
export async function importContentKey(rawKey) {
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: CRYPTO.ALGORITHM, length: CRYPTO.KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

// ─── Password Derivation ──────────────────────────────────────

/**
 * Generate a random salt for PBKDF2.
 * @returns {Uint8Array} — 16 bytes
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Derive a key from a password using PBKDF2.
 * @param {string} password
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
export async function derivePasswordKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: CRYPTO.PBKDF2_ITERATIONS,
      hash: CRYPTO.PBKDF2_HASH,
    },
    keyMaterial,
    CRYPTO.KEY_LENGTH
  );

  return derivedBits;
}

/**
 * Combine content key + password key using HKDF.
 * This produces the final encryption key.
 *
 * @param {ArrayBuffer} contentKeyRaw — raw content key bytes
 * @param {ArrayBuffer} passwordKeyRaw — PBKDF2-derived bytes
 * @returns {Promise<CryptoKey>} — final AES-GCM key
 */
export async function combineKeysWithHKDF(contentKeyRaw, passwordKeyRaw) {
  // XOR the two keys as input keying material
  const contentBytes = new Uint8Array(contentKeyRaw);
  const passwordBytes = new Uint8Array(passwordKeyRaw);
  const combined = new Uint8Array(contentBytes.length);
  for (let i = 0; i < contentBytes.length; i++) {
    combined[i] = contentBytes[i] ^ passwordBytes[i % passwordBytes.length];
  }

  // Use HKDF to derive the final key
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    combined,
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: CRYPTO.HKDF_HASH,
      salt: new Uint8Array(0), // empty salt — uniqueness from combined input
      info: new TextEncoder().encode(CRYPTO.HKDF_INFO),
    },
    hkdfKey,
    { name: CRYPTO.ALGORITHM, length: CRYPTO.KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Encryption / Decryption ──────────────────────────────────

/**
 * Generate a random IV for AES-GCM.
 * @returns {Uint8Array} — 12 bytes
 */
export function generateIV() {
  return crypto.getRandomValues(new Uint8Array(CRYPTO.IV_LENGTH));
}

/**
 * Encrypt a chunk of data with AES-GCM.
 * Returns IV prepended to ciphertext.
 *
 * @param {CryptoKey} key — AES-GCM key
 * @param {ArrayBuffer} data — plaintext chunk
 * @returns {Promise<ArrayBuffer>} — [IV (12 bytes) | ciphertext+authTag]
 */
export async function encryptChunk(key, data) {
  const iv = generateIV();

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: CRYPTO.ALGORITHM,
      iv,
      tagLength: CRYPTO.AUTH_TAG_LENGTH,
    },
    key,
    data
  );

  // Prepend IV to ciphertext
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result.buffer;
}

/**
 * Decrypt a chunk. Expects IV prepended to ciphertext.
 *
 * @param {CryptoKey} key — AES-GCM key
 * @param {ArrayBuffer} encryptedData — [IV | ciphertext+authTag]
 * @returns {Promise<ArrayBuffer>} — plaintext
 */
export async function decryptChunk(key, encryptedData) {
  const data = new Uint8Array(encryptedData);
  const iv = data.slice(0, CRYPTO.IV_LENGTH);
  const ciphertext = data.slice(CRYPTO.IV_LENGTH);

  return crypto.subtle.decrypt(
    {
      name: CRYPTO.ALGORITHM,
      iv,
      tagLength: CRYPTO.AUTH_TAG_LENGTH,
    },
    key,
    ciphertext
  );
}

// ─── Hashing ──────────────────────────────────────────────────

/**
 * SHA-256 hash of an ArrayBuffer. Returns hex string.
 * Used for chunk integrity verification (Merkle tree leaves).
 */
export async function sha256Hex(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute Merkle root from array of hex hash strings.
 */
export async function computeMerkleRoot(hashes) {
  if (!hashes || hashes.length === 0) return null;
  if (hashes.length === 1) return hashes[0];

  let level = [...hashes];

  while (level.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      const combined = new TextEncoder().encode(left + right);
      const hash = await sha256Hex(combined);
      nextLevel.push(hash);
    }
    level = nextLevel;
  }

  return level[0];
}

// ─── Key Encoding (URL fragment) ──────────────────────────────

/**
 * Encode a CryptoKey to base64url for URL fragment.
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function keyToBase64Url(key) {
  const raw = await exportKey(key);
  const bytes = new Uint8Array(raw);
  // Manual base64url encoding (no padding)
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a base64url string back to a CryptoKey.
 * @param {string} base64url
 * @returns {Promise<CryptoKey>}
 */
export async function base64UrlToKey(base64url) {
  // Restore standard base64
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return importContentKey(bytes.buffer);
}

// ─── File Chunking ────────────────────────────────────────────

/**
 * Split a File into chunks using File.slice().
 * @param {File} file
 * @param {number} chunkSize — bytes per chunk
 * @returns {Blob[]}
 */
export function sliceFile(file, chunkSize) {
  const chunks = [];
  let offset = 0;
  while (offset < file.size) {
    chunks.push(file.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  return chunks;
}

/**
 * Read a Blob as ArrayBuffer.
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
export function blobToArrayBuffer(blob) {
  return blob.arrayBuffer();
}

// ─── Filename Encryption ──────────────────────────────────────

/**
 * Encrypt a filename string.
 * @param {CryptoKey} key
 * @param {string} filename
 * @returns {Promise<string>} — base64url encoded encrypted filename
 */
export async function encryptFilename(key, filename) {
  const encoded = new TextEncoder().encode(filename);
  const encrypted = await encryptChunk(key, encoded);
  const bytes = new Uint8Array(encrypted);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decrypt a filename string.
 * @param {CryptoKey} key
 * @param {string} encryptedFilename — base64url encoded
 * @returns {Promise<string>}
 */
export async function decryptFilename(key, encryptedFilename) {
  let base64 = encryptedFilename.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decrypted = await decryptChunk(key, bytes.buffer);
  return new TextDecoder().decode(decrypted);
}

// ─── Password Verification ───────────────────────────────────

const PASSWORD_CHECK_PLAINTEXT = 'LINKVAULT_PASSWORD_OK';

/**
 * Generate an encrypted password check value.
 * Used during upload to create a small test ciphertext that can verify
 * the password during download WITHOUT consuming a view.
 *
 * @param {CryptoKey} combinedKey — the HKDF-derived combined key
 * @returns {Promise<string>} — base64url encoded encrypted check value
 */
export async function generatePasswordCheck(combinedKey) {
  const encoded = new TextEncoder().encode(PASSWORD_CHECK_PLAINTEXT);
  const encrypted = await encryptChunk(combinedKey, encoded);
  const bytes = new Uint8Array(encrypted);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify a password by decrypting the check value.
 * Returns true if the password is correct, false otherwise.
 *
 * @param {CryptoKey} combinedKey — the HKDF-derived combined key to test
 * @param {string} passwordCheck — base64url encoded encrypted check value from metadata
 * @returns {Promise<boolean>}
 */
export async function verifyPasswordCheck(combinedKey, passwordCheck) {
  try {
    let base64 = passwordCheck.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decrypted = await decryptChunk(combinedKey, bytes.buffer);
    const text = new TextDecoder().decode(decrypted);
    return text === PASSWORD_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}
