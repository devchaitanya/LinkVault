import { useState } from 'react';
import { DEFAULT_EXPIRY_MS, MAX_EXPIRY_MS, DEFAULT_MAX_VIEWS } from '../../config/constants.js';

/**
 * UploadOptions — expiry, view count, password configuration.
 * Custom inputs with sensible defaults and limits.
 */
export default function UploadOptions({ options, onChange }) {
  const [showPassword, setShowPassword] = useState(false);

  // Local string state — allows clearing inputs without snapping to defaults
  const totalMinInit = Math.round((options.expiryMs || DEFAULT_EXPIRY_MS) / 60_000);
  const [hoursStr, setHoursStr] = useState(String(Math.floor(totalMinInit / 60)));
  const [minutesStr, setMinutesStr] = useState(String(totalMinInit % 60));
  const [viewsStr, setViewsStr] = useState(String(options.maxViews || DEFAULT_MAX_VIEWS));

  const update = (key, value) => {
    onChange({ ...options, [key]: value });
  };

  const syncExpiry = () => {
    const h = Math.max(0, Math.min(24, parseInt(hoursStr) || 0));
    const m = Math.max(0, Math.min(59, parseInt(minutesStr) || 0));
    let totalMin = h * 60 + m;
    if (totalMin < 1) totalMin = 1;
    if (totalMin > 1440) totalMin = 1440;
    setHoursStr(String(Math.floor(totalMin / 60)));
    setMinutesStr(String(totalMin % 60));
    update('expiryMs', totalMin * 60_000);
  };

  const syncViews = () => {
    const v = Math.max(1, Math.min(1000, parseInt(viewsStr) || 1));
    setViewsStr(String(v));
    update('maxViews', v);
  };

  return (
    <div className="w-full space-y-5">
      {/* Expiry & Views */}
      <div className="space-y-4">
        {/* Expiry — hours + minutes */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Expires after
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={hoursStr}
                onChange={(e) => setHoursStr(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={syncExpiry}
                placeholder="0"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 text-sm pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">hours</span>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={minutesStr}
                onChange={(e) => setMinutesStr(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={syncExpiry}
                placeholder="10"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 text-sm pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">min</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">1 minute – 24 hours</p>
        </div>

        {/* View count */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Maximum views
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={viewsStr}
              onChange={(e) => setViewsStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={syncViews}
              placeholder="10"
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 text-sm pr-28"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
              {parseInt(viewsStr) === 1 ? 'burn after read' : 'views'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">1 – 1000 views</p>
        </div>
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Password protection
          <span className="text-slate-500 font-normal ml-2">(optional)</span>
        </label>

        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={options.password || ''}
            onChange={(e) => update('password', e.target.value)}
            placeholder="Enter a password to add extra protection"
            className="
              w-full px-4 py-2.5 rounded-lg
              bg-slate-800/50 border border-slate-600
              text-slate-200 placeholder-slate-500
              focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
              transition-all duration-200 text-sm
            "
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showPassword ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
        {options.password && (
          <p className="text-xs text-slate-500 mt-1.5">
            Recipients will need this password in addition to the link.
            The password never leaves your browser.
          </p>
        )}
      </div>

      {/* Geofencing / IP Restriction */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          IP restriction
          <span className="text-slate-500 font-normal ml-2">(optional)</span>
        </label>
        <input
          type="text"
          value={options.allowedIPs || ''}
          onChange={(e) => update('allowedIPs', e.target.value)}
          placeholder="Comma-separated IPs, e.g. 192.168.1.1, 10.0.0.5"
          className="
            w-full px-4 py-2.5 rounded-lg
            bg-slate-800/50 border border-slate-600
            text-slate-200 placeholder-slate-500
            focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
            transition-all duration-200 text-sm
          "
        />
        {options.allowedIPs && (
          <p className="text-xs text-slate-500 mt-1.5">
            Only these IP addresses can access the vault.
          </p>
        )}
      </div>
    </div>
  );
}
