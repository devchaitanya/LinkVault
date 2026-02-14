import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE_URL } from '../config/constants.js';
import { formatBytes, formatRelativeTime } from '../utils/helpers.js';

/**
 * Compute vault status from server data.
 */
function getVaultStatus(vault) {
  if (vault.isDeleted) return { label: 'Deleted', color: 'text-slate-400 bg-slate-500/20' };
  if (vault.remainingViews <= 0) return { label: 'Views exhausted', color: 'text-amber-400 bg-amber-500/20' };
  if (new Date(vault.expiresAt) <= new Date()) return { label: 'Expired', color: 'text-red-400 bg-red-500/20' };
  return { label: 'Active', color: 'text-emerald-400 bg-emerald-500/20' };
}

export default function DashboardPage() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [vaults, setVaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [expandedVault, setExpandedVault] = useState(null);
  const [extending, setExtending] = useState(null);
  const [copiedVault, setCopiedVault] = useState(null);
  const [actionError, setActionError] = useState(null);
  // Extend inputs per vault
  const [extendInputs, setExtendInputs] = useState({}); // { [vaultId]: { hours: '', minutes: '', views: '' } }

  // Load share URLs (with decryption keys) from localStorage
  const [shareUrls] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv_share_urls') || '{}'); }
    catch { return {}; }
  });

  const fetchVaults = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me/vaults`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setVaults(data.data.vaults);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
      return;
    }
    if (user) fetchVaults();
  }, [user, authLoading, navigate, fetchVaults]);

  const handleDelete = async (vaultId) => {
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/vaults/${vaultId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ authenticatedDelete: true }),
      });
      const data = await res.json();
      if (data.success) {
        setVaults((prev) => prev.filter((v) => v.vaultId !== vaultId));
        // Clean up localStorage share URL
        try {
          const stored = JSON.parse(localStorage.getItem('lv_share_urls') || '{}');
          delete stored[vaultId];
          localStorage.setItem('lv_share_urls', JSON.stringify(stored));
        } catch {}
      } else {
        setActionError(`Delete failed: ${data.error?.message || 'Unknown error'}`);
      }
    } catch {
      setActionError('Delete failed: network error');
    }
    setDeleteConfirm(null);
  };

  const handleExtend = async (vaultId) => {
    setActionError(null);
    const inputs = extendInputs[vaultId] || {};
    const hours = parseInt(inputs.hours) || 0;
    const mins = parseInt(inputs.minutes) || 0;
    const totalMinutes = hours * 60 + mins;
    const views = parseInt(inputs.views) || 0;

    if (totalMinutes <= 0 && views <= 0) {
      setActionError('Enter time or views to add.');
      return;
    }

    setExtending(vaultId);
    try {
      const body = {};
      if (totalMinutes > 0) body.additionalMs = Math.min(totalMinutes, 1440) * 60_000;
      if (views > 0) body.additionalViews = Math.min(views, 1000);

      const res = await fetch(`${API_BASE_URL}/auth/me/vaults/${vaultId}/extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setVaults((prev) =>
          prev.map((v) =>
            v.vaultId === vaultId
              ? {
                  ...v,
                  expiresAt: data.data.newExpiresAt || v.expiresAt,
                  remainingViews: data.data.remainingViews ?? v.remainingViews,
                  policy: {
                    ...v.policy,
                    maxViews: data.data.maxViews ?? v.policy?.maxViews,
                  },
                }
              : v
          )
        );
        // Clear inputs
        setExtendInputs((prev) => ({ ...prev, [vaultId]: { hours: '', minutes: '', views: '' } }));
      } else {
        setActionError(`Extend failed: ${data.error?.message || 'Unknown error'}`);
      }
    } catch {
      setActionError('Extend failed: network error');
    } finally {
      setExtending(null);
    }
  };

  const getVaultUrl = (vaultId) => shareUrls[vaultId] || `${window.location.origin}/vault/${vaultId}`;
  const hasFullUrl = (vaultId) => !!shareUrls[vaultId];

  const handleCopyLink = async (vaultId) => {
    const url = getVaultUrl(vaultId);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedVault(vaultId);
    setTimeout(() => setCopiedVault(null), 2000);
  };

  const updateExtendInput = (vaultId, field, value) => {
    setExtendInputs((prev) => ({
      ...prev,
      [vaultId]: { ...(prev[vaultId] || { hours: '', minutes: '', views: '' }), [field]: value },
    }));
  };

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">Welcome, {user?.username || 'user'}</p>
        </div>
        <Link
          to="/"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-all"
        >
          New Upload
        </Link>
      </div>

      {actionError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400/60 hover:text-red-400 ml-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {vaults.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-slate-400">No vaults yet. Upload something to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vaults.map((vault) => {
            const isExpanded = expandedVault === vault.vaultId;
            const vaultUrl = getVaultUrl(vault.vaultId);
            const status = getVaultStatus(vault);
            const inputs = extendInputs[vault.vaultId] || { minutes: '', views: '' };

            return (
              <div key={vault.vaultId} className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                {/* Main row */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Name + badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${
                          vault.contentType === 'text'
                            ? 'bg-violet-500/20 text-violet-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {vault.contentType === 'text' ? 'Text' : 'File'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${status.color}`}>
                          {status.label}
                        </span>
                      </div>

                      {/* Display name */}
                      <p className="text-sm text-slate-200 font-medium mt-1.5 truncate">
                        {vault.displayName || (vault.contentType === 'text' ? 'Text paste' : 'File upload')}
                      </p>

                      {/* Meta row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                        <span>{formatBytes(vault.totalSize)}</span>
                        <span>{vault.remainingViews} view{vault.remainingViews !== 1 ? 's' : ''} left</span>
                        <span>{formatRelativeTime(vault.expiresAt)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Expand */}
                      <button
                        onClick={() => setExpandedVault(isExpanded ? null : vault.vaultId)}
                        className={`p-2 rounded-lg transition-colors ${isExpanded ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'}`}
                        title="QR code & manage"
                      >
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>

                      {/* Delete */}
                      {deleteConfirm === vault.vaultId ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(vault.vaultId)}
                            className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-600"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(vault.vaultId)}
                          className="p-2 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete vault"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Copy link row — always visible */}
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs text-slate-400 font-mono truncate select-all">
                        {vaultUrl}
                      </div>
                      <button
                        onClick={() => handleCopyLink(vault.vaultId)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                          copiedVault === vault.vaultId
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                        }`}
                      >
                        {copiedVault === vault.vaultId ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    {!hasFullUrl(vault.vaultId) && (
                      <p className="text-[11px] text-amber-500/70 mt-1.5 flex items-center gap-1">
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        No decryption key stored — use the original share link to access content.
                      </p>
                    )}
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-950/50 p-4 space-y-5">
                    {/* QR Code */}
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">QR Code</p>
                      <div className="bg-white p-3 rounded-xl">
                        <QRCodeSVG value={vaultUrl} size={140} level="M" />
                      </div>
                      <p className="text-xs text-amber-500/80 text-center max-w-sm">
                        Note: Recipients need the full share link (with #k=...) to decrypt. This QR only contains the vault URL.
                      </p>
                    </div>

                    {/* Extend time & views */}
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Extend Vault</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Hours</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={inputs.hours || ''}
                            onChange={(e) => updateExtendInput(vault.vaultId, 'hours', e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-200 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Minutes</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="30"
                            value={inputs.minutes || ''}
                            onChange={(e) => updateExtendInput(vault.vaultId, 'minutes', e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-200 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Views</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="5"
                            value={inputs.views || ''}
                            onChange={(e) => updateExtendInput(vault.vaultId, 'views', e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-200 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => handleExtend(vault.vaultId)}
                        disabled={extending === vault.vaultId}
                        className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {extending === vault.vaultId ? 'Extending...' : 'Apply Extension'}
                      </button>
                    </div>

                    {/* Vault details */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-900/60 rounded-lg px-3 py-2">
                        <span className="text-slate-500">Created</span>
                        <p className="text-slate-300">{new Date(vault.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-900/60 rounded-lg px-3 py-2">
                        <span className="text-slate-500">Expires</span>
                        <p className="text-slate-300">{new Date(vault.expiresAt).toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-900/60 rounded-lg px-3 py-2">
                        <span className="text-slate-500">Total views used</span>
                        <p className="text-slate-300">
                          {(vault.policy?.maxViews || 0) - vault.remainingViews} / {vault.policy?.maxViews || '?'}
                        </p>
                      </div>
                      <div className="bg-slate-900/60 rounded-lg px-3 py-2">
                        <span className="text-slate-500">Remaining views</span>
                        <p className="text-slate-300">{vault.remainingViews}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
