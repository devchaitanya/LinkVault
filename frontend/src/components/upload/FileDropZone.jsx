import { useState, useRef, useCallback } from 'react';
import { MAX_FILE_SIZE } from '../../config/constants.js';
import { formatBytes } from '../../utils/helpers.js';
import { validateMagicNumber } from '../../utils/magicNumbers.js';

/**
 * FileDropZone — drag-and-drop + click-to-browse file selector.
 * Validates file size and magic numbers before allowing upload.
 */
export default function FileDropZone({ onFileSelect, disabled = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    setError(null);

    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${formatBytes(MAX_FILE_SIZE)}.`);
      return;
    }

    if (file.size === 0) {
      setError('Cannot upload an empty file.');
      return;
    }

    // Magic number validation
    const magicResult = await validateMagicNumber(file);
    if (!magicResult.valid) {
      setError(magicResult.reason);
      return;
    }

    setSelectedFile(file);
    onFileSelect?.(file);
  }, [onFileSelect]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [disabled, handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback((e) => {
    handleFile(e.target.files[0]);
  }, [handleFile]);

  const clearFile = useCallback((e) => {
    e.stopPropagation();
    setSelectedFile(null);
    setError(null);
    onFileSelect?.(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [onFileSelect]);

  return (
    <div className="w-full">
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative w-full border-2 border-dashed rounded-xl p-8
          flex flex-col items-center justify-center gap-3
          transition-all duration-200 cursor-pointer
          min-h-[180px]
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragging
            ? 'border-blue-400 bg-blue-500/10'
            : selectedFile
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-slate-600 hover:border-slate-500 bg-slate-800/30 hover:bg-slate-800/50'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
        />

        {selectedFile ? (
          <>
            {/* File selected state */}
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-slate-200 font-medium truncate max-w-xs">
                {selectedFile.name}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {formatBytes(selectedFile.size)}
                {selectedFile.type && ` · ${selectedFile.type}`}
              </p>
            </div>
            <button
              onClick={clearFile}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors mt-1"
            >
              Remove and choose different file
            </button>
          </>
        ) : (
          <>
            {/* Empty state */}
            <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-slate-300">
                <span className="text-blue-400 font-medium">Click to browse</span> or drag & drop
              </p>
              <p className="text-slate-500 text-sm mt-1">
                Any file up to {formatBytes(MAX_FILE_SIZE)}
              </p>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-sm mt-2 flex items-center gap-1.5">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
