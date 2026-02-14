import { useState } from 'react';
import { Button } from '../common/index.js';
import { copyToClipboard } from '../../utils/helpers.js';

/**
 * TextViewer — displays decrypted text content with copy button.
 * Used when vault contentType is 'text'.
 */
export default function TextViewer({ textContent, filename }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(textContent);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'paste.txt';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 1000);
  };

  const lineCount = textContent ? textContent.split('\n').length : 0;

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">Decrypted text</p>
            <p className="text-xs text-slate-500">{lineCount} line{lineCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
              ${copied
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }
            `}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all duration-200"
          >
            Download
          </button>
        </div>
      </div>

      {/* Text content */}
      <div className="relative rounded-xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
        <pre className="p-4 text-sm text-slate-200 font-mono whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto leading-relaxed">
          {textContent}
        </pre>
      </div>
    </div>
  );
}
