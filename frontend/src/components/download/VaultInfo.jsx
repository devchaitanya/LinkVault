import { formatBytes, formatRelativeTime } from '../../utils/helpers.js';
import { Button } from '../common/index.js';

/**
 * VaultInfo — displays vault metadata before triggering download/view.
 * Shows "View & Decrypt" for text vaults, "Download & Decrypt" for files.
 */
export default function VaultInfo({ metadata, onDownload, loading = false, contentType }) {
  if (!metadata) return null;

  const isText = contentType === 'text';

  return (
    <div className="w-full max-w-md mx-auto space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className={`w-14 h-14 rounded-2xl ${isText ? 'bg-violet-500/10 border-violet-500/20' : 'bg-blue-500/10 border-blue-500/20'} border flex items-center justify-center mx-auto mb-4`}>
          {isText ? (
            <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          ) : (
            <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
            </svg>
          )}
        </div>
        <h3 className="text-lg font-semibold text-slate-100">
          {isText ? 'Ready to view' : 'Ready to download'}
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          {isText ? 'End-to-end encrypted text' : 'End-to-end encrypted file'}
        </p>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Size</p>
          <p className="text-sm text-slate-300 mt-0.5">{formatBytes(metadata.totalSize)}</p>
        </div>
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Chunks</p>
          <p className="text-sm text-slate-300 mt-0.5">{metadata.chunkCount}</p>
        </div>
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Expiry</p>
          <p className="text-sm text-slate-300 mt-0.5">
            {formatRelativeTime(metadata.expiresAt)}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Views left</p>
          <p className="text-sm text-slate-300 mt-0.5">{metadata.remainingViews}</p>
        </div>
      </div>

      {/* Security badge */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        AES-256-GCM · Client-side decryption · Zero-knowledge server
      </div>

      {/* Download/View button */}
      <Button
        variant="primary"
        size="lg"
        onClick={onDownload}
        loading={loading}
        className="w-full"
      >
        {isText ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        )}
        {isText ? 'View & Decrypt' : 'Download & Decrypt'}
      </Button>

      {/* Warning */}
      <p className="text-xs text-slate-500 text-center leading-relaxed">
        {isText ? 'Viewing' : 'Downloading'} will consume 1 view. {isText ? 'Text' : 'The file'} will be decrypted in your browser.
        {metadata.remainingViews <= 1 && (
          <span className="text-amber-400 font-medium block mt-1">
            This is the last available view — the vault will be inaccessible after this.
          </span>
        )}
      </p>
    </div>
  );
}
