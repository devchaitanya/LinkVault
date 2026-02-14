import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/constants.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('lv_token'));
  const [loading, setLoading] = useState(() => !!localStorage.getItem('lv_token'));

  // Fetch user on mount if token exists
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setUser(data.data.user);
        } else {
          localStorage.removeItem('lv_token');
          setToken(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem('lv_token');
        setToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Login failed');
    localStorage.setItem('lv_token', data.data.token);
    setToken(data.data.token);
    setUser(data.data.user);
    return data.data;
  }, []);

  const register = useCallback(async (email, username, password) => {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Registration failed');
    localStorage.setItem('lv_token', data.data.token);
    setToken(data.data.token);
    setUser(data.data.user);
    return data.data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('lv_token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
