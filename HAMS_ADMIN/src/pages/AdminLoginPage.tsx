import React, { useState } from 'react';
import { ShieldCheck, Lock, UserCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AdminLoginPage.css';

export const AdminLoginPage: React.FC = () => {
  const { login } = useAuth();
  const [adminCode, setAdminCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminCode.trim()) {
      setError('Please enter your Admin Access ID');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(adminCode.trim(), password.trim());
    } catch (err: any) {
      setError(err.message || 'Invalid administrator credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        {/* Top Header */}
        <div className="login-header-zone">
          <div className="login-shield-badge">
            <ShieldCheck size={32} />
          </div>
          <h1>Admin Portal</h1>
          <p>Hostel Attendance Management System</p>
        </div>

        {error && (
          <div className="login-error-alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field-group">
            <label>ADMIN ACCESS ID</label>
            <div className="input-icon-container">
              <UserCheck size={18} className="field-icon" />
              <input
                type="text"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="Enter Admin Access ID"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="form-field-group">
            <label>PASSWORD</label>
            <div className="input-icon-container">
              <Lock size={18} className="field-icon" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            <span>{loading ? 'Authenticating...' : 'Sign In to Portal'}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="login-footer-info">
          <span>Connected to Hostel Attendance Database</span>
        </div>
      </div>
    </div>
  );
};
