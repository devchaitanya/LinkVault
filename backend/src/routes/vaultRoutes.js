import { Router } from 'express';
import multer from 'multer';
import { vaultController } from '../controllers/index.js';
import {
  uploadLimiter,
  validateVaultInit,
  validateChunkUpload,
  validateVaultId,
} from '../middleware/index.js';
import { optionalAuth } from '../middleware/auth.js';
import { env } from '../config/index.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.chunkSizeBytes + 1024,
  },
});

// ─── Upload Flow ───────────────────────────────────────────────

router.post(
  '/',
  uploadLimiter,
  optionalAuth,
  validateVaultInit(),
  vaultController.initializeVault.bind(vaultController)
);

/**
 * Upload a single encrypted chunk.
 * Idempotent — re-uploading the same chunk index overwrites.
 */
router.post(
  '/:vaultId/chunks',
  uploadLimiter,
  validateVaultId(),
  upload.single('chunk'),
  validateChunkUpload(),
  vaultController.uploadChunk.bind(vaultController)
);

/**
 * Finalize vault upload — marks vault as complete.
 */
router.post(
  '/:vaultId/finalize',
  validateVaultId(),
  vaultController.finalizeVault.bind(vaultController)
);

/**
 * Abort a pending upload — deletes partial data.
 */
router.delete(
  '/:vaultId/upload',
  validateVaultId(),
  vaultController.abortUpload.bind(vaultController)
);

// ─── Download Flow ─────────────────────────────────────────────

/**
 * Get vault metadata (no view consumed).
 * Used by the frontend to display vault info before downloading.
 */
router.get(
  '/:vaultId',
  validateVaultId(),
  vaultController.getVaultMetadata.bind(vaultController)
);

/**
 * Access vault — consume a view and get chunk download info.
 * This is the burn-after-read trigger.
 */
router.post(
  '/:vaultId/access',
  validateVaultId(),
  vaultController.accessVault.bind(vaultController)
);

/**
 * Download a specific encrypted chunk (binary stream).
 */
router.get(
  '/:vaultId/chunks/:chunkIndex',
  validateVaultId(),
  vaultController.downloadChunk.bind(vaultController)
);

// ─── Policy ────────────────────────────────────────────────────

/**
 * Manually delete a vault (requires delete token).
 */
router.delete(
  '/:vaultId',
  validateVaultId(),
  vaultController.deleteVault.bind(vaultController)
);

/**
 * Record a failed access attempt (e.g., wrong password).
 */
router.post(
  '/:vaultId/fail',
  validateVaultId(),
  vaultController.recordFailedAccess.bind(vaultController)
);

export default router;
