import React, { useEffect, useState } from 'react';
import { 
  Palmtree, 
  RefreshCw, 
  Search, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Phone, 
  Building2, 
  Users, 
  AlertCircle,
  Sparkles,
  Info
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';
import { ExpandableReasonTooltip } from '../../components/ExpandableReasonTooltip';

export const LeavesManagementView: React.FC = () => {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [floorFilter, setFloorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active_today' | 'approved'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchLeaves();
    fetchStats();

    // Auto-poll every 8 seconds so newly synced leaves appear automatically without user clicking
    const interval = setInterval(() => {
      fetchLeaves(false); // silent refresh
      fetchStats();
    }, 8000);

    return () => clearInterval(interval);
  }, [floorFilter, statusFilter, startDate, endDate, searchQuery]);

  const fetchLeaves = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      let url = '/leaves?';
      const params: string[] = [];
      if (floorFilter !== 'All') params.push(`floor_id=${floorFilter}`);
      if (statusFilter === 'active_today') params.push('active_only=true');
      if (startDate) params.push(`startDate=${startDate}`);
      if (endDate) params.push(`endDate=${endDate}`);
      if (searchQuery) params.push(`search=${encodeURIComponent(searchQuery)}`);

      url += params.join('&');
      const res = await apiClient.get(url);
      if (res.data.success) {
        setLeaves(res.data.data || []);
      }
    } catch (err: any) {
      console.error('Error fetching leaves:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiClient.get('/leaves/stats');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (e) {}
  };

  const handleClearDates = () => {
    setStartDate('');
    setEndDate('');
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await apiClient.post('/leaves/sync', {
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      if (res.data.success) {
        setSyncMessage({ text: res.data.message || 'Leaves successfully synced!', type: 'success' });
        fetchLeaves();
        fetchStats();
      } else {
        setSyncMessage({ text: res.data.message || 'Sync failed', type: 'error' });
      }
    } catch (err: any) {
      setSyncMessage({ text: err.response?.data?.message || err.message || 'Error syncing leaves', type: 'error' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const formatDateTime = (dtStr: string) => {
    if (!dtStr) return '—';
    const d = new Date(dtStr);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateDuration = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return '';
    const s = new Date(startStr).getTime();
    const e = new Date(endStr).getTime();
    const diffHours = Math.max(0, Math.round((e - s) / (1000 * 60 * 60)));
    if (diffHours < 24) return `${diffHours} hrs`;
    const days = Math.round(diffHours / 24);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  };

  const isCurrentlyActive = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return false;
    const now = new Date().getTime();
    const s = new Date(startStr).getTime();
    const e = new Date(endStr).getTime();
    return now >= s && now <= e;
  };

  const filteredLeaves = leaves.filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(l.bank_code || '').toLowerCase().includes(q) ||
      String(l.student_name || '').toLowerCase().includes(q) ||
      String(l.room_number || '').toLowerCase().includes(q) ||
      String(l.phone || '').toLowerCase().includes(q) ||
      String(l.reason || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Info Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        backgroundColor: '#ffffff',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#ede9fe',
            color: '#6d28d9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Palmtree size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Student Leave Management
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0 0' }}>
              Auto-synced from college portal. Students on approved leave are marked as <strong>Leave</strong> across all sessions.
            </p>
          </div>
        </div>

        <button
          onClick={handleManualSync}
          disabled={syncing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#4f46e5',
            color: '#ffffff',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: syncing ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)',
            opacity: syncing ? 0.7 : 1
          }}
        >
          <RefreshCw size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          {syncing ? 'Syncing Leaves...' : 'Sync Leaves from Portal'}
        </button>
      </div>

      {syncMessage && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: syncMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: syncMessage.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${syncMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`
        }}>
          {syncMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {syncMessage.text}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px'
      }}>
        {/* Active Today */}
        <HamsCard padding="20px" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                ON LEAVE TODAY
              </span>
              <span style={{ fontSize: '30px', fontWeight: 800, color: '#10b981' }}>
                {stats?.active_leaves_today || 0}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#ecfdf5', borderRadius: '12px', color: '#10b981' }}>
              <Palmtree size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            Excused from attendance today
          </div>
        </HamsCard>

        {/* Upcoming Leaves */}
        <HamsCard padding="20px" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                UPCOMING LEAVES
              </span>
              <span style={{ fontSize: '30px', fontWeight: 800, color: '#3b82f6' }}>
                {stats?.upcoming_leaves || 0}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#eff6ff', borderRadius: '12px', color: '#3b82f6' }}>
              <Clock size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>Scheduled for future dates</div>
        </HamsCard>

        {/* Total Synced Leaves */}
        <HamsCard padding="20px" style={{ borderLeft: '4px solid #6366f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                TOTAL APPROVED LEAVES
              </span>
              <span style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a' }}>
                {stats?.total_leaves || leaves.length || 0}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#ede9fe', borderRadius: '12px', color: '#6366f1' }}>
              <Users size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>Recorded in database</div>
        </HamsCard>
      </div>

      {/* Main Table Card */}
      <HamsCard padding="24px">
        {/* Controls & Search Filter Bar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: 1 }}>
            
            <div style={{ position: 'relative', minWidth: '220px', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search by Name, Bank Code, Room, Reason..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              style={{
                height: '40px',
                padding: '0 12px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Leave Records</option>
              <option value="active_today">Active Leaves Today</option>
              <option value="approved">Approved Leaves</option>
            </select>

            <select
              value={floorFilter}
              onChange={e => setFloorFilter(e.target.value)}
              style={{
                height: '40px',
                padding: '0 12px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <option value="All">All Floors</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fl => (
                <option key={fl} value={String(fl)}>Floor {fl === 0 ? '0 (Ground)' : fl}</option>
              ))}
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>From:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  height: '40px',
                  padding: '0 10px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>To:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  height: '40px',
                  padding: '0 10px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px'
                }}
              />
            </div>

            {(startDate || endDate) && (
              <button
                onClick={handleClearDates}
                style={{
                  height: '40px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #e2e8f0',
                  backgroundColor: '#f8fafc',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Clear date filter to see all records"
              >
                Clear Dates ✕
              </button>
            )}
          </div>

          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#6d28d9',
            backgroundColor: '#ede9fe',
            padding: '8px 14px',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Palmtree size={15} /> {filteredLeaves.length} Records
          </span>
        </div>

        {/* Leaves Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '13px' }}>
                <th style={{ padding: '12px 14px' }}>Bank Code</th>
                <th style={{ padding: '12px 14px' }}>Student Name</th>
                <th style={{ padding: '12px 14px' }}>Floor / Room</th>
                <th style={{ padding: '12px 14px' }}>Leave Duration</th>
                <th style={{ padding: '12px 14px' }}>Leave Reason</th>
                <th style={{ padding: '12px 14px' }}>Contact</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaves.map((l, idx) => {
                const activeNow = isCurrentlyActive(l.start_time, l.end_time);
                return (
                  <tr key={l.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#4f46e5' }}>
                      {l.bank_code}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      {l.student_name || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#475569', fontSize: '13px' }}>
                      {l.floor_id !== null && l.floor_id !== undefined ? `Floor ${l.floor_id}` : ''} {l.room_number ? `(Rm ${l.room_number})` : ''}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                          {formatDateTime(l.start_time)}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          to {formatDateTime(l.end_time)} ({calculateDuration(l.start_time, l.end_time)})
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: '240px' }}>
                      <ExpandableReasonTooltip
                        text={l.reason || 'Approved Leave'}
                        maxLength={35}
                        badgeStyle={true}
                        color="#334155"
                      />
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '13px' }}>
                      {l.phone ? (
                        <a 
                          href={`tel:${l.phone}`}
                          style={{ color: '#0284c7', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                        >
                          <Phone size={13} /> {l.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      {activeNow ? (
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          backgroundColor: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          fontSize: '12px',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                          Active Today
                        </span>
                      ) : (
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          backgroundColor: '#ede9fe',
                          color: '#6d28d9',
                          border: '1px solid #ddd6fe',
                          fontSize: '12px',
                          fontWeight: 700
                        }}>
                          Approved
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredLeaves.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                    {loading ? 'Loading leave records...' : 'No leave records found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </HamsCard>
    </div>
  );
};
