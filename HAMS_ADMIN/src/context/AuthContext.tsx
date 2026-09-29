import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../services/apiClient';

interface AdminUser {
  id: number;
  role: string;
  name?: string;
  floor_id?: number;
  assigned_floors?: number[];
  assigned_sessions?: string[];
  session_permissions?: Record<string, 'view' | 'edit'>;
}

interface AuthContextType {
  admin: AdminUser | null;
  token: string | null;
  login: (code: string, password?: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const res = await apiClient.get('/auth/me');
      if (res.data?.success && res.data.data) {
        const u = res.data.data;
        const userObj: AdminUser = {
          id: u.id,
          role: u.role || 'ADMIN',
          name: u.name,
          floor_id: u.floor_id,
          assigned_floors: u.assigned_floors || [],
          assigned_sessions: u.assigned_sessions || ['all'],
          session_permissions: u.session_permissions || {}
        };
        setAdmin(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(userObj)) {
            localStorage.setItem('admin_user', JSON.stringify(userObj));
            return userObj;
          }
          return prev;
        });
      }
    } catch (e: any) {
      if (e.response?.status === 401) {
        logout();
      }
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token');
    const savedUser = localStorage.getItem('admin_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setAdmin(JSON.parse(savedUser));
        refreshUser();
      } catch (e) {
        logout();
      }
    }
    setLoading(false);
  }, []);

  // Real-time polling to sync permissions, assigned sessions, and assigned floors without requiring page refresh
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      refreshUser();
    }, 3000);
    return () => clearInterval(interval);
  }, [token]);

  const login = async (code: string, password?: string): Promise<boolean> => {
    try {
      const payload: any = { username: code.trim() };
      if (password) payload.password = password;

      const res = await apiClient.post('/auth/login', payload);
      if (res.data.success) {
        const role = (res.data.data.role || res.data.data.user?.role || '').toUpperCase();
        if (role === 'ADMIN' || role === 'LEADER') {
          const userObj: AdminUser = {
            id: res.data.data.id || res.data.data.user?.id || 9999,
            role: role,
            name: res.data.data.name || res.data.data.user?.name || 'Administrator',
            floor_id: res.data.data.floor_id || res.data.data.user?.floor_id,
            assigned_floors: res.data.data.assigned_floors || res.data.data.user?.assigned_floors || [],
            assigned_sessions: res.data.data.assigned_sessions || res.data.data.user?.assigned_sessions || ['all'],
            session_permissions: res.data.data.session_permissions || res.data.data.user?.session_permissions || {},
          };
          const tok = res.data.data.token;
          setToken(tok);
          setAdmin(userObj);
          localStorage.setItem('admin_token', tok);
          localStorage.setItem('admin_user', JSON.stringify(userObj));
          return true;
        } else {
          throw new Error('This portal is for Administrators & Floor Leaders only. Students must use the Student Portal (port 5173).');
        }
      }
      throw new Error(res.data.message || 'Access restricted to Administrators');
    } catch (err: any) {
      console.error('Login error:', err);
      throw new Error(err.response?.data?.message || err.message || 'Login failed');
    }
  };

  const logout = () => {
    setAdmin(null);
    setToken(null);
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  };

  return (
    <AuthContext.Provider value={{ admin, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
