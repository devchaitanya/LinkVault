import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../common/index.js';
import { copyToClipboard, formatRelativeTime } from '../../utils/helpers.js';
import { apiService } from '../../services/index.js';

/**
 * ShareLink — displayed after successful upload.
 * Shows the share URL with copy button and security reminders.
 */
export default function ShareLink({ shareUrl, vaultId, expiresAt, maxViews, deleteToken }) {
  const [copied, setCopied] = useState(false);
  const [deleteState, setDeleteState] = useState('idle'); // idle | confirming | deleting | deleted | error
  const [deleteError, setDeleteError] = useState(null);

  const handleDeleteClick = () => {
    setDeleteState('confirming');
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleteState('deleting');
      await apiService.deleteVault(vaultId, deleteToken);
      setDeleteState('deleted');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete vault');
      setDeleteState('error');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteState('idle');
    setDeleteError(null);
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Success header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Vault created</h3>
          <p className="text-sm text-slate-400">Share this link with your recipient</p>
        </div>
      </div>

      {/* URL display */}
      <div className="relative">
        <div className="flex items-stretch rounded-lg overflow-hidden border border-slate-600 bg-slate-800/50">
          <div className="flex-1 px-4 py-3 text-sm text-slate-300 font-mono truncate select-all">
            {shareUrl}
          </div>
          <button
            onClick={handleCopy}
            className={`
              px-4 flex items-center gap-2 text-sm font-medium transition-all duration-200
              ${copied
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }
            `}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Vault info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Expiry</p>
          <p className="text-sm text-slate-300 mt-0.5">
            {expiresAt ? formatRelativeTime(expiresAt) : '1 hour'}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Views</p>
          <p className="text-sm text-slate-300 mt-0.5">{maxViews} remaining</p>
        </div>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center p-4 rounded-lg bg-white">
        <QRCodeSVG value={shareUrl} size={180} level="M" includeMargin={false} />
        <p className="text-xs text-slate-600 mt-2">Scan to open vault link</p>
      </div>

      {/* Manual delete */}
      {deleteToken && deleteState !== 'deleted' && (
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 space-y-2">
          {deleteState === 'idle' && (
            <button
              onClick={handleDeleteClick}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete this vault now
            </button>
          )}

          {deleteState === 'confirming' && (
            <div className="space-y-2">
              <p className="text-sm text-red-300">Are you sure? This cannot be undone.</p>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={handleDeleteConfirm}>
                  Yes, delete
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDeleteCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {deleteState === 'deleting' && (
            <p className="text-sm text-slate-400">Deleting...</p>
          )}

          {deleteState === 'error' && (
            <div className="space-y-1">
              <p className="text-sm text-red-400">{deleteError}</p>
              <button
                onClick={() => setDeleteState('idle')}
                className="text-xs text-slate-400 hover:text-slate-300"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Deleted confirmation */}
      {deleteState === 'deleted' && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Vault deleted successfully. The link is no longer valid.
          </div>
        </div>
      )}

      {/* Security notice */}
      <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <div className="flex gap-2">
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <div className="text-xs text-amber-300/80 leading-relaxed">
            <p className="font-medium text-amber-300">This link contains the decryption key.</p>
            <p className="mt-0.5">Anyone with this link can access the content. Share it only through a secure channel.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
