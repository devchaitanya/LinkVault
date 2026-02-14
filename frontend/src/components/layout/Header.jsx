import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Header() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navLink = (to, label) => (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        location.pathname === to
          ? 'bg-slate-800 text-blue-400'
          : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="w-full border-b border-slate-800">
      <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-100 group-hover:text-white transition-colors">
            LinkVault
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {navLink('/', 'Upload')}
          {user ? (
            <>
              {navLink('/dashboard', 'Dashboard')}
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-all duration-150"
              >
                Logout
              </button>
            </>
          ) : (
            navLink('/login', 'Login')
          )}
        </nav>
      </div>
    </header>
  );
}
