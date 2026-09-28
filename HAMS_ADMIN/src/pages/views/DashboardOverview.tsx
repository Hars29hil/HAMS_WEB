import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Sparkles, 
  RefreshCw, 
  BarChart2, 
  Radio, 
  AlertTriangle,
  Search,
  MessageSquare,
  FileText,
  AlertCircle,
  X,
  Phone,
  Calendar,
  RotateCcw,
  History
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';
import { renderSessionIcon } from '../../utils/sessionIcons';

export const DashboardOverview: React.FC = () => {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [stats, setStats] = useState<any>(null);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>('recent');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // 3-Day Absentees Filters & Justification Modal
  const [absentSearch, setAbsentSearch] = useState('');
  const [absentFloor, setAbsentFloor] = useState('All');
  const [absentJustifyFilter, setAbsentJustifyFilter] = useState<'all' | 'unjustified' | 'justified'>('all');
  const [justifyModal, setJustifyModal] = useState<{ isOpen: boolean; student: any; reason: string; error?: string } | null>(null);
  const [submittingJustify, setSubmittingJustify] = useState(false);

  const isToday = selectedDate === todayStr;

  useEffect(() => {
    fetchStats(selectedSessionKey, true, selectedDate);

    // Live Real-Time Polling every 3 seconds (only active when viewing today's date)
    const interval = setInterval(() => {
      if (!justifyModal?.isOpen && selectedDate === new Date().toLocaleDateString('en-CA')) {
        fetchStats(selectedSessionKey, false, selectedDate);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedSessionKey, justifyModal?.isOpen, selectedDate]);

  const fetchStats = async (sessionKey = selectedSessionKey, isInitial = false, dateStr = selectedDate) => {
    if (isInitial) setLoading(true);
    try {
      const res = await apiClient.get(`/admin/dashboard?session_key=${sessionKey}&date=${dateStr}`);
      if (res.data.success) {
        setStats(res.data.data);
      } else {
        if (isInitial) setError(res.data.message || 'Failed to fetch dashboard data');
      }
    } catch (err: any) {
      if (isInitial) setError(err.message || 'Error communicating with backend');
    } finally {
      if (isInitial) setLoading(false);
      setRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchStats(selectedSessionKey, true, selectedDate);
  };

  // Submit Justification from Dashboard
  const handleSaveJustification = async () => {
    if (!justifyModal) return;
    const trimmed = justifyModal.reason.trim();
    if (!trimmed) {
      setJustifyModal({
        ...justifyModal,
        error: 'Description / justification reason is required!'
      });
      return;
    }

    setSubmittingJustify(true);
    try {
      const datesToJustify = justifyModal.student.missed_dates && justifyModal.student.missed_dates.length > 0
        ? justifyModal.student.missed_dates
        : [selectedDate];

      const res = await apiClient.post('/attendance/session/absent-reason', {
        session_key: selectedSessionKey !== 'recent' && selectedSessionKey !== 'all' ? selectedSessionKey : 'night',
        student_id: justifyModal.student.student_id,
        student_code: justifyModal.student.student_code,
        dates: datesToJustify,
        reason: trimmed,
        is_justified: true
      });

      if (res.data.success) {
        setJustifyModal(null);
        fetchStats(selectedSessionKey, false, selectedDate);
      } else {
        alert(res.data.message || 'Failed to save reason');
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to save reason');
    } finally {
      setSubmittingJustify(false);
    }
  };

  const formatDateShort = (dStr: string) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (loading && !stats) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Loading Live Dashboard...</div>
        <p style={{ fontSize: '14px', margin: 0 }}>Connecting to real-time attendance streams...</p>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div style={{ padding: '32px' }}>
        <HamsCard padding="32px">
          <h3 style={{ color: '#ef4444', margin: '0 0 8px 0' }}>Dashboard Error</h3>
          <p style={{ color: '#64748b', margin: '0 0 16px 0' }}>{error}</p>
          <button
            onClick={() => fetchStats(selectedSessionKey, true)}
            style={{
              padding: '8px 18px',
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </HamsCard>
      </div>
    );
  }

  const currentSessionName = stats?.current_session?.name || 'Recent Attendance';
  const isRecent = stats?.current_session?.is_recent;

  const chartData = (stats?.weekly_stats || []).map((s: any) => ({
    name: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    present: s.present,
    late: s.late,
  }));

  // Filter 3-Day Absentees list
  const absenteesList: any[] = stats?.consecutive_absentees || [];
  const filteredAbsentees = absenteesList.filter(s => {
    const matchesFloor = absentFloor === 'All' || String(s.floor_id) === String(absentFloor);
    const matchesJustify = absentJustifyFilter === 'all' || 
      (absentJustifyFilter === 'justified' && s.is_justified) ||
      (absentJustifyFilter === 'unjustified' && !s.is_justified);
    const matchesSearch = !absentSearch ||
      String(s.student_code || '').toLowerCase().includes(absentSearch.toLowerCase()) ||
      String(s.name || '').toLowerCase().includes(absentSearch.toLowerCase()) ||
      String(s.room_number || '').toLowerCase().includes(absentSearch.toLowerCase()) ||
      String(s.phone_number || '').toLowerCase().includes(absentSearch.toLowerCase());
    return matchesFloor && matchesJustify && matchesSearch;
  });

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Floor Leader Notice Banner */}
      {stats?.is_leader_view && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 20px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '14px',
          color: '#1e40af'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            backgroundColor: '#dbeafe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563eb'
          }}>
            <Users size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Floor Leader Dashboard</div>
            <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '1px' }}>
              Showing real-time attendance & 3-day absentee metrics for your assigned floors: <strong>{stats.assigned_floors?.map((f: any) => `Floor ${f}`).join(', ')}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Session & Date Filter Bar */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        backgroundColor: '#ffffff',
        padding: '18px 22px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
      }}>
        {/* Tier 1: Session Live Indicator & Date Controls */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '14px',
          paddingBottom: '12px',
          borderBottom: '1px solid #f1f5f9'
        }}>
          {/* Left: Active Session Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: isToday 
                ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' 
                : 'linear-gradient(135deg, #475569 0%, #334155 100%)',
              color: '#ffffff',
              padding: '5px 13px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.5px',
              boxShadow: isToday ? '0 2px 8px rgba(79, 70, 229, 0.2)' : 'none'
            }}>
              {isToday ? (
                <>
                  <Sparkles size={13} />
                  {isRecent ? 'RECENT SESSION' : 'SELECTED SESSION'}
                </>
              ) : (
                <>
                  <History size={13} />
                  HISTORICAL VIEW
                </>
              )}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                {isToday ? 'Showing Live:' : 'Session:'} <strong style={{ color: '#4f46e5' }}>{currentSessionName}</strong>
              </span>
              <span style={{
                fontSize: '12px',
                color: '#475569',
                backgroundColor: '#f1f5f9',
                padding: '3px 9px',
                borderRadius: '8px',
                fontWeight: 600
              }}>
                📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Right: Date Picker, Today Button, Live Status & Refresh */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {/* Date Input Box */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              backgroundColor: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              borderRadius: '10px',
            }}>
              <Calendar size={14} color="#4f46e5" />
              <input
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value);
                  }
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0f172a',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Quick Button to Jump Back to Today */}
            {!isToday && (
              <button
                onClick={() => setSelectedDate(todayStr)}
                title="Reset to current date"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 12px',
                  backgroundColor: '#e0e7ff',
                  color: '#4338ca',
                  border: '1px solid #c7d2fe',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <RotateCcw size={12} />
                Today
              </button>
            )}

            {/* Live Sync / Historical Badge */}
            {isToday ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 800,
                color: '#059669',
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                  animation: 'pulse 1.5s infinite',
                }}></span>
                LIVE SYNC
              </div>
            ) : (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 11px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#475569',
              }}>
                ARCHIVED
              </div>
            )}

            {/* Manual Refresh Button */}
            <button
              onClick={handleManualRefresh}
              title="Refresh Data"
              style={{
                padding: '7px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
            >
              <RefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Tier 2: Session Filter Chips with Icons */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginRight: '2px' }}>
            Sessions:
          </span>

          {(stats?.available_sessions || []).map((sess: any) => {
            const isSelected = selectedSessionKey === sess.session_key;
            return (
              <button
                key={sess.session_key}
                onClick={() => setSelectedSessionKey(sess.session_key)}
                style={{
                  padding: '6px 13px',
                  borderRadius: '10px',
                  border: isSelected ? '1.5px solid #4f46e5' : '1px solid #cbd5e1',
                  backgroundColor: isSelected ? '#4f46e5' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#475569',
                  fontSize: '13px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: isSelected ? '0 2px 6px rgba(79, 70, 229, 0.2)' : 'none'
                }}
              >
                {renderSessionIcon(
                  sess.icon_name, 
                  sess.session_key, 
                  14, 
                  undefined, 
                  { color: isSelected ? '#ffffff' : '#64748b' }
                )}
                <span>{sess.session_name}</span>
                {sess.present_today > 0 && (
                  <span style={{
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#e0e7ff',
                    color: isSelected ? '#ffffff' : '#4338ca',
                    padding: '1px 6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}>
                    {sess.present_today}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
      }}>
        {/* Total Students */}
        <HamsCard padding="20px" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                TOTAL STUDENTS
              </span>
              <span style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a' }}>
                {stats?.total_students || 0}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#eff6ff', borderRadius: '12px', color: '#3b82f6' }}>
              <Users size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px' }}>Active in database</div>
        </HamsCard>

        {/* Present Today */}
        <HamsCard padding="20px" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                PRESENT TODAY
              </span>
              <span style={{ fontSize: '30px', fontWeight: 800, color: '#10b981' }}>
                {stats?.present_today || 0}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#ecfdf5', borderRadius: '12px', color: '#10b981' }}>
              <CheckCircle2 size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, marginTop: '10px' }}>
            In {currentSessionName} (Live)
          </div>
        </HamsCard>

        {/* Late Today */}
        <HamsCard padding="20px" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                LATE TODAY
              </span>
              <span style={{ fontSize: '30px', fontWeight: 800, color: '#f59e0b' }}>
                {stats?.late_today || 0}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#fffbeb', borderRadius: '12px', color: '#f59e0b' }}>
              <Clock size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600, marginTop: '10px' }}>
            In {currentSessionName} (Live)
          </div>
        </HamsCard>

        {/* Absent Today */}
        <HamsCard padding="20px" style={{ borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                ABSENT TODAY
              </span>
              <span style={{ fontSize: '30px', fontWeight: 800, color: '#ef4444' }}>
                {stats?.absent_today || 0}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#fef2f2', borderRadius: '12px', color: '#ef4444' }}>
              <XCircle size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600, marginTop: '10px' }}>
            In {currentSessionName} (Live)
          </div>
        </HamsCard>
      </div>

      {/* Main Grid: Chart & Floor Status */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '24px',
      }}>
        {/* Attendance Trend Chart */}
        <HamsCard padding="24px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Attendance Overview (Last 7 Days)
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>
                Real-time records for <strong>{currentSessionName}</strong>
              </p>
            </div>
            <BarChart2 size={20} color="#4f46e5" />
          </div>

          <div style={{ height: '300px', width: '100%' }}>
            {chartData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                No records recorded in the past 7 days for this session.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Bar dataKey="present" name="Present" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </HamsCard>

        {/* Live Floor Status */}
        <HamsCard padding="24px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Live Floor Status
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>
                Live count for <strong>{currentSessionName}</strong>
              </p>
            </div>
            <Radio size={20} color="#4f46e5" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '300px', overflowY: 'auto' }}>
            {(stats?.floor_status || []).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No floor data found
              </div>
            ) : (
              (stats?.floor_status || []).map((floor: any, i: number) => {
                const presentCount = floor.present_students ?? floor.present ?? 0;
                const totalCount = floor.total_students ?? floor.total ?? 0;
                const perc = totalCount > 0 ? (presentCount / totalCount) * 100 : (floor.percentage || 0);
                return (
                  <div
                    key={i}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{floor.floor_name || `Floor ${floor.floor_id}`}</span>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: presentCount > 0 ? '#10b981' : '#64748b',
                      }}>
                        {presentCount} / {totalCount} ({perc.toFixed(0)}%)
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${perc}%`,
                          height: '100%',
                          backgroundColor: perc > 75 ? '#10b981' : perc > 40 ? '#3b82f6' : '#f59e0b',
                          borderRadius: '3px',
                          transition: 'width 0.4s ease',
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </HamsCard>
      </div>

      {/* 3+ CONSECUTIVE DAYS UNJUSTIFIED ABSENTEES TABLE */}
      <HamsCard padding="24px">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  3+ Consecutive Days Absentees
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>
                  Students absent for the last {stats?.target_dates?.length || 3} occurrences of <strong>{currentSessionName}</strong> — track both justified and unjustified absences.
                </p>
              </div>
            </div>
          </div>

          {/* Filters for Absentees Table */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <select 
              value={absentJustifyFilter} 
              onChange={e => setAbsentJustifyFilter(e.target.value as any)} 
              style={{ minWidth: '195px', height: '40px', fontSize: '13px', fontWeight: 600, padding: '0 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }}
            >
              <option value="all">All 3-Day Absentees</option>
              <option value="unjustified">Unjustified Only</option>
              <option value="justified">Justified Only</option>
            </select>

            <select 
              value={absentFloor} 
              onChange={e => setAbsentFloor(e.target.value)} 
              style={{ minWidth: '140px', height: '40px', fontSize: '13px', fontWeight: 600, padding: '0 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }}
            >
              <option value="All">All Floors</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fl => (
                <option key={fl} value={String(fl)}>Floor {fl === 0 ? '0 (Ground)' : fl}</option>
              ))}
            </select>

            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search by ID, Name, Room..."
                value={absentSearch}
                onChange={e => setAbsentSearch(e.target.value)}
                style={{ width: '100%', height: '40px', paddingLeft: '36px', paddingRight: '12px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #cbd5e1', backgroundColor: '#ffffff' }}
              />
            </div>

            <span style={{
              padding: '8px 16px',
              borderRadius: '20px',
              backgroundColor: filteredAbsentees.length > 0 
                ? (absentJustifyFilter === 'justified' ? '#ecfdf5' : '#fef2f2') 
                : '#f8fafc',
              color: filteredAbsentees.length > 0 
                ? (absentJustifyFilter === 'justified' ? '#047857' : '#b91c1c') 
                : '#64748b',
              fontSize: '13px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: filteredAbsentees.length > 0 ? (absentJustifyFilter === 'justified' ? '#10b981' : '#ef4444') : '#94a3b8' }}></span>
              {filteredAbsentees.length} {absentJustifyFilter === 'justified' ? 'Justified' : absentJustifyFilter === 'unjustified' ? 'Defaulters' : 'Absentees'}
            </span>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Code</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Student Name</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Tag</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Floor</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Room No.</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Contact</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Missed Dates</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Justification Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAbsentees.map((s: any) => (
                <tr key={s.student_code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 800, color: '#2563eb', whiteSpace: 'nowrap' }}>
                    {s.student_code}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {s.tags && s.tags.length > 0 ? (
                        s.tags.map((tag: any) => (
                          <span
                            key={tag.id || tag.tag_id || tag.name}
                            style={{
                              padding: '3px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              backgroundColor: tag.name === 'Regular' ? '#ecfdf5' : tag.name === 'Late' ? '#fef2f2' : '#fffbeb',
                              color: tag.color || (tag.name === 'Regular' ? '#059669' : tag.name === 'Late' ? '#dc2626' : '#d97706'),
                              border: `1.5px solid ${tag.color || (tag.name === 'Regular' ? '#10b981' : tag.name === 'Late' ? '#ef4444' : '#f59e0b')}40`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                            }}
                          >
                            🏷️ {tag.name}
                          </span>
                        ))
                      ) : (
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: '#fffbeb',
                            color: '#d97706',
                            border: '1.5px solid #fde68a',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          🏷️ Irregular
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#334155',
                      display: 'inline-block',
                      whiteSpace: 'nowrap'
                    }}>
                      {s.floor_name || (s.floor_id === 0 ? 'Ground Floor' : `Floor ${s.floor_id}`)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}>
                      🚪 Room {s.room_number || 'N/A'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#475569', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {s.phone_number ? (
                      <a 
                        href={`tel:${s.phone_number}`}
                        style={{ color: '#0284c7', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}
                      >
                        <Phone size={13} /> {s.phone_number}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '6px', alignItems: 'center' }}>
                      {(s.missed_dates || []).map((d: string) => (
                        <span 
                          key={d} 
                          style={{
                            padding: '3px 8px',
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {formatDateShort(d)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    {s.is_justified ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          width: 'fit-content',
                          whiteSpace: 'nowrap'
                        }}>
                          <CheckCircle2 size={13} /> Justified
                        </span>
                        {s.justification_reason && (
                          <span style={{ fontSize: '11px', color: '#059669', fontStyle: 'italic', maxWidth: '200px', whiteSpace: 'normal' }}>
                            {s.justification_reason}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: '#fef2f2',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        whiteSpace: 'nowrap'
                      }}>
                        <AlertTriangle size={13} /> Unjustified Absent
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                      {s.phone_number && (
                        <a
                          href={`https://wa.me/91${s.phone_number}?text=Hello%20${encodeURIComponent(s.name)},%20you%20have%20been%20absent%20from%20hostel%20attendance%20for%20the%20last%203%20days%20without%20justification.%20Please%20report%20to%20your%20floor%20leader.`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '12px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <MessageSquare size={13} /> WhatsApp
                        </a>
                      )}

                      <button
                        onClick={() => setJustifyModal({ isOpen: true, student: s, reason: '', error: undefined })}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#ffffff',
                          color: '#3b82f6',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <FileText size={13} /> Justify
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredAbsentees.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                    🎉 Excellent! No students with 3+ consecutive unjustified absences found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </HamsCard>

      {/* DASHBOARD JUSTIFICATION POP-UP MODAL */}
      {justifyModal?.isOpen && createPortal(
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setJustifyModal(null); }}>
          <div className="modal-content-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Record Absence Justification
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  {justifyModal.student.name} ({justifyModal.student.student_code}) • {justifyModal.student.floor_name || `Floor ${justifyModal.student.floor_id}`} • Room {justifyModal.student.room_number || 'N/A'}
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
                Why was the student absent for 3+ consecutive days? <span style={{ color: '#ef4444' }}>* (Required)</span>
              </label>
              <textarea
                rows={4}
                value={justifyModal.reason}
                onChange={e => setJustifyModal({ ...justifyModal, reason: e.target.value, error: undefined })}
                placeholder="Enter detailed reason (e.g. Hospitalized with dengue, Approved home leave, College sports tournament)..."
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
                disabled={submittingJustify}
                onClick={handleSaveJustification}
                style={{ 
                  padding: '10px 20px', 
                  background: '#3b82f6', 
                  color: '#ffffff', 
                  border: 'none', 
                  borderRadius: '8px', 
                  cursor: submittingJustify ? 'not-allowed' : 'pointer', 
                  fontWeight: 700,
                  fontSize: '13px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {submittingJustify ? 'Saving...' : 'Save & Clear Defaulter'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

