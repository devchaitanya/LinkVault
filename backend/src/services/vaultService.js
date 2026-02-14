import { Vault } from '../models/index.js';
import { env } from '../config/index.js';
import {
  generateVaultId,
  computeMetadataHmac,
  AppError,
} from '../utils/index.js';
import storageService from './storageService.js';

/**
 * VaultService — core business logic for vault lifecycle.
 *
 * Responsibilities:
 *  - Create vaults (policy + metadata only)
 *  - Manage chunked upload sessions
 *  - Enforce access policies
 *  - Serve download metadata
 *  - Handle expiry and cleanup
 *
 * Extensibility: add new vault features by extending this service
 * or creating sibling services (e.g., sharingService, analyticsService).
 */
class VaultService {
  /**
   * Initialize a new vault upload session.
   * Creates the vault document in 'pending' state.
   *
   * @param {Object} params
   * @param {number} params.totalSize — total encrypted file size in bytes
   * @param {number} params.expectedChunks — number of chunks to expect
   * @param {string} params.merkleRoot — client-computed Merkle root
   * @param {string} [params.encryptedFilename] — encrypted original filename
   * @param {string} [params.mimeType] — MIME type hint
   * @param {Object} [params.cryptoParams] — encryption metadata
   * @param {Object} [params.policy] — access policy overrides
   * @returns {Object} — { vaultId, uploadUrl pattern, etc. }
   */
  async initializeVault({
    totalSize,
    expectedChunks,
    merkleRoot,
    encryptedFilename = null,
    displayName = null,
    mimeType = 'application/octet-stream',
    contentType = 'file',
    cryptoParams = {},
    policy = {},
    userId = null,
    allowedCountries = [],
    allowedIPs = [],
  }) {
    // Validate size
    if (totalSize > env.maxFileSizeBytes) {
      throw new AppError(413, 'FILE_TOO_LARGE', `Max file size is ${env.maxFileSizeBytes} bytes`);
    }

    if (expectedChunks < 1 || expectedChunks > Math.ceil(env.maxFileSizeBytes / env.chunkSizeBytes) + 1) {
      throw new AppError(400, 'INVALID_CHUNK_COUNT', 'Invalid number of chunks');
    }

    // Generate unique vault ID
    const vaultId = generateVaultId();

    // Compute expiry
    const expiryMs = Math.min(
      policy.expiryMs || env.defaultExpiryMs,
      env.maxExpiryMs
    );
    const expiresAt = new Date(Date.now() + expiryMs);

    // Compute view limit
    const maxViews = Math.min(
      Math.max(policy.maxViews || env.defaultMaxViews, 1),
      1000 // hard cap
    );

    // Compute metadata HMAC
    const metadataHmac = computeMetadataHmac(vaultId, merkleRoot, expiresAt, maxViews);

    // Generate delete token for uploader
    const { randomBytes, createHash } = await import('crypto');
    const deleteToken = randomBytes(32).toString('hex');
    const deleteTokenHash = createHash('sha256').update(deleteToken).digest('hex');

    // Create vault document
    const vault = await Vault.create({
      vaultId,
      chunks: [],
      totalSize,
      encryptedFilename,
      displayName: displayName || (contentType === 'text' ? 'Text paste' : 'File upload'),
      mimeType,
      contentType: contentType === 'text' ? 'text' : 'file',
      merkleRoot,
      metadataHmac,
      deleteTokenHash,
      cryptoParams: {
        algorithm: cryptoParams.algorithm || 'AES-GCM',
        keyLength: cryptoParams.keyLength || 256,
        ivLength: cryptoParams.ivLength || 12,
        isPasswordProtected: cryptoParams.isPasswordProtected || false,
        pbkdf2Salt: cryptoParams.pbkdf2Salt || null,
        pbkdf2Iterations: cryptoParams.pbkdf2Iterations || 100_000,
        passwordCheck: cryptoParams.passwordCheck || null,
        version: 1,
      },
      policy: {
        maxViews,
        accessWindowStart: policy.accessWindowStart || null,
        accessWindowEnd: policy.accessWindowEnd || null,
        maxFailedAttempts: policy.maxFailedAttempts || 10,
      },
      remainingViews: maxViews,
      expiresAt,
      uploadStatus: 'pending',
      expectedChunks,
      userId,
      allowedCountries,
      allowedIPs,
    });

    return {
      vaultId: vault.vaultId,
      expectedChunks: vault.expectedChunks,
      expiresAt: vault.expiresAt,
      maxViews,
      chunkSizeBytes: env.chunkSizeBytes,
      deleteToken,
    };
  }

  /**
   * Upload a single chunk for a pending vault.
   * Idempotent — uploading the same chunk index again overwrites.
   *
   * @param {string} vaultId
   * @param {number} chunkIndex — 0-based
   * @param {Buffer} data — encrypted chunk data
   * @param {string} hash — SHA-256 hash of the encrypted chunk
   */
  async uploadChunk(vaultId, chunkIndex, data, hash) {
    // Verify vault exists and is pending
    const vault = await Vault.findOne({ vaultId, uploadStatus: 'pending', isDeleted: false });
    if (!vault) {
      throw new AppError(404, 'VAULT_NOT_FOUND', 'Vault not found or upload already complete');
    }

    if (chunkIndex < 0 || chunkIndex >= vault.expectedChunks) {
      throw new AppError(400, 'INVALID_CHUNK_INDEX', `Chunk index must be 0-${vault.expectedChunks - 1}`);
    }

    // Upload to blob storage
    const blobKey = `${vaultId}/chunk-${chunkIndex}`;
    await storageService.uploadChunk(blobKey, data, data.length);

    // Upsert chunk entry in vault doc (idempotent)
    const existingIdx = vault.chunks.findIndex((c) => c.index === chunkIndex);
    const chunkEntry = {
      index: chunkIndex,
      blobKey,
      size: data.length,
      hash,
    };

    if (existingIdx >= 0) {
      vault.chunks[existingIdx] = chunkEntry;
    } else {
      vault.chunks.push(chunkEntry);
    }

    await vault.save();

    return {
      chunkIndex,
      blobKey,
      uploadedChunks: vault.chunks.length,
      expectedChunks: vault.expectedChunks,
    };
  }

  /**
   * Finalize a vault upload. Verifies all chunks are present.
   * Transitions vault from 'pending' to 'complete'.
   */
  async finalizeVault(vaultId) {
    const vault = await Vault.findOne({ vaultId, uploadStatus: 'pending', isDeleted: false });
    if (!vault) {
      throw new AppError(404, 'VAULT_NOT_FOUND', 'Vault not found or already finalized');
    }

    if (vault.chunks.length !== vault.expectedChunks) {
      throw new AppError(400, 'INCOMPLETE_UPLOAD', 
        `Expected ${vault.expectedChunks} chunks, got ${vault.chunks.length}`);
    }

    // Sort chunks by index for consistent ordering
    vault.chunks.sort((a, b) => a.index - b.index);
    vault.uploadStatus = 'complete';
    await vault.save();

    return vault.toPublic();
  }

  /**
   * Abort a pending upload — delete all uploaded chunks and vault doc.
   */
  async abortUpload(vaultId) {
    const vault = await Vault.findOne({ vaultId, uploadStatus: 'pending' });
    if (!vault) {
      throw new AppError(404, 'VAULT_NOT_FOUND', 'Vault not found');
    }

    // Delete blobs
    const blobKeys = vault.chunks.map((c) => c.blobKey);
    await storageService.deleteVaultBlobs(blobKeys);

    // Delete document
    vault.uploadStatus = 'failed';
    vault.isDeleted = true;
    await vault.save();

    return { vaultId, status: 'aborted' };
  }

  /**
   * Get vault metadata for download (no content).
   * Enforces access policy synchronously.
   * Does NOT consume a view — that happens on actual chunk download.
   */
  async getVaultMetadata(vaultId) {
    const vault = await Vault.findOne({ vaultId, uploadStatus: 'complete', isDeleted: false });
    if (!vault) {
      throw new AppError(403, 'ACCESS_DENIED', 'This link is invalid or the content has been deleted. Please check with the sender.');
    }

    // Enforce access policy
    const access = vault.isAccessible();
    if (!access.ok) {
      const messages = {
        expired: 'This content has expired and is no longer available.',
        no_views_remaining: 'This content has reached its maximum view limit and is no longer available.',
        locked_out: 'This content has been locked due to too many failed access attempts.',
        deleted: 'This content has been deleted by the owner.',
        before_access_window: 'This content is not yet available. Please try again later.',
        after_access_window: 'The access window for this content has closed.',
      };
      throw new AppError(403, 'ACCESS_DENIED', messages[access.reason] || 'Access denied.');
    }

    return vault.toPublic();
  }

  /**
   * Consume a view and return chunk download info.
   * Atomically decrements the remaining views counter.
   * This is the burn-after-read enforcement point.
   */
  async consumeViewAndGetChunks(vaultId) {
    // First check access
    const vault = await Vault.findOne({ vaultId, uploadStatus: 'complete', isDeleted: false });
    if (!vault) {
      throw new AppError(403, 'ACCESS_DENIED', 'This link is invalid or the content has been deleted.');
    }

    const access = vault.isAccessible();
    if (!access.ok) {
      const messages = {
        expired: 'This content has expired and is no longer available.',
        no_views_remaining: 'This content has reached its maximum view limit.',
        locked_out: 'This content has been locked due to too many failed access attempts.',
        deleted: 'This content has been deleted by the owner.',
      };
      throw new AppError(403, 'ACCESS_DENIED', messages[access.reason] || 'Access denied.');
    }

    // Atomic view consumption
    const updated = await Vault.consumeView(vaultId);
    if (!updated) {
      throw new AppError(403, 'NO_VIEWS_REMAINING', 'No views remaining for this content.');
    }

    // Return chunk info for client to download
    const chunkInfos = updated.chunks
      .sort((a, b) => a.index - b.index)
      .map((chunk) => ({
        index: chunk.index,
        blobKey: chunk.blobKey,
        size: chunk.size,
        hash: chunk.hash,
      }));

    return {
      vault: updated.toPublic(),
      chunks: chunkInfos,
    };
  }

  /**
   * Download a specific chunk (proxied through backend).
   * The backend streams encrypted bytes — it cannot read them.
   */
  async downloadChunk(vaultId, chunkIndex) {
    const vault = await Vault.findOne({ vaultId, uploadStatus: 'complete', isDeleted: false });
    if (!vault) {
      throw new AppError(403, 'ACCESS_DENIED', 'This vault does not exist or has expired');
    }

    const chunk = vault.chunks.find((c) => c.index === chunkIndex);
    if (!chunk) {
      throw new AppError(404, 'CHUNK_NOT_FOUND', `Chunk ${chunkIndex} not found`);
    }

    // Stream encrypted chunk
    const stream = await storageService.downloadChunkStream(chunk.blobKey);
    return { stream, size: chunk.size, hash: chunk.hash };
  }

  /**
   * Record a failed access attempt (e.g., wrong password attempt client-side signal).
   */
  async recordFailedAccess(vaultId) {
    const result = await Vault.recordFailedAttempt(vaultId);
    if (!result) {
      throw new AppError(403, 'ACCESS_DENIED', 'This vault does not exist or has expired');
    }

    return {
      failedAttempts: result.failedAttempts,
      maxFailedAttempts: result.policy.maxFailedAttempts,
      lockedOut: result.failedAttempts >= result.policy.maxFailedAttempts,
    };
  }

  /**
   * Manually delete a vault using the delete token.
   * Only the original uploader has the delete token.
   */
  async deleteVault(vaultId, deleteToken) {
    const vault = await Vault.findOne({ vaultId, isDeleted: false });
    if (!vault) {
      throw new AppError(403, 'ACCESS_DENIED', 'This vault does not exist or has expired');
    }

    // Verify delete token
    const { createHash } = await import('crypto');
    const providedHash = createHash('sha256').update(deleteToken).digest('hex');

    if (!vault.deleteTokenHash || providedHash !== vault.deleteTokenHash) {
      throw new AppError(403, 'INVALID_DELETE_TOKEN', 'Invalid delete token');
    }

    // Delete blobs
    const blobKeys = vault.chunks.map((c) => c.blobKey);
    if (blobKeys.length > 0) {
      await storageService.deleteVaultBlobs(blobKeys);
    }

    // Delete document
    await Vault.deleteOne({ _id: vault._id });

    return { vaultId, status: 'deleted' };
  }

  /**
   * Cleanup expired and deleted vaults.
   * Called by cron job. TTL is backup only — this is the primary cleanup path.
   */
  async cleanupExpiredVaults() {
    const now = new Date();

    // Find vaults that are expired or deleted
    const expiredVaults = await Vault.find({
      $or: [
        { expiresAt: { $lte: now }, isDeleted: false },
        { isDeleted: true },
        { uploadStatus: 'failed' },
        // Stale pending uploads (older than 1 hour)
        {
          uploadStatus: 'pending',
          createdAt: { $lte: new Date(now.getTime() - 3_600_000) },
        },
      ],
    }).limit(100); // Process in batches

    let cleaned = 0;

    for (const vault of expiredVaults) {
      try {
        // Delete blobs
        const blobKeys = vault.chunks.map((c) => c.blobKey);
        if (blobKeys.length > 0) {
          await storageService.deleteVaultBlobs(blobKeys);
        }

        // Delete document
        await Vault.deleteOne({ _id: vault._id });
        cleaned++;
      } catch (err) {
        console.error(`[Cleanup] Failed to clean vault ${vault.vaultId}:`, err.message);
      }
    }

    if (cleaned > 0) {
      console.log(`[Cleanup] Removed ${cleaned} expired/deleted vaults`);
    }

    return { cleaned, total: expiredVaults.length };
  }
}

// Singleton
export default new VaultService();
