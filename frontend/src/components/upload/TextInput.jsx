import { useState, useCallback } from 'react';
import { MAX_TEXT_LENGTH } from '../../config/constants.js';
import { formatBytes } from '../../utils/helpers.js';

/**
 * TextInput — textarea for plain text upload.
 * Alternative to FileDropZone for sharing text snippets.
 */
export default function TextInput({ onTextChange, disabled = false }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const handleChange = useCallback((e) => {
    const value = e.target.value;
    setError(null);

    if (new Blob([value]).size > MAX_TEXT_LENGTH) {
      setError(`Text too large. Maximum size is ${formatBytes(MAX_TEXT_LENGTH)}.`);
      return;
    }

    setText(value);
    onTextChange?.(value);
  }, [onTextChange]);

  const handleClear = useCallback(() => {
    setText('');
    setError(null);
    onTextChange?.('');
  }, [onTextChange]);

  const byteSize = new Blob([text]).size;

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        <textarea
          value={text}
          onChange={handleChange}
          disabled={disabled}
          placeholder="Paste or type your text here..."
          rows={8}
          className={`
            w-full px-4 py-3 rounded-xl
            bg-slate-800/30 border-2 border-dashed
            text-slate-200 placeholder-slate-500
            focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
            transition-all duration-200 text-sm font-mono resize-y
            min-h-[180px]
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'border-slate-600 hover:border-slate-500'}
            ${error ? 'border-red-500/50' : ''}
          `}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {text.length > 0
            ? `${text.length} chars · ${formatBytes(byteSize)}`
            : 'Plain text, code, notes, or any text content'
          }
        </span>
        {text.length > 0 && (
          <button
            onClick={handleClear}
            disabled={disabled}
            className="text-slate-500 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-sm flex items-center gap-1.5">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
