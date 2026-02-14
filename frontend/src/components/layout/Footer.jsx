/**
 * Footer — minimal footer with security disclaimer.
 */
export default function Footer() {
  return (
    <footer className="w-full border-t border-slate-800 mt-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            End-to-end encrypted · Zero-knowledge · Open source
          </div>
          <span>LinkVault &copy; {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
