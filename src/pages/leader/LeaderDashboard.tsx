import React, { useEffect, useState } from 'react';
import { LogOut, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';
import './LeaderDashboard.css';

interface AttendanceRecord {
  student_code: string;
  name: string;
  rssi: number;
  marked_at: string;
  floor_name: string;
}

export const LeaderDashboard: React.FC = () => {
  const { logout, user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLiveAttendance();
  }, []);

  const fetchLiveAttendance = async () => {
    try {
      const response = await apiClient.get('/attendance/live');
      if (response.data.success) {
        setRecords(response.data.records || []);
      } else {
        setError(response.data.message || 'Failed to load attendance');
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

  if (error) {
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

  return (
    <div className="leader-container">
      <header className="leader-header glass">
        <h2>{user?.name || 'Floor Leader'} Dashboard</h2>
        <button className="logout-btn" onClick={logout}>
          <LogOut size={20} />
        </button>
      </header>

      <div className="leader-content">
        <p className="subtitle">Live Attendance for Floor {user?.floor_id}</p>
        
        {/* KPI Grid */}
        <div className="kpi-grid">
          <HamsCard padding="1.5rem" className="kpi-card">
            <div className="kpi-icon green"><CheckCircle size={24} /></div>
            <div className="kpi-info">
              <span className="kpi-label">Present</span>
              <span className="kpi-value">{records.length}</span>
            </div>
          </HamsCard>
        </div>

        <div className="dashboard-main">
          <HamsCard padding="1.5rem" className="records-section">
            <h3 className="section-title">Recent Marks</h3>
            <div className="records-list">
              {records.length === 0 ? (
                <div className="empty-state">No students have marked attendance yet.</div>
              ) : (
                records.map((r, i) => (
                  <div className="record-row" key={i}>
                    <div className="record-info">
                      <h4>{r.name} ({r.student_code})</h4>
                      <p className="record-time">{new Date(r.marked_at).toLocaleTimeString()}</p>
                    </div>
                    <div className="record-badge">
                      <span className="status-dot online"></span>
                      Present
                    </div>
                  </div>
                ))
              )}
            </div>
          </HamsCard>
        </div>

      </div>
    </div>
  );
};
