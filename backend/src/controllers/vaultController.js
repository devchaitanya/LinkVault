import { vaultService } from '../services/index.js';
import { hashForLog, AppError } from '../utils/helpers.js';
import { Vault } from '../models/index.js';
import { generateDownloadSessionToken, verifyDownloadSessionToken } from '../middleware/auth.js';

/**
 * Check IP restrictions on a vault.
 */
function checkIPRestriction(vault, clientIP) {
  if (vault.allowedIPs && vault.allowedIPs.length > 0) {
    const normalizedIP = clientIP.replace('::ffff:', '');
    if (!vault.allowedIPs.includes(normalizedIP)) {
      throw new AppError(403, 'GEO_RESTRICTED', 'Access denied: your IP is not allowed');
    }
  }
}

class VaultController {
  /**
   * POST /api/vaults
   * Initialize a new vault upload session.
   */
  async initializeVault(req, res, next) {
    try {
      const result = await vaultService.initializeVault({
        totalSize: req.body.totalSize,
        expectedChunks: req.body.expectedChunks,
        merkleRoot: req.body.merkleRoot,
        encryptedFilename: req.body.encryptedFilename || null,
        displayName: req.body.displayName || null,
        mimeType: req.body.mimeType || 'application/octet-stream',
        contentType: req.body.contentType || 'file',
        cryptoParams: req.body.cryptoParams || {},
        policy: req.body.policy || {},
        userId: req.userId || null,
        allowedCountries: req.body.allowedCountries || [],
        allowedIPs: req.body.allowedIPs || [],
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/vaults/:vaultId/chunks
   * Upload a single encrypted chunk.
   */
  async uploadChunk(req, res, next) {
    try {
      const { vaultId } = req.params;
      const chunkIndex = parseInt(req.body.chunkIndex, 10);
      const hash = req.body.hash;

      // Chunk data comes from multer (file upload) or raw body
      let data;
      if (req.file) {
        data = req.file.buffer;
      } else {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_CHUNK_DATA', message: 'Chunk file is required' },
        });
      }

      const result = await vaultService.uploadChunk(vaultId, chunkIndex, data, hash);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/vaults/:vaultId/finalize
   * Finalize upload — mark vault as complete.
   */
  async finalizeVault(req, res, next) {
    try {
      const { vaultId } = req.params;
      const result = await vaultService.finalizeVault(vaultId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/vaults/:vaultId/upload
   * Abort a pending upload.
   */
  async abortUpload(req, res, next) {
    try {
      const { vaultId } = req.params;
      const result = await vaultService.abortUpload(vaultId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/vaults/:vaultId
   * Get vault metadata (no content, no view consumed).
   */
  async getVaultMetadata(req, res, next) {
    try {
      const { vaultId } = req.params;
      const result = await vaultService.getVaultMetadata(vaultId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/vaults/:vaultId/access
   * Consume a view and get chunk download info.
   * This is the burn-after-read endpoint.
   */
  async accessVault(req, res, next) {
    try {
      const { vaultId } = req.params;

      // Check geofencing / IP restriction
      const vault = await Vault.findOne({ vaultId, uploadStatus: 'complete', isDeleted: false });
      if (vault) {
        const clientIP = req.ip || req.connection?.remoteAddress || '';
        checkIPRestriction(vault, clientIP);
      }

      const result = await vaultService.consumeViewAndGetChunks(vaultId);

      // Generate a short-lived download session token for chunk downloads
      const sessionToken = generateDownloadSessionToken(vaultId);

      res.status(200).json({
        success: true,
        data: { ...result, sessionToken },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/vaults/:vaultId/chunks/:chunkIndex
   * Download a single encrypted chunk (proxied stream).
   * Requires a valid download session token from the access endpoint.
   */
  async downloadChunk(req, res, next) {
    try {
      const { vaultId } = req.params;
      const chunkIndex = parseInt(req.params.chunkIndex, 10);

      if (isNaN(chunkIndex) || chunkIndex < 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_CHUNK_INDEX', message: 'Invalid chunk index' },
        });
      }

      // Validate download session token
      const sessionToken = req.headers['x-download-session'];
      if (!sessionToken) {
        return res.status(401).json({
          success: false,
          error: { code: 'MISSING_SESSION', message: 'Download session token required' },
        });
      }

      const session = verifyDownloadSessionToken(sessionToken);
      if (!session || session.vaultId !== vaultId) {
        return res.status(403).json({
          success: false,
          error: { code: 'INVALID_SESSION', message: 'Invalid or expired download session' },
        });
      }

      const { stream, size, hash } = await vaultService.downloadChunk(vaultId, chunkIndex);

      // Set headers for encrypted binary download
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', size);
      res.setHeader('X-Chunk-Hash', hash);
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/vaults/:vaultId/fail
   * Record a failed access attempt (client signals wrong password).
   */
  async recordFailedAccess(req, res, next) {
    try {
      const { vaultId } = req.params;
      const result = await vaultService.recordFailedAccess(vaultId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/vaults/:vaultId
   * Manually delete a vault using the delete token.
   */
  async deleteVault(req, res, next) {
    try {
      const { vaultId } = req.params;
      const { deleteToken, authenticatedDelete } = req.body;

      // Authenticated delete: user owns the vault
      if (authenticatedDelete) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required for dashboard delete' },
          });
        }
        const { verifyToken } = await import('../middleware/auth.js');
        const decoded = verifyToken(authHeader.split(' ')[1]);
        if (!decoded) {
          return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
          });
        }
        // Check vault ownership
        const vault = await Vault.findOne({ vaultId, isDeleted: false });
        if (!vault) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Vault not found' },
          });
        }
        if (!vault.userId || vault.userId.toString() !== decoded.userId) {
          return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'You do not own this vault' },
          });
        }
        // Mark as deleted and purge blob storage immediately
        vault.isDeleted = true;
        await vault.save();
        // Also delete blobs from Azure Blob Storage
        try {
          const blobKeys = vault.chunks.map((c) => c.blobKey).filter(Boolean);
          if (blobKeys.length > 0) {
            const storageService = (await import('../services/storageService.js')).default;
            await storageService.deleteVaultBlobs(blobKeys);
          }
        } catch { /* blobs will be cleaned up by cron if this fails */ }
        return res.status(200).json({ success: true, data: { vaultId, status: 'deleted' } });
      }

      // Token-based delete (unauthenticated)
      if (!deleteToken) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_TOKEN', message: 'Delete token is required' },
        });
      }

      const result = await vaultService.deleteVault(vaultId, deleteToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/health
   * Health check endpoint.
   */
  async healthCheck(req, res) {
    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  }
}

export default new VaultController();
