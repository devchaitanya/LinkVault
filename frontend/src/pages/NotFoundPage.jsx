import { Link } from 'react-router-dom';
import { Button } from '../components/common/index.js';

/**
 * NotFoundPage — 404 handler.
 */
export default function NotFoundPage() {
  return (
    <div className="w-full max-w-md mx-auto text-center space-y-5 py-12">
      <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
        <span className="text-2xl font-bold text-slate-500">404</span>
      </div>
      <h2 className="text-xl font-semibold text-slate-100">Page not found</h2>
      <p className="text-slate-400 text-sm">
        This vault may have expired, been deleted, or the link is invalid.
      </p>
      <Link to="/">
        <Button variant="primary">Go to Upload</Button>
      </Link>
    </div>
  );
}
