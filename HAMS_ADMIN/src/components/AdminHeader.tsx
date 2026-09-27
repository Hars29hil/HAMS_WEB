import React from 'react';
import { Menu, Bell, Shield, Radio, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
    <header style={{
      padding: '16px 32px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 30,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={onToggleSidebar}
          style={{
            display: 'none',
            background: 'transparent',
            border: 'none',
            color: '#334155',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '8px',
          }}
          className="mobile-menu-btn"
        >
          <Menu size={22} />
        </button>

        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>
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
