import React, { useEffect, useState } from 'react';
import { LogOut, Phone, Mail, DoorClosed, CheckCircle, Fingerprint, Clock, RotateCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { connectToESP32 } from '../../services/bleService';
import { HamsCard } from '../../components/HamsCard';
import { RadarAnimation } from '../../components/RadarAnimation';
import './StudentDashboard.css';

export const StudentDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [isMarking, setIsMarking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const [attendanceActive, setAttendanceActive] = useState(false);
  const [schedule, setSchedule] = useState({ start: '', end: '', sessionName: 'Night' });
  const [allSchedules, setAllSchedules] = useState<Array<{ session_key: string; session_name: string; start_time: string; end_time: string }>>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchStatus();
    // Auto-poll status every 30 seconds to catch when a window opens
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const response = await apiClient.get('/attendance/my-status');
      if (response.data && (response.data.success || response.data.status === 'ok')) {
        const payload = response.data.data || response.data;
        const already_marked = payload.already_marked ?? false;
        const attendance_active = payload.attendance_active ?? false;
        const start_time = payload.start_time || '';
        const end_time = payload.end_time || '';
        const session_name = payload.session_name || 'Night Attendance';
        const all_schedules = payload.all_schedules || [];
        const schedulesObj = payload.schedules || {};

        setAlreadyMarked(Boolean(already_marked));
        setAttendanceActive(Boolean(attendance_active));
        setSchedule({ 
          start: start_time || (all_schedules[0]?.start_time) || '22:30', 
          end: end_time || (all_schedules[0]?.end_time) || '23:05',
          sessionName: session_name || (all_schedules[0]?.session_name) || 'Night Attendance'
        });

        if (Array.isArray(all_schedules) && all_schedules.length > 0) {
          setAllSchedules(all_schedules);
        } else if (Object.keys(schedulesObj).length > 0) {
          const mapped = Object.keys(schedulesObj).map(k => ({
            session_key: k,
            session_name: schedulesObj[k].name || (k.charAt(0).toUpperCase() + k.slice(1) + ' Attendance'),
            start_time: schedulesObj[k].start || schedulesObj[k].start_time || '00:00',
            end_time: schedulesObj[k].end || schedulesObj[k].end_time || '00:00'
          }));
          setAllSchedules(mapped);
        }
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMarkAttendance = async () => {
    if (alreadyMarked) {
      setError('Your attendance is already marked for today.');
      return;
    }
    if (!attendanceActive && schedule.start && schedule.end) {
      setError(`Attendance is only available during scheduled windows.`);
      return;
    }

    setIsMarking(true);
    setError('');
    setSuccess('');

    try {
      // 1. Connect to ESP32 GATT service and exchange string
      const bleConnection = await connectToESP32();
      let tokenToUse = bleConnection.token;

      // 2. If token is NONE, request challenge token from backend and write to ESP32
      if (tokenToUse === 'NONE') {
        const reqRes = await apiClient.post('/attendance/challenge', { rssi: -50 });
        if (reqRes.data.success) {
          tokenToUse = reqRes.data.challenge;
          // Write token string to ESP32 to activate blue LED indicator
          await bleConnection.writeToken(tokenToUse, 5);
        }
      }

      // 3. Disconnect from ESP32 immediately to free it for other students
      bleConnection.disconnect();

      // 4. Submit verified token string to backend to mark attendance
      const res = await apiClient.post('/attendance/mark', { proof: tokenToUse, rssi: -50 });
      if (res.data.success) {
        setAlreadyMarked(true);
        setSuccess('Attendance marked successfully!');
      } else {
        throw new Error(res.data.message || 'Failed to mark attendance.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'An unexpected error occurred during attendance marking.');
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header glass">
        <h2>Dashboard</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button 
            className="logout-btn" 
            onClick={fetchStatus} 
            title="Refresh status"
            style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
          >
            <RotateCw size={20} />
          </button>
          <button className="logout-btn" onClick={logout} title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        
        {/* Profile Card */}
        <HamsCard padding="2rem" className="profile-card">
          <div className="avatar">
            {user?.name?.[0]?.toUpperCase() || 'T'}
          </div>
          <h1 className="welcome-text">Welcome, {user?.name || 'Student'}!</h1>
          
          <div className="info-list">
            <div className="info-row">
              <div className="info-icon-wrapper"><DoorClosed size={20} /></div>
              <div className="info-text">
                <span className="info-label">ROOM</span>
                <span className="info-value">{user?.room || 'Not Assigned'}</span>
              </div>
            </div>
            <div className="info-row">
              <div className="info-icon-wrapper"><Phone size={20} /></div>
              <div className="info-text">
                <span className="info-label">PHONE</span>
                <span className="info-value">{user?.phone || 'N/A'}</span>
              </div>
            </div>
            <div className="info-row">
              <div className="info-icon-wrapper"><Mail size={20} /></div>
              <div className="info-text">
                <span className="info-label">EMAIL</span>
                <span className="info-value">{user?.email || 'N/A'}</span>
              </div>
            </div>
          </div>
        </HamsCard>

        {/* Schedule Info */}
        <div className={`schedule-banner glass ${attendanceActive ? 'active' : 'inactive'}`}>
          <div className="status-dot"></div>
          <div style={{ flex: 1 }}>
            <div className="status-title">
              {attendanceActive ? `Attendance is OPEN (${schedule.sessionName})` : 'Attendance is CLOSED'}
            </div>
            <div className="status-time">
              <div style={{ fontWeight: 600, marginTop: '2px', marginBottom: '2px' }}>Schedules:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {allSchedules.length > 0 ? (
                  allSchedules.map((s) => (
                    <div key={s.session_key} style={{ fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 600 }}>{s.session_name}:</span> {s.start_time}–{s.end_time}
                    </div>
                  ))
                ) : (
                  <div>{schedule.sessionName}: {schedule.start}–{schedule.end}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Card */}
        <HamsCard padding="2rem" className="attendance-card">
          {alreadyMarked || success ? (
            <div className="success-banner">
              <CheckCircle size={48} color="var(--color-success)" />
              <h3>Attendance Marked!</h3>
              <p>Your attendance has been recorded for today.<br/>See you tomorrow!</p>
            </div>
          ) : !attendanceActive ? (
            <div className="closed-attendance-view" style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                border: '3px solid #d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                color: '#d97706'
              }}>
                <Clock size={36} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#92400e', marginBottom: '0.4rem' }}>
                Attendance is closed.
              </h3>
              <p style={{ color: '#b45309', fontSize: '0.95rem', fontWeight: 600 }}>
                {allSchedules.length > 0 
                  ? (allSchedules.length === 1 
                      ? `Available between ${allSchedules[0].start_time} and ${allSchedules[0].end_time}`
                      : `Available during scheduled windows (${allSchedules.map(s => `${s.session_name}: ${s.start_time}–${s.end_time}`).join(', ')})`)
                  : `Available between ${schedule.start || '22:30'} and ${schedule.end || '23:05'}`
                }
              </p>
            </div>
          ) : (
            <div className="attendance-action">
              <RadarAnimation isScanning={isMarking}>
                <button 
                  className={`mark-btn ${isMarking ? 'marking' : ''}`}
                  onClick={handleMarkAttendance}
                  disabled={isMarking}
                >
                  <Fingerprint size={48} />
                </button>
              </RadarAnimation>
              
              <h3 className="action-title">Mark Attendance</h3>
              <p className="action-desc">Tap the button below to instantly record your attendance.</p>
              
              {error && <div className="error-message" style={{ marginTop: '1rem' }} dangerouslySetInnerHTML={{ __html: error }}></div>}
            </div>
          )}
        </HamsCard>
      </div>
    </div>
  );
};
