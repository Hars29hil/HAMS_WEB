import React, { useEffect, useState } from 'react';
import { Edit2, Trash2, Clock, ArrowRight, Info, ChevronDown, Play, Square, Download, CheckCircle, XCircle } from 'lucide-react';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';
import './LiveAttendanceView.css';

interface LiveAttendanceViewProps {
  sessionKey: string;
  sessionName: string;
  onChanged?: () => void;
}

export const LiveAttendanceView: React.FC<LiveAttendanceViewProps> = ({ sessionKey, sessionName, onChanged }) => {
  const [startTime, setStartTime] = useState('21:00');
  const [endTime, setEndTime] = useState('21:30');
  const [lateTime, setLateTime] = useState<string | null>(null);
  const [linkedSessionKey, setLinkedSessionKey] = useState<string | null>(null);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSchedule();
  }, [sessionKey]);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/attendance/schedule?type=${sessionKey}`);
      if (res.data.success) {
        setStartTime(res.data.data.start_time);
        setEndTime(res.data.data.end_time);
        setLateTime(res.data.data.late_time || null);
        setLinkedSessionKey(res.data.data.linked_session_key || null);
      }
      
      const sessionsRes = await apiClient.get('/admin/sessions');
      if (sessionsRes.data.success) {
        setAvailableSessions(sessionsRes.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch schedule', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/attendance/schedule', {
        startTime,
        endTime,
        type: sessionKey,
        lateTime,
        linkedSessionKey
      });
      if (res.data.success) {
        alert('Schedule saved successfully');
      }
    } catch (err) {
      alert('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const stopAttendance = async () => {
    setSaving(true);
    try {
      const now = new Date();
      const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      const res = await apiClient.put('/attendance/schedule', {
        startTime: nowStr,
        endTime: nowStr,
        type: sessionKey,
      });

      if (res.data.success) {
        setStartTime(nowStr);
        setEndTime(nowStr);
        alert('Attendance stopped immediately.');
      }
    } catch (err) {
      alert('Failed to stop attendance');
    } finally {
      setSaving(false);
    }
  };

  const editSession = async () => {
    const newName = window.prompt('Edit Session Name:', sessionName);
    if (newName && newName.trim() !== '') {
      setLoading(true);
      try {
        const res = await apiClient.put(`/admin/sessions/${sessionKey}`, {
          session_name: newName.trim()
        });
        if (res.data.success && onChanged) {
          onChanged();
        }
      } catch (err) {
        alert('Failed to edit session');
      } finally {
        setLoading(false);
      }
    }
  };

  const deleteSession = async () => {
    if (!window.confirm(`Are you sure you want to delete the ${sessionName} session?`)) return;
    setLoading(true);
    try {
      const res = await apiClient.delete(`/admin/sessions/${sessionKey}`);
      if (res.data.success && onChanged) {
        onChanged();
      }
    } catch (err) {
      alert('Failed to delete session');
    } finally {
      setLoading(false);
    }
  };

  const exportAttendance = () => {
    const token = localStorage.getItem('token');
    const baseUrl = apiClient.defaults.baseURL || 'https://api.example.com';
    window.open(`${baseUrl}/attendance/export?token=${token}`, '_blank');
  };

  const isAttendanceOpen = () => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [sh, sm] = startTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    
    const [eh, em] = endTime.split(':').map(Number);
    const endMins = eh * 60 + em;

    if (startMins === endMins) return false;

    if (endMins < startMins) {
      return nowMinutes >= startMins || nowMinutes <= endMins;
    } else {
      return nowMinutes >= startMins && nowMinutes <= endMins;
    }
  };

  const formatTime = (time24: string) => {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  if (loading) {
    return <div className="loading-state">Loading schedule...</div>;
  }

  const isOpen = isAttendanceOpen();

  return (
    <div className="live-view-container">
      <div className="live-header">
        <div>
          <h2>{sessionName} Schedule</h2>
          <p>Set the time window during which students are allowed to mark their attendance.</p>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={editSession} title="Edit Name"><Edit2 size={20} /></button>
          <button className="icon-btn delete" onClick={deleteSession} title="Delete"><Trash2 size={20} /></button>
        </div>
      </div>

      <div className={`status-banner ${isOpen ? 'open' : 'closed'}`}>
        <div className="status-icon">
          {isOpen ? <CheckCircle size={24} /> : <XCircle size={24} />}
        </div>
        <div className="status-text">
          <h3>Attendance is {isOpen ? 'OPEN' : 'CLOSED'}</h3>
          {isOpen && <p>Window: {formatTime(startTime)} – {formatTime(endTime)}</p>}
        </div>
      </div>

      <HamsCard padding="32px" className="schedule-card">
        <div className="card-section-header">
          <div className="icon-wrap"><Clock size={20} /></div>
          <h3>Global Time Window</h3>
        </div>

        <div className="time-pickers-row">
          <div className="time-field">
            <label>Start Time</label>
            <div className="input-wrap">
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
          </div>
          <ArrowRight className="arrow-icon" size={24} />
          <div className="time-field">
            <label>End Time</label>
            <div className="input-wrap">
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        </div>

        <h3 className="advanced-title">Advanced Settings</h3>
        <div className="advanced-row">
          <div className="time-field">
            <label>Late Criteria Time</label>
            <div className="input-wrap">
              <input type="time" value={lateTime || ''} onChange={e => setLateTime(e.target.value)} />
            </div>
            {lateTime && (
              <div className="clear-info">
                <Info size={14} /> Clear late time to disable late criteria limit.
                <button onClick={() => setLateTime(null)}>Clear</button>
              </div>
            )}
          </div>
          <div className="time-field">
            <label>Linked Attendance (Auto-mark)</label>
            <div className="input-wrap select-wrap">
              <select value={linkedSessionKey || ''} onChange={e => setLinkedSessionKey(e.target.value || null)}>
                <option value="">None</option>
                {availableSessions.filter(s => s.session_key !== sessionKey).map(s => (
                  <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
                ))}
              </select>
              <ChevronDown size={18} className="select-arrow" />
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button className="btn-primary start" onClick={saveSchedule} disabled={saving}>
            <Play size={18} /> {saving ? 'Saving...' : 'Start / Save Attendance'}
          </button>
          <button className="btn-primary stop" onClick={stopAttendance} disabled={saving}>
            <Square size={18} /> Stop Immediately
          </button>
        </div>

        <button className="btn-outline export" onClick={exportAttendance}>
          <Download size={18} /> Export Today's Attendance (CSV)
        </button>
      </HamsCard>
    </div>
  );
};
