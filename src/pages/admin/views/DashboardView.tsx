import React, { useEffect, useState } from 'react';
import { Users, CheckCircle, Clock, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';
// import '../AdminDashboard.css';

export const DashboardView: React.FC = () => {
  const { logout } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await apiClient.get('/admin/dashboard');
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

  if (loading) {
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

  const chartData = (stats.weekly_stats || []).map((s: any) => ({
    name: new Date(s.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
    present: s.present,
    late: s.late,
  }));

  return (
    <div className="admin-content" style={{ padding: '24px' }}>
      <p className="subtitle" style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>Here's what's happening in your hostel today</p>
      
      {/* KPI Grid */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <HamsCard padding="1.5rem" className="kpi-card">
          <div className="kpi-icon blue"><Users size={24} color="#3b82f6" /></div>
          <div className="kpi-info" style={{ marginTop: '12px' }}>
            <span className="kpi-label" style={{ display: 'block', fontSize: '14px', color: 'var(--color-text-muted)' }}>Total Students</span>
            <span className="kpi-value" style={{ display: 'block', fontSize: '28px', fontWeight: 'bold' }}>{stats.total_students}</span>
          </div>
        </HamsCard>
        <HamsCard padding="1.5rem" className="kpi-card">
          <div className="kpi-icon green"><CheckCircle size={24} color="#22c55e" /></div>
          <div className="kpi-info" style={{ marginTop: '12px' }}>
            <span className="kpi-label" style={{ display: 'block', fontSize: '14px', color: 'var(--color-text-muted)' }}>Present Today</span>
            <span className="kpi-value" style={{ display: 'block', fontSize: '28px', fontWeight: 'bold' }}>{stats.present_today}</span>
          </div>
        </HamsCard>
        <HamsCard padding="1.5rem" className="kpi-card">
          <div className="kpi-icon orange"><Clock size={24} color="#f59e0b" /></div>
          <div className="kpi-info" style={{ marginTop: '12px' }}>
            <span className="kpi-label" style={{ display: 'block', fontSize: '14px', color: 'var(--color-text-muted)' }}>Late</span>
            <span className="kpi-value" style={{ display: 'block', fontSize: '28px', fontWeight: 'bold' }}>{stats.late_today}</span>
          </div>
        </HamsCard>
        <HamsCard padding="1.5rem" className="kpi-card">
          <div className="kpi-icon red"><XCircle size={24} color="#ef4444" /></div>
          <div className="kpi-info" style={{ marginTop: '12px' }}>
            <span className="kpi-label" style={{ display: 'block', fontSize: '14px', color: 'var(--color-text-muted)' }}>Absent</span>
            <span className="kpi-value" style={{ display: 'block', fontSize: '28px', fontWeight: 'bold' }}>{stats.absent_today}</span>
          </div>
        </HamsCard>
      </div>

      <div className="dashboard-main" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Chart Section */}
        <HamsCard padding="1.5rem" className="chart-section">
          <h3 className="section-title" style={{ marginBottom: '20px' }}>Attendance Overview (Last 7 Days)</h3>
          <div className="chart-wrapper" style={{ height: '300px' }}>
            {chartData.length === 0 ? (
              <div className="empty-state">No data available</div>
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
          <h3 className="section-title" style={{ marginBottom: '20px' }}>Live Floor Status</h3>
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
