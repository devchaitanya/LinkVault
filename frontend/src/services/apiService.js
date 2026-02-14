import { API_BASE_URL } from '../config/constants.js';

/**
 * API Service — handles all HTTP communication with the backend.
 *
 * Trust boundary: this module sends ONLY encrypted data to the server.
 * It NEVER sends decryption keys, passwords, or plaintext.
 *
 * Extensibility: add new API methods here for new backend endpoints.
 */

class ApiService {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get auth token from localStorage.
   */
  _getAuthHeader() {
    const token = localStorage.getItem('lv_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Generic JSON fetch wrapper with error handling.
   */
  async _request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...this._getAuthHeader(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData?.error?.message || `Request failed: ${response.status}`);
      error.code = errorData?.error?.code || 'REQUEST_FAILED';
      error.status = response.status;
      error.details = errorData?.error?.details;
      throw error;
    }

    // For binary responses (chunk downloads)
    if (options.responseType === 'blob') {
      return response;
    }

    return response.json();
  }

  // ─── Upload Flow ───────────────────────────────────────────

  /**
   * Initialize a new vault upload session.
   * @returns {{ success: boolean, data: { vaultId, expectedChunks, expiresAt, maxViews, chunkSizeBytes } }}
   */
  async initializeVault({
    totalSize,
    expectedChunks,
    merkleRoot,
    encryptedFilename,
    displayName,
    mimeType,
    contentType,
    cryptoParams,
    policy,
    allowedIPs,
  }) {
    return this._request('/vaults', {
      method: 'POST',
      body: JSON.stringify({
        totalSize,
        expectedChunks,
        merkleRoot,
        encryptedFilename,
        displayName,
        mimeType,
        contentType,
        cryptoParams,
        policy,
        allowedIPs: allowedIPs || [],
      }),
    });
  }

  /**
   * Upload a single encrypted chunk.
   * Uses FormData to send binary data without base64 overhead.
   */
  async uploadChunk(vaultId, chunkIndex, encryptedBlob, hash) {
    const formData = new FormData();
    formData.append('chunkIndex', String(chunkIndex));
    formData.append('hash', hash);
    formData.append('chunk', new Blob([encryptedBlob]), `chunk-${chunkIndex}`);

    return this._request(`/vaults/${vaultId}/chunks`, {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Finalize the vault upload.
   */
  async finalizeVault(vaultId) {
    return this._request(`/vaults/${vaultId}/finalize`, {
      method: 'POST',
    });
  }

  /**
   * Abort a pending upload.
   */
  async abortUpload(vaultId) {
    return this._request(`/vaults/${vaultId}/upload`, {
      method: 'DELETE',
    });
  }

  // ─── Download Flow ─────────────────────────────────────────

  /**
   * Get vault metadata (no view consumed).
   */
  async getVaultMetadata(vaultId) {
    return this._request(`/vaults/${vaultId}`);
  }

  /**
   * Access vault — consume a view and get chunk info + session token.
   * The session token is stored internally and automatically sent with chunk downloads.
   * Sends the client's public IP via header so IP restriction works behind local proxies.
   */
  async accessVault(vaultId) {
    // Detect real public IP so IP restriction works even on localhost
    let publicIP;
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      publicIP = ipData.ip;
    } catch { /* best effort — backend falls back to req.ip */ }

    const headers = {};
    if (publicIP) headers['X-Client-Public-IP'] = publicIP;

    const result = await this._request(`/vaults/${vaultId}/access`, {
      method: 'POST',
      headers,
    });
    // Store the download session token for subsequent chunk downloads
    if (result?.data?.sessionToken) {
      this._downloadSessions = this._downloadSessions || {};
      this._downloadSessions[vaultId] = result.data.sessionToken;
    }
    return result;
  }

  /**
   * Download a single encrypted chunk as ArrayBuffer.
   * Sends the download session token obtained from accessVault.
   */
  async downloadChunk(vaultId, chunkIndex) {
    const url = `${this.baseUrl}/vaults/${vaultId}/chunks/${chunkIndex}`;
    const headers = {};
    if (this._downloadSessions?.[vaultId]) {
      headers['X-Download-Session'] = this._downloadSessions[vaultId];
    }
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Chunk download failed: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  // ─── Policy ────────────────────────────────────────────────

  /**
   * Report a failed access attempt (wrong password).
   */
  async reportFailedAccess(vaultId) {
    return this._request(`/vaults/${vaultId}/fail`, {
      method: 'POST',
    });
  }

  /**
   * Manually delete a vault using the delete token.
   */
  async deleteVault(vaultId, deleteToken) {
    return this._request(`/vaults/${vaultId}`, {
      method: 'DELETE',
      body: JSON.stringify({ deleteToken }),
    });
  }

  // ─── Health ────────────────────────────────────────────────

  async healthCheck() {
    return this._request('/health');
  }
}

// Singleton
const apiService = new ApiService();
export default apiService;
