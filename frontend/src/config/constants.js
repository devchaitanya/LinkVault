/**
 * Frontend configuration constants.
 *
 * Centralized config — change once, affects everywhere.
 * Extensibility: add new feature flags and config here.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// ─── Vault Defaults ────────────────────────────────────────────
export const DEFAULT_EXPIRY_MS = 600_000; // 10 minutes (assignment default)
export const MAX_EXPIRY_MS = 86_400_000; // 24 hours
export const DEFAULT_MAX_VIEWS = 10;
export const MAX_FILE_SIZE = 52_428_800; // 50 MB (assignment spec)
export const CHUNK_SIZE = 5_242_880; // 5 MB
export const MAX_TEXT_LENGTH = 500_000; // 500 KB text limit

// ─── Crypto Constants ──────────────────────────────────────────
export const CRYPTO = {
  ALGORITHM: 'AES-GCM',
  KEY_LENGTH: 256,
  IV_LENGTH: 12, // bytes
  AUTH_TAG_LENGTH: 128, // bits
  PBKDF2_ITERATIONS: 100_000,
  PBKDF2_HASH: 'SHA-256',
  HKDF_HASH: 'SHA-256',
  HKDF_INFO: 'LinkVault-v1',
};

// ─── Expiry Presets ────────────────────────────────────────────
export const EXPIRY_OPTIONS = [
  { label: '5 min', value: 300_000 },
  { label: '10 min', value: 600_000 },
  { label: '30 min', value: 1_800_000 },
  { label: '1 hour', value: 3_600_000 },
  { label: '6 hours', value: 21_600_000 },
  { label: '24 hours', value: 86_400_000 },
];

// ─── View Count Presets ────────────────────────────────────────
export const VIEW_OPTIONS = [
  { label: '1 view (burn after read)', value: 1 },
  { label: '5 views', value: 5 },
  { label: '10 views', value: 10 },
  { label: '25 views', value: 25 },
  { label: '50 views', value: 50 },
];
