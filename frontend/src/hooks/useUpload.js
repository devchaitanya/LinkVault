import { useState, useCallback, useRef } from 'react';
import { apiService } from '../services/index.js';
import {
  generateContentKey,
  exportKey,
  generateSalt,
  derivePasswordKey,
  combineKeysWithHKDF,
  encryptChunk,
  encryptFilename,
  sha256Hex,
  computeMerkleRoot,
  sliceFile,
  blobToArrayBuffer,
  keyToBase64Url,
  generatePasswordCheck,
} from '../services/cryptoService.js';
import { CHUNK_SIZE, DEFAULT_EXPIRY_MS, DEFAULT_MAX_VIEWS } from '../config/constants.js';

/**
 * useUpload — orchestrates the entire client-side encrypt + upload flow.
 * Supports both file and text uploads.
 *
 * Flow:
 *   1. Generate content key
 *   2. If password: derive password key, combine with HKDF
 *   3. Create blob from file or text
 *   4. Slice into chunks
 *   5. Encrypt each chunk client-side
 *   6. Hash each encrypted chunk (for Merkle tree)
 *   7. Compute Merkle root
 *   8. Initialize vault on backend
 *   9. Upload encrypted chunks
 *  10. Finalize vault
 *  11. Return share URL with key in fragment
 */
export function useUpload() {
  const [state, setState] = useState({
    status: 'idle', // idle | encrypting | uploading | finalizing | done | error
    progress: 0, // 0-100
    currentChunk: 0,
    totalChunks: 0,
    shareUrl: null,
    error: null,
    vaultId: null,
    deleteToken: null,
  });

  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = false;
    setState({
      status: 'idle',
      progress: 0,
      currentChunk: 0,
      totalChunks: 0,
      shareUrl: null,
      error: null,
      vaultId: null,
      deleteToken: null,
    });
  }, []);

  const abort = useCallback(async () => {
    abortRef.current = true;
    if (state.vaultId) {
      try {
        await apiService.abortUpload(state.vaultId);
      } catch {
        // Best effort
      }
    }
    reset();
  }, [state.vaultId, reset]);

  /**
   * Upload content (file or text).
   * @param {File|null} file — file to upload (null if text mode)
   * @param {Object} options
   * @param {string} [options.text] — text content (used if contentType is 'text')
   * @param {string} [options.contentType] — 'file' or 'text'
   */
  const upload = useCallback(async (file, options = {}) => {
    const {
      password = null,
      expiryMs = DEFAULT_EXPIRY_MS,
      maxViews = DEFAULT_MAX_VIEWS,
      text = null,
      contentType = 'file',
      allowedIPs = '',
    } = options;

    abortRef.current = false;

    // Create a Blob from text if text mode
    let uploadBlob;
    let uploadName;
    let uploadMime;

    if (contentType === 'text' && text) {
      uploadBlob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      uploadName = 'paste.txt';
      uploadMime = 'text/plain';
    } else if (file) {
      uploadBlob = file;
      uploadName = file.name;
      uploadMime = file.type || 'application/octet-stream';
    } else {
      throw new Error('No content to upload');
    }

    try {
      // ── Step 1: Generate content key ──────────────────────
      setState((s) => ({ ...s, status: 'encrypting', progress: 0 }));

      const contentKey = await generateContentKey();
      const contentKeyRaw = await exportKey(contentKey);

      // ── Step 2: Handle password protection ────────────────
      let encryptionKey = contentKey;
      let cryptoParams = {};

      if (password) {
        const salt = generateSalt();
        const passwordKeyRaw = await derivePasswordKey(password, salt);
        encryptionKey = await combineKeysWithHKDF(contentKeyRaw, passwordKeyRaw);

        // Generate a password check value so recipients can verify
        // the password BEFORE consuming a view (no burn-after-read on wrong password)
        const passwordCheck = await generatePasswordCheck(encryptionKey);

        cryptoParams = {
          isPasswordProtected: true,
          pbkdf2Salt: btoa(String.fromCharCode(...salt)),
          pbkdf2Iterations: 100_000,
          passwordCheck,
        };
      }

      // ── Step 3: Slice blob into chunks ────────────────────
      const chunks = sliceFile(uploadBlob, CHUNK_SIZE);
      const totalChunks = chunks.length;
      setState((s) => ({ ...s, totalChunks }));

      // ── Step 4-5: Encrypt chunks and compute hashes ───────
      const encryptedChunks = [];
      const chunkHashes = [];

      for (let i = 0; i < totalChunks; i++) {
        if (abortRef.current) return;

        const plaintext = await blobToArrayBuffer(chunks[i]);
        const encrypted = await encryptChunk(encryptionKey, plaintext);

        encryptedChunks.push(encrypted);

        // Hash the encrypted chunk (not plaintext) for Merkle tree
        const hash = await sha256Hex(encrypted);
        chunkHashes.push(hash);

        setState((s) => ({
          ...s,
          currentChunk: i + 1,
          progress: Math.round(((i + 1) / totalChunks) * 40), // 0-40% = encryption
        }));
      }

      // ── Step 6: Compute Merkle root ───────────────────────
      const merkleRoot = await computeMerkleRoot(chunkHashes);

      // ── Step 7: Encrypt filename ──────────────────────────
      const encryptedName = await encryptFilename(encryptionKey, uploadName);

      // Total encrypted size
      const totalSize = encryptedChunks.reduce((sum, c) => sum + c.byteLength, 0);

      // ── Step 8: Initialize vault on backend ───────────────
      setState((s) => ({ ...s, status: 'uploading', progress: 42 }));

      const initResult = await apiService.initializeVault({
        totalSize,
        expectedChunks: totalChunks,
        merkleRoot,
        encryptedFilename: encryptedName,
        displayName: contentType === 'text' ? 'Text paste' : uploadName,
        mimeType: uploadMime,
        contentType,
        cryptoParams,
        policy: {
          expiryMs,
          maxViews,
        },
        allowedIPs: allowedIPs ? allowedIPs.split(',').map(ip => ip.trim()).filter(Boolean) : [],
      });

      const vaultId = initResult.data.vaultId;
      const deleteToken = initResult.data.deleteToken;
      setState((s) => ({ ...s, vaultId }));

      // ── Step 9: Upload encrypted chunks ───────────────────
      for (let i = 0; i < totalChunks; i++) {
        if (abortRef.current) return;

        await apiService.uploadChunk(vaultId, i, encryptedChunks[i], chunkHashes[i]);

        setState((s) => ({
          ...s,
          currentChunk: i + 1,
          progress: 42 + Math.round(((i + 1) / totalChunks) * 50), // 42-92% = upload
        }));
      }

      // ── Step 10: Finalize ─────────────────────────────────
      setState((s) => ({ ...s, status: 'finalizing', progress: 94 }));
      await apiService.finalizeVault(vaultId);

      // ── Step 11: Build share URL ──────────────────────────
      const keyBase64 = await keyToBase64Url(contentKey);
      const origin = window.location.origin;
      const shareUrl = `${origin}/vault/${vaultId}#k=${keyBase64}`;

      setState({
        status: 'done',
        progress: 100,
        currentChunk: totalChunks,
        totalChunks,
        shareUrl,
        error: null,
        vaultId,
        deleteToken,
      });

      // Persist share URL (with key fragment) for dashboard access
      try {
        const stored = JSON.parse(localStorage.getItem('lv_share_urls') || '{}');
        stored[vaultId] = shareUrl;
        localStorage.setItem('lv_share_urls', JSON.stringify(stored));
      } catch { /* localStorage may be full */ }

      return { shareUrl, vaultId, deleteToken };
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err.message || 'Upload failed',
      }));
      throw err;
    }
  }, []);

  return {
    ...state,
    upload,
    abort,
    reset,
  };
}
