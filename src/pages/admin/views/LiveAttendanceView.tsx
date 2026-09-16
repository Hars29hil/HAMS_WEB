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

  const [activeTab, setActiveTab] = useState(0);
  
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceStudents, setAttendanceStudents] = useState<any[]>([]);
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState('All');
  
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);
  const [absentDate, setAbsentDate] = useState(new Date().toISOString().split('T')[0]);
  const [justificationModal, setJustificationModal] = useState<{isOpen: boolean, studentId: string, currentReason: string} | null>(null);

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

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/attendance/session/${sessionKey}/students?date=${attendanceDate}`);
      if (res.data.success) {
        setAttendanceStudents(res.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const markManual = async (studentId: string) => {
    try {
      await apiClient.post('/attendance/mark-manual', {
        session_key: sessionKey,
        student_code: studentId,
        date: attendanceDate
      });
      alert('Marked manually');
      fetchAttendance();
    } catch (e) {
      alert('Failed to mark manually');
    }
  };

  const fetchAbsent = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/attendance/session/${sessionKey}/absent-reasons?date=${absentDate}`);
      if (res.data.success) {
        setAbsentStudents(res.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const justifyAbsence = async (studentId: string, reason: string) => {
    try {
      await apiClient.post(`/attendance/session/absent-reason`, {
        session_key: sessionKey,
        student_code: studentId,
        date: absentDate,
        reason: reason
      });
      alert('Reason saved');
      setJustificationModal(null);
      fetchAbsent();
    } catch (e) {
      alert('Failed to save reason');
    }
  };

  useEffect(() => {
    if (activeTab === 1) fetchAttendance();
    if (activeTab === 2) fetchAbsent();
  }, [activeTab, attendanceDate, absentDate, sessionKey]);

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

      <div className="tabs-header" style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
        <button className={`tab-btn ${activeTab === 0 ? 'active' : ''}`} onClick={() => setActiveTab(0)}>Set Timing</button>
        <button className={`tab-btn ${activeTab === 1 ? 'active' : ''}`} onClick={() => setActiveTab(1)}>View Attendance</button>
        <button className={`tab-btn ${activeTab === 2 ? 'active' : ''}`} onClick={() => setActiveTab(2)}>Report Verification</button>
      </div>

      {activeTab === 0 && (
        <>
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
              <input 
                type="time" 
                value={startTime} 
                onChange={e => setStartTime(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker && (e.target as HTMLInputElement).showPicker()}
              />
            </div>
          </div>
          <ArrowRight className="arrow-icon" size={24} />
          <div className="time-field">
            <label>End Time</label>
            <div className="input-wrap">
              <input 
                type="time" 
                value={endTime} 
                onChange={e => setEndTime(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker && (e.target as HTMLInputElement).showPicker()}
              />
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
        </>
      )}

      {activeTab === 1 && (
         <HamsCard padding="24px">
           <div style={{display: 'flex', gap: '16px', marginBottom: '24px'}}>
             <input type="date" className="filter-select" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} />
             <select className="filter-select" value={attendanceStatusFilter} onChange={e => setAttendanceStatusFilter(e.target.value)}>
               <option value="All">All</option>
               <option value="Present">Present</option>
               <option value="Absent">Absent</option>
               <option value="Late">Late</option>
             </select>
           </div>
           
           <table className="students-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px' }}>Code</th>
                  <th style={{ padding: '12px' }}>Name</th>
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {attendanceStudents.filter(s => attendanceStatusFilter === 'All' || s.status === attendanceStatusFilter).map(s => (
                  <tr key={s.student_code} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px' }}>{s.student_code}</td>
                    <td style={{ padding: '12px' }}>{s.name}</td>
                    <td style={{ padding: '12px' }}>{s.status}</td>
                    <td style={{ padding: '12px' }}>
                      {s.status !== 'Present' && (
                        <button className="action-btn" onClick={() => markManual(s.student_code)}>Mark Manual</button>
                      )}
                    </td>
                  </tr>
                ))}
                {attendanceStudents.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '12px', textAlign: 'center' }}>No students found.</td></tr>
                )}
              </tbody>
           </table>
         </HamsCard>
      )}

      {activeTab === 2 && (
         <HamsCard padding="24px">
           <div style={{marginBottom: '24px'}}>
             <input type="date" className="filter-select" value={absentDate} onChange={e => setAbsentDate(e.target.value)} />
           </div>
           
           <table className="students-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px' }}>Code</th>
                  <th style={{ padding: '12px' }}>Name</th>
                  <th style={{ padding: '12px' }}>Reason</th>
                  <th style={{ padding: '12px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {absentStudents.map(s => (
                  <tr key={s.student_code} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px' }}>{s.student_code}</td>
                    <td style={{ padding: '12px' }}>{s.name}</td>
                    <td style={{ padding: '12px' }}>{s.reason || 'None'}</td>
                    <td style={{ padding: '12px' }}>
                      <button className="action-btn" onClick={() => setJustificationModal({isOpen: true, studentId: s.student_code, currentReason: s.reason || ''})}>Justify</button>
                    </td>
                  </tr>
                ))}
                {absentStudents.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '12px', textAlign: 'center' }}>No absent students found.</td></tr>
                )}
              </tbody>
           </table>
         </HamsCard>
      )}

      {justificationModal?.isOpen && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <h3 style={{ margin: '0 0 10px' }}>Justify Absence</h3>
            <textarea 
               style={{ width: '100%', height: '80px', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text)' }}
               value={justificationModal.currentReason} 
               onChange={e => setJustificationModal({...justificationModal, currentReason: e.target.value})} 
               placeholder="Enter reason..."
            />
            <div className="custom-modal-actions" style={{ marginTop: '15px' }}>
              <button className="btn-cancel" onClick={() => setJustificationModal(null)}>Cancel</button>
              <button className="btn-save" onClick={() => justifyAbsence(justificationModal.studentId, justificationModal.currentReason)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
