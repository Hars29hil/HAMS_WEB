import React from 'react';
import { Menu, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AdminHeader.css';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  onToggleSidebar: () => void;
  activeSessionName?: string;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  title,
  subtitle,
  onToggleSidebar,
  activeSessionName,
}) => {
  const { admin } = useAuth();

  return (
    <header className="admin-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle Menu"
          className="mobile-menu-btn"
        >
          <Menu size={22} />
        </button>

        <div>
          <h1 className="header-title-text">
            {title}
          </h1>
          {subtitle && (
            <p className="header-subtitle-text">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {activeSessionName && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            padding: '5px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 700,
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }}></span>
            Active: {activeSessionName}
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: '#f8fafc',
          borderRadius: '20px',
          border: '1px solid #e2e8f0',
          fontSize: '12px',
          fontWeight: 600,
          color: '#475569',
        }}>
          <Shield size={14} color="#4f46e5" />
          <span>{admin?.role || 'ADMIN'}</span>
        </div>
      </div>
    </header>
  );
};
