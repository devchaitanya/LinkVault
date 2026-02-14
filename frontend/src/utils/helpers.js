/**
 * Reusable utility functions for the frontend.
 * Extensibility: add formatting, validation, etc. here.
 */

/**
 * Format bytes into human-readable string.
 */
export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format milliseconds into human-readable duration.
 */
export function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

/**
 * Format a date as a relative time string.
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const target = new Date(date);
  const diffMs = target - now;

  if (diffMs <= 0) return 'expired';

  return `expires in ${formatDuration(diffMs)}`;
}

/**
 * Copy text to clipboard with fallback.
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

/**
 * Extract the key fragment from the current URL hash.
 * Returns null if not present.
 */
export function extractKeyFromHash(hash) {
  if (!hash) return null;
  const match = hash.match(/k=([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}
