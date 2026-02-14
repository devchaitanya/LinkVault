import { useState, useCallback } from 'react';
import { apiService } from '../services/index.js';
import {
  base64UrlToKey,
  exportKey,
  derivePasswordKey,
  combineKeysWithHKDF,
  decryptChunk,
  decryptFilename,
  sha256Hex,
  computeMerkleRoot,
  verifyPasswordCheck,
} from '../services/cryptoService.js';

/**
 * useDownload — orchestrates the entire download + client-side decrypt flow.
 *
 * Flow:
 *   1. Extract key from URL fragment (#k=...)
 *   2. Fetch vault metadata
 *   3. If password-protected: get password from user, derive key
 *   4. Consume a view (burn-after-read trigger)
 *   5. Download encrypted chunks
 *   6. Verify Merkle root
 *   7. Decrypt chunks client-side
 *   8. Reassemble file and trigger download
 */
export function useDownload() {
  const [state, setState] = useState({
    status: 'idle', // idle | loading | password_required | downloading | decrypting | done | error
    progress: 0,
    currentChunk: 0,
    totalChunks: 0,
    metadata: null,
    error: null,
    filename: null,
    textContent: null, // For text vaults — holds decrypted text
    contentType: null, // 'text' or 'file'
  });

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      progress: 0,
      currentChunk: 0,
      totalChunks: 0,
      metadata: null,
      error: null,
      filename: null,
      textContent: null,
      contentType: null,
    });
  }, []);

  /**
   * Retry from error — goes back to password_required or idle,
   * preserving metadata so the user doesn't need to re-paste the link.
   */
  const retryFromError = useCallback(() => {
    setState((s) => {
      const base = {
        status: 'idle',
        error: null,
        progress: 10,
        metadata: s.metadata,
        currentChunk: 0,
        totalChunks: 0,
        textContent: null,
        filename: null,
        contentType: null,
      };
      if (s.metadata?.cryptoParams?.isPasswordProtected) {
        return { ...base, status: 'password_required' };
      }
      return base;
    });
  }, []);

  /**
   * Fetch metadata and check if password is needed.
   * Call this first with the vaultId.
   */
  const fetchMetadata = useCallback(async (vaultId) => {
    try {
      setState((s) => ({ ...s, status: 'loading', progress: 5 }));

      const result = await apiService.getVaultMetadata(vaultId);
      const metadata = result.data;

      if (metadata.cryptoParams?.isPasswordProtected) {
        setState((s) => ({
          ...s,
          status: 'password_required',
          metadata,
          progress: 10,
        }));
        return { needsPassword: true, metadata };
      }

      setState((s) => ({
        ...s,
        status: 'idle',
        metadata,
        progress: 10,
      }));
      return { needsPassword: false, metadata };
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err.message || 'Failed to load vault',
      }));
      throw err;
    }
  }, []);

  /**
   * Download and decrypt the vault contents.
   * @param {string} vaultId
   * @param {string} keyFragment — base64url key from URL fragment
   * @param {string} [password] — user's password (if required)
   */
  const downloadAndDecrypt = useCallback(async (vaultId, keyFragment, password = null) => {
    try {
      // ── Step 1: Recover encryption key ────────────────────
      setState((s) => ({ ...s, status: 'downloading', progress: 12 }));

      const contentKey = await base64UrlToKey(keyFragment);
      let decryptionKey = contentKey;

      // ── Step 2: Handle password ───────────────────────────
      // Derive the combined key and verify BEFORE consuming a view.
      // This prevents wrong-password attempts from burning views.
      if (password && state.metadata?.cryptoParams?.isPasswordProtected) {
        const saltBase64 = state.metadata.cryptoParams.pbkdf2Salt;
        const saltBinary = atob(saltBase64);
        const salt = new Uint8Array(saltBinary.length);
        for (let i = 0; i < saltBinary.length; i++) {
          salt[i] = saltBinary.charCodeAt(i);
        }

        const contentKeyRaw = await exportKey(contentKey);
        const passwordKeyRaw = await derivePasswordKey(password, salt);
        decryptionKey = await combineKeysWithHKDF(contentKeyRaw, passwordKeyRaw);

        // If a passwordCheck value exists, verify the password pre-flight
        if (state.metadata.cryptoParams.passwordCheck) {
          const isValid = await verifyPasswordCheck(
            decryptionKey,
            state.metadata.cryptoParams.passwordCheck
          );
          if (!isValid) {
            // Report failed attempt (lockout tracking) but do NOT consume a view
            try {
              await apiService.reportFailedAccess(vaultId);
            } catch { /* best effort */ }
            throw new Error('Wrong password — please try again');
          }
        }
      }

      // ── Step 3: Consume a view and get chunk info ─────────
      // Only reached if password is correct (or no password needed)
      setState((s) => ({ ...s, progress: 15 }));
      const accessResult = await apiService.accessVault(vaultId);
      const { chunks } = accessResult.data;
      const totalChunks = chunks.length;

      setState((s) => ({ ...s, totalChunks }));

      // ── Step 4: Download encrypted chunks ─────────────────
      const encryptedChunks = [];
      const downloadedHashes = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunkData = await apiService.downloadChunk(vaultId, chunks[i].index);
        encryptedChunks.push(chunkData);

        // Verify hash of encrypted chunk
        const hash = await sha256Hex(chunkData);
        downloadedHashes.push(hash);

        if (hash !== chunks[i].hash) {
          throw new Error(`Chunk ${i} integrity check failed`);
        }

        setState((s) => ({
          ...s,
          currentChunk: i + 1,
          progress: 15 + Math.round(((i + 1) / totalChunks) * 45), // 15-60%
        }));
      }

      // ── Step 5: Verify Merkle root ────────────────────────
      setState((s) => ({ ...s, progress: 62 }));
      const computedMerkle = await computeMerkleRoot(downloadedHashes);
      if (computedMerkle !== state.metadata.merkleRoot) {
        throw new Error('Merkle root verification failed — data may be tampered');
      }

      // ── Step 6: Decrypt chunks ────────────────────────────
      setState((s) => ({ ...s, status: 'decrypting', progress: 65 }));

      const decryptedChunks = [];
      for (let i = 0; i < totalChunks; i++) {
        try {
          const plaintext = await decryptChunk(decryptionKey, encryptedChunks[i]);
          decryptedChunks.push(plaintext);
        } catch {
          // If first chunk fails on a password-protected vault without passwordCheck,
          // it's likely a wrong password (legacy vaults without pre-flight check)
          if (i === 0 && state.metadata?.cryptoParams?.isPasswordProtected &&
              !state.metadata.cryptoParams.passwordCheck) {
            try {
              await apiService.reportFailedAccess(vaultId);
            } catch { /* best effort */ }
            throw new Error('Decryption failed — wrong password or corrupted data');
          }
          throw new Error(`Failed to decrypt chunk ${i}`);
        }

        setState((s) => ({
          ...s,
          currentChunk: i + 1,
          progress: 65 + Math.round(((i + 1) / totalChunks) * 25), // 65-90%
        }));
      }

      // ── Step 7: Decrypt filename ──────────────────────────
      let filename = 'download';
      if (state.metadata.encryptedFilename) {
        try {
          filename = await decryptFilename(decryptionKey, state.metadata.encryptedFilename);
        } catch {
          console.warn('Could not decrypt filename, using default');
        }
      }

      // ── Step 8: Reassemble and handle based on content type ─
      setState((s) => ({ ...s, progress: 95, filename }));

      const blob = new Blob(decryptedChunks, { type: state.metadata.mimeType });
      const isText = state.metadata.contentType === 'text';

      if (isText) {
        // Text vault — read as text and return for display
        const textContent = await blob.text();

        setState((s) => ({
          ...s,
          status: 'done',
          progress: 100,
          filename,
          textContent,
          contentType: 'text',
        }));

        return { filename, size: blob.size, textContent };
      }

      // File vault — trigger browser download
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 1000);

      setState((s) => ({
        ...s,
        status: 'done',
        progress: 100,
        filename,
        contentType: 'file',
      }));

      return { filename, size: blob.size };
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err.message || 'Download failed',
      }));
      throw err;
    }
  }, [state.metadata]);

  return {
    ...state,
    fetchMetadata,
    downloadAndDecrypt,
    reset,
    retryFromError,
  };
}
