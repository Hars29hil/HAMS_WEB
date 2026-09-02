import React, { useEffect, useState } from 'react';
import { LogOut, Phone, Mail, DoorClosed, CheckCircle, Fingerprint } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { connectToESP32 } from '../../services/bleService';
import { HamsCard } from '../../components/HamsCard';
import { RadarAnimation } from '../../components/RadarAnimation';
import './StudentDashboard.css';

export const StudentDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [isMarking, setIsMarking] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const [attendanceActive, setAttendanceActive] = useState(false);
  const [schedule, setSchedule] = useState({ start: '', end: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await apiClient.get('/attendance/my-status');
      if (response.data.success) {
        const { already_marked, attendance_active, start_time, end_time } = response.data.data;
        setAlreadyMarked(already_marked);
        setAttendanceActive(attendance_active);
        setSchedule({ start: start_time, end: end_time });
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
      }
    }
  };

  const handleMarkAttendance = async () => {
    if (alreadyMarked) {
      setError('Your attendance is already marked for today.');
      return;
    }
    if (!attendanceActive && schedule.start && schedule.end) {
      setError(`Attendance is only available from ${schedule.start} to ${schedule.end}`);
      return;
    }

    setIsMarking(true);
    setError('');
    setSuccess('');

    try {
      // 1. Connect via Web Bluetooth and read token
      const bleConnection = await connectToESP32();
      
      let tokenToUse = bleConnection.token;

      // 2. If token is NONE (bridged mode), get a new one from backend
      if (tokenToUse === 'NONE') {
        const reqRes = await apiClient.post('/attendance/request-token', { rssi: -50 });
        if (reqRes.data.success) {
          tokenToUse = reqRes.data.token;
          
          // Write the new token to the ESP-32 to turn on the blue light and activate it!
          // Defaulting to 5 minutes duration as in the original app.
          await bleConnection.writeToken(tokenToUse, 5);
          
          // Do NOT return early. We must proceed to step 4 to actually call /attendance/mark !
        }
      }

      // 3. We have a valid token, disconnect to free up ESP-32 for others
      bleConnection.disconnect();

      // 4. Mark attendance with token
      const res = await apiClient.post('/attendance/mark', { ble_token: tokenToUse, rssi: -50 });
      if (res.data.success) {
        setAlreadyMarked(true);
        setSuccess('Attendance marked successfully!');
      } else {
        throw new Error(res.data.message || 'Failed to mark attendance.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during attendance marking.');
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header glass">
        <h2>Dashboard</h2>
        <button className="logout-btn" onClick={logout}>
          <LogOut size={20} />
        </button>
      </header>

      <div className="dashboard-content">
        
        {/* Profile Card */}
        <HamsCard padding="2rem" className="profile-card">
          <div className="avatar">
            {user?.name?.[0]?.toUpperCase() || '?'}
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
        {schedule.start && schedule.end && (
          <div className={`schedule-banner glass ${attendanceActive ? 'active' : 'inactive'}`}>
            <div className="status-dot"></div>
            <div>
              <div className="status-title">{attendanceActive ? 'Attendance is OPEN' : 'Attendance is CLOSED'}</div>
              <div className="status-time">Today's window: {schedule.start} – {schedule.end}</div>
            </div>
          </div>
        )}

        {/* Attendance Card */}
        <HamsCard padding="2rem" className="attendance-card">
          {alreadyMarked || success ? (
            <div className="success-banner">
              <CheckCircle size={48} color="var(--color-success)" />
              <h3>Attendance Marked!</h3>
              <p>Your attendance has been recorded for today.<br/>See you tomorrow!</p>
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
              <p className="action-desc">Be physically present on your assigned floor and ensure Bluetooth is enabled.</p>
              
              {error && <div className="error-message" style={{ marginTop: '1rem' }}>{error}</div>}
            </div>
          )}
        </HamsCard>
      </div>
    </div>
  );
};
