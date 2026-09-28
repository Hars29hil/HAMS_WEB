import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, 
  Square, 
  Download, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Info, 
  Edit2, 
  Trash2,
  ArrowRight,
  Search,
  UserCheck,
  AlertCircle,
  FileText,
  Check,
  X,
  MessageSquare,
  Send,
  Users,
  Phone
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';
import './LiveAttendanceManager.css';

interface ManualModalState {
  isOpen: boolean;
  student: any;
  status: 'Present' | 'Late';
  description: string;
}

interface JustifyModalState {
  isOpen: boolean;
  student: any;
  reason: string;
  error?: string;
}

interface StatusAlertConfig {
  enabled: boolean;
  target: 'student' | 'parent' | 'both';
  student_message: string;
  parent_message: string;
}

interface AutoAlertsConfig {
  absent: StatusAlertConfig;
  late: StatusAlertConfig;
  leave: StatusAlertConfig;
  present: StatusAlertConfig;
}

const DEFAULT_ALERTS_CONFIG: AutoAlertsConfig = {
  absent: {
    enabled: true,
    target: 'both',
    student_message: 'Dear {name}, you were marked Absent for {session_name} on {date}. Please contact your floor leader.',
    parent_message: 'Respected Parent, your ward {name} (Room {room}) was marked Absent for {session_name} attendance on {date} at AVD Hostel.'
  },
  late: {
    enabled: false,
    target: 'both',
    student_message: 'Dear {name}, you were marked Late for {session_name} on {date}. Please ensure to be on time.',
    parent_message: 'Respected Parent, your ward {name} (Room {room}) arrived Late for {session_name} attendance on {date}.'
  },
  leave: {
    enabled: false,
    target: 'both',
    student_message: 'Dear {name}, your leave for {session_name} on {date} is recorded ({reason}).',
    parent_message: 'Respected Parent, your ward {name} (Room {room}) is on approved leave for {session_name} on {date}.'
  },
  present: {
    enabled: false,
    target: 'both',
    student_message: 'Dear {name}, your attendance for {session_name} on {date} was recorded successfully.',
    parent_message: 'Respected Parent, your ward {name} (Room {room}) was marked Present for {session_name} on {date}.'
  }
};

export const LiveAttendanceManager: React.FC<{ sessionKey: string; onSessionDeleted?: () => void }> = ({
  sessionKey,
  onSessionDeleted,
}) => {
  const [sessionName, setSessionName] = useState('');
  const [isForAllStudents, setIsForAllStudents] = useState(true);
  const [startTime, setStartTime] = useState('21:00');
  const [endTime, setEndTime] = useState('21:30');
  const [lateTime, setLateTime] = useState<string | null>(null);
  const [linkedSessionKey, setLinkedSessionKey] = useState<string | null>(null);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);

  // Multi-Category WhatsApp Alerts Configuration
  const [alertsConfig, setAlertsConfig] = useState<AutoAlertsConfig>(DEFAULT_ALERTS_CONFIG);
  const [activeAlertCategory, setActiveAlertCategory] = useState<'absent' | 'late' | 'leave' | 'present'>('absent');
  const [autoMessage, setAutoMessage] = useState('');
  const [autoMessageStudent, setAutoMessageStudent] = useState('');
  const [autoMessageParent, setAutoMessageParent] = useState('');
  const [autoMessageTime, setAutoMessageTime] = useState('');
  const [sendingAlerts, setSendingAlerts] = useState(false);

  const getTodayDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState(0);
  const [attendanceDate, setAttendanceDate] = useState(getTodayDateStr());
  const [floorFilter, setFloorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [absentDate, setAbsentDate] = useState(getTodayDateStr());
  const [absentFloorFilter, setAbsentFloorFilter] = useState('All');
  const [absentStatusFilter, setAbsentStatusFilter] = useState('All');
  const [absentSearchQuery, setAbsentSearchQuery] = useState('');
  const [attendanceStudents, setAttendanceStudents] = useState<any[]>([]);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);

  // Targets / Student Assignment state
  const [targetStudents, setTargetStudents] = useState<any[]>([]);
  const [targetFloors, setTargetFloors] = useState<any[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>([]);
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [targetFloorFilter, setTargetFloorFilter] = useState('All');
  const [savingTargets, setSavingTargets] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Modals state
  const [manualModal, setManualModal] = useState<ManualModalState | null>(null);
  const [justifyModal, setJustifyModal] = useState<JustifyModalState | null>(null);

  useEffect(() => {
    fetchSchedule();
    fetchTargets();
  }, [sessionKey]);

  useEffect(() => {
    if (activeTab === 1) fetchAttendanceList();
    if (activeTab === 2) fetchAbsentList();
    if (activeTab === 3) fetchTargets();

    // Auto-poll live records every 3 seconds
    const pollInterval = setInterval(() => {
      if (activeTab === 1 && !manualModal?.isOpen && !justifyModal?.isOpen) fetchAttendanceList();
      if (activeTab === 2 && !manualModal?.isOpen && !justifyModal?.isOpen) fetchAbsentList();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [activeTab, attendanceDate, absentDate, sessionKey, manualModal?.isOpen, justifyModal?.isOpen]);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const [res, allRes] = await Promise.all([
        apiClient.get(`/attendance/schedule?type=${sessionKey}`),
        apiClient.get('/admin/sessions')
      ]);

      if (res.data.success && res.data.data) {
        const d = res.data.data;
        setStartTime((d.start_time || '21:00').slice(0, 5));
        setEndTime((d.end_time || '21:30').slice(0, 5));
        setLateTime(d.late_time ? d.late_time.slice(0, 5) : null);
        setLinkedSessionKey(d.linked_session_key || null);
        const sMsg = d.auto_message_student || d.auto_message || '';
        const pMsg = d.auto_message_parent || '';
        setAutoMessage(sMsg);
        setAutoMessageStudent(sMsg);
        setAutoMessageParent(pMsg);
        setAutoMessageTime(d.auto_message_time ? d.auto_message_time.slice(0, 5) : '');
        if (d.is_for_all_students !== undefined) {
          setIsForAllStudents(Boolean(d.is_for_all_students));
        }

        if (d.auto_alerts_config) {
          const cfg = typeof d.auto_alerts_config === 'string' ? JSON.parse(d.auto_alerts_config) : d.auto_alerts_config;
          setAlertsConfig({
            absent: { ...DEFAULT_ALERTS_CONFIG.absent, ...(cfg.absent || {}) },
            late: { ...DEFAULT_ALERTS_CONFIG.late, ...(cfg.late || {}) },
            leave: { ...DEFAULT_ALERTS_CONFIG.leave, ...(cfg.leave || {}) },
            present: { ...DEFAULT_ALERTS_CONFIG.present, ...(cfg.present || {}) }
          });
        }
      }
      if (allRes.data.success) {
        setAvailableSessions(allRes.data.data);
        const match = allRes.data.data.find((s: any) => s.session_key === sessionKey);
        if (match) {
          setSessionName(match.session_name);
          if (match.is_for_all_students !== undefined) {
            setIsForAllStudents(Boolean(match.is_for_all_students));
          }
        } else {
          setSessionName(sessionKey.charAt(0).toUpperCase() + sessionKey.slice(1) + ' Attendance');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTargets = async () => {
    try {
      const res = await apiClient.get(`/attendance/session/${sessionKey}/targets`);
      if (res.data.success) {
        setTargetStudents(res.data.students || []);
        setTargetFloors(res.data.floors || []);
        setSelectedTargetIds(res.data.assigned_student_ids || []);
        if (res.data.is_for_all_students !== undefined) {
          setIsForAllStudents(Boolean(res.data.is_for_all_students));
        }
      }
    } catch (e) {
      console.error('Failed to load targets', e);
    }
  };

  const toggleStudentTarget = (studentId: number) => {
    setSelectedTargetIds(prev => 
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAllTargets = () => {
    const visibleStudentIds = filteredTargetStudents.map(s => s.student_id);
    setSelectedTargetIds(prev => Array.from(new Set([...prev, ...visibleStudentIds])));
  };

  const handleClearAllTargets = () => {
    const visibleStudentIds = new Set(filteredTargetStudents.map(s => s.student_id));
    setSelectedTargetIds(prev => prev.filter(id => !visibleStudentIds.has(id)));
  };

  const saveAssignedTargets = async () => {
    setSavingTargets(true);
    try {
      const res = await apiClient.post(`/attendance/session/${sessionKey}/targets`, {
        assigned_student_ids: selectedTargetIds
      });

      if (res.data.success) {
        alert('Assigned students for this session saved successfully!');
        fetchTargets();
        if (activeTab === 1) fetchAttendanceList();
        if (activeTab === 2) fetchAbsentList();
      } else {
        alert(res.data.message || 'Failed to save assigned students');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save assigned students');
    } finally {
      setSavingTargets(false);
    }
  };

  const updateCategoryConfig = (
    cat: 'absent' | 'late' | 'leave' | 'present',
    updates: Partial<StatusAlertConfig>
  ) => {
    setAlertsConfig(prev => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        ...updates
      }
    }));
  };

  const saveSchedule = async () => {
    // Validate that autoMessageTime is after endTime
    if (autoMessageTime && autoMessageTime.trim()) {
      const [eh, em] = endTime.split(':').map(Number);
      const [mh, mm] = autoMessageTime.split(':').map(Number);
      const [sh, sm] = startTime.split(':').map(Number);
      const eMins = eh * 60 + em;
      const mMins = mh * 60 + mm;
      const sMins = sh * 60 + sm;

      if (sMins <= eMins && mMins <= eMins) {
        alert(`Automated WhatsApp message time (${autoMessageTime}) must be set AFTER attendance End Time (${endTime})!`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await apiClient.put('/attendance/schedule', {
        type: sessionKey,
        startTime: startTime,
        endTime: endTime,
        lateTime: lateTime,
        linkedSessionKey: linkedSessionKey,
        autoMessage: alertsConfig.absent.student_message,
        autoMessageStudent: alertsConfig.absent.student_message,
        autoMessageParent: alertsConfig.absent.parent_message,
        autoMessageTime: autoMessageTime,
        autoAlertsConfig: alertsConfig
      });
      alert(res.data.message || 'Schedule and WhatsApp alert settings saved successfully!');
      fetchSchedule();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to update schedule');
    } finally {
      setSaving(false);
    }
  };

  const sendInstantSessionAlerts = async () => {
    const enabledCategories = (['absent', 'late', 'leave', 'present'] as const).filter(
      cat => alertsConfig[cat].enabled && (
        ((alertsConfig[cat].target === 'student' || alertsConfig[cat].target === 'both') && alertsConfig[cat].student_message.trim()) ||
        ((alertsConfig[cat].target === 'parent' || alertsConfig[cat].target === 'both') && alertsConfig[cat].parent_message.trim())
      )
    );

    if (enabledCategories.length === 0) {
      alert('Please enable at least one status category (Absent, Late, Leave, Present) and write a message template before sending.');
      return;
    }

    const catLabels = enabledCategories.map(c => c.toUpperCase()).join(', ');
    if (!window.confirm(`Are you sure you want to send WhatsApp alerts for categories: [${catLabels}] for ${sessionName} on ${attendanceDate}?\n\nMessages will be delivered safely in 1–2 second intervals.`)) {
      return;
    }

    setSendingAlerts(true);
    try {
      const res = await apiClient.post(`/attendance/session/${sessionKey}/send-session-alerts`, {
        alertsConfig: alertsConfig,
        date: attendanceDate
      });

      alert(res.data.message || 'Alerts dispatch started successfully.');
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to send alerts');
    } finally {
      setSendingAlerts(false);
    }
  };

  const stopAttendance = async () => {
    const now = new Date();
    const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setStartTime(curTime);
    setEndTime(curTime);
    setSaving(true);
    try {
      await apiClient.put('/attendance/schedule', {
        type: sessionKey,
        startTime: curTime,
        endTime: curTime,
        lateTime: lateTime,
        linkedSessionKey: linkedSessionKey
      });
      alert('Attendance stopped immediately.');
      fetchSchedule();
    } catch (e) {
      alert('Failed to stop attendance');
    } finally {
      setSaving(false);
    }
  };

  const editSession = async () => {
    const newName = window.prompt('Enter new name for this session:', sessionName);
    if (!newName || !newName.trim()) return;
    try {
      await apiClient.put(`/admin/sessions/${sessionKey}`, { session_name: newName.trim() });
      setSessionName(newName.trim());
      alert('Session name updated!');
    } catch (e) {
      alert('Failed to rename session');
    }
  };

  const deleteSession = async () => {
    if (!window.confirm(`Are you sure you want to delete session "${sessionName}"?`)) return;
    try {
      await apiClient.delete(`/admin/sessions/${sessionKey}`);
      alert('Session deleted');
      if (onSessionDeleted) onSessionDeleted();
    } catch (e) {
      alert('Failed to delete session');
    }
  };

  const exportAttendanceCSV = () => {
    const token = localStorage.getItem('admin_token');
    const baseUrl = apiClient.defaults.baseURL || '/api';
    window.open(`${baseUrl}/attendance/export?type=${sessionKey}&date=${attendanceDate}&token=${token}`, '_blank');
  };

  const fetchAttendanceList = async () => {
    try {
      const res = await apiClient.get(`/attendance/session/${sessionKey}/students?date=${attendanceDate}`);
      if (res.data.success) {
        setAttendanceStudents(res.data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAbsentList = async () => {
    try {
      const res = await apiClient.get(`/attendance/session/${sessionKey}/absent-reasons?date=${absentDate}`);
      if (res.data.success) {
        setAbsentStudents(res.data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Open Manual Mark Modal
  const openManualModal = (student: any) => {
    const currentStatus = student.status === 'Late' ? 'Late' : 'Present';
    setManualModal({
      isOpen: true,
      student: student,
      status: currentStatus,
      description: student.remarks || ''
    });
  };

  // Submit Manual Mark
  const handleSaveManualAttendance = async () => {
    if (!manualModal?.student) return;
    setSubmittingAction(true);
    try {
      const res = await apiClient.post('/attendance/mark-manual', {
        session_key: sessionKey,
        student_code: manualModal.student.student_code,
        student_id: manualModal.student.student_id,
        date: attendanceDate,
        status: manualModal.status,
        is_late: manualModal.status === 'Late',
        description: manualModal.description.trim()
      });

      if (res.data.success) {
        setManualModal(null);
        fetchAttendanceList();
        if (activeTab === 2) fetchAbsentList();
      } else {
        alert(res.data.message || 'Failed to mark attendance');
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to mark manual attendance');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Justify Modal
  const openJustifyModal = (student: any) => {
    setJustifyModal({
      isOpen: true,
      student: student,
      reason: student.reason || '',
      error: undefined
    });
  };

  // Submit Justification (Description is Required)
  const handleSaveJustification = async () => {
    if (!justifyModal) return;
    const trimmedReason = justifyModal.reason.trim();
    if (!trimmedReason) {
      setJustifyModal({
        ...justifyModal,
        error: 'Description / justification is required!'
      });
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await apiClient.post('/attendance/session/absent-reason', {
        session_key: sessionKey,
        student_id: justifyModal.student.student_id,
        student_code: justifyModal.student.student_code,
        date: absentDate,
        reason: trimmedReason,
        is_justified: true
      });

      if (res.data.success) {
        setJustifyModal(null);
        fetchAbsentList();
        if (activeTab === 1) fetchAttendanceList();
      } else {
        alert(res.data.message || 'Failed to save reason');
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to save reason');
    } finally {
      setSubmittingAction(false);
    }
  };

  const format12Hour = (time24: string) => {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  const isWindowActive = () => {
    const now = new Date();
    const curMins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const sMins = sh * 60 + sm;
    const eMins = eh * 60 + em;

    if (sMins === eMins) return false;
    if (eMins < sMins) {
      return curMins >= sMins || curMins <= eMins;
    }
    return curMins >= sMins && curMins <= eMins;
  };

  const isOpen = isWindowActive();

  // Filter attendance students
  const filteredAttendance = attendanceStudents.filter(s => {
    const studentStatus = s.status || (Boolean(s.is_present && s.is_present !== 0 && s.is_present !== '0') ? (Boolean(s.is_late && s.is_late !== 0 && s.is_late !== '0') ? 'Late' : 'Present') : 'Absent');
    const matchesFloor = floorFilter === 'All' || String(s.floor_id) === String(floorFilter);
    const matchesStatus = statusFilter === 'All' || studentStatus.toLowerCase() === statusFilter.toLowerCase();
    const matchesSearch = !searchQuery || 
      String(s.student_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(s.room_number || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFloor && matchesStatus && matchesSearch;
  });

  // Filter absent students
  const filteredAbsent = absentStudents.filter(s => {
    const matchesFloor = absentFloorFilter === 'All' || String(s.floor_id) === String(absentFloorFilter);
    const isJustified = Boolean(s.reason && s.reason.trim().length > 0);
    const matchesStatus = absentStatusFilter === 'All' ||
      (absentStatusFilter === 'Justified' && isJustified) ||
      (absentStatusFilter === 'Unjustified' && !isJustified);
    const matchesSearch = !absentSearchQuery || 
      String(s.student_code || '').toLowerCase().includes(absentSearchQuery.toLowerCase()) ||
      String(s.name || '').toLowerCase().includes(absentSearchQuery.toLowerCase()) ||
      String(s.room_number || '').toLowerCase().includes(absentSearchQuery.toLowerCase());
    return matchesFloor && matchesStatus && matchesSearch;
  });

  // Filter target assignment students
  const filteredTargetStudents = targetStudents.filter(s => {
    const matchesFloor = targetFloorFilter === 'All' || String(s.floor_id) === String(targetFloorFilter);
    const matchesSearch = !targetSearchQuery || 
      String(s.student_code || '').toLowerCase().includes(targetSearchQuery.toLowerCase()) ||
      String(s.name || '').toLowerCase().includes(targetSearchQuery.toLowerCase()) ||
      String(s.room_number || '').toLowerCase().includes(targetSearchQuery.toLowerCase());
    return matchesFloor && matchesSearch;
  });

  return (
    <div className="live-manager-container animate-fade-in">
      {/* Header */}
      <div className="live-manager-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{sessionName} Schedule</h2>
            {isForAllStudents ? (
              <span style={{
                padding: '3px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0'
              }}>
                🌟 All Students Session
              </span>
            ) : (
              <span style={{
                padding: '3px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: '#fffbeb',
                color: '#b45309',
                border: '1px solid #fde68a'
              }}>
                🎯 Selective Session ({selectedTargetIds.length} Assigned)
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0 0' }}>Set the time window and manage student assignments & live attendance.</p>
        </div>
        <div className="header-action-group">
          <button className="header-action-btn edit" onClick={editSession} title="Rename Session">
            <Edit2 size={15} /> Edit Name
          </button>
          <button className="header-action-btn delete" onClick={deleteSession} title="Delete Session">
            <Trash2 size={15} /> Delete Session
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-navigation">
        <button
          className={`tab-nav-btn ${activeTab === 0 ? 'active' : ''}`}
          onClick={() => setActiveTab(0)}
        >
          Set Timing
        </button>
        <button
          className={`tab-nav-btn ${activeTab === 1 ? 'active' : ''}`}
          onClick={() => setActiveTab(1)}
        >
          View Attendance
        </button>
        <button
          className={`tab-nav-btn ${activeTab === 2 ? 'active' : ''}`}
          onClick={() => setActiveTab(2)}
        >
          Report Verification
        </button>
        <button
          className={`tab-nav-btn ${activeTab === 3 ? 'active' : ''}`}
          onClick={() => setActiveTab(3)}
          style={{ position: 'relative' }}
        >
          <span>Student Assignment</span>
          {!isForAllStudents && (
            <span style={{
              marginLeft: '6px',
              padding: '2px 7px',
              fontSize: '11px',
              fontWeight: 800,
              borderRadius: '10px',
              backgroundColor: '#f59e0b',
              color: '#ffffff'
            }}>
              {selectedTargetIds.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 0: TIMING CONTROLS */}
      {activeTab === 0 && (
        <>
          {/* Status banner */}
          <div className={`live-status-banner ${isOpen ? 'open' : 'closed'}`}>
            <div className="status-banner-icon">
              {isOpen ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
            </div>
            <div>
              <h3>Attendance is {isOpen ? 'OPEN' : 'CLOSED'}</h3>
              {isOpen && <p>Live Time Window: {format12Hour(startTime)} – {format12Hour(endTime)}</p>}
            </div>
          </div>

          <div className="time-window-card">
            <div className="window-card-header">
              <div className="header-icon-pill">
                <Clock size={18} />
              </div>
              <h3>Global Time Window</h3>
            </div>

            <div className="time-pickers-container">
              <div className="time-input-field">
                <label>Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
              </div>

              <ArrowRight size={22} className="time-arrow" />

              <div className="time-input-field">
                <label>End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="advanced-settings-header">Advanced Settings</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="time-input-field">
                <label>Late Criteria Time</label>
                <input
                  type="time"
                  value={lateTime || ''}
                  onChange={e => setLateTime(e.target.value || null)}
                />
                {lateTime && (
                  <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <Info size={13} /> Late cutoff enabled.
                    <button
                      onClick={() => setLateTime(null)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div className="time-input-field">
                <label>Linked Attendance (Auto-mark)</label>
                <select
                  value={linkedSessionKey || ''}
                  onChange={e => setLinkedSessionKey(e.target.value || null)}
                >
                  <option value="">None</option>
                  {availableSessions.filter(s => s.session_key !== sessionKey).map(s => (
                    <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="timing-actions-row">
              <button className="btn-start-timing" onClick={saveSchedule} disabled={saving}>
                <Play size={18} /> {saving ? 'Saving...' : 'Start / Save Attendance'}
              </button>

              <button className="btn-stop-timing" onClick={stopAttendance} disabled={saving}>
                <Square size={18} /> Stop Immediately
              </button>
            </div>

            <button className="btn-export-csv" onClick={exportAttendanceCSV}>
              <Download size={17} /> Export Today's Attendance (CSV)
            </button>
          </div>

          {/* AUTOMATED WHATSAPP ALERTS FOR MULTI-STATUS CATEGORIES */}
          <div className="time-window-card" style={{ marginTop: '20px' }}>
            <div className="window-card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="header-icon-pill" style={{ backgroundColor: '#25D366' }}>
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    Automated & Instant WhatsApp Alerts (Multi-Status)
                  </h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                    Configure separate message templates & recipients (Student, Parent, or Both) for each status.
                  </p>
                </div>
              </div>

              {autoMessageTime && (
                <span style={{ 
                  padding: '4px 12px', 
                  borderRadius: '12px', 
                  fontSize: '12px', 
                  fontWeight: 700, 
                  backgroundColor: '#ecfdf5', 
                  color: '#065f46',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Clock size={13} /> Auto-Send Scheduled at {format12Hour(autoMessageTime)}
                </span>
              )}
            </div>

            {/* Time schedule row & active delivery mode summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 2fr', gap: '20px', marginBottom: '20px' }}>
              <div className="time-input-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                  <Clock size={15} /> Trigger Time (After End Time)
                </label>
                <input
                  type="time"
                  value={autoMessageTime}
                  onChange={e => setAutoMessageTime(e.target.value)}
                />
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                  Must be scheduled after attendance end time ({format12Hour(endTime)}).
                </div>
                {autoMessageTime && (
                  <button
                    type="button"
                    onClick={() => setAutoMessageTime('')}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: '#ef4444', 
                      cursor: 'pointer', 
                      fontWeight: 700, 
                      fontSize: '12px', 
                      textAlign: 'left', 
                      marginTop: '6px' 
                    }}
                  >
                    ✕ Clear Time (Disable Auto-Send)
                  </button>
                )}
              </div>

              {/* Delivery Status Indicator Banner */}
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
                  Active Alert Categories Summary:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {Object.entries(alertsConfig).filter(([_, cfg]) => cfg.enabled).length > 0 ? (
                    Object.entries(alertsConfig).filter(([_, cfg]) => cfg.enabled).map(([k, cfg]) => {
                      const colors: Record<string, { bg: string; text: string; border: string; icon: string }> = {
                        absent: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', icon: '🔴' },
                        late: { bg: '#fffbeb', text: '#92400e', border: '#fde68a', icon: '🟡' },
                        leave: { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe', icon: '🏖️' },
                        present: { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', icon: '🟢' }
                      };
                      const colorInfo = colors[k] || colors.absent;
                      return (
                        <span
                          key={`summary_${k}`}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            backgroundColor: colorInfo.bg,
                            color: colorInfo.text,
                            border: `1px solid ${colorInfo.border}`,
                            fontSize: '12px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <span>{colorInfo.icon}</span>
                          <span style={{ textTransform: 'capitalize' }}>{k}</span>
                          <span style={{ fontSize: '11px', opacity: 0.8 }}>({cfg.target === 'both' ? 'Both' : (cfg.target === 'student' ? 'Student' : 'Parent')})</span>
                        </span>
                      );
                    })
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>
                      🛑 No alert categories enabled. Select categories below to enable alerts.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* MULTI-SELECT STATUS SELECTOR CARDS */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '10px' }}>
                Select Status Categories to Send WhatsApp Alerts:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {(['absent', 'late', 'leave', 'present'] as const).map((cat) => {
                  const isSelected = activeAlertCategory === cat;
                  const isEnabled = alertsConfig[cat].enabled;
                  const meta: Record<string, { label: string; icon: string; desc: string; activeColor: string; bgLight: string }> = {
                    absent: { label: 'Absent', icon: '🔴', desc: 'Students not marked present', activeColor: '#ef4444', bgLight: '#fef2f2' },
                    late: { label: 'Late', icon: '🟡', desc: 'Students marked after late cutoff', activeColor: '#f59e0b', bgLight: '#fffbeb' },
                    leave: { label: 'Approved Leave', icon: '🏖️', desc: 'Students with approved leave', activeColor: '#8b5cf6', bgLight: '#f5f3ff' },
                    present: { label: 'Present', icon: '🟢', desc: 'Successfully marked present', activeColor: '#10b981', bgLight: '#ecfdf5' }
                  };
                  const m = meta[cat];

                  return (
                    <div
                      key={`cat_card_${cat}`}
                      onClick={() => setActiveAlertCategory(cat)}
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        border: isSelected ? `2px solid ${m.activeColor}` : (isEnabled ? '1px solid #cbd5e1' : '1px solid #e2e8f0'),
                        backgroundColor: isSelected ? m.bgLight : (isEnabled ? '#ffffff' : '#f8fafc'),
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: isSelected ? `0 4px 12px ${m.activeColor}25` : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '18px' }}>{m.icon}</span>
                          <span style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>{m.label}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateCategoryConfig(cat, { enabled: e.target.checked });
                          }}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            accentColor: m.activeColor
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                        <span style={{ color: '#64748b' }}>{m.desc}</span>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: isEnabled ? '#dcfce7' : '#f1f5f9',
                          color: isEnabled ? '#15803d' : '#94a3b8'
                        }}>
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CONFIGURATION PANEL FOR SELECTED STATUS */}
            {(() => {
              const curCat = activeAlertCategory;
              const curCfg = alertsConfig[curCat];
              const curMeta: Record<string, { label: string; icon: string; color: string; bg: string }> = {
                absent: { label: 'Absent Students', icon: '🔴', color: '#ef4444', bg: '#fef2f2' },
                late: { label: 'Late Students', icon: '🟡', color: '#f59e0b', bg: '#fffbeb' },
                leave: { label: 'Approved Leave Students', icon: '🏖️', color: '#8b5cf6', bg: '#f5f3ff' },
                present: { label: 'Present Students', icon: '🟢', color: '#10b981', bg: '#ecfdf5' }
              };
              const curInfo = curMeta[curCat];

              return (
                <div style={{
                  padding: '18px',
                  borderRadius: '12px',
                  border: `1.5px solid ${curInfo.color}40`,
                  backgroundColor: '#ffffff',
                  marginBottom: '16px'
                }}>
                  {/* Category Sub-header & Target Options */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>{curInfo.icon}</span>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                          Configuring Template for {curInfo.label}
                        </h4>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          Status: <strong style={{ color: curCfg.enabled ? '#15803d' : '#94a3b8' }}>{curCfg.enabled ? 'Enabled' : 'Disabled'}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Target Selector: Student / Parent / Both */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Send To:</span>
                      <div style={{ display: 'inline-flex', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '4px' }}>
                        {[
                          { key: 'student', label: '👦 Student' },
                          { key: 'parent', label: '👨‍👩‍👧 Parent' },
                          { key: 'both', label: '👥 Both' }
                        ].map(t => (
                          <button
                            key={`target_btn_${t.key}`}
                            type="button"
                            onClick={() => updateCategoryConfig(curCat, { target: t.key as any })}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              border: 'none',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              backgroundColor: curCfg.target === t.key ? '#ffffff' : 'transparent',
                              color: curCfg.target === t.key ? '#0f172a' : '#64748b',
                              boxShadow: curCfg.target === t.key ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Two Message Boxes: Student and Parent */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                    
                    {/* 1. Student Message Box */}
                    <div style={{
                      padding: '14px',
                      borderRadius: '10px',
                      border: curCfg.student_message.trim() ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
                      backgroundColor: (curCfg.target === 'student' || curCfg.target === 'both') ? '#faf5ff' : '#f8fafc',
                      opacity: (curCfg.target === 'student' || curCfg.target === 'both') ? 1 : 0.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                          <Users size={16} color="#4f46e5" /> 1. Student WhatsApp Message
                        </label>
                        {(curCfg.target === 'student' || curCfg.target === 'both') && curCfg.student_message.trim() && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5', backgroundColor: '#ede9fe', padding: '2px 6px', borderRadius: '4px' }}>
                            Active
                          </span>
                        )}
                      </div>
                      <textarea
                        rows={4}
                        value={curCfg.student_message}
                        onChange={e => updateCategoryConfig(curCat, { student_message: e.target.value })}
                        placeholder={`e.g. Dear {name}, you were marked ${curInfo.label} for {session_name} on {date}.`}
                        style={{ 
                          width: '100%', 
                          resize: 'vertical',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          fontFamily: 'inherit',
                          backgroundColor: '#ffffff'
                        }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Tags:</span>
                        {['{name}', '{session_name}', '{date}', '{floor}', '{room}', '{reason}', '{status}'].map(tag => (
                          <button
                            key={`tag_student_${curCat}_${tag}`}
                            type="button"
                            onClick={() => {
                              const next = curCfg.student_message + (curCfg.student_message ? ' ' : '') + tag;
                              updateCategoryConfig(curCat, { student_message: next });
                            }}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: '#4338ca'
                            }}
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Parent Message Box */}
                    <div style={{
                      padding: '14px',
                      borderRadius: '10px',
                      border: curCfg.parent_message.trim() ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                      backgroundColor: (curCfg.target === 'parent' || curCfg.target === 'both') ? '#f0fdf4' : '#f8fafc',
                      opacity: (curCfg.target === 'parent' || curCfg.target === 'both') ? 1 : 0.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                          <Phone size={16} color="#10b981" /> 2. Parent WhatsApp Message
                        </label>
                        {(curCfg.target === 'parent' || curCfg.target === 'both') && curCfg.parent_message.trim() && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                            Active
                          </span>
                        )}
                      </div>
                      <textarea
                        rows={4}
                        value={curCfg.parent_message}
                        onChange={e => updateCategoryConfig(curCat, { parent_message: e.target.value })}
                        placeholder={`e.g. Respected Parent, your ward {name} (Room {room}) was marked ${curInfo.label} for {session_name} attendance on {date} at AVD Hostel.`}
                        style={{ 
                          width: '100%', 
                          resize: 'vertical',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          fontFamily: 'inherit',
                          backgroundColor: '#ffffff'
                        }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Tags:</span>
                        {['{name}', '{session_name}', '{date}', '{floor}', '{room}', '{reason}', '{status}'].map(tag => (
                          <button
                            key={`tag_parent_${curCat}_${tag}`}
                            type="button"
                            onClick={() => {
                              const next = curCfg.parent_message + (curCfg.parent_message ? ' ' : '') + tag;
                              updateCategoryConfig(curCat, { parent_message: next });
                            }}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: '#059669'
                            }}
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* Bottom Controls */}
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              gap: '12px', 
              paddingTop: '16px', 
              borderTop: '1px solid #f1f5f9' 
            }}>
              <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Info size={15} color="#3b82f6" /> Messages are sent with a 1–2 second human interval to protect WhatsApp account from being blocked.
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={sendInstantSessionAlerts}
                  disabled={sendingAlerts || !Object.values(alertsConfig).some(c => c.enabled)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: '1.5px solid #25D366',
                    background: '#ecfdf5',
                    color: '#065f46',
                    fontWeight: 700,
                    cursor: (sendingAlerts || !Object.values(alertsConfig).some(c => c.enabled)) ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: !Object.values(alertsConfig).some(c => c.enabled) ? 0.6 : 1
                  }}
                >
                  <Send size={15} /> {sendingAlerts ? 'Sending Alerts...' : 'Send Session Alerts Now'}
                </button>

                <button
                  type="button"
                  onClick={saveSchedule}
                  disabled={saving}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
                  }}
                >
                  {saving ? 'Saving...' : 'Save Schedule & Alerts'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* TAB 1: VIEW ATTENDANCE */}
      {activeTab === 1 && (
        <HamsCard padding="24px">
          {/* Filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
            <input
              type="date"
              value={attendanceDate}
              onChange={e => setAttendanceDate(e.target.value)}
              style={{ width: '160px' }}
            />

            <select value={floorFilter} onChange={e => setFloorFilter(e.target.value)} style={{ width: '130px' }}>
              <option value="All">All Floors</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fl => (
                <option key={fl} value={String(fl)}>Floor {fl}</option>
              ))}
            </select>

            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '130px' }}>
              <option value="All">All Status</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
              <option value="Leave">Leave</option>
            </select>

            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search by ID, Name, or Room..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px' }}
              />
            </div>

            <button 
              className="btn-export-csv" 
              onClick={exportAttendanceCSV}
              style={{ padding: '8px 14px', fontSize: '13px' }}
            >
              <Download size={14} /> Export CSV
            </button>

            <span style={{ fontSize: '13px', fontWeight: 700, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
              Live Sync ({filteredAttendance.length})
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '12px 14px' }}>Code</th>
                <th style={{ padding: '12px 14px' }}>Name</th>
                <th style={{ padding: '12px 14px' }}>Floor / Room</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px' }}>Notes / Remarks</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendance.map(s => (
                <tr key={s.student_code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#3b82f6' }}>{s.student_code}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>{s.name}</span>
                      {s.tags && s.tags.length > 0 && s.tags.map((tag: any) => (
                        <span
                          key={tag.id || tag.tag_id}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: `${tag.color || '#4f46e5'}20`,
                            color: tag.color || '#4f46e5',
                            border: `1px solid ${tag.color || '#4f46e5'}50`
                          }}
                        >
                          🏷️ {tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '13px' }}>
                    Floor {s.floor_id} {s.room_number ? `(Rm ${s.room_number})` : ''}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: s.status === 'Present' ? '#ecfdf5' : (s.status === 'Late' ? '#fef3c7' : (s.status === 'Leave' ? '#ede9fe' : '#fef2f2')),
                      color: s.status === 'Present' ? '#166534' : (s.status === 'Late' ? '#92400e' : (s.status === 'Leave' ? '#6d28d9' : '#991b1b')),
                      border: s.status === 'Leave' ? '1px solid #ddd6fe' : undefined,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {s.status === 'Leave' ? '🏖️ Leave' : s.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '13px', maxWidth: '200px' }}>
                    {s.remarks || s.reason || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <button
                      onClick={() => openManualModal(s)}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: s.status === 'Absent' ? '#e0e7ff' : '#f1f5f9',
                        color: s.status === 'Absent' ? '#4338ca' : '#334155',
                        border: '1px solid ' + (s.status === 'Absent' ? '#c7d2fe' : '#cbd5e1'),
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <UserCheck size={14} />
                      {s.status === 'Absent' ? 'Mark Manual' : 'Edit Mark'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredAttendance.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                    No students match the criteria for {attendanceDate}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </HamsCard>
      )}

      {/* TAB 2: ABSENT / REPORT VERIFICATION */}
      {activeTab === 2 && (
        <HamsCard padding="24px">
          {/* Filters Bar for Absent / Justifications */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
            <input
              type="date"
              value={absentDate}
              onChange={e => setAbsentDate(e.target.value)}
              style={{ width: '160px' }}
            />

            <select 
              value={absentFloorFilter} 
              onChange={e => setAbsentFloorFilter(e.target.value)} 
              style={{ width: '130px' }}
            >
              <option value="All">All Floors</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fl => (
                <option key={fl} value={String(fl)}>Floor {fl}</option>
              ))}
            </select>

            <select 
              value={absentStatusFilter} 
              onChange={e => setAbsentStatusFilter(e.target.value)} 
              style={{ width: '140px' }}
            >
              <option value="All">All Status</option>
              <option value="Justified">Justified</option>
              <option value="Unjustified">Unjustified</option>
            </select>

            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search absent by ID, Name, or Room..."
                value={absentSearchQuery}
                onChange={e => setAbsentSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px' }}
              />
            </div>

            <span style={{ fontSize: '13px', fontWeight: 700, color: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6366f1' }}></span>
              Absent Records ({filteredAbsent.length})
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '12px 14px' }}>Code</th>
                <th style={{ padding: '12px 14px' }}>Name</th>
                <th style={{ padding: '12px 14px' }}>Floor / Room</th>
                <th style={{ padding: '12px 14px' }}>Justification Reason</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAbsent.map(s => (
                <tr key={s.student_code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#3b82f6' }}>{s.student_code}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>{s.name}</span>
                      {s.tags && s.tags.length > 0 && s.tags.map((tag: any) => (
                        <span
                          key={tag.id || tag.tag_id}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: `${tag.color || '#4f46e5'}20`,
                            color: tag.color || '#4f46e5',
                            border: `1px solid ${tag.color || '#4f46e5'}50`
                          }}
                        >
                          🏷️ {tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '13px' }}>
                    Floor {s.floor_id} {s.room_number ? `(Rm ${s.room_number})` : ''}
                  </td>
                  <td style={{ padding: '12px 14px', color: s.reason ? '#0f172a' : '#94a3b8' }}>
                    {s.reason ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#047857', fontWeight: 600 }}>
                        <Check size={14} /> {s.reason}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unjustified</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        onClick={() => openJustifyModal(s)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: '#3b82f6',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <FileText size={14} /> Justify
                      </button>

                      <button
                        onClick={() => openManualModal({ ...s, status: 'Absent' })}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#e0e7ff',
                          color: '#4338ca',
                          border: '1px solid #c7d2fe',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Mark Manual
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAbsent.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                    No absent students match the criteria for {absentDate}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </HamsCard>
      )}

      {/* TAB 3: STUDENT ASSIGNMENT / TARGET MANAGEMENT */}
      {activeTab === 3 && (
        <HamsCard padding="24px">
          {/* Information & Mode Banner */}
          <div style={{
            padding: '16px 20px',
            borderRadius: '12px',
            backgroundColor: isForAllStudents ? '#f0fdf4' : '#fffbeb',
            border: isForAllStudents ? '1px solid #bbf7d0' : '1px solid #fde68a',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: isForAllStudents ? '#dcfce7' : '#fef3c7',
                color: isForAllStudents ? '#15803d' : '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '18px'
              }}>
                {isForAllStudents ? '🌟' : '🎯'}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: isForAllStudents ? '#15803d' : '#92400e' }}>
                  {isForAllStudents ? 'Hostel-Wide Session (All Students Active)' : 'Selective Session (Specific Students Only)'}
                </h4>
                <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: isForAllStudents ? '#166534' : '#b45309' }}>
                  {isForAllStudents
                    ? 'This session is set for all hostel students by default. You can assign specific students below if this session becomes selective.'
                    : 'Only students selected below can mark attendance for this session. Absentee WhatsApp alerts will ONLY go to these assigned students.'}
                </p>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#ffffff',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontWeight: 700,
              fontSize: '13px',
              color: '#334155'
            }}>
              <Users size={16} color="#4f46e5" />
              <span>Assigned: <strong style={{ color: '#4f46e5' }}>{selectedTargetIds.length}</strong> / {targetStudents.length} Students</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px',
            paddingBottom: '16px',
            borderBottom: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
              <select
                value={targetFloorFilter}
                onChange={(e) => setTargetFloorFilter(e.target.value)}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="All">All Floors</option>
                {targetFloors.map((fl: any) => (
                  <option key={`target_fl_${fl.floor_id}`} value={String(fl.floor_id)}>
                    {fl.floor_name || `Floor ${fl.floor_id}`}
                  </option>
                ))}
              </select>

              <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '380px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Filter students by name, ID, room..."
                  value={targetSearchQuery}
                  onChange={(e) => setTargetSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleSelectAllTargets}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#eef2ff',
                  color: '#4338ca',
                  border: '1px solid #c7d2fe',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✓ Select All ({filteredTargetStudents.length})
              </button>

              <button
                type="button"
                onClick={handleClearAllTargets}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#f1f5f9',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ✕ Deselect All
              </button>
            </div>

            <button
              type="button"
              disabled={savingTargets}
              onClick={saveAssignedTargets}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 20px',
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: savingTargets ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              <Check size={16} />
              <span>{savingTargets ? 'Saving Assignments...' : `Save Assigned Students (${selectedTargetIds.length})`}</span>
            </button>
          </div>

          {/* Student Targeting Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                  <th style={{ padding: '12px 14px', width: '40px' }}>Assign</th>
                  <th style={{ padding: '12px 14px' }}>Student Code</th>
                  <th style={{ padding: '12px 14px' }}>Student Name</th>
                  <th style={{ padding: '12px 14px' }}>Floor</th>
                  <th style={{ padding: '12px 14px' }}>Room No.</th>
                  <th style={{ padding: '12px 14px' }}>Contact Phone</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Session Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTargetStudents.map(student => {
                  const isAssigned = selectedTargetIds.includes(student.student_id);
                  return (
                    <tr
                      key={`target_row_${student.student_id}`}
                      onClick={() => toggleStudentTarget(student.student_id)}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isAssigned ? '#f5f3ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => toggleStudentTarget(student.student_id)}
                          style={{
                            width: '18px',
                            height: '18px',
                            accentColor: '#4f46e5',
                            cursor: 'pointer'
                          }}
                        />
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#3b82f6', fontFamily: 'monospace' }}>
                        {student.student_code}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>
                        {student.name}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>
                        Floor {student.floor_id}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>
                        {student.room_number ? `Room ${student.room_number}` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace' }}>
                        {student.phone_number || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {isAssigned ? (
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '20px',
                            backgroundColor: '#dcfce7',
                            color: '#15803d',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            ✓ Assigned
                          </span>
                        ) : (
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '20px',
                            backgroundColor: '#f1f5f9',
                            color: '#94a3b8',
                            fontSize: '11px',
                            fontWeight: 600
                          }}>
                            Not Assigned
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredTargetStudents.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                      No students found matching the selected filter/search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </HamsCard>
      )}

      {/* MODAL 1: MANUAL ATTENDANCE POP-UP (REGULAR OR LATE + DESCRIPTION) */}
      {manualModal?.isOpen && createPortal(
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setManualModal(null); }}>
          <div className="modal-content-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Mark Manual Attendance
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  {manualModal.student.name} ({manualModal.student.student_code}) • Floor {manualModal.student.floor_id} • Room {manualModal.student.room_number || 'N/A'}
                </p>
              </div>
              <button 
                onClick={() => setManualModal(null)} 
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Attendance Status Type: Regular or Late */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                Select Attendance Status:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setManualModal({ ...manualModal, status: 'Present' })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '14px',
                    borderRadius: '10px',
                    border: manualModal.status === 'Present' ? '2px solid #10b981' : '1px solid #e2e8f0',
                    backgroundColor: manualModal.status === 'Present' ? '#ecfdf5' : '#ffffff',
                    color: manualModal.status === 'Present' ? '#065f46' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: 700,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <CheckCircle2 size={22} color={manualModal.status === 'Present' ? '#10b981' : '#94a3b8'} />
                  <span>Regular (Present)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManualModal({ ...manualModal, status: 'Late' })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '14px',
                    borderRadius: '10px',
                    border: manualModal.status === 'Late' ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                    backgroundColor: manualModal.status === 'Late' ? '#fffbeb' : '#ffffff',
                    color: manualModal.status === 'Late' ? '#92400e' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: 700,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Clock size={22} color={manualModal.status === 'Late' ? '#f59e0b' : '#94a3b8'} />
                  <span>Late</span>
                </button>
              </div>
            </div>

            {/* Description / Remarks */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                Description / Remarks (Optional):
              </label>
              <textarea
                rows={3}
                value={manualModal.description}
                onChange={e => setManualModal({ ...manualModal, description: e.target.value })}
                placeholder="E.g. In room sick, Bluetooth connection issue, Warden permission granted..."
                style={{ 
                  width: '100%', 
                  padding: '10px 14px', 
                  borderRadius: '8px', 
                  border: '1px solid #cbd5e1', 
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setManualModal(null)}
                style={{ 
                  padding: '10px 18px', 
                  background: '#f1f5f9', 
                  border: '1px solid #cbd5e1', 
                  borderRadius: '8px', 
                  cursor: 'pointer', 
                  fontWeight: 600,
                  fontSize: '13px',
                  color: '#475569'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleSaveManualAttendance}
                style={{ 
                  padding: '10px 20px', 
                  background: manualModal.status === 'Late' ? '#d97706' : '#10b981', 
                  color: '#ffffff', 
                  border: 'none', 
                  borderRadius: '8px', 
                  cursor: submittingAction ? 'not-allowed' : 'pointer', 
                  fontWeight: 700,
                  fontSize: '13px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {submittingAction ? 'Saving...' : `Mark as ${manualModal.status}`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 2: JUSTIFICATION POP-UP (DESCRIPTION REQUIRED) */}
      {justifyModal?.isOpen && createPortal(
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setJustifyModal(null); }}>
          <div className="modal-content-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Justify Absence / Late
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  {justifyModal.student.name} ({justifyModal.student.student_code}) • Floor {justifyModal.student.floor_id} • Room {justifyModal.student.room_number || 'N/A'}
                </p>
              </div>
              <button 
                onClick={() => setJustifyModal(null)} 
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {justifyModal.error && (
              <div style={{ 
                padding: '10px 14px', 
                backgroundColor: '#fef2f2', 
                border: '1px solid #fecaca', 
                borderRadius: '8px', 
                color: '#b91c1c', 
                fontSize: '13px', 
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px'
              }}>
                <AlertCircle size={16} />
                {justifyModal.error}
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                Why did the student arrive late or stay absent? <span style={{ color: '#ef4444' }}>* (Required)</span>
              </label>
              <textarea
                rows={4}
                value={justifyModal.reason}
                onChange={e => setJustifyModal({ ...justifyModal, reason: e.target.value, error: undefined })}
                placeholder="Give proper detailed reason for absence / late arrival (e.g. Medical emergency at hospital, College sports event, On approved weekend leave)..."
                style={{ 
                  width: '100%', 
                  padding: '12px 14px', 
                  borderRadius: '8px', 
                  border: justifyModal.error ? '2px solid #ef4444' : '1px solid #cbd5e1', 
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setJustifyModal(null)}
                style={{ 
                  padding: '10px 18px', 
                  background: '#f1f5f9', 
                  border: '1px solid #cbd5e1', 
                  borderRadius: '8px', 
                  cursor: 'pointer', 
                  fontWeight: 600,
                  fontSize: '13px',
                  color: '#475569'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleSaveJustification}
                style={{ 
                  padding: '10px 20px', 
                  background: '#3b82f6', 
                  color: '#ffffff', 
                  border: 'none', 
                  borderRadius: '8px', 
                  cursor: submittingAction ? 'not-allowed' : 'pointer', 
                  fontWeight: 700,
                  fontSize: '13px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {submittingAction ? 'Saving...' : 'Submit Justification'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

