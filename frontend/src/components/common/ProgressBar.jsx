/**
 * ProgressBar — animated progress indicator.
 * Reusable across upload/download/any async operation.
 */
export default function ProgressBar({ progress = 0, label = '', className = '' }) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-sm text-slate-400">{label}</span>
          <span className="text-sm font-mono text-slate-300">{Math.round(progress)}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
