import React, { useEffect, useState } from 'react';
import { LogOut, CheckCircle, Phone, Save } from 'lucide-react';
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

interface Student {
  student_id: number;
  student_code: string;
  name: string;
  assigned_mobile: string | null;
}

export const LeaderDashboard: React.FC = () => {
  const { logout, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'attendance' | 'mobile'>('attendance');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [mobileInputs, setMobileInputs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingMobile, setSavingMobile] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [attendanceRes, studentsRes] = await Promise.all([
        apiClient.get('/attendance/live'),
        apiClient.get('/students')
      ]);

      if (attendanceRes.data.success) {
        setRecords(attendanceRes.data.records || []);
      }
      
      if (studentsRes.data.success) {
        const fetchedStudents = studentsRes.data.data || [];
        setStudents(fetchedStudents);
        
        // Initialize inputs
        const initialInputs: Record<number, string> = {};
        fetchedStudents.forEach((s: Student) => {
          initialInputs[s.student_id] = s.assigned_mobile || '';
        });
        setMobileInputs(initialInputs);
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

  const handleMobileInputChange = (studentId: number, value: string) => {
    setMobileInputs(prev => ({ ...prev, [studentId]: value }));
  };

  const handleAssignMobile = async (studentId: number) => {
    const mobile = mobileInputs[studentId];
    setSavingMobile(studentId);
    try {
      const response = await apiClient.put(`/students/${studentId}/mobile`, { assigned_mobile: mobile });
      if (response.data.success) {
        setStudents(prev => prev.map(s => s.student_id === studentId ? { ...s, assigned_mobile: mobile } : s));
        alert('Mobile number assigned successfully');
      } else {
        alert(response.data.message || 'Failed to assign mobile');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error assigning mobile');
    } finally {
      setSavingMobile(null);
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
        <div className="leader-tabs">
          <button 
            className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            Live Attendance
          </button>
          <button 
            className={`tab-btn ${activeTab === 'mobile' ? 'active' : ''}`}
            onClick={() => setActiveTab('mobile')}
          >
            Assign Mobile
          </button>
        </div>

        {activeTab === 'attendance' && (
          <>
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
          </>
        )}

        {activeTab === 'mobile' && (
          <div className="dashboard-main">
            <HamsCard padding="1.5rem" className="records-section">
              <h3 className="section-title">Assign Login Mobile Number</h3>
              <p className="section-desc">Assign a mobile number to students so they can auto-login via their SIM card.</p>
              
              <div className="records-list">
                {students.length === 0 ? (
                  <div className="empty-state">No students found on this floor.</div>
                ) : (
                  students.map((s) => (
                    <div className="record-row mobile-assign-row" key={s.student_id}>
                      <div className="record-info">
                        <h4>{s.name}</h4>
                        <p className="record-time">Bank Code: {s.student_code}</p>
                      </div>
                      <div className="mobile-input-group">
                        <div className="input-wrapper">
                          <Phone size={16} className="input-icon" />
                          <input 
                            type="text" 
                            placeholder="e.g. 9876543210" 
                            value={mobileInputs[s.student_id] || ''}
                            onChange={(e) => handleMobileInputChange(s.student_id, e.target.value)}
                          />
                        </div>
                        <button 
                          className="save-btn" 
                          onClick={() => handleAssignMobile(s.student_id)}
                          disabled={savingMobile === s.student_id}
                        >
                          <Save size={16} />
                          {savingMobile === s.student_id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </HamsCard>
          </div>
        )}

      </div>
    </div>
  );
};
