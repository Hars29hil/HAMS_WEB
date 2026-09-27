import React, { useEffect, useState } from 'react';
import { Users, CheckCircle, Clock, XCircle, Sparkles, Filter, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';

export const DashboardView: React.FC = () => {
  const { logout } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>('recent');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats(selectedSessionKey);
  }, [selectedSessionKey]);

  const fetchStats = async (sessionKey = selectedSessionKey) => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/admin/dashboard?session_key=${sessionKey}`);
      if (response.data.success) {
        setStats(response.data.data);
      } else {
        setError(response.data.message || 'Failed to load stats');
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
      }
      setError(err.message || 'Error loading dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  if (error || !stats) {
    return (
      <div className="error-screen">
        <HamsCard padding="2rem">
          <h3>Error Loading Dashboard</h3>
          <p>{error}</p>
          <button onClick={logout} className="logout-btn">Log Out</button>
        </HamsCard>
      </div>
    );
  }

  const currentSessionName = stats.current_session?.name || 'Recent Attendance';
  const isRecent = stats.current_session?.is_recent;

  const chartData = (stats.weekly_stats || []).map((s: any) => ({
    name: new Date(s.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
    present: s.present,
    late: s.late,
  }));

  return (
    <div className="admin-content" style={{ padding: '24px' }}>
      
      {/* Session Filter Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '20px',
        backgroundColor: 'var(--color-bg-elevated, #1e293b)',
        padding: '14px 20px',
        borderRadius: '12px',
        border: '1px solid var(--color-border, #334155)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 700,
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
          }}>
            <Sparkles size={14} />
            {isRecent ? 'RECENT SESSION' : 'SELECTED SESSION'}
          </span>
          <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
            Showing: <strong style={{ color: '#818cf8' }}>{currentSessionName}</strong>
          </span>
        </div>

        {/* Quick Session Switcher Chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {(stats.available_sessions || []).map((sess: any) => {
            const isSelected = selectedSessionKey === sess.session_key;
            return (
              <button
                key={sess.session_key}
                onClick={() => setSelectedSessionKey(sess.session_key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: isSelected ? '1px solid #6366f1' : '1px solid var(--color-border, #475569)',
                  backgroundColor: isSelected ? '#6366f1' : 'transparent',
                  color: isSelected ? '#ffffff' : 'var(--color-text-muted, #94a3b8)',
                  fontSize: '13px',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {sess.session_name}
                {sess.present_today > 0 && (
                  <span style={{
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(99, 102, 241, 0.2)',
                    color: isSelected ? '#ffffff' : '#818cf8',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 700
                  }}>
                    {sess.present_today}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="subtitle" style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>
        Here's what's happening in your hostel today for <strong>{currentSessionName}</strong>
      </p>
      
      {/* KPI Grid */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <HamsCard padding="1.5rem" className="kpi-card">
          <div className="kpi-icon blue"><Users size={24} color="#3b82f6" /></div>
          <div className="kpi-info" style={{ marginTop: '12px' }}>
            <span className="kpi-label" style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-muted)' }}>Total Students</span>
            <span className="kpi-value" style={{ display: 'block', fontSize: '28px', fontWeight: 'bold' }}>{stats.total_students}</span>
          </div>
        </HamsCard>

        <HamsCard padding="1.5rem" className="kpi-card">
          <div className="kpi-icon green"><CheckCircle size={24} color="#22c55e" /></div>
          <div className="kpi-info" style={{ marginTop: '12px' }}>
            <span className="kpi-label" style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Present ({currentSessionName})
            </span>
            <span className="kpi-value" style={{ display: 'block', fontSize: '28px', fontWeight: 'bold', color: '#22c55e' }}>{stats.present_today}</span>
          </div>
        </HamsCard>

        <HamsCard padding="1.5rem" className="kpi-card">
          <div className="kpi-icon orange"><Clock size={24} color="#f59e0b" /></div>
          <div className="kpi-info" style={{ marginTop: '12px' }}>
            <span className="kpi-label" style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Late ({currentSessionName})
            </span>
            <span className="kpi-value" style={{ display: 'block', fontSize: '28px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.late_today}</span>
          </div>
        </HamsCard>

        <HamsCard padding="1.5rem" className="kpi-card">
          <div className="kpi-icon red"><XCircle size={24} color="#ef4444" /></div>
          <div className="kpi-info" style={{ marginTop: '12px' }}>
            <span className="kpi-label" style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Absent ({currentSessionName})
            </span>
            <span className="kpi-value" style={{ display: 'block', fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{stats.absent_today}</span>
          </div>
        </HamsCard>
      </div>

      <div className="dashboard-main" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Chart Section */}
        <HamsCard padding="1.5rem" className="chart-section">
          <h3 className="section-title" style={{ marginBottom: '20px' }}>
            Attendance Overview (Last 7 Days - {currentSessionName})
          </h3>
          <div className="chart-wrapper" style={{ height: '300px' }}>
            {chartData.length === 0 ? (
              <div className="empty-state">No data available for this session</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: 'var(--color-bg-elevated)', border: 'none', borderRadius: '8px'}} />
                  <Bar dataKey="present" fill="var(--color-success)" radius={[4, 4, 0, 0]} barSize={16} />
                  <Bar dataKey="late" fill="var(--color-warning)" radius={[4, 4, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </HamsCard>

        {/* Floor Status */}
        <HamsCard padding="1.5rem" className="floor-section">
          <h3 className="section-title" style={{ marginBottom: '20px' }}>
            Live Floor Status ({currentSessionName})
          </h3>
          <div className="floor-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {(stats.floor_status || []).length === 0 ? (
              <div className="empty-state">No floor data available</div>
            ) : (
              (stats.floor_status || []).map((floor: any, i: number) => (
                <div className="floor-row" key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="floor-info">
                    <h4 style={{ margin: '0 0 4px' }}>{floor.floor_name}</h4>
                    <p className="floor-sub" style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-muted)' }}>Attendance {floor.session_status}</p>
                    <p className="floor-sub" style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-muted)' }}>{floor.present_students} / {floor.total_students} students</p>
                  </div>
                  <div className="floor-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <span className={`status-dot ${floor.session_status === 'Active' ? 'online' : 'offline'}`} style={{ width: '8px', height: '8px', borderRadius: '50%', background: floor.session_status === 'Active' ? '#22c55e' : '#ef4444' }}></span>
                    {floor.session_status === 'Active' ? 'Online' : 'Offline'}
                  </div>
                </div>
              ))
            )}
          </div>
        </HamsCard>
      </div>

    </div>
  );
};
