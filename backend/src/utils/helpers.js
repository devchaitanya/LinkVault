import crypto from 'crypto';
import { nanoid } from 'nanoid';

/**
 * Generate a cryptographically random ID using nanoid.
 * 12 chars ≈ ~71 bits of entropy — sufficient for ephemeral links.
 */
export function generateVaultId(length = 12) {
  return nanoid(length);
}

/**
 * Create a consistently-formatted API error.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

/**
 * Hash a string for safe logging (e.g., IP addresses).
 * Uses SHA-256 truncated to 16 chars — irreversible but consistent.
 */
export function hashForLog(value) {
  return crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Build a Merkle root from an array of chunk hashes.
 * Uses SHA-256. Pads odd-length levels by duplicating the last hash.
 */
export function computeMerkleRoot(hashes) {
  if (!hashes || hashes.length === 0) return null;
  if (hashes.length === 1) return hashes[0];

  let level = [...hashes];

  while (level.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left; // duplicate last if odd
      const combined = crypto
        .createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }
    level = nextLevel;
  }

  return level[0];
}

/**
 * Compute HMAC-SHA256 over vault metadata for tamper detection.
 * Uses a server-side secret key.
 */
export function computeMetadataHmac(vaultId, merkleRoot, expiresAt, maxViews) {
  // In production, use a dedicated HMAC secret from env
  const secret = process.env.HMAC_SECRET || 'linkvault-dev-hmac-secret';
  const data = `${vaultId}:${merkleRoot}:${new Date(expiresAt).toISOString()}:${maxViews}`;
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Validate a magic number (first bytes) against known dangerous types.
 * Returns true if the file appears safe for upload.
 */
const BLOCKED_MAGIC_NUMBERS = [
  // Windows executables
  { bytes: [0x4d, 0x5a], name: 'EXE/DLL' },
  // ELF binaries
  { bytes: [0x7f, 0x45, 0x4c, 0x46], name: 'ELF' },
];

export function validateMagicNumber(buffer) {
  const header = new Uint8Array(buffer.slice(0, 8));

  for (const magic of BLOCKED_MAGIC_NUMBERS) {
    const match = magic.bytes.every((byte, i) => header[i] === byte);
    if (match) {
      return { safe: false, type: magic.name };
    }
  }

  return { safe: true, type: null };
}

/**
 * Sleep helper for retries.
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
