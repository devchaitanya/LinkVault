import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { VaultInfo, PasswordPrompt, TextViewer } from '../components/download/index.js';
import { ProgressBar, StatusMessage, Button } from '../components/common/index.js';
import { useDownload, usePeerPresence } from '../hooks/index.js';
import { extractKeyFromHash } from '../utils/helpers.js';

export default function DownloadPage() {
  const { vaultId } = useParams();
  const location = useLocation();
  const [keyFragment, setKeyFragment] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [downloadMode, setDownloadMode] = useState('cloud'); // 'cloud' | 'p2p'

  const {
    status,
    progress,
    currentChunk,
    totalChunks,
    metadata,
    error,
    filename,
    textContent,
    contentType,
    fetchMetadata,
    downloadAndDecrypt,
    reset,
    retryFromError,
  } = useDownload();

  // Track peers viewing this vault (BroadcastChannel across tabs)
  const { peerCount } = usePeerPresence(
    vaultId,
    downloadMode === 'p2p' && !!keyFragment
  );

  // Extract key from URL fragment on mount
  useEffect(() => {
    const key = extractKeyFromHash(location.hash);
    setKeyFragment(key);

    if (!key) {
      // No key in URL — show error
      return;
    }

    // Always reset & fetch metadata on mount/refresh
    // This ensures a fresh state after browser refresh
    reset();
    setPasswordError(null);
    if (vaultId) {
      fetchMetadata(vaultId).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, location.hash]);

  // Handle non-password download
  const handleDownload = useCallback(async () => {
    if (!vaultId || !keyFragment) return;

    try {
      await downloadAndDecrypt(vaultId, keyFragment);
    } catch {
      // Error is in state
    }
  }, [vaultId, keyFragment, downloadAndDecrypt]);

  // Handle password submit
  const handlePasswordSubmit = useCallback(async (password) => {
    if (!vaultId || !keyFragment) return;

    setPasswordError(null);
    try {
      await downloadAndDecrypt(vaultId, keyFragment, password);
    } catch (err) {
      const msg = err.message || 'Decryption failed';
      setPasswordError(msg);
      // For password/decryption errors, go back to password prompt
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('decrypt')) {
        retryFromError();
      }
    }
  }, [vaultId, keyFragment, downloadAndDecrypt, retryFromError]);

  // Handle general retry (re-fetch metadata from scratch)
  const handleRetry = useCallback(async () => {
    setPasswordError(null);
    reset();
    if (vaultId) {
      try { await fetchMetadata(vaultId); } catch {}
    }
  }, [vaultId, fetchMetadata, reset]);

  const statusLabels = {
    loading: 'Loading vault info...',
    downloading: `Downloading chunk ${currentChunk}/${totalChunks}...`,
    decrypting: `Decrypting chunk ${currentChunk}/${totalChunks}...`,
  };

  const isProcessing = ['downloading', 'decrypting'].includes(status);
  const showModeToggle = metadata && ['idle', 'password_required'].includes(status);

  // ─── No Key Error ──────────────────────────────────────────
  if (!keyFragment) {
    return (
      <div className="w-full max-w-md mx-auto text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-100">Missing decryption key</h2>
        <p className="text-sm text-slate-400">
          The decryption key should be included in the URL fragment.<br />
          Make sure you have the complete link from the sender.
        </p>
        <StatusMessage
          type="warning"
          message="The URL fragment (the part after #) contains the decryption key and is never sent to the server. If it's missing, the content cannot be decrypted."
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-6">
      {/* Loading state */}
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading vault...</p>
        </div>
      )}

      {/* Download mode toggle + vault info / password prompt */}
      {showModeToggle && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          {/* Download mode toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
            <div>
              <p className="text-sm font-medium text-slate-300">Download Mode</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {downloadMode === 'cloud' ? 'Direct server download' : 'P2P torrent-like download (WebRTC)'}
              </p>
            </div>
            <div className="flex rounded-lg bg-slate-800/50 p-0.5">
              <button
                type="button"
                onClick={() => setDownloadMode('cloud')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${downloadMode === 'cloud' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-300'}`}
              >
                Cloud
              </button>
              <button
                type="button"
                onClick={() => setDownloadMode('p2p')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${downloadMode === 'p2p' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-300'}`}
              >
                P2P
              </button>
            </div>
          </div>
          {downloadMode === 'p2p' && (
            <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${peerCount > 0 ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
                <span className="text-xs text-slate-400">
                  {peerCount > 0
                    ? `${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`
                    : 'Searching for peers...'}
                </span>
              </div>
              <p className="text-xs text-amber-300/80">
                {peerCount > 0
                  ? `P2P mode detects ${peerCount} other tab${peerCount !== 1 ? 's' : ''} viewing this vault. WebRTC peer download coming soon — currently falls back to cloud.`
                  : 'P2P mode uses WebRTC to download directly from peers when available. Falls back to cloud if no peers are connected.'}
              </p>
            </div>
          )}

          {/* Password required (with toggle visible) */}
          {status === 'password_required' && (
            <PasswordPrompt
              onSubmit={handlePasswordSubmit}
              loading={isProcessing}
              error={passwordError}
              contentType={metadata?.contentType}
            />
          )}

          {/* Vault info (ready to download/view) */}
          {status === 'idle' && (
            <VaultInfo
              metadata={metadata}
              onDownload={handleDownload}
              loading={isProcessing}
              contentType={metadata?.contentType}
            />
          )}
        </div>
      )}

      {/* Progress */}
      {isProcessing && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="text-center mb-2">
            <h3 className="text-lg font-semibold text-slate-100">
              {status === 'downloading' ? 'Downloading' : 'Decrypting'}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {status === 'downloading' ? 'Fetching encrypted data...' : 'Decrypting in your browser...'}
            </p>
          </div>
          <ProgressBar
            progress={progress}
            label={statusLabels[status] || 'Processing...'}
          />
        </div>
      )}

      {/* Success — Text vault */}
      {status === 'done' && contentType === 'text' && textContent != null && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Decrypted text</h3>
              <p className="text-sm text-slate-400">This content was securely encrypted end-to-end.</p>
            </div>
          </div>
          <TextViewer textContent={textContent} filename={filename} />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={handleRetry} className="flex-1">
              View again
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/'} className="flex-1">
              Share your own
            </Button>
          </div>
        </div>
      )}

      {/* Success — File vault */}
      {status === 'done' && contentType !== 'text' && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-100">Download complete</h3>
          <p className="text-sm text-slate-400">
            {filename ? (
              <><span className="text-slate-300 font-medium">{filename}</span> has been decrypted and downloaded.</>
            ) : (
              'File has been decrypted and downloaded.'
            )}
          </p>
          <div className="flex gap-3 justify-center mt-3">
            <Button variant="secondary" onClick={handleRetry}>
              Download again
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/'}>
              Upload your own
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <div className="space-y-4">
          <StatusMessage type="error" message={error} />
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={handleRetry}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/'}>
              Go home
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
