import { AppError } from '../utils/helpers.js';
import { env } from '../config/index.js';

/**
 * Validation middleware factories.
 *
 * Each factory returns an Express middleware function.
 * Keeps validation logic out of controllers for cleaner extensibility.
 */

/**
 * Validate vault initialization request body.
 */
export function validateVaultInit() {
  return (req, res, next) => {
    const { totalSize, expectedChunks, merkleRoot, cryptoParams, policy } = req.body;

    const errors = [];

    if (!totalSize || typeof totalSize !== 'number' || totalSize <= 0) {
      errors.push('totalSize must be a positive number');
    }

    if (totalSize > env.maxFileSizeBytes) {
      errors.push(`totalSize exceeds maximum of ${env.maxFileSizeBytes} bytes`);
    }

    if (!expectedChunks || typeof expectedChunks !== 'number' || expectedChunks < 1) {
      errors.push('expectedChunks must be a positive integer');
    }

    if (!merkleRoot || typeof merkleRoot !== 'string') {
      errors.push('merkleRoot is required and must be a string');
    }

    // Validate crypto params if provided
    if (cryptoParams) {
      if (cryptoParams.isPasswordProtected && !cryptoParams.pbkdf2Salt) {
        errors.push('pbkdf2Salt is required when password protection is enabled');
      }
    }

    // Validate policy if provided
    if (policy) {
      if (policy.expiryMs && (typeof policy.expiryMs !== 'number' || policy.expiryMs <= 0)) {
        errors.push('policy.expiryMs must be a positive number');
      }
      if (policy.expiryMs && policy.expiryMs > env.maxExpiryMs) {
        errors.push(`policy.expiryMs exceeds maximum of ${env.maxExpiryMs}ms`);
      }
      if (policy.maxViews && (typeof policy.maxViews !== 'number' || policy.maxViews < 1)) {
        errors.push('policy.maxViews must be a positive integer');
      }
    }

    if (errors.length > 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request', errors));
    }

    next();
  };
}

/**
 * Validate chunk upload params.
 */
export function validateChunkUpload() {
  return (req, res, next) => {
    const errors = [];

    // chunkIndex comes as a string from FormData — coerce to number
    const rawIndex = req.body.chunkIndex;
    const chunkIndex = rawIndex !== undefined ? Number(rawIndex) : undefined;
    if (chunkIndex === undefined || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
      errors.push('chunkIndex must be a non-negative integer');
    } else {
      // Replace body value with the parsed number for downstream use
      req.body.chunkIndex = chunkIndex;
    }

    const { hash } = req.body;
    if (!hash || typeof hash !== 'string') {
      errors.push('hash is required (SHA-256 of encrypted chunk)');
    }

    if (!req.file && !req.body.chunk) {
      errors.push('Chunk data is required');
    }

    if (errors.length > 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid chunk upload', errors));
    }

    next();
  };
}

/**
 * Validate vaultId parameter format.
 */
export function validateVaultId() {
  return (req, res, next) => {
    const { vaultId } = req.params;

    if (!vaultId || typeof vaultId !== 'string' || vaultId.length < 8 || vaultId.length > 64) {
      return next(new AppError(400, 'INVALID_VAULT_ID', 'Invalid vault ID format'));
    }

    // Only allow URL-safe base64 + nanoid characters
    if (!/^[A-Za-z0-9_-]+$/.test(vaultId)) {
      return next(new AppError(400, 'INVALID_VAULT_ID', 'Vault ID contains invalid characters'));
    }

    next();
  };
}

export default { validateVaultInit, validateChunkUpload, validateVaultId };
