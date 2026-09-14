import React, { useState, useEffect } from 'react';
import { Clock, Play, Square, Download, Edit2, Trash2, Info, CheckCircle, XCircle } from 'lucide-react';
import { HamsCard } from '../../components/HamsCard';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import './LiveAttendanceView.css';

interface Session {
  session_key: string;
  session_name: string;
  icon_name?: string;
}

export const LiveAttendanceView: React.FC = () => {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>('');
  
  const [startTime, setStartTime] = useState('21:00');
  const [endTime, setEndTime] = useState('21:30');
  const [lateTime, setLateTime] = useState<string | null>(null);
  const [linkedSessionKey, setLinkedSessionKey] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (selectedSessionKey) {
      fetchSchedule(selectedSessionKey);
    }
  }, [selectedSessionKey]);

  const fetchSessions = async () => {
    try {
      const res = await apiClient.get('/admin/sessions');
      if (res.data.success) {
        setSessions(res.data.data);
        if (res.data.data.length > 0 && !selectedSessionKey) {
          setSelectedSessionKey(res.data.data[0].session_key);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedule = async (type: string) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/attendance/schedule?type=${type}`);
      if (res.data.success) {
        const data = res.data.data;
        setStartTime(data.start_time.substring(0, 5));
        setEndTime(data.end_time.substring(0, 5));
        setLateTime(data.late_time ? data.late_time.substring(0, 5) : null);
        setLinkedSessionKey(data.linked_session_key);
      }
    } catch (err: any) {
      setError('Failed to load schedule for ' + type);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg('');
    setError('');
    try {
      const res = await apiClient.put('/attendance/schedule', {
        startTime,
        endTime,
        type: selectedSessionKey,
        lateTime: lateTime,
        linkedSessionKey: linkedSessionKey
      });
      if (res.data.success) {
        setSuccessMsg('Schedule saved & activated successfully');
      } else {
        setError(res.data.message || 'Failed to save');
      }
    } catch (err: any) {
      setError('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleStop = async () => {
    setSaving(true);
    setSuccessMsg('');
    setError('');
    try {
      const now = new Date();
      const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      const res = await apiClient.put('/attendance/schedule', {
        startTime: nowStr,
        endTime: nowStr,
        type: selectedSessionKey
      });
      if (res.data.success) {
        setStartTime(nowStr);
        setEndTime(nowStr);
        setSuccessMsg('Attendance stopped immediately.');
      }
    } catch (err: any) {
      setError('Failed to stop attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!token) return;
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const url = `${baseUrl}/attendance/export?token=${token}`;
    window.open(url, '_blank');
  };

  const isAttendanceCurrentlyOpen = () => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [sH, sM] = startTime.split(':').map(Number);
    const startMinutes = sH * 60 + sM;
    
    const [eH, eM] = endTime.split(':').map(Number);
    const endMinutes = eH * 60 + eM;

    if (startMinutes === endMinutes) return false;

    if (endMinutes < startMinutes) {
      return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
    } else {
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    }
  };

  if (loading && sessions.length === 0) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  const selectedSessionName = sessions.find(s => s.session_key === selectedSessionKey)?.session_name || selectedSessionKey;
  const isOpen = isAttendanceCurrentlyOpen();

  return (
    <div className="live-attendance-container">
      <header className="page-header">
        <h2>Live Attendance Configuration</h2>
        <p className="subtitle">Configure and manage active attendance sessions.</p>
      </header>

      {error && <div className="alert error">{error}</div>}
      {successMsg && <div className="alert success">{successMsg}</div>}

      <div className="tabs-container glass">
        {sessions.map(s => (
          <button 
            key={s.session_key}
            className={`tab-btn ${selectedSessionKey === s.session_key ? 'active' : ''}`}
            onClick={() => setSelectedSessionKey(s.session_key)}
          >
            {s.session_name}
          </button>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state">No sessions available</div>
      ) : (
        <>
          <div className={`status-badge ${isOpen ? 'open' : 'closed'}`}>
            <div className="status-icon">
              {isOpen ? <CheckCircle size={24} /> : <XCircle size={24} />}
            </div>
            <div className="status-text">
              <h3>Attendance is {isOpen ? 'OPEN' : 'CLOSED'}</h3>
              {isOpen && <p>Window: {startTime} – {endTime}</p>}
            </div>
          </div>

          <HamsCard padding="2rem" className="schedule-card">
            <div className="card-header-with-icon">
              <div className="icon-wrapper"><Clock size={20} /></div>
              <h3>Global Time Window for {selectedSessionName}</h3>
            </div>
            
            <div className="time-picker-grid">
              <div className="time-field">
                <label>Start Time</label>
                <input 
                  type="time" 
                  value={startTime} 
                  onChange={e => setStartTime(e.target.value)}
                  className="glass-input"
                />
              </div>
              <div className="time-field">
                <label>End Time</label>
                <input 
                  type="time" 
                  value={endTime} 
                  onChange={e => setEndTime(e.target.value)}
                  className="glass-input"
                />
              </div>
            </div>

            <h4 className="advanced-title">Advanced Settings</h4>
            
            <div className="time-picker-grid">
              <div className="time-field">
                <label>Late Criteria Time</label>
                <input 
                  type="time" 
                  value={lateTime || ''} 
                  onChange={e => setLateTime(e.target.value || null)}
                  className="glass-input"
                />
                <button 
                  className="btn-text small" 
                  onClick={() => setLateTime(null)}
                >
                  Clear late time
                </button>
              </div>

              <div className="time-field">
                <label>Linked Attendance (Auto-mark)</label>
                <select 
                  value={linkedSessionKey || ''} 
                  onChange={e => setLinkedSessionKey(e.target.value || null)}
                  className="glass-input"
                >
                  <option value="">None</option>
                  {sessions.filter(s => s.session_key !== selectedSessionKey).map(s => (
                    <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="action-buttons mt-8">
              <button 
                className="btn-primary success" 
                onClick={handleSave} 
                disabled={saving}
              >
                <Play size={18} /> {saving ? 'Saving...' : 'Start / Save Attendance'}
              </button>
              
              <button 
                className="btn-primary danger" 
                onClick={handleStop} 
                disabled={saving}
              >
                <Square size={18} /> Stop Immediately
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
              <button className="btn-outline w-full" onClick={handleExport}>
                <Download size={18} /> Export Today's Attendance (CSV)
              </button>
            </div>
          </HamsCard>
        </>
      )}
    </div>
  );
};
