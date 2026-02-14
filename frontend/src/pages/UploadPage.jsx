import { useState, useCallback } from 'react';
import { FileDropZone, TextInput, UploadOptions, ShareLink } from '../components/upload/index.js';
import { ProgressBar, StatusMessage, Button } from '../components/common/index.js';
import { useUpload } from '../hooks/index.js';
import { DEFAULT_EXPIRY_MS, DEFAULT_MAX_VIEWS } from '../config/constants.js';

/**
 * UploadPage — main page for uploading files or text.
 *
 * Flow: Select mode (File/Text) → Add content → Configure options → Encrypt & Upload → Get share link
 */
export default function UploadPage() {
  const [mode, setMode] = useState('file'); // 'file' | 'text'
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [options, setOptions] = useState({
    expiryMs: DEFAULT_EXPIRY_MS,
    maxViews: DEFAULT_MAX_VIEWS,
    password: '',
    allowedIPs: '',
  });

  const {
    status,
    progress,
    currentChunk,
    totalChunks,
    shareUrl,
    error,
    vaultId,
    deleteToken,
    upload,
    abort,
    reset,
  } = useUpload();

  // Content check: for text, require non-empty trimmed string
  const hasContent = mode === 'file' ? !!file : (text && text.trim().length > 0);

  // Mode switching — clear error state and content from the other mode
  const switchMode = useCallback((newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    if (newMode === 'file') {
      setText('');
    } else {
      setFile(null);
    }
    // Clear any previous error when switching modes
    if (status === 'error') {
      reset();
    }
  }, [mode, status, reset]);

  const handleUpload = useCallback(async () => {
    if (!hasContent) return;

    try {
      if (mode === 'text') {
        await upload(null, {
          password: options.password || null,
          expiryMs: options.expiryMs,
          maxViews: options.maxViews,
          text: text.trim(),
          contentType: 'text',
          allowedIPs: options.allowedIPs || '',
        });
      } else {
        await upload(file, {
          password: options.password || null,
          expiryMs: options.expiryMs,
          maxViews: options.maxViews,
          contentType: 'file',
          allowedIPs: options.allowedIPs || '',
        });
      }
    } catch {
      // Error is in state
    }
  }, [hasContent, mode, file, text, options, upload]);

  const handleNewUpload = useCallback(() => {
    setFile(null);
    setText('');
    setMode('file');
    setOptions({
      expiryMs: DEFAULT_EXPIRY_MS,
      maxViews: DEFAULT_MAX_VIEWS,
      password: '',
      allowedIPs: '',
    });
    reset();
  }, [reset]);

  const statusLabels = {
    encrypting: `Encrypting chunk ${currentChunk}/${totalChunks}...`,
    uploading: `Uploading chunk ${currentChunk}/${totalChunks}...`,
    finalizing: 'Finalizing vault...',
  };

  const isProcessing = ['encrypting', 'uploading', 'finalizing'].includes(status);

  return (
    <div className="w-full max-w-xl mx-auto space-y-6">
      {/* Title */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-100">Share securely</h1>
        <p className="text-slate-400 mt-1.5">
          Your content is encrypted in your browser before uploading. No one else can read it.
        </p>
      </div>

      {status === 'done' && shareUrl ? (
        /* ── Success State ─────────────────────────────── */
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-5">
          <ShareLink
            shareUrl={shareUrl}
            vaultId={vaultId}
            deleteToken={deleteToken}
            maxViews={options.maxViews}
            expiresAt={new Date(Date.now() + options.expiryMs).toISOString()}
          />
          <div className="pt-2">
            <Button variant="secondary" onClick={handleNewUpload} className="w-full">
              Share something else
            </Button>
          </div>
        </div>
      ) : (
        /* ── Upload Form ───────────────────────────────── */
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
          {/* Mode switcher (File / Text) */}
          {!isProcessing && (
            <div className="flex rounded-lg bg-slate-800/50 p-1">
              <button
                type="button"
                onClick={() => switchMode('file')}
                className={`
                  flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150
                  flex items-center justify-center gap-2
                  ${mode === 'file'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-400 hover:text-slate-300'
                  }
                `}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                File
              </button>
              <button
                type="button"
                onClick={() => switchMode('text')}
                className={`
                  flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150
                  flex items-center justify-center gap-2
                  ${mode === 'text'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-400 hover:text-slate-300'
                  }
                `}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Text
              </button>
            </div>
          )}

          {/* Content input */}
          {mode === 'file' ? (
            <FileDropZone onFileSelect={setFile} disabled={isProcessing} />
          ) : (
            <TextInput onTextChange={setText} disabled={isProcessing} />
          )}

          {/* Options (shown when content is ready) */}
          {hasContent && !isProcessing && (
            <UploadOptions options={options} onChange={setOptions} />
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-3">
              <ProgressBar
                progress={progress}
                label={statusLabels[status] || 'Processing...'}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <StatusMessage type="error" message={error} />
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {isProcessing ? (
              <Button variant="danger" onClick={abort} className="w-full">
                Cancel
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleUpload}
                disabled={!hasContent || isProcessing}
                loading={isProcessing}
                className="w-full"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Encrypt & {mode === 'text' ? 'Share' : 'Upload'}
              </Button>
            )}
          </div>

          {/* Security reminder */}
          {!isProcessing && !error && (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Encrypted with AES-256-GCM · Key never leaves your browser
            </div>
          )}
        </div>
      )}

      {/* Content safety notice */}
      <div className="text-center">
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          All content is end-to-end encrypted. The server never sees your plaintext data.
        </p>
      </div>
    </div>
  );
}
