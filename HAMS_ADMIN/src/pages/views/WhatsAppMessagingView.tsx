import React, { useEffect, useState } from 'react';
import { 
  Send, 
  CheckSquare, 
  XSquare, 
  RefreshCw, 
  Smartphone, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  LogOut, 
  QrCode, 
  User, 
  Phone,
  Filter,
  Calendar,
  Layers,
  Clock,
  Users,
  Check
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

interface ConnectedUser {
  phone: string;
  name: string;
}

export const WhatsAppMessagingView: React.FC = () => {
  const [waStatus, setWaStatus] = useState<string>('connecting');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [connectedUser, setConnectedUser] = useState<ConnectedUser | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [messageText, setMessageText] = useState<string>(
    'Jai Swaminarayan {name},\nThis is a notification regarding your {session_name} on {date}.\nStatus: {status}\nRoom: {room number}, Floor: {floor}.\nPlease ensure timely presence.'
  );
  
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  // Multi-day Filters
  const todayStr = new Date().toISOString().slice(0, 10);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedSession, setSelectedSession] = useState<string>('night');
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [recipientTarget, setRecipientTarget] = useState<'student' | 'parent' | 'both'>('student');

  const [multiDayAttendanceMap, setMultiDayAttendanceMap] = useState<Record<string, Record<string, { status: string; marked_at?: string; is_late?: boolean; reason?: string }>>>({});

  const datesInRange = React.useMemo(() => {
    if (!startDate || !endDate) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) return [startDate];
    const list: string[] = [];
    const curr = new Date(start);
    while (curr <= end) {
      list.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
    }
    return list;
  }, [startDate, endDate]);

  const totalDays = datesInRange.length || 1;

  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [reportData, setReportData] = useState<any>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchWaStatus();
    fetchMetadata();

    // Auto-poll status every 3 seconds for snappy QR scan detection
    const interval = setInterval(fetchWaStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchSessionAttendance();
  }, [startDate, endDate, selectedSession]);

  const fetchWaStatus = async () => {
    try {
      const res = await apiClient.get('/whatsapp/status');
      const data = res.data?.data || res.data;
      if (data) {
        setWaStatus(data.status || 'disconnected');
        setQrCodeData(data.qr || '');
        if (data.user && (data.user.phone || data.user.name)) {
          setConnectedUser(data.user);
        } else {
          setConnectedUser(null);
        }
      }
    } catch (e) {
      console.error('Error fetching WA status:', e);
    }
  };

  const fetchMetadata = async () => {
    setLoading(true);
    try {
      const [stuRes, flRes, sessRes, repRes] = await Promise.all([
        apiClient.get('/students'),
        apiClient.get('/floors'),
        apiClient.get('/admin/sessions'),
        apiClient.get('/admin/reports?time_filter=all')
      ]);
      if (stuRes.data.success) setStudents(stuRes.data.data);
      if (flRes.data.success) setFloors(flRes.data.data);
      if (sessRes.data.success && Array.isArray(sessRes.data.data)) {
        setSessions(sessRes.data.data);
        if (sessRes.data.data.length > 0 && !selectedSession) {
          setSelectedSession(sessRes.data.data[0].session_key);
        }
      }
      if (repRes.data.success) setReportData(repRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const getStudentSummary = (s: any) => {
    if (!s) {
      return {
        absentCount: 0,
        presentCount: 0,
        lateCount: 0,
        leaveCount: 0,
        notStartedCount: 0,
        daysCount: totalDays,
        isStrictAbsent: false,
        isStrictPresent: false,
        isStrictLate: false,
        isStrictLeave: false,
        isStrictNotStarted: false,
        dailyList: []
      };
    }
    const idKey = String(s.id);
    const rawCode = String(s.student_code || s.bank_code || s.bankCode || '').trim();
    const unpadded = rawCode.replace(/^0+/, '');
    const padded = rawCode ? rawCode.padStart(4, '0') : '';

    let absentCount = 0;
    let presentCount = 0;
    let lateCount = 0;
    let leaveCount = 0;
    let notStartedCount = 0;
    const dailyList: Array<{ date: string; status: string; is_late?: boolean; reason?: string }> = [];

    for (const d of datesInRange) {
      const dayMap = multiDayAttendanceMap[d] || {};
      const att = dayMap[idKey] || dayMap[rawCode] || (unpadded ? dayMap[unpadded] : undefined) || (padded ? dayMap[padded] : undefined) || null;
      const status = (att?.status || 'Not Started').toLowerCase();
      dailyList.push({ date: d, status: att?.status || 'Not Started', is_late: att?.is_late, reason: att?.reason });

      if (status === 'absent') absentCount++;
      else if (status === 'present') presentCount++;
      else if (status === 'late') lateCount++;
      else if (status === 'leave') leaveCount++;
      else notStartedCount++;
    }

    return {
      absentCount,
      presentCount,
      lateCount,
      leaveCount,
      notStartedCount,
      daysCount: totalDays,
      isStrictAbsent: absentCount === totalDays && totalDays > 0,
      isStrictPresent: presentCount === totalDays && totalDays > 0,
      isStrictLate: lateCount === totalDays && totalDays > 0,
      isStrictLeave: leaveCount === totalDays && totalDays > 0,
      isStrictNotStarted: notStartedCount === totalDays && totalDays > 0,
      dailyList
    };
  };

  const fetchSessionAttendance = async () => {
    if (!selectedSession || selectedSession === 'all' || datesInRange.length === 0) {
      setMultiDayAttendanceMap({});
      return;
    }
    setAttendanceLoading(true);
    try {
      const results = await Promise.all(
        datesInRange.map(async (d) => {
          try {
            const res = await apiClient.get(`/attendance/session/${selectedSession}/students?date=${d}`);
            if (res.data?.success && Array.isArray(res.data.data)) {
              const map: Record<string, { status: string; marked_at?: string; is_late?: boolean; reason?: string }> = {};
              for (const item of res.data.data) {
                const entry = {
                  status: item.status || (item.is_present ? (item.is_late ? 'Late' : 'Present') : (item.leave_id ? 'Leave' : (item.session_started === false ? 'Not Started' : 'Absent'))),
                  marked_at: item.marked_at,
                  is_late: Boolean(item.is_late),
                  reason: item.reason || item.absent_reason || item.leave_reason || null,
                  session_started: item.session_started
                };

                if (item.student_id !== undefined && item.student_id !== null) {
                  map[String(item.student_id)] = entry;
                }
                if (item.student_code) {
                  const codeStr = String(item.student_code).trim();
                  map[codeStr] = entry;
                  const unpadded = codeStr.replace(/^0+/, '');
                  if (unpadded) map[unpadded] = entry;
                  map[codeStr.padStart(4, '0')] = entry;
                }
              }
              return { date: d, map };
            }
          } catch (e) {
            console.warn(`Failed to load attendance for ${d}:`, e);
          }
          return { date: d, map: {} };
        })
      );

      const combined: Record<string, Record<string, any>> = {};
      for (const r of results) {
        combined[r.date] = r.map;
      }
      setMultiDayAttendanceMap(combined);
    } catch (e) {
      console.warn('Failed to load multi-day session attendance:', e);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await apiClient.post('/whatsapp/connect');
      await fetchWaStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect this WhatsApp number?')) return;
    try {
      await apiClient.post('/whatsapp/disconnect');
      setWaStatus('disconnected');
      setQrCodeData('');
      setConnectedUser(null);
      alert('WhatsApp disconnected. You can now scan with a new number.');
      setTimeout(handleConnect, 1000);
    } catch (e) {
      alert('Failed to disconnect WhatsApp');
    }
  };

  const handleCheckboxChange = (id: string, checked: boolean) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const next = new Set<string>();
    filteredStudents.forEach(s => next.add(String(s.student_code || s.id)));
    setSelectedStudentIds(next);
  };

  const handleClearAll = () => {
    setSelectedStudentIds(new Set());
  };

  const insertTag = (tag: string) => {
    setMessageText(prev => prev + ' ' + tag);
  };

  const handleSendMessages = async () => {
    if (waStatus !== 'open') {
      alert('WhatsApp is not connected! Please scan the QR code first.');
      return;
    }
    if (selectedStudentIds.size === 0) {
      alert('Please select at least one student.');
      return;
    }
    if (!messageText.trim()) {
      alert('Message cannot be empty.');
      return;
    }

    setSending(true);
    try {
      const messages = [];
      const currentSessionObj = sessions.find(s => s.session_key === selectedSession);
      const sessionLabel = currentSessionObj ? currentSessionObj.session_name : (selectedSession.charAt(0).toUpperCase() + selectedSession.slice(1) + ' Attendance');
      const dateLabel = totalDays === 1 ? startDate : `${startDate} to ${endDate} (${totalDays} days)`;

      for (const s of students) {
        const sCode = String(s.student_code || s.id);
        if (selectedStudentIds.has(sCode)) {
          const summary = getStudentSummary(s);
          let studentStatus = 'Absent';
          if (totalDays === 1) {
            studentStatus = summary.dailyList[0]?.status || 'Absent';
          } else {
            if (summary.isStrictAbsent) studentStatus = `Absent for all ${totalDays} days (${startDate} to ${endDate})`;
            else if (summary.isStrictPresent) studentStatus = `Present for all ${totalDays} days (${startDate} to ${endDate})`;
            else if (summary.isStrictLate) studentStatus = `Late for all ${totalDays} days (${startDate} to ${endDate})`;
            else if (summary.isStrictLeave) studentStatus = `On Leave for all ${totalDays} days (${startDate} to ${endDate})`;
            else studentStatus = `${summary.absentCount} days Absent, ${summary.presentCount} days Present (${totalDays} days)`;
          }

          let text = messageText;
          text = text.replace(/{name}/gi, s.name || 'Student');
          text = text.replace(/{student_name}/gi, s.name || 'Student');
          text = text.replace(/{session_name}/gi, sessionLabel);
          text = text.replace(/{date}/gi, dateLabel);
          text = text.replace(/{status}/gi, studentStatus);
          text = text.replace(/{room number}/gi, s.room_number || 'N/A');
          text = text.replace(/{room}/gi, s.room_number || 'N/A');
          text = text.replace(/{floor}/gi, s.floor_id !== undefined && s.floor_id !== null ? `Floor ${s.floor_id}` : 'Unassigned');

          // Percentage calculation
          const rec = reportData?.studentRecords?.[sCode];
          let attended = 0;
          let total = 0;
          if (reportData?.totals) {
            Object.keys(reportData.totals).forEach(type => {
              total += reportData.totals[type] || 0;
              if (rec) attended += rec[type] || 0;
            });
          }
          const perc = total > 0 ? ((attended / total) * 100).toFixed(1) + '%' : '0%';
          text = text.replace(/{attendance percentage}/gi, perc);

          // Route to student, parent, or both
          const studentPhone = s.assigned_mobile || s.phone_number;
          const parentPhone = s.parent_phone || s.father_phone || s.mother_phone;

          if ((recipientTarget === 'student' || recipientTarget === 'both') && studentPhone) {
            messages.push({
              phone: studentPhone,
              text,
            });
          }

          if ((recipientTarget === 'parent' || recipientTarget === 'both') && parentPhone) {
            messages.push({
              phone: parentPhone,
              text,
            });
          }
        }
      }

      if (messages.length === 0) {
        alert('No valid phone numbers found for selected students and target recipient type.');
        setSending(false);
        return;
      }

      const res = await apiClient.post('/whatsapp/send', { messages }, { timeout: 1800000 });
      if (res.data.success) {
        alert(res.data.message || `Dispatched ${messages.length} WhatsApp message(s) successfully!`);
      } else {
        alert('Failed: ' + res.data.message);
      }
    } catch (err: any) {
      alert('Send error: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  // FILTERING STUDENTS: Search + Floor + Strict Multi-Day Attendance Status
  const filteredStudents = students.filter(s => {
    const sCode = String(s.student_code || s.id);
    const sName = String(s.name || '').toLowerCase();
    const sRoom = String(s.room_number || '').toLowerCase();
    const sPhone = String(s.assigned_mobile || s.phone_number || '');
    const pPhone = String(s.parent_phone || s.father_phone || s.mother_phone || '');
    const query = searchQuery.trim().toLowerCase();

    // 1. Search Query Match
    if (query) {
      const matchName = sName.includes(query);
      const matchCode = sCode.toLowerCase().includes(query) || sCode.replace(/^0+/, '').includes(query);
      const matchRoom = sRoom.includes(query);
      const matchPhone = sPhone.includes(query) || pPhone.includes(query);
      if (!matchName && !matchCode && !matchRoom && !matchPhone) return false;
    }

    // 2. Floor filter
    if (selectedFloor !== 'all') {
      const floorNum = parseInt(selectedFloor, 10);
      const studentFloor = s.floor_id !== undefined && s.floor_id !== null ? parseInt(String(s.floor_id), 10) : null;
      if (studentFloor !== floorNum) {
        // Fallback: check room number first digit if floor_id is unassigned
        if (s.room_number) {
          const roomStr = String(s.room_number).trim();
          let calculatedFloor = -1;
          if (roomStr.length >= 3) {
            calculatedFloor = parseInt(roomStr.substring(0, roomStr.length - 2), 10);
          }
          if (calculatedFloor !== floorNum) return false;
        } else {
          return false;
        }
      }
    }

    // 3. Status filter (Strict Continuous Matching Across the Selected Date Range)
    if (statusFilter !== 'all') {
      const summary = getStudentSummary(s);
      
      if (statusFilter === 'absent') {
        // Continuous: Student must be ABSENT on ALL days of the selected date range
        if (summary.absentCount !== totalDays) return false;
      } else if (statusFilter === 'present') {
        // Continuous: Student must be PRESENT on ALL days of the selected date range
        if (summary.presentCount !== totalDays) return false;
      } else if (statusFilter === 'late') {
        // Continuous: Student must be LATE on ALL days of the selected date range
        if (summary.lateCount !== totalDays) return false;
      } else if (statusFilter === 'leave') {
        // Continuous: Student must be on LEAVE on ALL days of the selected date range
        if (summary.leaveCount !== totalDays) return false;
      } else if (statusFilter === 'not_started') {
        if (summary.notStartedCount !== totalDays) return false;
      }
    }

    return true;
  });

  const isConnected = waStatus === 'open';

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1280px' }} className="animate-fade-in">
      
      {/* WhatsApp Connection Status Header */}
      <HamsCard padding="24px">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              padding: '12px',
              backgroundColor: isConnected ? '#ecfdf5' : '#fffbeb',
              borderRadius: '12px',
              color: isConnected ? '#10b981' : '#f59e0b'
            }}>
              <Smartphone size={26} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                WhatsApp Gateway Status
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isConnected ? '#10b981' : '#f59e0b',
                }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: isConnected ? '#10b981' : '#f59e0b', textTransform: 'capitalize' }}>
                  {waStatus}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={fetchWaStatus}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            {isConnected && (
              <button
                onClick={handleDisconnect}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <LogOut size={14} /> Disconnect
              </button>
            )}
          </div>
        </div>

        {/* CONNECTED STATE: Show Linked Number and Profile */}
        {isConnected && (
          <div style={{
            marginTop: '20px',
            padding: '18px 20px',
            backgroundColor: '#f0fdf4',
            borderRadius: '12px',
            border: '1px solid #bbf7d0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone size={18} style={{ color: '#16a34a' }} />
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', display: 'block' }}>Connected Number</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    {connectedUser?.phone ? `+${connectedUser.phone}` : 'Active WhatsApp Gateway'}
                  </span>
                </div>
              </div>

              {connectedUser?.name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '2px solid #bbf7d0', paddingLeft: '20px' }}>
                  <User size={18} style={{ color: '#16a34a' }} />
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', display: 'block' }}>Linked Name / Profile</span>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                      {connectedUser.name}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#dcfce7',
              color: '#15803d',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700
            }}>
              <CheckCircle2 size={15} /> System Ready to Broadcast
            </span>
          </div>
        )}

        {/* NOT CONNECTED STATE: Show QR Code */}
        {!isConnected && (
          <div style={{
            marginTop: '20px',
            padding: '24px',
            backgroundColor: '#f8fafc',
            borderRadius: '14px',
            border: '1.5px dashed #cbd5e1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}>
            {qrCodeData ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <QrCode size={20} color="#2563eb" />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    Scan QR Code to Link WhatsApp
                  </h4>
                </div>
                <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '440px', marginBottom: '16px' }}>
                  Open WhatsApp on your phone &gt; Settings / Menu &gt; <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong> and point your camera at this QR code.
                </p>
                <div style={{
                  padding: '16px',
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  border: '1px solid #e2e8f0'
                }}>
                  <QRCodeSVG value={qrCodeData} size={220} />
                </div>
              </>
            ) : (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <AlertCircle size={32} color="#f59e0b" />
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  WhatsApp is currently disconnected
                </h4>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '14px'
                  }}
                >
                  {connecting ? 'Initializing connection...' : 'Connect WhatsApp Now'}
                </button>
              </div>
            )}
          </div>
        )}
      </HamsCard>

      {/* Message Composer Card */}
      <HamsCard padding="24px">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Compose Template Message
          </h3>

          {/* Recipient Target Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', padding: '0 6px' }}>Send To:</span>
            {[
              { key: 'student', label: 'Student' },
              { key: 'parent', label: 'Parent' },
              { key: 'both', label: 'Both' },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRecipientTarget(tab.key as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: recipientTarget === tab.key ? '#4f46e5' : 'transparent',
                  color: recipientTarget === tab.key ? '#ffffff' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Dynamic Tags Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
          {[
            '{name}', 
            '{session_name}', 
            '{date}', 
            '{status}', 
            '{room number}', 
            '{floor}', 
            '{attendance percentage}'
          ].map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => insertTag(tag)}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: '1px solid #c7d2fe',
                backgroundColor: '#eef2ff',
                color: '#4338ca',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + {tag}
            </button>
          ))}
        </div>

        <textarea
          rows={4}
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          placeholder="Enter message template..."
          style={{ width: '100%', marginBottom: '16px', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#4f46e5' }}>
            🎯 {selectedStudentIds.size} student(s) selected
          </span>
          <button
            onClick={handleSendMessages}
            disabled={sending || selectedStudentIds.size === 0 || !isConnected}
            style={{
              padding: '12px 24px',
              backgroundColor: isConnected ? '#4f46e5' : '#94a3b8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: isConnected ? '0 4px 14px rgba(79, 70, 229, 0.3)' : 'none',
            }}
          >
            <Send size={16} /> {sending ? 'Sending Broadcast...' : 'Send WhatsApp Messages'}
          </button>
        </div>
      </HamsCard>

      {/* FILTER ROW & RECIPIENTS CARD */}
      <HamsCard padding="24px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={18} color="#4f46e5" />
                Recipient Filters ({filteredStudents.length} matches)
              </h3>
              
              {/* Date Range Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                backgroundColor: totalDays > 1 ? '#eff6ff' : '#f1f5f9',
                color: totalDays > 1 ? '#1d4ed8' : '#475569',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 700,
                border: totalDays > 1 ? '1px solid #bfdbfe' : '1px solid #e2e8f0'
              }}>
                <Calendar size={13} color={totalDays > 1 ? '#2563eb' : '#64748b'} />
                {totalDays === 1 
                  ? `1 Day Selected (${startDate})` 
                  : `🗓️ ${totalDays} Days Selected (${startDate} to ${endDate})`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSelectAll}
                style={{ padding: '8px 14px', backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <CheckSquare size={16} /> Select All Filtered ({filteredStudents.length})
              </button>
              <button
                onClick={handleClearAll}
                style={{ padding: '8px 14px', backgroundColor: '#ffffff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <XSquare size={16} /> Clear Selection
              </button>
            </div>
          </div>

          {/* Multi-Dimension Filters: From Date, To Date, Session, Floor, Status, Search */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            backgroundColor: '#f8fafc',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}>
            
            {/* 1. From Date Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                📅 From Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: '#ffffff'
                }}
              />
            </div>

            {/* 2. To Date Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                📅 To Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: '#ffffff'
                }}
              />
            </div>

            {/* 3. Session Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                ⏰ Session Type
              </label>
              <select
                value={selectedSession}
                onChange={e => setSelectedSession(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: '#ffffff'
                }}
              >
                {sessions.map(s => (
                  <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
                ))}
              </select>
            </div>

            {/* 4. Floor Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                🏢 Floor Filter
              </label>
              <select
                value={selectedFloor}
                onChange={e => setSelectedFloor(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="all">All Floors</option>
                {floors.map(f => (
                  <option key={f.floor_id} value={String(f.floor_id)}>{f.floor_name || f.name}</option>
                ))}
              </select>
            </div>

            {/* 5. Status Filter: Strict Continuous Across Date Range */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                ⚡ Status Filter {attendanceLoading && <span style={{ fontSize: '10px', color: '#6366f1' }}>⏳</span>}
              </label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: statusFilter === 'absent' ? '#dc2626' : (statusFilter === 'present' ? '#16a34a' : (statusFilter === 'leave' ? '#2563eb' : (statusFilter === 'late' ? '#d97706' : '#0f172a'))),
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="all">All (Present, Late, Absent, Leave & Pending)</option>
                <option value="absent">🔴 Absent Only {totalDays > 1 ? `(All ${totalDays} Days Continuous)` : ''}</option>
                <option value="present">🟢 Present Only {totalDays > 1 ? `(All ${totalDays} Days Continuous)` : ''}</option>
                <option value="late">🟡 Late Only {totalDays > 1 ? `(All ${totalDays} Days Continuous)` : ''}</option>
                <option value="leave">🏖️ Leave Only {totalDays > 1 ? `(All ${totalDays} Days Continuous)` : ''}</option>
                <option value="not_started">⏳ Not Started / Pending</option>
              </select>
            </div>

            {/* 6. Search by Name / ID / Room / Phone */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                🔍 Search Student
              </label>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Name, ID, Room, Mobile..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 32px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#ffffff'
                  }}
                />
              </div>
            </div>

          </div>
        </div>

        {/* RECIPIENTS TABLE */}
        <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '12px 14px', width: '40px' }}></th>
                <th style={{ padding: '12px 14px' }}>Student ID</th>
                <th style={{ padding: '12px 14px' }}>Name</th>
                <th style={{ padding: '12px 14px' }}>Floor / Room</th>
                <th style={{ padding: '12px 14px' }}>
                  Status ({totalDays === 1 ? startDate : `${totalDays} Days: ${startDate} to ${endDate}`})
                </th>
                <th style={{ padding: '12px 14px' }}>Student Mobile</th>
                <th style={{ padding: '12px 14px' }}>Parent Mobile</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    {attendanceLoading ? 'Loading session attendance records for selected date range...' : 'No students match the selected filters.'}
                  </td>
                </tr>
              ) : (
                filteredStudents.map(s => {
                  const sCode = String(s.student_code || s.id);
                  const isSelected = selectedStudentIds.has(sCode);
                  const summary = getStudentSummary(s);

                  let badgeBg = '#fef2f2';
                  let badgeColor = '#991b1b';
                  let badgeBorder = '#fecaca';
                  let badgeLabel = '🔴 Absent';

                  if (totalDays === 1) {
                    const currentStatus = summary.dailyList[0]?.status || 'Not Started';
                    const isPresent = currentStatus.toLowerCase() === 'present';
                    const isLate = currentStatus.toLowerCase() === 'late';
                    const isLeave = currentStatus.toLowerCase() === 'leave';
                    const isNotStarted = currentStatus.toLowerCase() === 'not started';

                    if (isPresent) {
                      badgeBg = '#ecfdf5';
                      badgeColor = '#065f46';
                      badgeBorder = '#a7f3d0';
                      badgeLabel = '🟢 Present';
                    } else if (isLate) {
                      badgeBg = '#fffbeb';
                      badgeColor = '#b45309';
                      badgeBorder = '#fde68a';
                      badgeLabel = '🟡 Late';
                    } else if (isLeave) {
                      badgeBg = '#eff6ff';
                      badgeColor = '#1d4ed8';
                      badgeBorder = '#bfdbfe';
                      badgeLabel = '🏖️ Leave';
                    } else if (isNotStarted) {
                      badgeBg = '#f1f5f9';
                      badgeColor = '#64748b';
                      badgeBorder = '#e2e8f0';
                      badgeLabel = '⏳ Not Started';
                    } else {
                      badgeBg = '#fef2f2';
                      badgeColor = '#991b1b';
                      badgeBorder = '#fecaca';
                      badgeLabel = '🔴 Absent';
                    }
                  } else {
                    // Multi-day status display
                    if (summary.isStrictAbsent) {
                      badgeBg = '#fef2f2';
                      badgeColor = '#991b1b';
                      badgeBorder = '#fecaca';
                      badgeLabel = `🔴 Absent (${totalDays}/${totalDays} Days)`;
                    } else if (summary.isStrictPresent) {
                      badgeBg = '#ecfdf5';
                      badgeColor = '#065f46';
                      badgeBorder = '#a7f3d0';
                      badgeLabel = `🟢 Present (${totalDays}/${totalDays} Days)`;
                    } else if (summary.isStrictLate) {
                      badgeBg = '#fffbeb';
                      badgeColor = '#b45309';
                      badgeBorder = '#fde68a';
                      badgeLabel = `🟡 Late (${totalDays}/${totalDays} Days)`;
                    } else if (summary.isStrictLeave) {
                      badgeBg = '#eff6ff';
                      badgeColor = '#1d4ed8';
                      badgeBorder = '#bfdbfe';
                      badgeLabel = `🏖️ Leave (${totalDays}/${totalDays} Days)`;
                    } else {
                      // Mixed summary
                      badgeBg = '#f8fafc';
                      badgeColor = '#334155';
                      badgeBorder = '#cbd5e1';
                      badgeLabel = `${summary.absentCount > 0 ? `🔴 ${summary.absentCount}A ` : ''}${summary.presentCount > 0 ? `🟢 ${summary.presentCount}P ` : ''}${summary.lateCount > 0 ? `🟡 ${summary.lateCount}L ` : ''}${summary.leaveCount > 0 ? `🏖️ ${summary.leaveCount}Lv ` : ''}`.trim() || '⏳ Pending';
                    }
                  }

                  const tooltipText = summary.dailyList.map(d => `${d.date}: ${d.status}${d.reason ? ` (${d.reason})` : ''}`).join('\n');

                  return (
                    <tr 
                      key={sCode} 
                      onClick={() => handleCheckboxChange(sCode, !isSelected)}
                      style={{ 
                        borderBottom: '1px solid #f1f5f9', 
                        backgroundColor: isSelected ? '#eef2ff' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => handleCheckboxChange(sCode, e.target.checked)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 800, color: '#4f46e5' }}>
                        {s.student_code || s.id}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                        {s.name}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569' }}>
                        {s.floor_id !== undefined && s.floor_id !== null ? `Floor ${s.floor_id}` : 'Unassigned'} / <strong>{s.room_number || 'N/A'}</strong>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 9px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 800,
                          backgroundColor: badgeBg,
                          color: badgeColor,
                          border: `1px solid ${badgeBorder}`
                        }} title={tooltipText}>
                          {badgeLabel}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569' }}>
                        {s.assigned_mobile || s.phone_number || <span style={{ color: '#cbd5e1' }}>None</span>}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569' }}>
                        {s.parent_phone || s.father_phone || s.mother_phone || <span style={{ color: '#cbd5e1' }}>None</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </HamsCard>

    </div>
  );
};
